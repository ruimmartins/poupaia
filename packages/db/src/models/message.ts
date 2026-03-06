export interface Message {
  id: string | null;
  type: 'user' | 'bot';
  userId: number;
  text: string;
  timestamp: Date;
  processed: boolean;
}
