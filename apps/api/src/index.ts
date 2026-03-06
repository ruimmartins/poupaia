import 'dotenv/config';
import express from 'express';
import { handleRequest } from './entry';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/', async (req, res) => {
  const startTime = Date.now();
  const updateId = req.body?.update_id;
  console.log(`[webhook] Incoming update id=${updateId} from=${req.body?.message?.from?.id} chat=${req.body?.message?.chat?.id}`);

  try {
    const update = req.body;

    if (!update?.message?.chat?.id) {
      console.warn('[webhook] Bad request — missing message or chat id');
      return res.status(400).send('Bad Request');
    }

    res.status(200).send('OK');
    console.log(`[webhook] Acknowledged update id=${updateId} in ${Date.now() - startTime}ms`);

    await handleRequest(update.message);
    console.log(`[webhook] Finished processing update id=${updateId} in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error(`[webhook] Error processing update id=${updateId}:`, error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`[server] Bot webhook server running on port ${PORT}`);
});
