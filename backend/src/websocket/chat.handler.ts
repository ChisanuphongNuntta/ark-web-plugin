import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedSocket } from './index.js';
import { sendToDiscord } from '../discord/bot.js';

const prisma = new PrismaClient();

// Rate limiting: max messages per minute per user
const MESSAGE_RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

const userMessageCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRate = userMessageCounts.get(userId);

  if (!userRate || now > userRate.resetAt) {
    userMessageCounts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userRate.count >= MESSAGE_RATE_LIMIT) {
    return false;
  }

  userRate.count++;
  return true;
}

export function chatHandler(io: Server, socket: AuthenticatedSocket) {
  // Join a server-specific chat room
  socket.on('chat:join', async (data: { serverId?: number }) => {
    const room = data.serverId ? `chat:server:${data.serverId}` : 'chat:global';
    socket.join(room);

    // Send recent message history
    try {
      const messages = await prisma.chatMessage.findMany({
        where: data.serverId ? { serverId: data.serverId } : { serverId: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          server: { select: { name: true } },
        },
      });

      // Add serverName to each message
      const messagesWithServerName = messages.reverse().map(msg => ({
        ...msg,
        serverName: msg.server?.name || null,
        server: undefined, // Remove server relation from response
      }));

      socket.emit('chat:history', { messages: messagesWithServerName, serverId: data.serverId ?? null });
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  });

  // Leave a server-specific chat room
  socket.on('chat:leave', (data: { serverId?: number }) => {
    const room = data.serverId ? `chat:server:${data.serverId}` : 'chat:global';
    socket.leave(room);
  });

  // Send a chat message
  socket.on('chat:send', async (data: { content: string; serverId?: number | null }) => {
    // Must be authenticated to send
    if (!socket.userId) {
      socket.emit('chat:error', { message: 'You must be logged in to send messages' });
      return;
    }

    // Validate content
    const content = data.content?.trim();
    if (!content || content.length === 0) {
      socket.emit('chat:error', { message: 'Message cannot be empty' });
      return;
    }

    if (content.length > 500) {
      socket.emit('chat:error', { message: 'Message too long (max 500 characters)' });
      return;
    }

    // Rate limit check
    if (!checkRateLimit(socket.userId)) {
      socket.emit('chat:error', { message: 'Too many messages, please wait' });
      return;
    }

    try {
      // Get server name if serverId is provided
      let serverName: string | null = null;
      if (data.serverId) {
        const server = await prisma.server.findUnique({
          where: { id: data.serverId },
          select: { name: true },
        });
        serverName = server?.name || null;
      }

      // Save message to database
      const message = await prisma.chatMessage.create({
        data: {
          source: 'web',
          serverId: data.serverId ?? null,
          senderType: 'web_user',
          senderId: socket.userId,
          senderName: socket.userName || 'Unknown',
          senderAvatar: socket.userAvatar,
          content,
        },
      });

      // Broadcast to appropriate room(s)
      const room = data.serverId ? `chat:server:${data.serverId}` : 'chat:global';
      io.to(room).emit('chat:message', {
        id: message.id,
        source: message.source,
        serverId: message.serverId,
        serverName,
        senderType: message.senderType,
        senderId: message.senderId,
        senderName: message.senderName,
        senderAvatar: message.senderAvatar,
        content: message.content,
        createdAt: message.createdAt,
      });

      // Send to Discord
      sendToDiscord({
        source: message.source,
        serverId: message.serverId,
        serverName,
        senderName: message.senderName,
        content: message.content,
      });

    } catch (error) {
      console.error('Error saving chat message:', error);
      socket.emit('chat:error', { message: 'Failed to send message' });
    }
  });

  // Get online users in a room
  socket.on('chat:users', async (data: { serverId?: number }) => {
    const room = data.serverId ? `chat:server:${data.serverId}` : 'chat:global';
    const sockets = await io.in(room).fetchSockets();

    const users = sockets.map((s) => ({
      id: (s as unknown as AuthenticatedSocket).userId,
      name: (s as unknown as AuthenticatedSocket).userName,
    })).filter(u => u.id); // Only include authenticated users

    socket.emit('chat:users', { users, serverId: data.serverId ?? null });
  });
}
