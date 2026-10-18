/**
 * Public server directory + live status data layer.
 *
 * REST (public, cached, rate-limited by the backend):
 *   GET /servers/directory    -> { groups: DirectoryGroup[], statusPages? }
 *   GET /servers/status       -> ServersStatusEvent (full snapshot)
 *   GET /servers/:id/players  -> ServerPlayersResponse
 * Socket: 'servers:status' to room 'servers' (join with 'servers:subscribe').
 */
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GameMode } from '@/lib/contracts/types';
import type { ServersStatusEvent } from './events';
import { mergeServerStatus, normalizeLiveStatus, toNumber, type ServerStatusCache } from './statusMerge';

export type { ServerStatusCache } from './statusMerge';
import { SERVERS_STATUS_KEY, serverPlayersKey } from './queryKeys';

export interface DirectoryServer {
  id: number;
  name: string;
  map: string | null;
  displayName: string;
  gameMode: GameMode;
  cluster: { id: string; key: string; name: string } | null;
  connect: { host: string; port: number } | null;
  rates: string | null;
  isModded: boolean;
  available: boolean;
  online: boolean;
  playerCount: number;
  deliverable: boolean;
  sortOrder: number;
}

export interface DirectoryGroup {
  key: string;
  name: string;
  gameMode: GameMode | null;
  rates: string | null;
  isModded: boolean;
  description: string | null;
  servers: DirectoryServer[];
}

export interface DirectoryResponse {
  groups: DirectoryGroup[];
  statusPages?: string[];
}

export interface ServerPlayer {
  name: string;
  durationSec: number;
}

export interface ServerPlayersResponse {
  serverId: number;
  players: ServerPlayer[];
  fetchedAt: string;
}

export const serversDirectoryApi = {
  directory: (): Promise<DirectoryResponse> =>
    api.get('/servers/directory').then((r) => ({
      groups: Array.isArray(r.data?.groups) ? r.data.groups : [],
      statusPages: Array.isArray(r.data?.statusPages) ? r.data.statusPages : [],
    })),
  status: (): Promise<ServerStatusCache> =>
    api.get('/servers/status').then((r) => mergeServerStatus(undefined, r.data as ServersStatusEvent, true)),
  players: (serverId: number): Promise<ServerPlayersResponse> =>
    api.get(`/servers/${serverId}/players`, { timeout: 10_000 }).then((r) => ({
      serverId,
      players: Array.isArray(r.data?.players)
        ? (r.data.players as unknown[]).map((p) => {
            const row = (p ?? {}) as Record<string, unknown>;
            return { name: typeof row.name === 'string' ? row.name : '', durationSec: toNumber(row.durationSec) };
          })
        : [],
      fetchedAt: typeof r.data?.fetchedAt === 'string' ? r.data.fetchedAt : new Date().toISOString(),
    })),
};

/**
 * Apply a 'servers:status' event: update the live snapshot cache and refresh
 * open player lists whose head-count, online state or roster (playersRev) changed.
 */
export function applyServersStatusEvent(client: QueryClient, payload: ServersStatusEvent): void {
  const previous = client.getQueryData<ServerStatusCache>(SERVERS_STATUS_KEY);
  const next = mergeServerStatus(previous, payload);
  client.setQueryData(SERVERS_STATUS_KEY, next);
  (payload?.servers ?? []).forEach((raw) => {
    const status = normalizeLiveStatus(raw);
    if (!status) return;
    const before = previous?.byId[status.id];
    if (
      !before ||
      before.players !== status.players ||
      before.online !== status.online ||
      (before.playersRev ?? null) !== (status.playersRev ?? null)
    ) {
      void client.invalidateQueries({ queryKey: serverPlayersKey(status.id) });
    }
  });
}
