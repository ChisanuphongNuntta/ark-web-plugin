import type { Server } from 'socket.io';

// Process-local handle to the Socket.IO server. Both SERVICE_ROLE=web and
// SERVICE_ROLE=plugin-gateway call setupSocketIO(), and the Redis adapter fans every
// `io.to(room).emit()` out to all processes, so a gateway emit reaches browsers connected to
// the web process. When no server was attached (scripts, unit tests) emits are a safe no-op.
let server: Server | null = null;

export function setRealtimeServer(io: Server | null): void {
  server = io;
}

export function getRealtimeServer(): Server | null {
  return server;
}
