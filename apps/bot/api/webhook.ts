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

  const chatId = update.message.chat.id

  await sendTelegramMessage(chatId, "Processando sua mensagem... ⏳")

  console.log("Received update:", JSON.stringify(update))

  res.status(200).send("OK")

  const messages = await handleMessage(update.message)

  for (const msg of messages) {
    if (msg.imageUrl) {
      await sendTelegramPhoto(chatId, msg.imageUrl, msg.text)
    } else {
      await sendTelegramMessage(chatId, msg.text)
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}
