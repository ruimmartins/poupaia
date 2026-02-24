import { Listr } from "listr2";
import { scrapAmazon } from "./amazon";
import { connectToDatabase, closeConnection, Product, deleteInvalidProducts, createOrUpdateProducts } from "@poupaia/db";
import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

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
      title: "Conectando ao MongoDB...",
      task: async (ctx, task) => {
        ctx.db = await connectToDatabase();
        task.title = "Conectado ao MongoDB";
      },
    },
    {
      title: "Scraping Amazon em paralelo...",
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
        
        const uniqueProducts = Array.from(
          new Map(ctx.products.map((p: Product) => [p.id, p])).values()
        );
        ctx.products = uniqueProducts;
        
        task.title = `Scraping concluído: ${ctx.products.length} produtos únicos (${PARALLEL_TASKS} tasks em paralelo)`;
      },
    },
    {
      title: "A guardar produtos no MongoDB",
      task: async (ctx, task) => {
        const products: Product[] = ctx.products;
        
        if (products.length === 0) {
          task.title = "Nenhum produto encontrado";
          return;
        }
        
        const result = await createOrUpdateProducts(ctx.db, products);
        
        task.title = `${result.upsertedCount} novos, ${result.modifiedCount} atualizados (${products.length} total)`;
      },
    }
  ]);

  try {
    await tasks.run();
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✓ Execução concluída em ${executionTime} minutos`);
  } finally {
    await closeConnection();
  }
}

main().catch(console.error);