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
      {
        brandLevel: {
          $eq: 0,
        },
      },
    ],
  });
};

export const searchProducts = async (db: Db, filters: Partial<QueryFilters> = {}): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  const query: any = {
    $text: { $search: (filters.query ?? []).join(' ') },
  };

  const andConditions: any[] = [];

  if (filters.excludeIds && filters.excludeIds.length > 0) {
    query.id = { $nin: filters.excludeIds };
  }

  if (filters.categories && filters.categories.length > 0) {
    query.category = { $in: filters.categories };
  }

  if ((filters.minPrice !== undefined && filters.minPrice !== null) || (filters.maxPrice !== undefined && filters.maxPrice !== null)) {
    query.currentPrice = {};
    if (filters.minPrice !== undefined && filters.minPrice !== null) {
      query.currentPrice.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
      query.currentPrice.$lte = filters.maxPrice;
    }

    if (Object.keys(query.currentPrice).length === 0) {
      delete query.currentPrice;
    }
  }

  if (filters.minDiscount !== undefined && filters.minDiscount !== null) {
    query.discountPercentage = { $gte: filters.minDiscount };
  }

  if (filters.keywordGroups && filters.keywordGroups.length > 0) {
    const keywordConditions = filters.keywordGroups.map(group => ({
      $or: group.map(keyword => ({ title: { $regex: `\\b${keyword}\\b`, $options: 'i' } })),
    }));

    andConditions.push(...keywordConditions);
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const results = await collection
    .find(query)
    .sort({ score: { $meta: 'textScore' } })
    .toArray();

  return results;
};
