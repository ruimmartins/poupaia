import { Db, Collection } from 'mongodb';
import { User, UserStateEnum } from './models/user';

export const getUsersCollection = async (db: Db): Promise<Collection<User>> => db.collection<User>('users');

export const getOrCreateUser = async (db: Db, userId: number, chatId: number, profile?: Partial<User['profile']>): Promise<User> => {
  const collection = await getUsersCollection(db);

  const existingUser = await collection.findOne({ id: userId });

  if (existingUser) {
    const updateFields: any = {};
    
    if (profile) {
      updateFields.profile = { ...existingUser.profile, ...profile };
    }
    
    // Garantir que chatId está sempre atualizado
    if (existingUser.chatId !== chatId) {
      updateFields.chatId = chatId;
    }
    
    if (Object.keys(updateFields).length > 0) {
      await collection.updateOne({ id: userId }, { $set: updateFields });
      return { ...existingUser, ...updateFields };
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
