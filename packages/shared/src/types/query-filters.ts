export interface QueryFilters {
  // Pesquisa orgânica
  query: string[]; // Query de pesquisa orgânica (usado com text search)

  // Filtros de preço
  minPrice?: number;
  maxPrice?: number;

  // Filtros de desconto
  minDiscount?: number; // Exemplo: 30 (para 30% ou mais)

  // Filtros de categoria
  categories: string[]; // Array de categorias

  // Filtros de data
  minCreatedAt?: string; // ISO date string (e.g., "2025-01-01T00:00:00Z")
  maxCreatedAt?: string; // ISO date string

  embeddings?: number[]; // Embeddings para busca vetorial
}
