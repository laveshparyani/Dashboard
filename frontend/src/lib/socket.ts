import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Create socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 3,
  reconnectionDelay: 1000,
  timeout: 5000,
  transports: ['polling', 'websocket'],
  path: '/socket.io',
  withCredentials: true
});

let isConnecting = false;

export const connectSocket = (token: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (isConnecting) {
      reject(new Error('Connection already in progress'));
      return;
    }

    if (socket.connected) {
      socket.disconnect();
    }

    isConnecting = true;
    socket.auth = { token };

    const cleanup = () => {
      isConnecting = false;
      socket.off('connect');
      socket.off('connect_error');
      socket.off('error');
    };

    socket.once('connect', () => {
      console.log('Socket connected successfully');
      cleanup();
      resolve();
    });

    socket.once('connect_error', (error) => {
      console.error('Socket connection error:', error);
      cleanup();
      reject(error);
    });

    socket.once('error', (error) => {
      console.error('Socket error:', error);
      cleanup();
      reject(error);
    });

    socket.connect();

    // Set connection timeout
    setTimeout(() => {
      if (!socket.connected) {
        cleanup();
        socket.disconnect();
        reject(new Error('Connection timeout'));
      }
    }, 5000);
  });
};

export const joinTableRoom = (tableId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    socket.emit('joinTable', tableId, (error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log('Successfully joined table room:', tableId);
        resolve();
      }
    });
  });
};

export const leaveTableRoom = (tableId: string) => {
  if (socket.connected) {
    socket.emit('leaveTable', tableId);
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.removeAllListeners();
    socket.disconnect();
  }
};

export const onTableUpdate = (callback: (data: any) => void) => {
  socket.on('tableUpdated', callback);
};

export const offTableUpdate = (callback: (data: any) => void) => {
  socket.off('tableUpdated', callback);
};

export { socket as socketInstance }; 