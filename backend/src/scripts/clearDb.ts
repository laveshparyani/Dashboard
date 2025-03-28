import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Table } from '../models/Table';

dotenv.config();

export async function clearDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // Clear all collections
    await User.deleteMany({});
    await Table.deleteMany({});

    console.log('Successfully cleared all collections');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  clearDatabase();
} 