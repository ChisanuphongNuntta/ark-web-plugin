/** Pure helpers for the live server status cache (no runtime imports; unit-tested). */
import type { LiveServerStatus, ServersStatusEvent } from './events';

/** Snapshot cached under SERVERS_STATUS_KEY, indexed by server id. */
export interface ServerStatusCache {
  at: string | null;
  byId: Record<number, LiveServerStatus>;
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Defensive normaliser: tolerates `playerCount` instead of `players`, etc. */
export function normalizeLiveStatus(raw: unknown): LiveServerStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = toNumber(r.id, NaN);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    online: Boolean(r.online ?? r.isOnline),
    players: toNumber(r.players ?? r.playerCount),
    maxPlayers: r.maxPlayers === null || r.maxPlayers === undefined ? null : toNumber(r.maxPlayers),
    version: typeof r.version === 'string' ? r.version : null,
    name: typeof r.name === 'string' ? r.name : typeof r.sessionName === 'string' ? r.sessionName : null,
    source: typeof r.source === 'string' ? r.source : undefined,
    playersRev: typeof r.playersRev === 'string' ? r.playersRev : null,
    map: typeof r.map === 'string' ? r.map : null,
  };
}

/**
 * Merge a status payload into the cache. The socket event may carry only the
 * servers that changed, so this upserts by id and keeps the rest.
 */
export function mergeServerStatus(
  previous: ServerStatusCache | undefined,
  payload: ServersStatusEvent | undefined,
  replace = false,
): ServerStatusCache {
  const byId: Record<number, LiveServerStatus> = replace || !previous ? {} : { ...previous.byId };
  (payload?.servers ?? []).forEach((raw) => {
    const status = normalizeLiveStatus(raw);
    if (status) byId[status.id] = status;
  });
  return { at: payload?.at ?? previous?.at ?? null, byId };
}
