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

  const now = new Date();

  const eightDaysAgo = new Date();
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

  return await collection.deleteMany({
    $or: [
      {
        expiresAt: {
          $ne: null,
          $lt: now.toISOString(),
        },
      },
      {
        expiresAt: null,
        createdAt: {
          $lt: eightDaysAgo.toISOString(),
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

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.currentPrice = {};
    if (filters.minPrice !== undefined) {
      query.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      query.currentPrice.$lte = filters.maxPrice;
    }
  }

  if (filters.minDiscount !== undefined) {
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
