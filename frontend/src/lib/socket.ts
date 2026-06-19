import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export interface ChatMessage {
  id: string;
  source: 'game' | 'discord' | 'web';
  serverId: number | null;
  serverName?: string | null;
  senderType: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  content: string;
  createdAt: string;
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token?: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

  socket = io(backendUrl, {
    path: '/socket.io',
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinChatRoom(serverId?: number): void {
  socket?.emit('chat:join', { serverId });
}

export function leaveChatRoom(serverId?: number): void {
  socket?.emit('chat:leave', { serverId });
}

export function sendChatMessage(content: string, serverId?: number | null): void {
  socket?.emit('chat:send', { content, serverId });
}

export function onChatMessage(callback: (message: ChatMessage) => void): () => void {
  socket?.on('chat:message', callback);
  return () => {
    socket?.off('chat:message', callback);
  };
}

export function onChatHistory(callback: (data: { messages: ChatMessage[]; serverId: number | null }) => void): () => void {
  socket?.on('chat:history', callback);
  return () => {
    socket?.off('chat:history', callback);
  };
}

export function onChatError(callback: (error: { message: string }) => void): () => void {
  socket?.on('chat:error', callback);
  return () => {
    socket?.off('chat:error', callback);
  };
}
