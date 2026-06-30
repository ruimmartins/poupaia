interface Profile {
  firstName?: string;
  lastName?: string;
  username?: string;
  language?: 'pt' | 'en';
}

export enum UserStateEnum {
  IDLE = 'idle',
  BROWSING = 'browsing',
  SETTING_INTERESTS = 'setting_interests',
  SETTING_NOTIF_PREFS = 'setting_notif_prefs',
}

export interface UserQueries {
  query: string;
  embeddings?: number[];
}

export interface NotificationPrefs {
  minDiscountLevel: 'razoavel' | 'bom' | 'excelente';
  maxResultsPerCategory: number;
}

export interface InterestItem {
  query: string;
  categories: string[];
  brands?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  excludeBrands?: string[];
  embedding?: number[];
  createdAt: string;
}

export interface User {
  id: number;
  createdAt: string;
  state: UserStateEnum;
  profile: Profile;
  queries?: UserQueries[];
  interests?: InterestItem[];
  notificationPrefs?: NotificationPrefs;
  chatId: number;
}
