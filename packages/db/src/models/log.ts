export interface Log {
  id: string;

  userId: string;
  alertId: string;
  productId: string;

  platform: 'telegram' | 'whatsapp' | 'instagram' | 'facebook';

  sentAt: Date;
}
