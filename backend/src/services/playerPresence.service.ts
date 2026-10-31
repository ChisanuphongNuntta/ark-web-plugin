// Last server each player logged into, kept in Redis (no schema change). Written by the plugin login hook
// (plugin.controller.getPlayerBySteamId), read when a checkout targets "auto". It records a login, not a
// presence: a logout is not reported, so the value is a best guess and every reader must tolerate it being stale.
import redis from '../config/redis.js';

export const PRESENCE_TTL_SECONDS = 12 * 60 * 60;
const REDIS_TIMEOUT_MS = 250;

export const presenceKey = (steamId: string) => `iris:presence:last-login:${steamId}`;

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), REDIS_TIMEOUT_MS))]);
}

/** Remember that `steamId` just logged into `serverId`. Never throws. */
export async function recordLogin(steamId: string, serverId: number): Promise<void> {
  if (!steamId || !Number.isSafeInteger(serverId)) return;
  try {
    await withTimeout(redis.set(presenceKey(steamId), String(serverId), 'EX', PRESENCE_TTL_SECONDS));
  } catch (error) {
    console.error('[presence] could not record login:', error);
  }
}

/** The server of the player's most recent login within the TTL, or null. Never throws. */
export async function lastLoginServer(steamId: string | null | undefined): Promise<number | null> {
  if (!steamId) return null;
  try {
    const value = await withTimeout(redis.get(presenceKey(steamId)));
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch (error) {
    console.error('[presence] could not read last login:', error);
    return null;
  }
}
