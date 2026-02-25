import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { Listr } from "listr2";
import {
  connectToDatabase,
  closeConnection,
  getActiveAlerts,
  searchProducts,
  updateAlertLastChecked,
  updateAlertLastTriggered,
  getUserSentProducts,
  markProductsAsSentToUser,
} from "@poupaia/db";
import { sendTelegramMessage, formatProductsForUser, getRandomMessage, MESSAGES, escapeMarkdownV2 } from "@poupaia/messaging";

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
      title: "A buscar alertas ativos...",
      task: async (ctx, task) => {
        ctx.alerts = await getActiveAlerts(ctx.db);
        
        if (ctx.alerts.length === 0) {
          task.title = "Nenhum alerta ativo encontrado";
        } else {
          task.title = `Encontrados ${ctx.alerts.length} alerta(s) ativo(s)`;
        }
      },
    },
    {
      title: "A processar alertas",
      task: async (ctx, task) => {
        if (!ctx.alerts || ctx.alerts.length === 0) {
          task.skip('Nenhum alerta para processar');
          return;
        }

        let alertsChecked = 0;
        let alertsTriggered = 0;

        for (const alert of ctx.alerts) {
          try {
            const userSentProductIds = await getUserSentProducts(ctx.db, alert.userId);
            
            const allProducts = await searchProducts(
              ctx.db,
              alert.searchQuery || '',
              {
                ...alert.filters,
              }
            );

            const newProducts = allProducts.filter(
              p => !userSentProductIds.includes(p.id)
            );

            if (newProducts.length > 0) {
              const messages = formatProductsForUser(newProducts);
              
              await sendTelegramMessage(alert.chatId.toString(), escapeMarkdownV2(getRandomMessage(MESSAGES.ALERT_TRIGGERED(newProducts.length, alert.searchQuery))));
              
              for (const message of messages) {
                await sendTelegramMessage(alert.chatId.toString(), message.text);
              }

              await markProductsAsSentToUser(
                ctx.db,
                alert.userId,
                newProducts.map(p => p.id)
              );
              
              await updateAlertLastTriggered(ctx.db, alert.id);
              alertsTriggered++;
            } else {
              await updateAlertLastChecked(ctx.db, alert.id);
            }

            alertsChecked++;
          } catch (error) {
            console.error(`Erro ao processar alerta ${alert.id}:`, error);
          }
        }

        task.title = `${alertsChecked} alerta(s) verificado(s), ${alertsTriggered} notificação(ões) enviada(s)`;
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
};

main().catch(console.error);
