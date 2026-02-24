export interface ProductFilters {
  // Pesquisa orgânica
  searchQuery?: string;       // Query de pesquisa orgânica (usado com text search)
  
  // Filtros de preço
  minPrice?: number;
  maxPrice?: number;
  
  // Filtros de desconto
  minDiscount?: number;       // Exemplo: 30 (para 30% ou mais)
  
  // Filtros de categoria
  categories?: string[];      // Array de categorias
  
  keywordGroups?: string[][]; // Array de grupos de keywords. Dentro de cada grupo é OR, entre grupos é AND
                              // Exemplo: [["homem", "men"], ["sapatilhas", "sneakers"]]
                              // Significa: (homem OR men) AND (sapatilhas OR sneakers)
  
  // Ordenação
  sortBy?: 'price' | 'discountPercentage' | 'createdAt';
  sortOrder?: 'asc' | 'desc'; // ascendente ou descendente
  
  // Paginação
  limit?: number;
}