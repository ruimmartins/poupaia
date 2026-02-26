import fs from 'fs';
import path from 'path';
import { Db, Collection } from 'mongodb';
import { Product } from './models/products';
import { ProductFilters } from './models/product-filters';
import { getUserSentProducts } from './users';

export const getProductsCollection = async (db: Db): Promise<Collection<Product>> => db.collection<Product>('products');

export const getAllCategories = async (db: Db): Promise<string[]> => await db.collection('products').distinct('category');

export const createOrUpdateProducts = async (db: Db, products: Product[]) => {
  const collection = await getProductsCollection(db);
  const content = fs.readFileSync(path.resolve(__dirname, './helpers/files/good-brands.csv'), 'utf8');

  const brands = content.split(',').map(brand => brand.trim());

  const bulkOps = products.map(product => {
    const { createdAt, ...productWithoutCreatedAt } = product;

    productWithoutCreatedAt.brandLevel = brands.includes(product.brand ?? 'not a brand') ? 1 : 0;

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

export const searchProducts = async (db: Db, searchQuery: string, filters: Partial<ProductFilters> = {}): Promise<Product[]> => {
  const collection = await getProductsCollection(db);

  const query: any = {
    $text: { $search: searchQuery },
  };

  const andConditions: any[] = [];

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
    // Remove empty object if no valid price filters
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

  /* console.log('Constructed MongoDB query:', JSON.stringify(query, null, 2)); */

  const results = await collection
    .find(
      query /* , {
      projection: { score: { $meta: 'textScore' }, brandLevel: 1 },
    } */
    )
    .sort({ score: { $meta: 'textScore' }, brandLevel: -1 })
    .limit(10)
    .toArray();

  return results;
};

export const searchAndFilterProducts = async (db: Db, userId: number, searchQuery: string, filters: Partial<ProductFilters>) => {
  const userSentProductIds = await getUserSentProducts(db, userId);
  const allProducts = await searchProducts(db, searchQuery, filters);

  return allProducts.filter(p => !userSentProductIds.includes(p.id));
};
