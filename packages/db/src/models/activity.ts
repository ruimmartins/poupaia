import { Message } from './message';
import { ProductFilters } from './product-filters';
import { Product } from './products';

export interface Activity {
  id?: string; // ID único da atividade
  userId: number;
  startedAt: string; // Timestamp de início da atividade
  productsSent: Product[]; // Array de produtos enviados ao usuário
  messages: Message[]; // Array de mensagens trocadas com o usuário
  intent: ProductFilters;
}
