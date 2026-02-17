import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;

function getMongoClient(): MongoClient {
  if (!client) {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    client = new MongoClient(uri);
  }
  
  return client;
}

export async function connectToDatabase(): Promise<Db> {
  if (isConnected && db) {
    return db;
  }

  try {
    const mongoClient = getMongoClient();
    await mongoClient.connect();
    console.log('Successfully connected to MongoDB Atlas');
    
    // Replace 'your-database-name' with your actual database name
    db = mongoClient.db(process.env.MONGODB_PRODUCTS_DB_NAME || 'products');
    isConnected = true;
    
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas:', error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  if (isConnected && client) {
    await client.close();
    isConnected = false;
    db = null;
    client = null;
    console.log('MongoDB connection closed');
  }
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export { getMongoClient as client };
