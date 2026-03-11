import { Db, Collection } from 'mongodb';
import { User, UserStateEnum } from './models/user';

export const getUsersCollection = async (db: Db): Promise<Collection<User>> => db.collection<User>('users');

export const getOrCreateUser = async (db: Db, userId: number, chatId: number, profile?: Partial<User['profile']>): Promise<User> => {
  const collection = await getUsersCollection(db);

  const existingUser = await collection.findOne({ id: userId });

  if (existingUser) {
    if (profile) {
      await collection.updateOne({ id: userId }, { $set: { profile: { ...existingUser.profile, ...profile } } });
    }
    return existingUser;
  }

  const newUser: User = {
    id: userId,
    state: UserStateEnum.IDLE,
    createdAt: new Date().toISOString(),
    profile: profile || {},
    chatId,
  };

  await collection.insertOne(newUser as any);

  return newUser;
};

export const getAllUsers = async (db: Db): Promise<User[]> => {
  const collection = await getUsersCollection(db);
  return await collection.find().toArray();
};

export const updateUserState = async (db: Db, userId: number, user: Partial<User>): Promise<void> => {
  const collection = await getUsersCollection(db);
  await collection.updateOne({ id: userId }, { $set: { ...user } });
};
