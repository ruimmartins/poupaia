export interface Message {
  id: string;
  userId: number;                // ID do utilizador Telegram
  chatId: number;                // ID do chat
  text: string;                  // Conteúdo da mensagem
  intentType: string;            // "search", "alert", "irrelevant", etc.
  createdAt: string;             // ISO string
}
