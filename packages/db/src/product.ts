import { Db, Collection } from 'mongodb';
import { Product } from './models/products';
import { InterestItem } from './models/user';
import { QueryFilters } from './types/query-filters';
import { brands } from './helpers/files/good-brands';

export const getProductsCollection = async (db: Db): Promise<Collection<Product>> => db.collection<Product>('products');

export const getAllCategories = async (db: Db): Promise<string[]> => await db.collection('products').distinct('category');

export const createOrUpdateProducts = async (db: Db, products: Product[]) => {
  const collection = await getProductsCollection(db);

  const bulkOps = products
    .filter(product => brands.includes(product.brand ?? 'not a brand'))
    .map(product => {
      const { createdAt, sentToUserIds, ...productWithoutMeta } = product;

      return {
        updateOne: {
          filter: { id: product.id },
          update: {
            $set: productWithoutMeta,
            $setOnInsert: { createdAt },
          },
          upsert: true,
        },
      };
    });

  return await collection.bulkWrite(bulkOps);
};

export const deleteInvalidProducts = async (db: Db) => {
  const collection = await getProductsCollection(db);

  const now = new Date();

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  return await collection.deleteMany({
    $or: [
      {
        currentPrice: { $eq: null } as any,
      },
      {
        expiresAt: null,
        createdAt: {
          $lt: twoDaysAgo.toISOString(),
        },
      },
      {
        expiresAt: {
          $lt: now.toISOString(),
        },
      },
    ],
  });
};

const EXPECTED_EMBEDDING_DIMENSION = 384;

export const getAllProductsWithoutEmbeddings = async (db: Db): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  return await collection
    .find({
      $or: [
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } },
        {
          $expr: {
            $ne: [{ $size: { $ifNull: ['$embedding', []] } }, EXPECTED_EMBEDDING_DIMENSION],
          },
        },
      ],
    })
    .toArray();
};

