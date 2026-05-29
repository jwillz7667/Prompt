import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from './logger.js';
import { verifyAccessToken } from './jwt.js';
import { prisma } from './prisma.js';

let io: SocketIOServer | null = null;

// Admin API key for authentication
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] || '';

type SocketRole = 'user' | 'agent';

interface TypingData {
  ticketId: string;
  isTyping: boolean;
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

function extractBearerToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.['token'];
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

async function authorizeTicketJoin(
  socket: Socket,
  ticketId: string,
  requestedRole: SocketRole,
  apiKey?: string
): Promise<{ authorized: true; role: SocketRole; userId?: string } | { authorized: false; reason: string }> {
  if (!ticketId || typeof ticketId !== 'string' || ticketId.length > 128) {
    return { authorized: false, reason: 'Invalid ticket id' };
  }

  if (requestedRole === 'agent') {
    const handshakeAdminKey = socket.handshake.auth?.['apiKey'];
    const candidateApiKey = apiKey || (typeof handshakeAdminKey === 'string' ? handshakeAdminKey : undefined);

    if (!ADMIN_API_KEY || candidateApiKey !== ADMIN_API_KEY) {
      return { authorized: false, reason: 'Unauthorized' };
    }

    return { authorized: true, role: 'agent' };
  }

  const token = extractBearerToken(socket);
  if (!token) {
    return { authorized: false, reason: 'Authentication required' };
  }

  try {
    const decoded = verifyAccessToken(token);
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userId: decoded.userId },
      select: { id: true },
    });

    if (!ticket) {
      return { authorized: false, reason: 'Ticket not found' };
    }

    return { authorized: true, role: 'user', userId: decoded.userId };
  } catch (error) {
    logger.warn({ error, socketId: socket.id, ticketId }, 'Invalid socket ticket auth token');
    return { authorized: false, reason: 'Invalid token' };
  }
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
    transports: ['polling', 'websocket'],  // Allow polling first for mobile compatibility
    pingTimeout: 60000,      // 60 seconds before considering connection dead
    pingInterval: 25000,     // Send ping every 25 seconds
    upgradeTimeout: 30000,   // 30 seconds to upgrade from polling to websocket
    allowUpgrades: true,
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Socket connected');

    // Join ticket room for real-time updates
    socket.on('join:ticket', async (data: { ticketId: string; role: SocketRole; apiKey?: string }) => {
      const { ticketId, role, apiKey } = data;
      const authorization = await authorizeTicketJoin(socket, ticketId, role, apiKey);

      if (!authorization.authorized) {
        socket.emit('ticket:error', { message: authorization.reason });
        return;
      }

      const previousTicketId = socket.data.ticketId as string | undefined;
      if (previousTicketId && previousTicketId !== ticketId) {
        socket.leave(`ticket:${previousTicketId}`);
      }

      const room = `ticket:${ticketId}`;
      socket.join(room);
      socket.data.ticketId = ticketId;
      socket.data.role = authorization.role;
      socket.data.userId = authorization.userId;

      logger.info({ socketId: socket.id, ticketId, role: authorization.role }, 'Joined ticket room');

      // Notify others in the room
      socket.to(room).emit('participant:joined', { role: authorization.role });
    });

    // Leave ticket room
    socket.on('leave:ticket', (data: { ticketId: string }) => {
      if (socket.data.ticketId !== data.ticketId) {
        socket.emit('ticket:error', { message: 'Cannot leave a ticket that was not joined' });
        return;
      }

      const room = `ticket:${data.ticketId}`;
      socket.leave(room);
      socket.to(room).emit('participant:left', { role: socket.data.role });
      socket.data.ticketId = undefined;
      socket.data.role = undefined;
      socket.data.userId = undefined;
      logger.info({ socketId: socket.id, ticketId: data.ticketId }, 'Left ticket room');
    });

    // Typing indicator
    socket.on('typing:start', (data: TypingData) => {
      if (socket.data.ticketId !== data.ticketId) {
        socket.emit('ticket:error', { message: 'Join the ticket before sending typing events' });
        return;
      }

      const room = `ticket:${data.ticketId}`;
      socket.to(room).emit('typing:update', {
        ticketId: data.ticketId,
        isTyping: true,
        role: socket.data.role,
      });
    });

    socket.on('typing:stop', (data: TypingData) => {
      if (socket.data.ticketId !== data.ticketId) {
        socket.emit('ticket:error', { message: 'Join the ticket before sending typing events' });
        return;
      }

      const room = `ticket:${data.ticketId}`;
      socket.to(room).emit('typing:update', {
        ticketId: data.ticketId,
        isTyping: false,
        role: socket.data.role,
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
