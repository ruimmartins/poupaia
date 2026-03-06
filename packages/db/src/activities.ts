import { v4 as uuidv4 } from 'uuid';
import { Collection, Db } from 'mongodb';
import { Activity } from './models/activity';

export const getActivitiesCollection = async (db: Db): Promise<Collection<Activity>> => {
  return db.collection<Activity>('activities');
};

export const getLastActivity = async (db: Db, userId: number): Promise<Activity | null> => {
  const collection = await getActivitiesCollection(db);
  const activities = await collection.find({ userId }).sort({ startedAt: -1 }).toArray();
  return activities[0] ?? null;
};

export const createOrUpdateActivity = async (db: Db, activity: Activity): Promise<Activity> => {
  const collection = await getActivitiesCollection(db);
  activity.id = activity.id || uuidv4();
  await collection.updateOne({ id: activity.id }, { $set: activity }, { upsert: true });
  return activity;
};
