export interface ProductFilters {
  // Filtros de preço
  minPrice?: number;
  maxPrice?: number;
  
  // Filtros de desconto
  minDiscount?: number;       // Exemplo: 30 (para 30% ou mais)
  
  // Filtros de categoria
  categories?: string[];      // Array de categorias
  
  // Filtros de tempo
  hasExpiration?: boolean;    // true = apenas ofertas com expiração
  notExpired?: boolean;       // true = excluir produtos já expirados
  
  // Filtros de análise AI
  minDealScore?: number;      // Exemplo: 7 (para 7/10 ou mais)
  onlyGoodDeals?: boolean;    // true = apenas aiAnalysis.isGoodDeal = true
  
  // Filtros de palavras-chave
  keywords?: string[];        // Array de palavras-chave (TODAS devem estar presentes - AND)
  keywordGroups?: string[][]; // Array de grupos de keywords. Dentro de cada grupo é OR, entre grupos é AND
                              // Exemplo: [["homem", "men"], ["sapatilhas", "sneakers"]]
                              // Significa: (homem OR men) AND (sapatilhas OR sneakers)
  
  // Ordenação
  sortBy?: 'price' | 'discount' | 'dealScore' | 'createdAt';
  sortOrder?: 'asc' | 'desc'; // ascendente ou descendente
  
  // Paginação
  limit?: number;
  skip?: number;
}