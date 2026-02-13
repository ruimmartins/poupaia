import { Listr } from "listr2";
import { scrapAmazon } from "./scrappers/amazon";
import { connectToDatabase, closeConnection } from "./mongodb/connection";
import { Product } from "./mongodb/models/products";
import * as dotenv from 'dotenv';

dotenv.config();

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

        // Salvar produtos no MongoDB (upsert para evitar duplicados)
        const collection = ctx.db.collection('products');
        
        const bulkOps = products.map(product => {
          const { createdAt, ...productWithoutCreatedAt } = product;
          
          return {
            updateOne: {
              filter: { id: product.id },
              update: { 
                $set: productWithoutCreatedAt,
                $setOnInsert: { createdAt }
              },
              upsert: true
            }
          };
        });

        const result = await collection.bulkWrite(bulkOps);
        
        task.title = `${result.upsertedCount} novos, ${result.modifiedCount} atualizados (${products.length} total)`;
      },
    },
    {
      title: "A eliminar produtos expirados",
      task: async (ctx, task) => {
        const collection = ctx.db.collection('products');
        
        // Eliminar produtos onde expiresAt já passou
        const result = await collection.deleteMany({
          expiresAt: { 
            $ne: null,
            $lt: new Date().toISOString()
          }
        });
        
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