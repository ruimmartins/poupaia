export interface Alert {
  id: string;
  userId: number;
  chatId: number;
  
  searchQuery: string;
  categories?: string[];
  keywordGroups?: string[][];
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  
  isActive: boolean;
  
  createdAt: string;
  lastCheckedAt?: string;
  lastTriggeredAt?: string;
}