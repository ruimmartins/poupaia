import { QueryFilters } from '@poupaia/db';
import { IdleIntentTypeEnum } from '../types';

export interface SearchResponse {
  type: IdleIntentTypeEnum;
  intent: QueryFilters;
}
