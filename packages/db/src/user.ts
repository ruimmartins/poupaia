import { Db, Collection } from 'mongodb';
import { User, UserStateEnum } from './models/user';

export const getUsersCollection = async (db: Db): Promise<Collection<User>> => db.collection<User>('users');

export const getOrCreateUser = async (db: Db, userId: number, profile?: Partial<User['profile']>): Promise<User> => {
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
    lastInteractionAt: new Date().toISOString(),
    profile: profile || {},
  };

  await collection.insertOne(newUser as any);

  return newUser;
};

export const isUserBlocked = async (db: Db, user: User): Promise<boolean> => {
  if (!user || !user.blockedUntil) {
    return false;
  }

  const blockedUntil = new Date(user.blockedUntil);
  const now = new Date();

  if (now >= blockedUntil) {
    await unblockUser(db, user.id);
    return false;
  }

  return true;
};

export const blockUser = async (db: Db, userId: number, durationInHours: number = 24): Promise<void> => {
  const collection = await getUsersCollection(db);

  const blockedUntil = new Date();
  blockedUntil.setHours(blockedUntil.getHours() + durationInHours);

  await collection.updateOne({ id: userId }, { $set: { blockedUntil: blockedUntil.toISOString() } }, { upsert: true });
};

export const unblockUser = async (db: Db, userId: number): Promise<void> => {
  const collection = await getUsersCollection(db);

  await collection.updateOne({ id: userId }, { $unset: { blockedUntil: '' } });
};

export const updateUserState = async (db: Db, userId: number, state: UserStateEnum): Promise<void> => {
  const collection = await getUsersCollection(db);
  await collection.updateOne({ id: userId }, { $set: { state } });
};
