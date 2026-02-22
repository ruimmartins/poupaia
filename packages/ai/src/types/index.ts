import type { ProductFilters } from '@poupaia/db';

export enum IntentType {
  IRRELEVANT = 'irrelevant',
  ALERT = 'alert',
  SEARCH = 'search',
  DELETE_ALERT = 'delete_alert',
}

export interface AIResponse {
  isRelevant: boolean;
  messageType?: IntentType;
  filters?: any;
  userMessage?: string;
}

export interface ProcessedMessage {
  type: IntentType;
  filters?: ProductFilters;
  alertData?: {
    criteria: {
      categories?: string[];
      keywordGroups?: string[][];
      maxPrice?: number;
      minDiscountPercent?: number;
    };
  };
  deleteAlertData?: {
    categories?: string[];
    keywordGroups?: string[][];
  };
  responseMessage: string;
}

export interface ProductMessage {
  text: string;
  imageUrl?: string;
}
