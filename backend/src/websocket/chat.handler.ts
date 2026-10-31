import { Server } from 'socket.io';
import type { AuthenticatedSocket } from './index.js';
import { chatHistory, ingestChat } from '../services/chat.service.js';
import { verifySocketToken } from '../realtime/socketAuth.js';
export function readServerId(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as { serverId?: unknown }).serverId;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
const roomFor = (id?: number) => id ? `chat:server:${id}` : 'chat:global';
export function chatHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('chat:join', async (data: unknown) => {
    try {
      const id = readServerId(data);
      for (const room of socket.rooms) if (room.startsWith('chat:server:')) socket.leave(room);
      socket.join(roomFor(id));
      socket.emit('chat:history', { messages: await chatHistory(id), serverId: id ?? null });
    } catch { socket.emit('chat:error', { message: 'Failed to load chat history' }); }
  });
  socket.on('chat:leave', (data: unknown) => { socket.leave(roomFor(readServerId(data))); });
  socket.on('chat:send', async (data: unknown) => {
    try {
      const identity = socket.authToken ? await verifySocketToken(socket.authToken) : null;
      if (!identity || identity.userId !== socket.userId) throw new Error('Please log in again');
      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      const id = payload.clientMessageId;
      if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9:._-]{1,64}$/.test(id))) throw new Error('Invalid message id');
      const result = await ingestChat({ source: 'web', senderId: identity.userId,
        senderName: identity.userName || 'Player', senderAvatar: identity.userAvatar,
        serverId: readServerId(data), content: payload.content,
        externalId: id ? `web:${identity.userId}:${id}` : undefined });
      if (result.reason) throw new Error(`Chat unavailable: ${result.reason}`);
      socket.emit('chat:sent', { messageId: result.message?.id, duplicate: result.duplicate });
    } catch (error) { socket.emit('chat:error', { message: error instanceof Error ? error.message : 'Failed to send message' }); }
  });
  socket.on('chat:users', async (data: unknown) => {
    try {
      const id = readServerId(data);
      const sockets = await io.in(roomFor(id)).fetchSockets();
      const users = sockets.map(s => ({ id: (s as unknown as AuthenticatedSocket).userId, name: (s as unknown as AuthenticatedSocket).userName })).filter(u => u.id);
      socket.emit('chat:users', { users, serverId: id ?? null });
    } catch { socket.emit('chat:error', { message: 'Failed to list users' }); }
  });
}
