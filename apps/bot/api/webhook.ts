import { handleMessage } from "../src/handleMessage"
import { sendTelegramMessage, sendTelegramPhoto } from "@poupaia/messaging"

export default async (req:any, res:any) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed")
  }

  const update = req.body

  if (!update?.message?.chat?.id) {
    return res.status(400).send("Bad Request")
  }

  res.status(200).send("OK")

  const chatId = update.message.chat.id
  const messages = await handleMessage(update.message)

  await sendTelegramMessage(chatId, "Processando sua mensagem... ⏳")

  for (const msg of messages) {
    if (msg.imageUrl) {
      await sendTelegramPhoto(chatId, msg.imageUrl, msg.text)
    } else {
      await sendTelegramMessage(chatId, msg.text)
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}
