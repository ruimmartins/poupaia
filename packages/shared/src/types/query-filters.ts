export interface QueryFilters {
  // Pesquisa orgânica
  query?: string[]; // Query de pesquisa orgânica (usado com text search)

  // Filtros de preço
  minPrice?: number;
  maxPrice?: number;

  // Filtros de desconto
  minDiscount?: number; // Exemplo: 30 (para 30% ou mais)

  // Filtros de categoria
  categories?: string[]; // Array de categorias

  keywordGroups?: string[][];

  excludeIds?: string[]; // IDs de produtos a excluir dos resultados
}
