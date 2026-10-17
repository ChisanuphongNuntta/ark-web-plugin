// A server is considered "online" when its last heartbeat is within this window.
// Plugins are expected to heartbeat well inside this interval (see openapi HeartbeatRequest).
export const HEARTBEAT_ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

export function isServerOnline(lastHeartbeat: Date | null, now: Date = new Date()): boolean {
  if (!lastHeartbeat) return false;
  return now.getTime() - lastHeartbeat.getTime() <= HEARTBEAT_ONLINE_WINDOW_MS;
}