export const searchProducts = async (db: Db, filters: Partial<QueryFilters> = {}, excludeProducts?: string[]): Promise<Product[]> => {
  const collection = await getProductsCollection(db);
  const vectorIndexName = process.env.MONGODB_VECTOR_INDEX_NAME || 'product_vector_search';

  if (!Array.isArray(filters.embeddings) || filters.embeddings.length === 0) {
    console.warn('[searchProducts] Missing embeddings for vector search');
    return [];
  }

  const expectedDimensionsRaw = process.env.MONGODB_VECTOR_DIMENSIONS || '';
  const expectedDimensions = Number.parseInt(expectedDimensionsRaw, 10);
  if (Number.isFinite(expectedDimensions) && filters.embeddings.length !== expectedDimensions) {
    console.warn(`[searchProducts] Embedding dimensions mismatch. expected=${expectedDimensions} got=${filters.embeddings.length}`);
    return [];
  }

  const query: any = {};

  if (excludeProducts && excludeProducts.length > 0) {
    query.id = { $nin: excludeProducts };
  }

  if (filters.minPrice || filters.maxPrice) {
    query.currentPrice = {};
    if (filters.minPrice) {
      query.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice) {
      query.currentPrice.$lte = filters.maxPrice;
    }
  }

  if (filters.minDiscount !== undefined && filters.minDiscount !== null) {
    query.discountPercentage = { $gte: filters.minDiscount };
  }

  // createdAt is NOT a filter field in the Atlas vectorSearch index,
  // so it must be applied as a $match stage after $vectorSearch.
  const postMatchQuery: any = {};

  if (filters.minCreatedAt || filters.maxCreatedAt) {
    postMatchQuery.createdAt = {};
    if (filters.minCreatedAt) {
      postMatchQuery.createdAt.$gte = filters.minCreatedAt;
    }
    if (filters.maxCreatedAt) {
      postMatchQuery.createdAt.$lte = filters.maxCreatedAt;
    }
  }

  const hasFilterQuery = Object.keys(query).length > 0;
  const hasPostMatchQuery = Object.keys(postMatchQuery).length > 0;

  const pipeline: object[] = [
    {
      $vectorSearch: {
        index: vectorIndexName,
        path: 'embedding',
        queryVector: filters.embeddings,
        ...(hasFilterQuery ? { filter: query } : {}),
        numCandidates: 1000,
        limit: 100,
      },
    },
    {
      $addFields: {
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  if (hasPostMatchQuery) {
    pipeline.push({ $match: postMatchQuery });
  }

  pipeline.push({ $limit: 20 });

  const results = await collection.aggregate<Product>(pipeline).toArray();

  return results;
};

export const getBestPromotions = async (db: Db, limit: number = 10, excludeProducts: string[] = []): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  const minCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  const query: any = {
    createdAt: { $gte: minCreatedAt },
    discountPercentage: { $gt: 0 },
  };

  if (excludeProducts.length > 0) {
    query.id = { $nin: excludeProducts };
  }

  return await collection.find(query).sort({ discountPercentage: -1 }).limit(limit).toArray();
};

export const searchProductsByInterests = async (
  db: Db,
  interests: InterestItem[],
  {
    allowedLevels = ['razoavel', 'bom', 'excelente'] as const,
    maxPerInterest = 20,
    excludeProductIds = [] as string[],
    minDiscountPercentage = 0,
  }: {
    allowedLevels?: readonly string[];
    maxPerInterest?: number;
    excludeProductIds?: string[];
    minDiscountPercentage?: number;
  } = {}
): Promise<Product[]> => {
  const collection = await getProductsCollection(db);
  const vectorIndexName = process.env.MONGODB_VECTOR_INDEX_NAME || 'product_vector_search';
  const expectedDimensionsRaw = process.env.MONGODB_VECTOR_DIMENSIONS || '';
  const expectedDimensions = Number.parseInt(expectedDimensionsRaw, 10);

  const resultsMap = new Map<string, Product>();

  for (const interest of interests) {
    if (!interest.embedding || interest.embedding.length === 0) {
      continue;
    }

    if (Number.isFinite(expectedDimensions) && interest.embedding.length !== expectedDimensions) {
      console.warn(`[searchProductsByInterests] Embedding dimension mismatch for "${interest.query}"`);
      continue;
    }

    const preFilter: any = {};

    if (excludeProductIds.length > 0) {
      preFilter.id = { $nin: excludeProductIds };
    }

    if (minDiscountPercentage > 0) {
      preFilter.discountPercentage = { $gte: minDiscountPercentage };
    }

    if (allowedLevels.length < 3) {
      preFilter.discountLevel = { $in: allowedLevels };
    }

    const pipeline: object[] = [
      {
        $vectorSearch: {
          index: vectorIndexName,
          path: 'embedding',
          queryVector: interest.embedding,
          ...(Object.keys(preFilter).length > 0 ? { filter: preFilter } : {}),
          numCandidates: 500,
          limit: maxPerInterest * 3,
        },
      },
      {
        $addFields: {
          _vectorScore: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    if (interest.categories.length > 0) {
      pipeline.push({ $match: { parentCategory: { $in: interest.categories } } });
    }

    if (interest.brands && interest.brands.length > 0) {
      pipeline.push({ $match: { brand: { $in: interest.brands } } });
    }

    if (interest.includeKeywords && interest.includeKeywords.length > 0) {
      const andClauses = interest.includeKeywords.map(kw => ({
        title: { $regex: escapeRegex(kw), $options: 'i' },
      }));
      pipeline.push({ $match: { $and: andClauses } });
    }

    if (interest.excludeKeywords && interest.excludeKeywords.length > 0) {
      const norClauses = interest.excludeKeywords.map(kw => ({
        title: { $regex: escapeRegex(kw), $options: 'i' },
      }));
      pipeline.push({ $match: { $nor: norClauses } });
    }

    if (interest.excludeBrands && interest.excludeBrands.length > 0) {
      pipeline.push({ $match: { brand: { $nin: interest.excludeBrands } } });
    }

    pipeline.push({ $limit: maxPerInterest });

    const results = await collection.aggregate<Product>(pipeline).toArray();

    for (const product of results) {
      if (!resultsMap.has(product.id)) {
        resultsMap.set(product.id, product);
      }
    }
  }

  return Array.from(resultsMap.values()).sort((a, b) => b.discountPercentage - a.discountPercentage);
};

const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const generateProductEmbeddings = async (db: Db, generateEmbeddingFn: (contents: string[]) => Promise<{ values?: number[] }[]>): Promise<void> => {
  const products = await getAllProductsWithoutEmbeddings(db);

  if (products.length === 0) {
    console.log('[generateProductEmbeddings] No products without embeddings');
    return;
  }

  const collection = await getProductsCollection(db);
  const BATCH_SIZE = 50;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const titles = batch.map(p => `${p.title}, Category: ${p.parentCategory || ''}`);

    try {
      const embeddings = await generateEmbeddingFn(titles);

      const bulkOps = batch.map((product, idx) => {
        const embeddingValues = embeddings[idx]?.values;
        if (!embeddingValues || embeddingValues.length === 0) return null;

        return {
          updateOne: {
            filter: { id: product.id },
            update: { $set: { embedding: embeddingValues } },
          },
        };
      }).filter(Boolean);

      if (bulkOps.length > 0) {
        await collection.bulkWrite(bulkOps as any);
      }

      console.log(`[generateProductEmbeddings] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} products, ${bulkOps.length} embedded`);
    } catch (error) {
      console.error(`[generateProductEmbeddings] Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
    }
  }

  console.log(`[generateProductEmbeddings] Done: ${products.length} products processed`);
};
