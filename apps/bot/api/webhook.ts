import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleMessage } from "../src/handleMessage"
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

  if (!update.message) {
    return res.status(200).send("OK")
  }

  const response = await handleMessage(update.message)

  console.log('📤 Response to send:', response);

  return res.status(200).send("OK")
}