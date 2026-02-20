export const sendTelegramMessage = async (
  chatId: string,
  text: string
) => {
  console.log("MESSAGE TELEGRAM TOKEN:", process.env.TELEGRAM_BOT_TOKEN);
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown"
    })
  })
}

export const sendTelegramPhoto = async (
  chatId: string,
  photoUrl: string,
  caption?: string
) => {
  console.log("PHOTO TELEGRAM TOKEN:", process.env.TELEGRAM_BOT_TOKEN);
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "Markdown"
    })
  })
}
