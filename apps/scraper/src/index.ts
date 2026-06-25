import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { Listr } from 'listr2';
import { scrapAmazon } from './amazon';
import { connectToDatabase, closeConnection, Product, createOrUpdateProducts, deleteInvalidProducts, getAllUsers, getProductsCollection } from '@poupaia/db';
import { sendProductsToUser } from '@poupaia/shared';

// Carregar .env da pasta apps/scraper (apenas em desenvolvimento local)
const envPath = path.resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const main = async () => {
  const startTime = Date.now();
  const PARALLEL_TASKS = 1; // Número de scrapers em paralelo

  const tasks = new Listr([
    {
      title: 'Wating...',
      skip: process.env.NO_SCRAPING === 'true', // Pular em produção
      task: async (ctx, task) => {
        const oneHour = 1000 * 60 * 60;
        const delay = Math.floor(Math.random() * oneHour); // Delay aleatório entre 0h e 1h
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
      skip: process.env.NO_SCRAPING === 'true', // Pular em produção
      task: async (ctx, task) => {
        const scrapingTasks = Array.from({ length: PARALLEL_TASKS }, (_, index) =>
          scrapAmazon(index, PARALLEL_TASKS)
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
      skip: process.env.NO_SCRAPING === 'true', // Pular em produção
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

          if (!user.interests || user.interests.length === 0) {
            console.log(`[notifyUsers] User ${user.id} has no interests, skipping`);
            continue;
          }

          const prefs = user.notificationPrefs ?? { minDiscountLevel: 'razoavel', maxResultsPerCategory: 0 };
          const maxResultsPerCat = prefs.maxResultsPerCategory > 0 ? prefs.maxResultsPerCategory : 0;

          const DISCOUNT_LEVELS = ['razoavel', 'bom', 'excelente'] as const;
          const minLevelIdx = DISCOUNT_LEVELS.indexOf(prefs.minDiscountLevel);
          const allowedLevels = DISCOUNT_LEVELS.slice(minLevelIdx);

          const baseQuery: any = {
            discountLevel: { $in: allowedLevels },
          };

          let foundProducts;

          if (maxResultsPerCat > 0) {
            // Query per-category with individual limits
            const perCategoryResults = await Promise.all(
              user.interests.map(interest =>
                productsCollection
                  .find({ ...baseQuery, parentCategory: interest })
                  .sort({ discountPercentage: -1 })
                  .limit(maxResultsPerCat)
                  .toArray()
              )
            );
            foundProducts = perCategoryResults.flat();
          } else {
            const categoryQueries = user.interests.map(interest => ({
              parentCategory: interest,
            }));

            foundProducts = await productsCollection
              .find({ ...baseQuery, $or: categoryQueries })
              .sort({ discountPercentage: -1 })
              .toArray();
          }

          // Filter out products already sent to this user
          const productsToSend = foundProducts.filter(
            product => !product.sentToUserIds || !product.sentToUserIds.includes(user.id)
          );

          console.log(`[notifyUsers] User ${user.id} found ${foundProducts.length} products, ${productsToSend.length} unsent`);

          if (productsToSend.length > 0) {
            await sendProductsToUser(ctx.db, user.id, user.chatId, productsToSend, true);

            // Update products to track that this user received them
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
