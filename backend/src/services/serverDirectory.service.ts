// Public server directory + ServerSummary projection (UI redesign 2026-10).
//
// Pure mapping/grouping helpers are exported separately from the DB queries so the
// deliverable/online/grouping rules are unit-testable without a database.
import type { GameMode } from '@prisma/client';
import prisma from '../config/database.js';
import { isServerOnline } from '../utils/serverStatus.js';
import siteSettingsService from './siteSettings.service.js';

export interface ClusterRef {
  id: string;
  key: string;
  name: string;
}

export interface ServerSummary {
  id: number;
  name: string;
  map: string | null;
  displayName: string;
  gameMode: GameMode;
  cluster: ClusterRef | null;
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
  servers: ServerSummary[];
}

export interface DirectoryResponse {
  groups: DirectoryGroup[];
  statusPages: string[];
}

// Columns needed to build a ServerSummary. NEVER add apiKey/webhookUrl/credential secrets.
export const SERVER_SUMMARY_SELECT = {
  id: true,
  name: true,
  map: true,
  displayName: true,
  gameMode: true,
  connectHost: true,
  connectPort: true,
  rates: true,
  isModded: true,
  isListed: true,
  isAvailable: true,
  isActive: true,
  drainMode: true,
  lastHeartbeat: true,
  playerCount: true,
  sortOrder: true,
  clusterId: true,
  cluster: {
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true,
      gameMode: true,
      rates: true,
      isModded: true,
      description: true,
      sortOrder: true,
    },
  },
  credentials: {
    where: { status: 'active' },
    select: { id: true },
    take: 1,
  },
} as const;

// Shape returned by a findMany with SERVER_SUMMARY_SELECT. Fields are optional/loose so
// older rows and test doubles without the new columns still map safely.
export interface ServerSummarySource {
  id: number;
  name: string;
  map?: string | null;
  displayName?: string | null;
  gameMode?: GameMode | null;
  connectHost?: string | null;
  connectPort?: number | null;
  rates?: string | null;
  isModded?: boolean | null;
  isListed?: boolean | null;
  isAvailable?: boolean | null;
  isActive?: boolean | null;
  drainMode?: boolean | null;
  lastHeartbeat?: Date | null;
  playerCount?: number | null;
  sortOrder?: number | null;
  cluster?: {
    id: string;
    key: string;
    name: string;
    isActive?: boolean | null;
    gameMode?: GameMode | null;
    rates?: string | null;
    isModded?: boolean | null;
    description?: string | null;
    sortOrder?: number | null;
  } | null;
  credentials?: Array<{ id: string }> | null;
}

// "TheIsland" -> "The Island", "Genesis2" -> "Genesis 2". Fallback when displayName is unset.
export function humanizeMapName(map: string | null | undefined): string | null {
  if (!map) return null;
  return map
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim();
}

// Shop delivery can target a server only when it is active, not draining, and has at least
// one active signing credential (i.e. a real plugin can authenticate and lease jobs).
export function isServerDeliverable(server: Pick<ServerSummarySource, 'isActive' | 'drainMode' | 'credentials'>): boolean {
  return Boolean(server.isActive) && !server.drainMode && (server.credentials?.length ?? 0) > 0;
}

export function toServerSummary(server: ServerSummarySource, now: Date = new Date()): ServerSummary {
  const host = server.connectHost?.trim();
  const port = server.connectPort;
  return {
    id: server.id,
    name: server.name,
    map: server.map ?? null,
    displayName: server.displayName?.trim() || humanizeMapName(server.map) || server.name,
    gameMode: server.gameMode ?? 'PVE',
    cluster: server.cluster ? { id: server.cluster.id, key: server.cluster.key, name: server.cluster.name } : null,
    connect: host && typeof port === 'number' && Number.isInteger(port) && port > 0 ? { host, port } : null,
    rates: server.rates ?? server.cluster?.rates ?? null,
    isModded: Boolean(server.isModded),
    available: server.isAvailable !== false,
    online: isServerOnline(server.lastHeartbeat ?? null, now),
    playerCount: server.playerCount ?? 0,
    deliverable: isServerDeliverable(server),
    sortOrder: server.sortOrder ?? 0,
  };
}

