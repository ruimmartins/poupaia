import { BrowsingIntentTypeEnum } from '../types';

export interface BrowsingResponse {
  type: BrowsingIntentTypeEnum;
  intent?: {
    productIndex: number;
    productTitle: string;
    verdict: 'worth_it' | 'not_worth_it' | 'depends';
    reason: string;
  };
}
