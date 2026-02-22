import { Db, Collection } from 'mongodb';
import { Message } from './models/message';
import { v4 as uuidv4 } from 'uuid';

export const getMessagesCollection = async (db: Db): Promise<Collection<Message>> =>
  db.collection<Message>('messages');

export const saveMessage = async (
  db: Db,
  messageData: Omit<Message, 'id' | 'createdAt'>
): Promise<Message> => {
  const collection = await getMessagesCollection(db);

  const newMessage: Message = {
    ...messageData,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  await collection.insertOne(newMessage as any);
  
  return newMessage;
};

export const getLastUserMessages = async (
  db: Db,
  userId: number,
  limit: number = 5
): Promise<Message[]> => {
  const collection = await getMessagesCollection(db);

  return await collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
};

export const shouldBlockUser = async (
  db: Db,
  userId: number
): Promise<boolean> => {
  const lastMessages = await getLastUserMessages(db, userId, 5);
  
  if (lastMessages.length < 5) {
    return false;
  }
  
  return lastMessages.every(msg => msg.intentType === 'irrelevant');
};
