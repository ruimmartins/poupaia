import { Db } from 'mongodb';
import { getAllCategories } from './product';
import { getUsersCollection } from './user';

export interface CategorySelection {
  categories: string[];
  selectedCategories: string[];
  page: number;
}

export const CATEGORIES_PER_PAGE = 5;

export const getTopLevelCategories = async (db: Db): Promise<string[]> => {
  const allCategories = await getAllCategories(db);
  
  // Extrair apenas a categoria de nível superior (antes do primeiro " > ")
  const topLevel = allCategories
    .map(category => {
      const parts = category.split(' > ');
      return parts[0].trim();
    })
    .filter((category, index, self) => self.indexOf(category) === index); // remover duplicados
  
  return topLevel.sort();
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
