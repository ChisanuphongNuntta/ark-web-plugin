import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { chatHandler } from './chat.handler.js';

export let io: Server;

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userAvatar?: string;
}

export async function setupSocketIO(httpServer: HttpServer): Promise<Server> {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  // Setup Redis adapter if Redis URL is configured
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.IO Redis adapter connected');
    } catch (error) {
      console.error('Failed to connect Redis adapter:', error);
      console.log('Socket.IO running without Redis adapter (single instance mode)');
    }
  } else {
    console.log('Socket.IO running without Redis adapter (REDIS_URL not configured)');
  }

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (token) {
      try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT secret is not configured');
        const decoded = jwt.verify(token, jwtSecret) as { userId: string };
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [session, user] = await Promise.all([
          prisma.userSession.findUnique({ where: { token: tokenHash } }),
          prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, discordUsername: true, discordAvatar: true, isBanned: true },
          }),
        ]);
        if (!session || !session.isActive || session.expiresAt < new Date() || !user || user.isBanned) {
          return next(new Error('Authentication error'));
        }
        socket.userId = decoded.userId;
        socket.userName = user.discordUsername || 'Anonymous';
        socket.userAvatar = user.discordAvatar || undefined;
      } catch {
        // A supplied but invalid/revoked token must not be downgraded to a guest.
        return next(new Error('Authentication error'));
      }
    } else {
      // No token - allow connection as guest (read-only)
      socket.userId = undefined;
      socket.userName = 'Guest';
    }

    next();
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userName})`);

    // Join global chat room by default
    socket.join('chat:global');

    // Register chat handlers
    chatHandler(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  console.log('Socket.IO server initialized');
  return io;
}

// Helper to emit chat messages (used by REST API and Discord bot)
export function emitChatMessage(message: {
  id: string;
  source: string;
  serverId?: number | null;
  serverName?: string | null;
  serverStyle?: { chatTag: string | null; chatColor: string | null; chatIcon: string | null } | null;
  senderType: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  playerRank?: { name: string; color: string; icon: string | null } | null;
  content: string;
  createdAt: Date;
}) {
  if (!io) return;

  const room = message.serverId ? `chat:server:${message.serverId}` : 'chat:global';
  io.to(room).emit('chat:message', message);

  // Also emit to global if it's a server-specific message (optional: for global feed)
  // if (message.serverId) {
  //   io.to('chat:global').emit('chat:message', { ...message, fromServer: true });
  // }
}

export { AuthenticatedSocket };
