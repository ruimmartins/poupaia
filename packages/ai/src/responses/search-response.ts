import { QueryFilters } from '@poupaia/shared';
import { IdleIntentTypeEnum } from '../types';

export interface SearchResponse {
  type: IdleIntentTypeEnum;
  intent: QueryFilters;
}
