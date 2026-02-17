export interface Channel {
  id: string,
  userId: string,

  platform: "telegram" | "whatsapp" | "instagram" | "facebook",

  platformUserId: string,  // telegramId, whatsappId, etc
  username?: string,

  isPrimary: boolean,
  isActive: boolean,

  createdAt: Date

}