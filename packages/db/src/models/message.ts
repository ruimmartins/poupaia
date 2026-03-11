export interface Message {
  id: string | null;
  type: 'user' | 'model';
  userId: number;
  text: string;
  timestamp: Date;
  processed: boolean;
}
