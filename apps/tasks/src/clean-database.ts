import { Listr } from "listr2";
import { connectToDatabase, closeConnection, Product, deleteInvalidProducts, createOrUpdateProducts, cleanUserSentProducts } from "@poupaia/db";
import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

const envPath = path.resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const main = async () => {
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
      title: "A eliminar produtos inválidos",
      task: async (ctx, task) => {
    
        const result = await deleteInvalidProducts(ctx.db);
        
        if (result.deletedCount === 0) {
          task.title = "Nenhum produto expirado";
        } else {
          task.title = `${result.deletedCount} produto(s) expirado(s) eliminado(s)`;
        }
      },
    },
    {
      title: "A limpar IDs de produtos enviados órfãos...",
      task: async (ctx, task) => {
        const result = await cleanUserSentProducts(ctx.db);

        if (result.usersChecked === 0) {
          task.title = "Nenhum utilizador com produtos enviados";
        } else if (result.idsRemoved === 0) {
          task.title = `${result.usersChecked} utilizador(es) verificado(s), nenhum ID órfão`;
        } else {
          task.title = `${result.idsRemoved} ID(s) órfão(s) removido(s) de ${result.usersChecked} utilizador(es)`;
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