import { Db, Collection } from 'mongodb';
import { User } from './models/user';

export const getUsersCollection = async (db: Db): Promise<Collection<User>> =>
  db.collection<User>('users');

export const getOrCreateUser = async (
  db: Db,
  userId: number,
  profile?: Partial<User['profile']>
): Promise<User> => {
  const collection = await getUsersCollection(db);

  const existingUser = await collection.findOne({ id: userId });

  if (existingUser) {
    if (profile) {
      await collection.updateOne(
        { id: userId },
        { $set: { profile: { ...existingUser.profile, ...profile } } }
      );
    }
    return existingUser;
  }

  const newUser: User = {
    id: userId,
    createdAt: new Date().toISOString(),
    isActive: true,
    profile: profile || {},
  };

  await collection.insertOne(newUser as any);
  
  return newUser;
};

export const isUserBlocked = async (
  db: Db,
  user: User
): Promise<boolean> => {
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

export const blockUser = async (
  db: Db,
  userId: number,
  durationInHours: number = 24
): Promise<void> => {
  const collection = await getUsersCollection(db);

  const blockedUntil = new Date();
  blockedUntil.setHours(blockedUntil.getHours() + durationInHours);

  await collection.updateOne(
    { id: userId },
    { $set: { blockedUntil: blockedUntil.toISOString() } },
    { upsert: true }
  );
};

export const unblockUser = async (
  db: Db,
  userId: number
): Promise<void> => {
  const collection = await getUsersCollection(db);

  await collection.updateOne(
    { id: userId },
    { $unset: { blockedUntil: "" } }
  );
};

export const markProductsAsSentToUser = async (
  db: Db,
  userId: number,
  productIds: string[]
): Promise<void> => {
  const collection = await getUsersCollection(db);

  await collection.updateOne(
    { id: userId },
    { $addToSet: { sentProductIds: { $each: productIds } } },
    { upsert: true }
  );
};

export const getUserSentProducts = async (
  db: Db,
  userId: number
): Promise<string[]> => {
  const collection = await getUsersCollection(db);

  const user = await collection.findOne({ id: userId });

  return user?.sentProductIds || [];
};

export const setPendingAlertFilters = async (
  db: Db,
  userId: number,
  filters: {
    searchQuery: string;
    categories?: string[];
    keywordGroups?: string[][];
    minPrice?: number;
    maxPrice?: number;
    minDiscount?: number;
  }
): Promise<void> => {
  const collection = await getUsersCollection(db);

  await collection.updateOne(
    { id: userId },
    { $set: { pendingAlertFilters: filters } },
    { upsert: true }
  );
};

export const getPendingAlertFilters = async (
  db: Db,
  userId: number
): Promise<User['pendingAlertFilters'] | null> => {
  const collection = await getUsersCollection(db);

  const user = await collection.findOne({ id: userId });

  return user?.pendingAlertFilters || null;
};

export const clearPendingAlertFilters = async (
  db: Db,
  userId: number
): Promise<void> => {
  const collection = await getUsersCollection(db);

  await collection.updateOne(
    { id: userId },
    { $unset: { pendingAlertFilters: "" } }
  );
};

export const cleanUserSentProducts = async (
  db: Db
): Promise<{ usersChecked: number; idsRemoved: number }> => {
  const usersCollection = await getUsersCollection(db);
  const productsCollection = db.collection('products');
  
  const users = await usersCollection
    .find({ sentProductIds: { $exists: true, $ne: [] } })
    .toArray();

  if (users.length === 0) {
    return { usersChecked: 0, idsRemoved: 0 };
  }

  let totalCleaned = 0;

  for (const user of users) {
    if (user.sentProductIds && user.sentProductIds.length > 0) {
      const existingProducts = await productsCollection
        .find({ 
          id: { 
            $in: user.sentProductIds
          } 
        })
        .project({ id: 1 })
        .toArray();

      const existingIds = existingProducts.map((doc: any) => doc.id);

      if (existingIds.length < user.sentProductIds.length) {
        const removedCount = user.sentProductIds.length - existingIds.length;
        
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { sentProductIds: existingIds } }
        );

        totalCleaned += removedCount;
      }
    }
  }

  return { usersChecked: users.length, idsRemoved: totalCleaned };
};
