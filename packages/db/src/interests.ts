import { Db } from 'mongodb';
import { PARENT_CATEGORIES } from './helpers/files/categories';
import { getUsersCollection } from './user';

export interface CategorySelection {
  categories: string[];
  selectedCategories: string[];
  page: number;
}

export const CATEGORIES_PER_PAGE = 5;

/**
 * Returns the fixed list of parent category names available for user interests.
 * These are derived from the PARENT_CATEGORIES mapping, not from DB state.
 */
export const getTopLevelCategories = async (_db: Db): Promise<string[]> => {
  return PARENT_CATEGORIES.map(c => c.nome);
};

export const saveUserInterests = async (db: Db, userId: number, interests: string[]): Promise<void> => {
  const collection = await getUsersCollection(db);
  await collection.updateOne({ id: userId }, { $set: { interests } });
};

export const getUserInterests = async (db: Db, userId: number): Promise<string[]> => {
  const collection = await getUsersCollection(db);
  const user = await collection.findOne({ id: userId });
  return user?.interests || [];
};
