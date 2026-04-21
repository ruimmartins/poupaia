import { QueryFilters } from '../types/query-filters';
import { Message } from './message';
import { Product } from './products';

export interface Activity {
  id?: string; // ID único da atividade
  userId: number;
  startedAt: string; // Timestamp de início da atividade
  productsSent: Product[]; // Array de produtos enviados ao usuário
  trigger: string; // Mensagem que disparou a atividade
  intent: QueryFilters;
}