// Live status merged into directory items (realtime 2026-10). When the A2S/heartbeat snapshot
// has an entry, `online`/`playerCount` come from it (A2S is authoritative for listed servers
// without a plugin) and the extra fields are filled; otherwise the heartbeat-derived values stay.
export interface LiveStatusLike {
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
  version?: string | null;
  source: 'a2s' | 'heartbeat';
  playersRev?: string;
}

export interface LiveServerSummary extends ServerSummary {
  maxPlayers: number | null;
  version: string | null;
  statusSource: 'a2s' | 'heartbeat';
  playersRev: string | null;
}

export function mergeLiveStatus(summary: ServerSummary, live: LiveStatusLike | undefined): LiveServerSummary {
  if (!live) {
    return { ...summary, maxPlayers: null, version: null, statusSource: 'heartbeat', playersRev: null };
  }
  return {
    ...summary,
    online: live.online,
    playerCount: live.players ?? 0,
    maxPlayers: live.maxPlayers ?? null,
    version: live.version ?? null,
    statusSource: live.source,
    playersRev: live.playersRev ?? null,
  };
}

export function mergeDirectoryLiveStatus(
  directory: DirectoryResponse,
  live: Map<number, LiveStatusLike>,
): DirectoryResponse & { groups: Array<DirectoryGroup & { servers: LiveServerSummary[] }> } {
  return {
    ...directory,
    groups: directory.groups.map((group) => ({
      ...group,
      servers: group.servers.map((server) => mergeLiveStatus(server, live.get(server.id))),
    })),
  };
}

export const UNASSIGNED_GROUP_KEY = 'unassigned';

// Groups listed servers by cluster, ordered by cluster.sortOrder then server.sortOrder
// (ties broken by cluster key / server id for a stable order). Only isListed && isActive
// servers in an active (or no) cluster are included. Servers without a cluster go into a
// trailing "unassigned" group, which is omitted when empty.
export function groupDirectory(servers: ServerSummarySource[], now: Date = new Date()): DirectoryGroup[] {
  type Bucket = { group: DirectoryGroup; clusterSort: number; servers: ServerSummarySource[] };
  const buckets = new Map<string, Bucket>();

  for (const server of servers) {
    if (server.isListed === false || server.isActive === false) continue;
    if (server.cluster && server.cluster.isActive === false) continue;

    const key = server.cluster?.key ?? UNASSIGNED_GROUP_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        clusterSort: server.cluster ? server.cluster.sortOrder ?? 0 : Number.MAX_SAFE_INTEGER,
        servers: [],
        group: server.cluster
          ? {
              key: server.cluster.key,
              name: server.cluster.name,
              gameMode: server.cluster.gameMode ?? null,
              rates: server.cluster.rates ?? null,
              isModded: Boolean(server.cluster.isModded),
              description: server.cluster.description ?? null,
              servers: [],
            }
          : {
              key: UNASSIGNED_GROUP_KEY,
              name: 'Other servers',
              gameMode: null,
              rates: null,
              isModded: false,
              description: null,
              servers: [],
            },
      };
      buckets.set(key, bucket);
    }
    bucket.servers.push(server);
  }

  return [...buckets.values()]
    .sort((a, b) => a.clusterSort - b.clusterSort || a.group.key.localeCompare(b.group.key))
    .map((bucket) => ({
      ...bucket.group,
      servers: bucket.servers
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
        .map((server) => toServerSummary(server, now)),
    }));
}

class ServerDirectoryService {
  async getDirectory(now: Date = new Date()): Promise<DirectoryResponse> {
    const [servers, statusPages] = await Promise.all([
      prisma.server.findMany({
        where: { isListed: true, isActive: true },
        select: SERVER_SUMMARY_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      siteSettingsService.getStatusPages(),
    ]);
    return { groups: groupDirectory(servers as ServerSummarySource[], now), statusPages };
  }
}

export const serverDirectoryService = new ServerDirectoryService();
export default serverDirectoryService;
