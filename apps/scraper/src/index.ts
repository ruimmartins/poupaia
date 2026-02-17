import { Listr } from "listr2";
import { scrapAmazon } from "./amazon";
import { connectToDatabase, closeConnection, Product, deleteExpiredProducts, createOrUpdateProducts } from "@poupaia/db";
import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

// Carregar .env da pasta apps/scraper (apenas em desenvolvimento local)
const envPath = path.resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function main() {
  const startTime = Date.now();
  
  const tasks = new Listr([
    {
      title: "Conectando ao MongoDB...",
      task: async (ctx, task) => {
        ctx.db = await connectToDatabase();
        task.title = "Conectado ao MongoDB";
      },
    },
    {
      title: "Scraping Amazon...",
      task: async (ctx, task) => {
        ctx.products = await scrapAmazon();
        task.title = `Scraping Amazon concluído: ${ctx.products.length} produtos encontrados`;
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
    },
    {
      title: "A eliminar produtos expirados",
      task: async (ctx, task) => {
    
        const result = await deleteExpiredProducts(ctx.db);
        
        if (result.deletedCount === 0) {
          task.title = "Nenhum produto expirado";
        } else {
          task.title = `${result.deletedCount} produto(s) expirado(s) eliminado(s)`;
        }
      },
    },
  ]);

  try {
    await tasks.run();
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`\n✓ Execução concluída em ${executionTime}s`);
  } finally {
    await closeConnection();
  }
}

main().catch(console.error);