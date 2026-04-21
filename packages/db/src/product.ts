import { Db, Collection } from 'mongodb';
import { Product } from './models/products';
import { QueryFilters } from './types/query-filters';
import { brands } from './helpers/files/good-brands';

export const getProductsCollection = async (db: Db): Promise<Collection<Product>> => db.collection<Product>('products');

export const getAllCategories = async (db: Db): Promise<string[]> => await db.collection('products').distinct('category');

export const createOrUpdateProducts = async (db: Db, products: Product[]) => {
  const collection = await getProductsCollection(db);

  const bulkOps = products
    .filter(product => brands.includes(product.brand ?? 'not a brand'))
    .map(product => {
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

const EXPECTED_EMBEDDING_DIMENSION = 1578;

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
