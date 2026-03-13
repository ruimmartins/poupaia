export interface Product {
  // --- Identifiers ---
  id: string; // Unique Amazon ID (Primary Key)

  // --- Core Product Data ---
  title: string;
  currentPrice: number; // Cleaned decimal (e.g., 29.99)
  originalPrice: number | null; // For discount calculation
  brand: string | null; // Optional brand name
  discountPercentage: number; // Calculated: ((original - current) / original) * 100

  // --- Assets & Links ---
  url: string; // Clean URL (no tracking params)
  imageUrl: string;
  category: string; // Scraped category or department

  // --- Timestamps ---
  createdAt: string; // When first seen
  updatedAt: string; // Last time price was checked
  expiresAt: string | null; // Especially for Lightning Deals (Ofertas Flash)

  embedding?: number[]; // Gemini embedding vector (length depends on model, e.g., 768 or 1024)

  // --- AI Analysis (Gemini Output) ---
  /* aiAnalysis?: {
    dealScore: number;        // 0 to 10 (AI's rating of the deal)
    summary: string;          // One-sentence sales pitch
    pros: string[];           // List of key benefits
    cons: string[];           // Any warnings (e.g., "only for Prime")
    isGoodDeal: boolean;      // Final verdict
    telegramPost: string;     // The final formatted text for the channel
  }; */
}
