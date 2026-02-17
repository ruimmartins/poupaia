export interface User{
  id: string,
  createdAt: Date,
  isActive: boolean,
  profile: {
    firstName?: string,
    language?: "pt" | "en"
  }
}