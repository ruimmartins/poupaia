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

export const searchProducts = async (
  db: Db,
  searchQuery: string,
  filters: Partial<ProductFilters> = {}
): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  const query: any = {
    $text: { $search: searchQuery },
  };

  const andConditions: any[] = [];

  if (filters.categories && filters.categories.length > 0) {
    query.category = { $in: filters.categories };
  }

  if (
    (filters.minPrice !== undefined && filters.minPrice !== null) ||
    (filters.maxPrice !== undefined && filters.maxPrice !== null)
  ) {
    query.currentPrice = {};
    if (filters.minPrice !== undefined && filters.minPrice !== null) {
      query.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
      query.currentPrice.$lte = filters.maxPrice;
    }
    // Remove empty object if no valid price filters
    if (Object.keys(query.currentPrice).length === 0) {
      delete query.currentPrice;
    }
  }

  if (filters.minDiscount !== undefined && filters.minDiscount !== null) {
    query.discountPercentage = { $gte: filters.minDiscount };
  }

  if (filters.keywordGroups && filters.keywordGroups.length > 0) {
    const keywordConditions = filters.keywordGroups.map(group => {
      const wordsNeedingBoundary = [
        'men',
        'man',
        'boy',
        'girl',
        'kid',
        'baby',
        'toddler',
        'laptop',
        'pc',
        'computer',
      ];

      return {
        $or: group.map(keyword => {
          const needsBoundary = wordsNeedingBoundary.includes(keyword.toLowerCase());
          const pattern = needsBoundary ? `\\b${keyword}\\b` : keyword;

          return { title: { $regex: pattern, $options: 'i' } };
        }),
      };
    });

    andConditions.push(...keywordConditions);
  }

  if (filters.notExpired) {
    andConditions.push({
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date().toISOString() } }],
    });
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const results = await collection
    .find(query, {
      projection: {
        score: { $meta: 'textScore' },
      },
    })
    .sort({ score: { $meta: 'textScore' } })
    .limit(filters.limit || 20)
    .toArray();

  return results;
}
