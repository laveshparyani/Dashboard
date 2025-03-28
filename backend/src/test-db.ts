import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Successfully connected to MongoDB.');
    
    // Create a test collection
    const testSchema = new mongoose.Schema({
      name: String,
      date: { type: Date, default: Date.now }
    });
    
    const Test = mongoose.model('Test', testSchema);
    await Test.create({ name: 'test entry' });
    console.log('Successfully created test entry');
    
    // Clean up
    await mongoose.connection.dropCollection('tests');
    await mongoose.connection.close();
    console.log('Test completed and connection closed.');
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

testConnection(); 