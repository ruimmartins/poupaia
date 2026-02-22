export interface User {
  id: number;
  createdAt: string;
  isActive: boolean;
  blockedUntil?: string;
  sentProductIds?: string[];
  pendingAlertFilters?: {
    searchQuery: string;
    categories?: string[];
    keywordGroups?: string[][];
    minPrice?: number;
    maxPrice?: number;
    minDiscount?: number;
  };
  profile: {
    firstName?: string;
    lastName?: string;
    username?: string;
    language?: "pt" | "en";
  };
}