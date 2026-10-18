import { getRealtimeServer } from './io.js';
import { RealtimeRooms } from './events.js';

// Immediate socket-side effects of auth changes. Fire-and-forget like the emit helpers: a
// realtime failure never fails the REST request. Work across replicas through the Redis adapter.

/** Disconnect every socket that authenticated with this UserSession (logout / session revoke). */
export function disconnectSessionSockets(sessionId: string | null | undefined): void {
  const io = getRealtimeServer();
  if (!io || !sessionId) return;
  try {
    io.in(RealtimeRooms.session(sessionId)).disconnectSockets(true);
  } catch (error) {
    console.error('[realtime] disconnect session sockets failed:', error);
  }
}

/** Disconnect every socket of a user (ban, account deletion). Clients reconnect as guests. */
export function disconnectUserSockets(userId: string): void {
  const io = getRealtimeServer();
  if (!io) return;
  try {
    io.in(RealtimeRooms.user(userId)).disconnectSockets(true);
  } catch (error) {
    console.error('[realtime] disconnect user sockets failed:', error);
  }
}

/** Remove a user's sockets from the 'admin' room (role changed away from ADMIN|ROOT). */
export function revokeAdminRoom(userId: string): void {
  const io = getRealtimeServer();
  if (!io) return;
  try {
    io.in(RealtimeRooms.user(userId)).socketsLeave(RealtimeRooms.admin);
  } catch (error) {
    console.error('[realtime] revoke admin room failed:', error);
  }
}
