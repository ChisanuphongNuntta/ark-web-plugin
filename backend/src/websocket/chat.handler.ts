import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedSocket } from './index.js';
import { sendToDiscord } from '../discord/bot.js';
import vipService from '../services/vip.service.js';

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

/**
 * Socket payloads are untrusted (any guest can emit anything, including nothing). Only a positive
 * safe integer is accepted as a server id; everything else means the global room.
 */
export function readServerId(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const serverId = (data as { serverId?: unknown }).serverId;
  return typeof serverId === 'number' && Number.isSafeInteger(serverId) && serverId > 0 ? serverId : undefined;
}

function roomFor(serverId: number | undefined): string {
  return serverId ? `chat:server:${serverId}` : 'chat:global';
}

export function chatHandler(io: Server, socket: AuthenticatedSocket) {
  // Join a server-specific chat room
  socket.on('chat:join', async (data: unknown) => {
    try {
      const serverId = readServerId(data);
      socket.join(roomFor(serverId));

      // Send recent message history
      const messages = await prisma.chatMessage.findMany({
        where: serverId ? { serverId } : { serverId: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          server: { select: { name: true } },
        },
      });

      // Add serverName (and the sender's VIP badge) to each message
      const badgeOf = await vipService.chatBadgeResolver(messages);
      const messagesWithServerName = messages.reverse().map(msg => ({
        ...msg,
        vip: badgeOf(msg),
        serverName: msg.server?.name || null,
        server: undefined, // Remove server relation from response
      }));

      socket.emit('chat:history', { messages: messagesWithServerName, serverId: serverId ?? null });
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  });

  // Leave a server-specific chat room
  socket.on('chat:leave', (data: unknown) => {
    try {
      socket.leave(roomFor(readServerId(data)));
    } catch (error) {
      console.error('chat:leave failed:', error);
    }
  });

  // Send a chat message
  socket.on('chat:send', async (data: unknown) => {
    try {
      await handleSend(data);
    } catch (error) {
      console.error('Error saving chat message:', error);
      socket.emit('chat:error', { message: 'Failed to send message' });
    }
  });

  async function handleSend(data: unknown) {
    // Must be authenticated to send
    if (!socket.userId) {
      socket.emit('chat:error', { message: 'You must be logged in to send messages' });
      return;
    }

    // Validate content
    const rawContent = data && typeof data === 'object' ? (data as { content?: unknown }).content : undefined;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    const serverId = readServerId(data);
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

    // Get server name if serverId is provided
    let serverName: string | null = null;
    if (serverId) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { name: true },
      });
      serverName = server?.name || null;
    }

    // Save message to database
    const message = await prisma.chatMessage.create({
      data: {
        source: 'web',
        serverId: serverId ?? null,
        senderType: 'web_user',
        senderId: socket.userId,
        senderName: socket.userName || 'Unknown',
        senderAvatar: socket.userAvatar,
        content,
      },
    });

    // Sender's VIP badge (avatar frame in the web chat). Never fails the send.
    let vip: Awaited<ReturnType<typeof vipService.badgeForUser>> = null;
    try {
      vip = await vipService.badgeForUser(socket.userId);
    } catch (error) {
      console.error('VIP badge lookup for chat failed:', error);
    }

    // Broadcast to appropriate room(s)
    io.to(roomFor(serverId)).emit('chat:message', {
      id: message.id,
      source: message.source,
      serverId: message.serverId,
      serverName,
      senderType: message.senderType,
      senderId: message.senderId,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar,
      vip,
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
  }

  // Get online users in a room
  socket.on('chat:users', async (data: unknown) => {
    try {
      const serverId = readServerId(data);
      const sockets = await io.in(roomFor(serverId)).fetchSockets();

      const users = sockets.map((s) => ({
        id: (s as unknown as AuthenticatedSocket).userId,
        name: (s as unknown as AuthenticatedSocket).userName,
      })).filter(u => u.id); // Only include authenticated users

      socket.emit('chat:users', { users, serverId: serverId ?? null });
    } catch (error) {
      console.error('chat:users failed:', error);
    }
  });
}
