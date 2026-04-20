import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { Listr } from 'listr2';
import { scrapAmazon } from './amazon';
import { connectToDatabase, closeConnection, Product, createOrUpdateProducts, deleteInvalidProducts, getAllUsers, searchProducts, getProductsCollection, getAllProductsWithoutEmbeddings, getBestPromotions } from '@poupaia/db';
import { sendProductsToUser } from '@poupaia/shared';
import { generateEmbedding } from '@poupaia/ai';

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
      title: 'A gerar embeddings para os produtos',
      task: async (ctx, task) => {
        const batchSize = 50;
        const products: Product[] = await getAllProductsWithoutEmbeddings(ctx.db);

        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);

          const contents = batch.map(p => `${p.title}, Category: ${p.category}`);

          const response = await generateEmbedding(contents);

          for (let j = 0; j < batch.length; j++) {
            batch[j].embedding = response[j].values;
          }

          await createOrUpdateProducts(ctx.db, batch);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Pequena pausa para evitar sobrecarregar a API
        }

        task.title = `Embeddings gerados para ${products.length} produtos`;
      },
    },
    {
      title: 'A enviar novos produtos aos utilizadores',
      task: async (ctx, task) => {
        const users = await getAllUsers(ctx.db);
        let totalSentProducts = 0;

        console.log(`[notifyUsers] Found ${users.length} users`);

        for (const user of users) {
          if (!user.chatId) {
            console.log(`[notifyUsers] User ${user.id} has no chatId, skipping`);
            continue;
          }

          // Verificar se o utilizador tem categorias de interesse definidas
          if (!user.interests || user.interests.length === 0) {
            console.log(`[notifyUsers] User ${user.id} has no interests, skipping`);
            continue;
          }

          // Procurar produtos das categorias de interesse criados na última hora
          const minCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
          
          const productsCollection = await getProductsCollection(ctx.db);
          
          // Criar query para encontrar produtos cujas categorias começam com as categorias de interesse
          const categoryQueries = user.interests.map(interest => ({
            category: { $regex: `^${interest}`, $options: 'i' },
          }));
          
          const foundProducts = await productsCollection
            .find({
              createdAt: { $gte: minCreatedAt },
              $or: categoryQueries,
            })
            .sort({ discountPercentage: -1 })
            .toArray();

          console.log(`[notifyUsers] User ${user.id} found ${foundProducts.length} products from interests`);

          if (foundProducts.length > 0) {
            // Enviar todos os produtos encontrados (sem limite de 10)
            await sendProductsToUser(ctx.db, user.id, user.chatId, foundProducts, true);
            totalSentProducts += foundProducts.length;
            console.log(`[notifyUsers] User ${user.id} sent ${foundProducts.length} products`);
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
