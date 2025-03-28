import { MongoClient } from 'mongodb';

// MongoDB collections
export const collections: {
  tables?: any;
} = {};

// Initialize MongoDB connection
export async function connectToDatabase() {
  const client = await MongoClient.connect(process.env.MONGODB_URI as string);
  const db = client.db();

  collections.tables = db.collection('tables');

  console.log('Connected to MongoDB');
  return { client, db };
} 