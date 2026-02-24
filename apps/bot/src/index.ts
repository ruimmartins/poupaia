import 'dotenv/config';
import express from 'express';
import { handleMessage } from './handleMessage';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/', async (req, res) => {
  try {
    const update = req.body;

    if (!update?.message?.chat?.id) {
      return res.status(400).send('Bad Request');
    }
    
    res.status(200).send('OK');

    await handleMessage(update.message);

  } catch (error) {
    console.error('Error processing webhook:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`Bot webhook server running on port ${PORT}`);
});
