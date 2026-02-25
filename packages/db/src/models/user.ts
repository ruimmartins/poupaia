import { ProductFilters } from '../types';

export interface User {
  id: number;
  createdAt: string;
  isActive: boolean;
  blockedUntil?: string;
  sentProductIds?: string[];
  pendingAlertFilters?: ProductFilters;
  profile: {
    firstName?: string;
    lastName?: string;
    username?: string;
    language?: 'pt' | 'en';
    interests?: string[];
  };
}
