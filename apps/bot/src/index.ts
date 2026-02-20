import express from 'express';
import { handleMessage } from './handleMessage';
import { sendTelegramMessage, sendTelegramPhoto } from '@poupaia/messaging';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/', async (req, res) => {
  try {
    const update = req.body;

    if (!update?.message?.chat?.id) {
      return res.status(400).send('Bad Request');
    }

    const chatId = update.message.chat.id;

    console.log('Received update:', JSON.stringify(update));

    await sendTelegramMessage(chatId, 'Processando sua mensagem... ⏳');

    console.log("message sent to user, starting processing...");
    
    // Responder imediatamente ao Telegram para evitar timeout
    res.status(200).send('OK');

    console.log("handleMessage will be called now...");

    // Processar mensagem em background
    const messages = await handleMessage(update.message);

    console.log("handleMessage has been called.");

    for (const msg of messages) {
      if (msg.imageUrl) {
        await sendTelegramPhoto(chatId, msg.imageUrl, msg.text);
      } else {
        await sendTelegramMessage(chatId, msg.text);
      }
      // Pequeno delay para garantir ordem
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log("all done");

  } catch (error) {
    console.error('Error processing webhook:', error);
    // Se ainda não respondeu (erro síncrono antes do res.send), responder agora
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`Bot webhook server running on port ${PORT}`);
});
