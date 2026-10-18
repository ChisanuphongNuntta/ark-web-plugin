/**
 * One shared Socket.IO connection for the whole site (chat + realtime events).
 *
 * Auth: the web session lives in the httpOnly `token` cookie, so the browser
 * sends it with the handshake (`withCredentials`). The backend verifies it the
 * same way as REST and joins `user:<id>` (+ `admin` for staff). Guests stay
 * connected for public rooms (chat, servers).
 *
 * Reconnect: unlimited attempts with exponential backoff (1s -> 30s, jittered).
 * Rooms registered through `subscribeRoom` are re-joined on every (re)connect,
 * because the server forgets room membership when a socket drops.
 *
 * Re-auth: call `reauthenticateSocket()` after login/logout so the handshake is
 * repeated with the new cookie (RealtimeProvider does this when the user id
 * changes).
 */
import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';

let socket: Socket | null = null;
/** Optional explicit token (legacy callers). The cookie is the primary credential. */
let explicitToken: string | undefined;

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface SocketStatusState {
  status: SocketStatus;
  /** Bumped on every successful (re)connect; consumers refetch when it changes. */
  connectCount: number;
}

export const useSocketStatus = create<SocketStatusState>(() => ({ status: 'idle', connectCount: 0 }));

function setStatus(status: SocketStatus) {
  useSocketStatus.setState({ status });
}

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

/* ------------------------------------------------------------------ *
 * Room registry (re-joined after every reconnect)
 * ------------------------------------------------------------------ */

interface RoomSubscription {
  joinEvent: string;
  leaveEvent?: string;
  payload?: unknown;
  refs: number;
}

const rooms = new Map<string, RoomSubscription>();

function emitJoin(sub: RoomSubscription) {
  if (!socket?.connected) return; // joined on the next 'connect'
  if (sub.payload === undefined) socket.emit(sub.joinEvent);
  else socket.emit(sub.joinEvent, sub.payload);
}

function emitLeave(sub: RoomSubscription) {
  if (!socket?.connected || !sub.leaveEvent) return;
  if (sub.payload === undefined) socket.emit(sub.leaveEvent);
  else socket.emit(sub.leaveEvent, sub.payload);
}

/**
 * Join a room for as long as the returned function is not called. Ref-counted
 * by `key`, so several components can share one subscription.
 */
export function subscribeRoom(
  key: string,
  joinEvent: string,
  options: { leaveEvent?: string; payload?: unknown } = {},
): () => void {
  ensureSocket();
  const existing = rooms.get(key);
  if (existing) {
    existing.refs += 1;
  } else {
    const sub: RoomSubscription = { joinEvent, leaveEvent: options.leaveEvent, payload: options.payload, refs: 1 };
    rooms.set(key, sub);
    emitJoin(sub);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const sub = rooms.get(key);
    if (!sub) return;
    sub.refs -= 1;
    if (sub.refs <= 0) {
      rooms.delete(key);
      emitLeave(sub);
    }
  };
}

/* ------------------------------------------------------------------ *
 * Connection
 * ------------------------------------------------------------------ */

function socketOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (explicit) return explicit;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return new URL(apiUrl, base).origin;
  } catch {
    return apiUrl.replace(/\/api\/?$/, '');
  }
}

/** Returns the shared socket, creating and connecting it on first use (browser only). */
export function ensureSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket) {
    if (!socket.connected && !socket.active) {
      setStatus('connecting');
      socket.connect();
    }
    return socket;
  }

  setStatus('connecting');
  socket = io(socketOrigin(), {
    path: '/socket.io',
    withCredentials: true,
    // Evaluated on every handshake, so a token set later is picked up on reconnect.
    auth: (cb) => cb(explicitToken ? { token: explicitToken } : {}),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    timeout: 15_000,
  });

  socket.on('connect', () => {
    useSocketStatus.setState((s) => ({ status: 'connected', connectCount: s.connectCount + 1 }));
    rooms.forEach((sub) => emitJoin(sub));
  });

  socket.on('disconnect', (reason) => {
    // A server-side disconnect is not retried by the client on its own.
    if (reason === 'io server disconnect') {
      setStatus('reconnecting');
      window.setTimeout(() => socket?.connect(), 2000);
      return;
    }
    setStatus(reason === 'io client disconnect' ? 'idle' : 'reconnecting');
  });

  socket.on('connect_error', () => {
    setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Repeat the handshake so the server re-reads the session cookie
 * (after login, logout or account switch). Rooms are re-joined on connect.
 */
export function reauthenticateSocket(): void {
  if (!socket) {
    ensureSocket();
    return;
  }
  setStatus('connecting');
  socket.disconnect();
  socket.connect();
}

/**
 * Legacy entry point used by the chat widget. `token` is optional — the
 * httpOnly cookie already authenticates the browser.
 */
export function connectSocket(token?: string): Socket {
  if (token && token !== explicitToken) {
    explicitToken = token;
    if (socket?.connected) reauthenticateSocket();
  }
  return ensureSocket() as Socket;
}

/** Fully closes the shared connection (all features lose realtime). */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setStatus('idle');
}

/**
 * Listen to a server event on the shared socket. Returns an unsubscribe
 * function. Listeners survive reconnects (same Socket instance).
 */
export function onSocketEvent<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  const s = ensureSocket();
  if (!s) return () => undefined;
  s.on(event, handler as (...args: unknown[]) => void);
  return () => {
    s.off(event, handler as (...args: unknown[]) => void);
  };
}

/* ------------------------------------------------------------------ *
 * Chat (kept API-compatible with ChatWidget)
 * ------------------------------------------------------------------ */

let releaseChatRoom: (() => void) | null = null;

/** Join one chat room (global when serverId is omitted). Re-joined after reconnects. */
export function joinChatRoom(serverId?: number): void {
  releaseChatRoom?.();
  releaseChatRoom = subscribeRoom(`chat:${serverId ?? 'global'}`, 'chat:join', {
    leaveEvent: 'chat:leave',
    payload: { serverId },
  });
}

export function leaveChatRoom(serverId?: number): void {
  if (releaseChatRoom) {
    releaseChatRoom();
    releaseChatRoom = null;
  } else {
    socket?.emit('chat:leave', { serverId });
  }
}

export function sendChatMessage(content: string, serverId?: number | null): void {
  socket?.emit('chat:send', { content, serverId });
}

export function onChatMessage(callback: (message: ChatMessage) => void): () => void {
  return onSocketEvent<ChatMessage>('chat:message', callback);
}

export function onChatHistory(callback: (data: { messages: ChatMessage[]; serverId: number | null }) => void): () => void {
  return onSocketEvent('chat:history', callback);
}

export function onChatError(callback: (error: { message: string }) => void): () => void {
  return onSocketEvent('chat:error', callback);
}
