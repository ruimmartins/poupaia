import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleMessage } from "../src/handleMessage"
import { sendTelegramMessage, sendTelegramPhoto } from "@poupaia/messaging"
import dotenv from 'dotenv';
import path from 'path';

// Carregar .env explicitamente (fallback se Vercel Dev não carregar)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed")
  }

  const update = req.body

  res.status(200).send("OK")

  const chatId = update.message.chat.id;
  const messages = await handleMessage(update.message)

  await sendTelegramMessage(chatId, "Processando sua mensagem... ⏳");

  for (const msg of messages) {
    if (msg.imageUrl) {
      await sendTelegramPhoto(chatId, msg.imageUrl, msg.text);
    } else {
      await sendTelegramMessage(chatId, msg.text);
    }
    
    // Pequeno delay entre mensagens para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}