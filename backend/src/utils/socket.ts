import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from './logger.js';

let io: SocketIOServer | null = null;

// Admin API key for authentication
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] || '';

interface TypingData {
  ticketId: string;
  isTyping: boolean;
  role: 'user' | 'agent';
  userId?: string;
}

interface MessageData {
  ticketId: string;
  message: {
    id: string;
    role: 'user' | 'assistant' | 'agent';
    content: string;
    createdAt: string;
    isFromAI: boolean;
  };
}

export function initializeSocket(httpServer: HttpServer, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // In development, allow any origin
        if (process.env['NODE_ENV'] !== 'production') {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Socket connected');

    // Join ticket room for real-time updates
    socket.on('join:ticket', (data: { ticketId: string; role: 'user' | 'agent'; apiKey?: string }) => {
      const { ticketId, role, apiKey } = data;

      // Validate admin API key for agents
      if (role === 'agent') {
        if (!ADMIN_API_KEY || apiKey !== ADMIN_API_KEY) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }
      }

      const room = `ticket:${ticketId}`;
      socket.join(room);
      socket.data.ticketId = ticketId;
      socket.data.role = role;

      logger.info({ socketId: socket.id, ticketId, role }, 'Joined ticket room');

      // Notify others in the room
      socket.to(room).emit('participant:joined', { role });
    });

    // Leave ticket room
    socket.on('leave:ticket', (data: { ticketId: string }) => {
      const room = `ticket:${data.ticketId}`;
      socket.leave(room);
      socket.to(room).emit('participant:left', { role: socket.data.role });
      logger.info({ socketId: socket.id, ticketId: data.ticketId }, 'Left ticket room');
    });

    // Typing indicator
    socket.on('typing:start', (data: TypingData) => {
      const room = `ticket:${data.ticketId}`;
      socket.to(room).emit('typing:update', {
        ticketId: data.ticketId,
        isTyping: true,
        role: data.role,
      });
    });

    socket.on('typing:stop', (data: TypingData) => {
      const room = `ticket:${data.ticketId}`;
      socket.to(room).emit('typing:update', {
        ticketId: data.ticketId,
        isTyping: false,
        role: data.role,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.data.ticketId) {
        const room = `ticket:${socket.data.ticketId}`;
        socket.to(room).emit('participant:left', { role: socket.data.role });
        socket.to(room).emit('typing:update', {
          ticketId: socket.data.ticketId,
          isTyping: false,
          role: socket.data.role,
        });
      }
      logger.info({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

// Emit new message to ticket room
export function emitNewMessage(data: MessageData): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit message');
    return;
  }

  const room = `ticket:${data.ticketId}`;
  io.to(room).emit('ticket:message', data);
  logger.info({ ticketId: data.ticketId, role: data.message.role }, 'Emitted new message to room');
}

// Emit ticket status update
export function emitTicketUpdate(ticketId: string, update: Record<string, unknown>): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit update');
    return;
  }

  const room = `ticket:${ticketId}`;
  io.to(room).emit('ticket:update', { ticketId, ...update });
}

export function getIO(): SocketIOServer | null {
  return io;
}
