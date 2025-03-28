import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { setupGoogleSheetsSync } from './services/googleSheets';
import jwt from 'jsonwebtoken';
import { setIO } from './services/io';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Configure CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Configure Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

// Set the IO instance in our service
setIO(io);

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token not provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Routes
app.use('/api', routes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join table room for real-time updates
  socket.on('joinTable', async (tableId: string, callback) => {
    try {
      if (!tableId) {
        throw new Error('No table ID provided');
      }
      const room = `table-${tableId}`;
      await socket.join(room);
      console.log(`Client ${socket.id} joined table ${tableId}`);
      callback();
    } catch (error: any) {
      console.error('Error joining table:', error);
      callback(error.message);
    }
  });

  // Leave table room
  socket.on('leaveTable', async (tableId: string, callback) => {
    try {
      if (!tableId) {
        throw new Error('No table ID provided');
      }
      const room = `table-${tableId}`;
      await socket.leave(room);
      console.log(`Client ${socket.id} left table ${tableId}`);
      callback?.();
    } catch (error: any) {
      console.error('Error leaving table:', error);
      callback?.(error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Connect to MongoDB
const connectToMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    if (!mongoURI.startsWith('mongodb://') && !mongoURI.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI format. URI must start with mongodb:// or mongodb+srv://');
    }

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Start periodic Google Sheets sync
    setupGoogleSheetsSync();
    
    // Start server
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error: any) {
    if (error.name === 'MongoServerError' && error.code === 8000) {
      console.error('MongoDB authentication failed. Please check your credentials.');
    } else {
      console.error('MongoDB connection error:', error.message);
    }
    process.exit(1);
  }
};

// Initialize the application
connectToMongoDB(); 