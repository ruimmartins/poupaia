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
}

export interface User {
  id: number;
  createdAt: string;
  state: UserStateEnum;
  profile: Profile;
  queries?: string[];
  chatId: number;
}
