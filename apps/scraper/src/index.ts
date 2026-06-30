import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { Listr } from 'listr2';
import { scrapAmazon } from './amazon';
import { connectToDatabase, closeConnection, Product, createOrUpdateProducts, deleteInvalidProducts, getAllUsers, getProductsCollection, searchProductsByInterests, generateProductEmbeddings, InterestItem } from '@poupaia/db';
import { generateEmbedding } from '@poupaia/ai';
import { sendProductsToUser } from '@poupaia/shared';

const envPath = path.resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const main = async () => {
  const startTime = Date.now();
  const PARALLEL_TASKS = 1;

  const tasks = new Listr([
    {
      title: 'Wating...',
      skip: process.env.NO_SCRAPING === 'true' || process.env.SKIP_WAIT === 'true',
      task: async (ctx, task) => {
        const oneHour = 1000 * 60 * 60;
        const delay = Math.floor(Math.random() * oneHour);
        await new Promise(resolve => setTimeout(resolve, delay));
        task.title = `Waited: ${(delay / 1000 / 60).toFixed(2)} minutos`;
      },
    },
    {
      title: 'Conectando ao MongoDB...',
      task: async (ctx, task) => {
        ctx.db = await connectToDatabase();
        task.title = 'Conectado ao MongoDB';
      },
    },
    {
      title: 'Scraping Amazon em paralelo...',
      skip: process.env.NO_SCRAPING === 'true',
      task: async (ctx, task) => {
        const scrapingTasks = Array.from({ length: PARALLEL_TASKS }, (_, index) =>
          scrapAmazon(index, PARALLEL_TASKS, progress => {
            task.title = `Scraping [${progress.categoryIndex}/${progress.categoryTotal}]: ${progress.categoryName}`;
          })
            .then(products => {
              return products;
            })
            .catch(error => {
              console.error(`[Task ${index}] Erro:`, error);
              return [];
            })
        );

        const results = await Promise.all(scrapingTasks);

        ctx.products = results.flat();

        const uniqueProducts = Array.from(new Map(ctx.products.map((p: Product) => [p.id, p])).values());
        ctx.products = uniqueProducts;

        task.title = `Scraping concluído: ${ctx.products.length} produtos únicos (${PARALLEL_TASKS} tasks em paralelo)`;
      },
    },
    {
      title: 'A guardar produtos no MongoDB',
      skip: process.env.NO_SCRAPING === 'true',
      task: async (ctx, task) => {
        const products: Product[] = ctx.products;

        if (products.length === 0) {
          task.title = 'Nenhum produto encontrado';
          return;
        }

        const result = await createOrUpdateProducts(ctx.db, products);

        task.title = `${result.upsertedCount} novos, ${result.modifiedCount} atualizados (${products.length} total)`;
      },
    },
    {
      title: 'A gerar embeddings para produtos novos',
      skip: process.env.NO_SCRAPING === 'true',
      task: async (ctx, task) => {
        await generateProductEmbeddings(ctx.db, async (contents) => {
          const result = await generateEmbedding(contents);
          return result;
        });
        task.title = 'Embeddings gerados';
      },
    },
    {
      title: 'A apagar produtos antigos do MongoDB',
      task: async (ctx, task) => {
        const result = await deleteInvalidProducts(ctx.db);
        task.title = `${result.deletedCount} produtos antigos apagados`;
      },
    },
    {
      title: 'A enviar novos produtos aos utilizadores',
      task: async (ctx, task) => {
        const users = await getAllUsers(ctx.db);
        let totalSentProducts = 0;

        console.log(`[notifyUsers] Found ${users.length} users`);

        const productsCollection = await getProductsCollection(ctx.db);

        for (const user of users) {
          if (!user.chatId) {
            console.log(`[notifyUsers] User ${user.id} has no chatId, skipping`);
            continue;
          }

          const prefs = user.notificationPrefs ?? { minDiscountLevel: 'razoavel', maxResultsPerCategory: 0 };

          if (!user.interests || user.interests.length === 0) {
            console.log(`[notifyUsers] User ${user.id} has no interests, sending excelente deals`);

            const excelenteProducts = await productsCollection
              .find({ discountLevel: 'excelente' })
              .sort({ discountPercentage: -1 })
              .limit(prefs.maxResultsPerCategory > 0 ? prefs.maxResultsPerCategory : 10)
              .toArray();

            const productsToSend = excelenteProducts.filter(
              product => !product.sentToUserIds || !product.sentToUserIds.includes(user.id)
            );

            if (productsToSend.length > 0) {
              await sendProductsToUser(ctx.db, user.id, user.chatId, productsToSend, true);

              const productIds = productsToSend.map(p => p.id);
              await productsCollection.updateMany(
                { id: { $in: productIds } },
                { $addToSet: { sentToUserIds: user.id } }
              );

              totalSentProducts += productsToSend.length;
              console.log(`[notifyUsers] User ${user.id} (no interests) sent ${productsToSend.length} excelente products`);
            }
            continue;
          }

          const DISCOUNT_LEVELS = ['razoavel', 'bom', 'excelente'] as const;
          const minLevelIdx = DISCOUNT_LEVELS.indexOf(prefs.minDiscountLevel);
          const allowedLevels = DISCOUNT_LEVELS.slice(minLevelIdx);

          const maxPerInterest = prefs.maxResultsPerCategory > 0 ? prefs.maxResultsPerCategory : 20;

          const interestsWithEmbeddings = user.interests.filter((i): i is InterestItem & { embedding: number[] } =>
            typeof i !== 'string' && !!(i as InterestItem).embedding && (i as InterestItem).embedding!.length > 0
          );

          let foundProducts: Product[];

          if (interestsWithEmbeddings.length > 0) {
            foundProducts = await searchProductsByInterests(ctx.db, interestsWithEmbeddings, {
              allowedLevels,
              maxPerInterest,
              excludeProductIds: [],
              minDiscountPercentage: 0,
            });
          } else {
            foundProducts = [];
          }

          const simpleInterests = user.interests.filter(
            i => typeof i === 'string' || !(i as InterestItem).embedding || (i as InterestItem).embedding!.length === 0
          );

          if (simpleInterests.length > 0) {
            const categoryNames = simpleInterests.map(i =>
              typeof i === 'string' ? i : (i as InterestItem).categories
            ).flat().filter((v, idx, arr) => arr.indexOf(v) === idx);

            if (categoryNames.length > 0) {
              const baseQuery: any = {
                discountLevel: { $in: allowedLevels },
              };

              let categoryProducts;
              if (maxPerInterest > 0) {
                const perCategoryResults = await Promise.all(
                  categoryNames.map(cat =>
                    productsCollection
                      .find({ ...baseQuery, parentCategory: cat })
                      .sort({ discountPercentage: -1 })
                      .limit(maxPerInterest)
                      .toArray()
                  )
                );
                categoryProducts = perCategoryResults.flat();
              } else {
                categoryProducts = await productsCollection
                  .find({ ...baseQuery, parentCategory: { $in: categoryNames } })
                  .sort({ discountPercentage: -1 })
                  .toArray();
              }

              const existingIds = new Set(foundProducts.map(p => p.id));
              for (const p of categoryProducts) {
                if (!existingIds.has(p.id)) {
                  foundProducts.push(p);
                }
              }
            }
          }

          const productsToSend = foundProducts.filter(
            product => !product.sentToUserIds || !product.sentToUserIds.includes(user.id)
          );

          console.log(`[notifyUsers] User ${user.id} found ${foundProducts.length} products, ${productsToSend.length} unsent`);

          if (productsToSend.length > 0) {
            await sendProductsToUser(ctx.db, user.id, user.chatId, productsToSend, true);

            const productIds = productsToSend.map(p => p.id);
            await productsCollection.updateMany(
              { id: { $in: productIds } },
              { $addToSet: { sentToUserIds: user.id } }
            );

            totalSentProducts += productsToSend.length;
            console.log(`[notifyUsers] User ${user.id} sent ${productsToSend.length} products`);
          } else {
            console.log(`[notifyUsers] User ${user.id} no products to send`);
          }
        }

        task.title = `Novos produtos enviados: ${totalSentProducts} total (${users.length} utilizadores)`;
      },
    },
  ]);

  try {
    await tasks.run();

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✓ Execução concluída em ${executionTime} minutos`);
  } finally {
    await closeConnection();
  }
};

main().catch(console.error);
