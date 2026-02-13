import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('MONGODB_URI environment variable is not defined');
}

const client = new MongoClient(uri);

let db: Db | null = null;
let isConnected = false;

export async function connectToDatabase(): Promise<Db> {
  if (isConnected && db) {
    return db;
  }

  try {
    await client.connect();
    console.log('Successfully connected to MongoDB Atlas');
    
    // Replace 'your-database-name' with your actual database name
    db = client.db(process.env.MONGODB_PRODUCTS_DB_NAME || 'products');
    isConnected = true;
    
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas:', error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  if (isConnected) {
    await client.close();
    isConnected = false;
    db = null;
    console.log('MongoDB connection closed');
  }
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export { client };
