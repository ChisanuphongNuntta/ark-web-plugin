import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { chatHandler } from './chat.handler.js';
import { setRealtimeServer } from '../realtime/io.js';
import { allowedSocketOrigins, extractSocketToken, isTrustedSocketOrigin, verifySocketToken } from '../realtime/socketAuth.js';
import { RealtimeClientEvents, RealtimeEvents, RealtimeRooms } from '../realtime/events.js';
import serverQueryService from '../services/serverQuery.service.js';

export let io: Server;

/** How often a socket in the 'admin' room re-checks its session + role (demotion, revoke, ban). */
export const ADMIN_SOCKET_RECHECK_MS = 60_000;

interface AuthenticatedSocket extends Socket {
  userId?: string;
  isAdmin?: boolean;
  canJoinAdminRoom?: boolean;
  sessionId?: string;
  authToken?: string;
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

  // Authentication middleware — same session rules as REST (middlewares/auth.ts). The browser's
  // httpOnly `token` cookie rides on the handshake (client: withCredentials: true); an explicit
  // auth.token / Bearer header is also accepted.
  const trustedOrigins = allowedSocketOrigins();
  io.use(async (socket: AuthenticatedSocket, next) => {
    let found = extractSocketToken(socket.handshake);
    // CORS does not cover websocket upgrades: the ambient cookie only authenticates handshakes
    // from the site itself (allow-listed or same-origin). Anything else connects as a guest.
    if (found?.source === 'cookie' && !isTrustedSocketOrigin(socket.handshake, trustedOrigins)) {
      found = null;
    }

    if (found) {
      try {
        const identity = await verifySocketToken(found.token);
        if (identity) {
          socket.userId = identity.userId;
          socket.userName = identity.userName;
          socket.userAvatar = identity.userAvatar;
          socket.isAdmin = identity.isAdmin;
          socket.canJoinAdminRoom = identity.canJoinAdminRoom;
          socket.sessionId = identity.sessionId;
          socket.authToken = found.token;
          return next();
        }
      } catch (error) {
        console.error('Socket auth lookup failed:', error);
      }
      // An explicitly supplied but invalid/revoked token must not be downgraded to a guest.
      // A stale cookie (logged out / expired session) only downgrades to guest so public
      // rooms (chat, server status) keep working.
      if (found.source !== 'cookie') return next(new Error('Authentication error'));
    }

    // No (valid) token - guest (read-only, public rooms only)
    socket.userId = undefined;
    socket.isAdmin = false;
    socket.canJoinAdminRoom = false;
    socket.userName = 'Guest';
    next();
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userName})`);

    // Join global chat room by default
    socket.join('chat:global');

    // Private realtime rooms (wallet / order / delivery events for this user only).
    if (socket.userId) socket.join(RealtimeRooms.user(socket.userId));
    if (socket.sessionId) socket.join(RealtimeRooms.session(socket.sessionId));
    // Admin feed (every transaction, ledger mismatches): role ADMIN|ROOT only, the same rule as
    // the REST admin pages. Membership is re-checked periodically so a demotion, ban, logout or
    // session revoke that happens while connected removes the socket (logout/revoke/role change
    // also act immediately through realtime/sessionControl.ts).
    let adminRecheck: NodeJS.Timeout | undefined;
    if (socket.canJoinAdminRoom) {
      socket.join(RealtimeRooms.admin);
      adminRecheck = setInterval(async () => {
        try {
          const identity = socket.authToken ? await verifySocketToken(socket.authToken) : null;
          if (!identity) {
            socket.disconnect(true);
          } else if (!identity.canJoinAdminRoom) {
            socket.leave(RealtimeRooms.admin);
            clearInterval(adminRecheck);
          }
        } catch (error) {
          console.error('admin socket re-check failed:', error);
        }
      }, ADMIN_SOCKET_RECHECK_MS);
      adminRecheck.unref?.();
    }

    // Public live server status. Joining sends the current snapshot immediately.
    socket.on(RealtimeClientEvents.serversSubscribe, async () => {
      socket.join(RealtimeRooms.servers);
      try {
        socket.emit(RealtimeEvents.serversStatus, await serverQueryService.getPublicStatus());
      } catch (error) {
        console.error('servers:subscribe snapshot failed:', error);
      }
    });
    socket.on(RealtimeClientEvents.serversUnsubscribe, () => {
      socket.leave(RealtimeRooms.servers);
    });

    // Register chat handlers
    chatHandler(io, socket);

    socket.on('disconnect', (reason) => {
      if (adminRecheck) clearInterval(adminRecheck);
      console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  setRealtimeServer(io);
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
  /** Sender's VIP badge (contracts/vip-2026-10.md), null when not VIP. */
  vip?: { tierRank: number; frameStyle: string; label: string } | null;
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
