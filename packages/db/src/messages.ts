import { Collection, Db } from 'mongodb';
import { Message } from './models/message';
import { v4 as uuidv4 } from 'uuid';

export const getMessagesCollection = async (db: Db): Promise<Collection<Message>> => db.collection<Message>('messages');

export const getUnprocessedMessagesForUser = async (db: Db, userId: number): Promise<Message[]> => {
  const messagesCollection = await getMessagesCollection(db);
  return messagesCollection.find({ userId, processed: false }).toArray();
};

export const saveMessage = async (db: Db, message: Message): Promise<void> => {
  const messagesCollection = await getMessagesCollection(db);
  await messagesCollection.insertOne({ ...message, id: uuidv4() });
};

export const setMessegesAsProcessed = async (db: Db, messageIds: any[]): Promise<void> => {
  const messagesCollection = await getMessagesCollection(db);
  await messagesCollection.updateMany({ _id: { $in: messageIds } }, { $set: { processed: true } });
};
