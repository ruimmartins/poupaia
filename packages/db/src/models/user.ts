interface Profile {
  firstName?: string;
  lastName?: string;
  username?: string;
  language?: 'pt' | 'en';
  interests?: string[];
}

export enum UserStateEnum {
  IDLE = 'idle',
  BROWSING = 'browsing',
  SETTING_INTERESTS = 'setting_interests',
}

export interface User {
  id: number;
  createdAt: string;
  lastInteractionAt: string;
  blockedUntil?: string;
  state: UserStateEnum;
  profile: Profile;
}
