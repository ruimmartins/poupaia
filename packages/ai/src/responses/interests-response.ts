import { InterestsIntentTypeEnum } from '../types';

export interface InterestItem {
  query: string;
  categories: string[];
}

export interface InterestsResponse {
  type: InterestsIntentTypeEnum;
  interests: InterestItem[];
}
