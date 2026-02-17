export interface Alert {
  id: string,
  userId: string,

  type: "price_watch" | "category_watch" | "recommendation",

  criteria: {
    product?: string,
    category?: string,
    keywords?: string[],
    maxPrice?: number,
    minDiscountPercent?: number
  },

  frequency: "once" | "always",

  isActive: boolean,

  createdAt: Date,
  lastTriggeredAt?: Date
}