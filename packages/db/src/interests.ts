import { Db } from 'mongodb';
import { PARENT_CATEGORIES } from './helpers/files/categories';
import { getUsersCollection } from './user';
import { InterestItem } from './models/user';

export const getTopLevelCategories = async (_db: Db): Promise<string[]> => {
  return PARENT_CATEGORIES.map(c => c.nome);
};

export const saveUserInterests = async (db: Db, userId: number, interests: InterestItem[]): Promise<void> => {
  const collection = await getUsersCollection(db);
  await collection.updateOne({ id: userId }, { $set: { interests } });
};

export const getUserInterests = async (db: Db, userId: number): Promise<InterestItem[]> => {
  const collection = await getUsersCollection(db);
  const user = await collection.findOne({ id: userId });
  if (!user?.interests || user.interests.length === 0) return [];

  if (typeof user.interests[0] === 'string') {
    return (user.interests as unknown as string[]).map(name => ({
      query: name,
      categories: [name],
      createdAt: user.createdAt || new Date().toISOString(),
    }));
  }

  return user.interests as InterestItem[];
};
