import { Db, Collection } from 'mongodb';
import { Product } from './models/products';
import { QueryFilters } from '@poupaia/shared';
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

export const getAllProductsWithoutEmbeddings = async (db: Db): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  return await collection
    .find({
      $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
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

  if (filters.minCreatedAt || filters.maxCreatedAt) {
    query.createdAt = {};
    if (filters.minCreatedAt) {
      query.createdAt.$gte = filters.minCreatedAt;
    }
    if (filters.maxCreatedAt) {
      query.createdAt.$lte = filters.maxCreatedAt;
    }
  }

  const hasFilterQuery = Object.keys(query).length > 0;

  const results = await collection
    .aggregate<Product>([
      {
        $vectorSearch: {
          index: vectorIndexName,
          path: 'embedding',
          queryVector: filters.embeddings,
          ...(hasFilterQuery ? { filter: query } : {}),
          numCandidates: 1000,
          limit: 20,
        },
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  return results;
};
