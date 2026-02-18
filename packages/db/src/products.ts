import { Db, Collection, Filter } from 'mongodb';
import { Product } from './models/products';
import { ProductFilters } from './models/product-filters';

const escapeRegex = (text: string) => text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

export const getProductsCollection = async (db: Db): Promise<Collection<Product>> =>
  db.collection<Product>('products');

export const getAllCategories = async (db: Db): Promise<string[]> =>
  await db.collection('products').distinct('category');

export const createOrUpdateProducts = async (db: Db, products: Product[]) => {
  const collection = await getProductsCollection(db);

  const bulkOps = products.map(product => {
    const { createdAt, ...productWithoutCreatedAt } = product;

    return {
      updateOne: {
        filter: { id: product.id },
        update: {
          $set: productWithoutCreatedAt,
          $setOnInsert: { createdAt },
        },
        upsert: true,
      },
    };
  });

  return await collection.bulkWrite(bulkOps);
};

export const deleteExpiredProducts = async (db: Db) => {
  const collection = await getProductsCollection(db);
  
  // Data atual
  const now = new Date();
  
  // Data de 8 dias atrás
  const eightDaysAgo = new Date();
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
  
  return await collection.deleteMany({
    $or: [
      // Produtos com data de expiração que já expiraram
      {
        expiresAt: {
          $ne: null,
          $lt: now.toISOString(),
        },
      },
      // Produtos sem data de expiração criados há mais de 8 dias
      {
        expiresAt: null,
        createdAt: {
          $lt: eightDaysAgo.toISOString(),
        },
      },
    ],
  });
};

export async function findProductsForUser(
  db: Db,
  filters: ProductFilters = {}
): Promise<Product[]> {
  const collection = await getProductsCollection(db);

  const andConditions: any[] = [];

  // Construir o filtro do MongoDB
  const mongoFilter: Filter<Product> = {};

  // Filtro de preço
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    mongoFilter.currentPrice = {};
    if (filters.minPrice !== undefined) {
      mongoFilter.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      mongoFilter.currentPrice.$lte = filters.maxPrice;
    }
  }

  // Filtro de desconto
  if (filters.minDiscount !== undefined) {
    mongoFilter.discountPercentage = { $gte: filters.minDiscount };
  }

  // Filtro de categorias
  if (filters.categories && filters.categories.length > 0) {
    mongoFilter.category = { $in: filters.categories }; // Match any of the categories
  }

  // Filtro de palavras-chave (TODAS devem estar presentes)
  if (filters.keywords && filters.keywords.length > 0) {
    // Usar $and para garantir que TODAS as keywords estejam no título
    andConditions.push({
      $and: filters.keywords.map(keyword => ({
        title: { $regex: escapeRegex(keyword), $options: 'i' },
      })),
    });
  }

  // Filtro de grupos de palavras-chave (dentro do grupo é OR, entre grupos é AND)
  if (filters.keywordGroups && filters.keywordGroups.length > 0) {
    // Palavras que precisam de word boundary para evitar false positives
    const needsBoundary = ['men', 'man', 'boy', 'girl', 'kid', 'baby', 'women', 'woman'];
    
    // Para cada grupo, criar um $or, e juntar todos com $and
    filters.keywordGroups.forEach(group => {
      if (group.length > 0) {
        andConditions.push({
          $or: group.map(keyword => {
            // Usar word boundaries apenas para palavras específicas em inglês
            const useBoundary = needsBoundary.includes(keyword.toLowerCase());
            const pattern = useBoundary 
              ? `\\b${escapeRegex(keyword)}\\b`
              : escapeRegex(keyword);
            
            return {
              title: { $regex: pattern, $options: 'i' }
            };
          }),
        });
      }
    });
  }

  // Filtros de tempo
  if (filters.hasExpiration) {
    mongoFilter.expiresAt = { $ne: null };
  }

  if (filters.notExpired) {
    andConditions.push({
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date().toISOString() } }],
    });
  }

  // Construir ordenação
  const sort: Record<string, 1 | -1> = {};
  if (filters.sortBy) {
    const sortField =
      filters.sortBy === 'dealScore'
        ? 'aiAnalysis.dealScore'
        : filters.sortBy === 'price'
          ? 'currentPrice'
          : filters.sortBy;

    sort[sortField] = filters.sortOrder === 'asc' ? 1 : -1;
  } else {
    // Ordenação padrão: mais recentes primeiro
    sort.createdAt = -1;
  }

  if (andConditions.length > 0) {
    mongoFilter.$and = andConditions;
  }

  // Executar query
  let query = collection.find(mongoFilter).sort(sort);

  // Aplicar paginação
  if (filters.skip !== undefined) {
    query = query.skip(filters.skip);
  }

  if (filters.limit !== undefined) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(50); // Limite padrão
  }

  return await query.toArray();
}

/**
 * Busca produtos com text search (ordenado por relevância)
 * Usa o text index criado para pesquisa orgânica
 */
export async function searchProducts(
  db: Db,
  searchQuery: string,
  filters: Partial<ProductFilters> = {}
): Promise<Product[]> {
  const collection = await getProductsCollection(db);

  // Construir query com text search
  const query: any = {
    $text: { $search: searchQuery }
  };

  // Adicionar filtros opcionais
  const andConditions: any[] = [];

  // Filtro de categorias
  if (filters.categories && filters.categories.length > 0) {
    query.category = { $in: filters.categories };
  }

  // Filtro de preço
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.currentPrice = {};
    if (filters.minPrice !== undefined) {
      query.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      query.currentPrice.$lte = filters.maxPrice;
    }
  }

  // Filtro de desconto
  if (filters.minDiscount !== undefined) {
    query.discountPercentage = { $gte: filters.minDiscount };
  }

  // Filtro de keyword groups (para garantir precisão APENAS no título)
  // Exemplo: [["computador", "laptop"], ["portátil"]] = deve ter (computador OR laptop) AND (portátil)
  if (filters.keywordGroups && filters.keywordGroups.length > 0) {
    const keywordConditions = filters.keywordGroups.map((group) => {
      // Palavras que precisam de word boundary (inglês)
      const wordsNeedingBoundary = ['men', 'man', 'boy', 'girl', 'kid', 'baby', 'toddler', 'laptop', 'pc', 'computer'];
      
      return {
        $or: group.map((keyword) => {
          const needsBoundary = wordsNeedingBoundary.includes(keyword.toLowerCase());
          const pattern = needsBoundary 
            ? `\\b${keyword}\\b` 
            : keyword;
          
          return { title: { $regex: pattern, $options: 'i' } };
        }),
      };
    });

    andConditions.push(...keywordConditions);
  }

  // Filtros de tempo
  if (filters.notExpired) {
    andConditions.push({
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date().toISOString() } }],
    });
  }

  // Filtros de AI (comentados temporariamente até os produtos terem aiAnalysis)
  // TODO: Descomentar quando o scraper adicionar aiAnalysis aos produtos
  /* if (filters.minDealScore !== undefined) {
    query['aiAnalysis.dealScore'] = { $gte: filters.minDealScore };
  }

  if (filters.onlyGoodDeals) {
    query['aiAnalysis.isGoodDeal'] = true;
  } */

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  // Buscar com score de relevância
  const results = await collection
    .find(query, {
      projection: {
        score: { $meta: 'textScore' }
      }
    })
    .sort({ score: { $meta: 'textScore' } }) // Ordenar por relevância
    .limit(filters.limit || 20)
    .toArray();

  return results;
}
