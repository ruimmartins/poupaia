import { Db, Collection } from 'mongodb';
import { Alert } from './models/alert';
import { v4 as uuidv4 } from 'uuid';

export const getAlertsCollection = async (db: Db): Promise<Collection<Alert>> =>
  db.collection<Alert>('alerts');

export const createAlert = async (
  db: Db,
  alertData: Omit<Alert, 'id' | 'createdAt' | 'isActive'>
): Promise<Alert> => {
  const collection = await getAlertsCollection(db);

  const newAlert: Alert = {
    ...alertData,
    id: uuidv4(),
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  await collection.insertOne(newAlert as any);
  
  return newAlert;
};

export const getUserAlerts = async (
  db: Db,
  userId: number,
  onlyActive: boolean = true
): Promise<Alert[]> => {
  const collection = await getAlertsCollection(db);

  const query: any = { userId };
  if (onlyActive) {
    query.isActive = true;
  }

  return await collection.find(query).toArray();
};

export const deleteAlert = async (
  db: Db,
  alertId: string,
  userId: number
): Promise<boolean> => {
  const collection = await getAlertsCollection(db);

  const result = await collection.deleteOne({
    id: alertId,
    userId, // Garante que só apaga alertas do próprio user
  });

  return result.deletedCount > 0;
};

export const deleteUserAlerts = async (
  db: Db,
  userId: number,
  filters?: {
    categories?: string[];
    keywordGroups?: string[][];
  }
): Promise<number> => {
  const collection = await getAlertsCollection(db);

  const query: any = { userId };

  if (filters?.categories && filters.categories.length > 0) {
    query.categories = { $in: filters.categories };
  }

  if (filters?.keywordGroups && filters.keywordGroups.length > 0) {
    query.keywordGroups = { $in: filters.keywordGroups };
  }

  const result = await collection.deleteMany(query);
  
  return result.deletedCount;
};

export const updateAlertLastChecked = async (
  db: Db,
  alertId: string
): Promise<void> => {
  const collection = await getAlertsCollection(db);

  await collection.updateOne(
    { id: alertId },
    { $set: { lastCheckedAt: new Date().toISOString() } }
  );
};

export const updateAlertLastTriggered = async (
  db: Db,
  alertId: string
): Promise<void> => {
  const collection = await getAlertsCollection(db);

  await collection.updateOne(
    { id: alertId },
    { 
      $set: { 
        lastTriggeredAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      } 
    }
  );
};

export const deactivateAlert = async (
  db: Db,
  alertId: string,
  userId: number
): Promise<boolean> => {
  const collection = await getAlertsCollection(db);

  const result = await collection.updateOne(
    { id: alertId, userId },
    { $set: { isActive: false } }
  );

  return result.modifiedCount > 0;
};

export const getActiveAlerts = async (db: Db): Promise<Alert[]> => {
  const collection = await getAlertsCollection(db);

  return await collection.find({ isActive: true }).toArray();
};
