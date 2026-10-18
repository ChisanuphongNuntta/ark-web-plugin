// Live game-server status (realtime 2026-10).
//
// A single poller (SERVICE_ROLE=web, guarded by a Redis lock so only ONE web replica polls)
// queries every target with Steam A2S_INFO + A2S_PLAYER every SERVER_QUERY_INTERVAL_MS
// (default 30s), merges plugin heartbeats for servers without a query target, caches the
// snapshot (including player names) in Redis under `iris:servers:status`, and emits
// `servers:status` to the public `servers` room only when something visible changed.
//
// Query targets, in priority order:
//   1. SERVER_QUERY_TARGETS env override: "1=151.141.23.59:1001,2=151.141.23.59:1004"
//      (plugin servers whose query port must not be published as a Join address)
//   2. Server.connectHost + Server.connectPort (the public directory's Steam query port)
// Servers with neither are heartbeat-only (online/playerCount from the C++ plugin).
import crypto from 'node:crypto';
import prisma from '../config/database.js';
import redis from '../config/redis.js';
import { isServerOnline } from '../utils/serverStatus.js';
import { emitServersStatus } from '../realtime/emit.js';
import type { ServerLiveStatus, ServersStatusEvent, ServerStatusSource } from '../realtime/events.js';
import { parseArkVersion, queryA2S, type A2SQueryResult, type UdpSocketFactory } from './a2s.js';

export const SERVER_STATUS_KEY = 'iris:servers:status';
export const SERVER_POLLER_LOCK_KEY = 'iris:servers:status:lock';
export const ANONYMOUS_PLAYER_NAME = 'ไม่ระบุชื่อ';
/** Consecutive failed A2S rounds before an a2s-online server is shown offline (anti-flap). */
export const A2S_MISS_THRESHOLD = 2;
const MAX_PLAYER_NAME = 64;

export interface PlayerEntry {
  name: string;
  durationSec: number;
}

export interface ServerStatusEntry extends ServerLiveStatus {
  /** Hash of the player-name list; changes when someone joins/leaves even if the count does not. */
  playersRev?: string;
  /** Player list from the last successful A2S_PLAYER (null when unknown / heartbeat-only). */
  playerList: PlayerEntry[] | null;
  /** Last successful A2S query (ISO), null when never queried. */
  fetchedAt: string | null;
  /** Consecutive failed A2S rounds. */
  misses: number;
}

export interface StoredSnapshot {
  at: string;
  servers: ServerStatusEntry[];
}

export interface QueryTarget {
  host: string;
  port: number;
}

export interface ServerRow {
  id: number;
  connectHost: string | null;
  connectPort: number | null;
  lastHeartbeat: Date | null;
  playerCount: number | null;
}

export interface PlayersResponse {
  serverId: number;
  players: PlayerEntry[];
  fetchedAt: string | null;
  online: boolean;
  source: ServerStatusSource;
}

const intFromEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

export function pollerConfig() {
  return {
    intervalMs: intFromEnv('SERVER_QUERY_INTERVAL_MS', 30_000, 5_000, 10 * 60_000),
    timeoutMs: intFromEnv('SERVER_QUERY_TIMEOUT_MS', 2_500, 500, 10_000),
    concurrency: intFromEnv('SERVER_QUERY_CONCURRENCY', 8, 1, 32),
    enabled: (process.env.SERVER_QUERY_ENABLED ?? 'true').toLowerCase() !== 'false',
  };
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────────────────

/** Parses "1=host:port,2=host:port" (whitespace/semicolons tolerated). Invalid pairs are ignored. */
export function parseTargetOverrides(raw: string | undefined): Map<number, QueryTarget> {
  const out = new Map<number, QueryTarget>();
  if (!raw) return out;
  for (const part of raw.split(/[,;\s]+/)) {
    const match = /^(\d+)=([A-Za-z0-9.-]+):(\d{1,5})$/.exec(part.trim());
    if (!match) continue;
    const id = Number(match[1]);
    const port = Number(match[3]);
    if (id > 0 && port > 0 && port < 65536) out.set(id, { host: match[2], port });
  }
  return out;
}

export function resolveTarget(server: ServerRow, overrides: Map<number, QueryTarget>): QueryTarget | null {
  const override = overrides.get(server.id);
  if (override) return override;
  const host = server.connectHost?.trim();
  const port = server.connectPort;
  if (host && typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536) return { host, port };
  return null;
}

export function playersRevFor(list: PlayerEntry[] | null): string | undefined {
  if (!list) return undefined;
  const names = list.map((p) => p.name).sort().join('\n');
  return crypto.createHash('sha1').update(`${list.length}\n${names}`).digest('hex').slice(0, 10);
}

const cleanName = (name: string) =>
  // Strip control characters; cap length. Empty stays empty (rendered as ANONYMOUS_PLAYER_NAME).
  name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_PLAYER_NAME);

const MAX_SESSION_NAME = 100;

/**
 * Public session name for the in-game server browser search: control characters removed and the
 * ARK build suffix stripped — complete "- (v361.7)" or the 63-byte-truncated "- (v361" / "- (".
 */
export function cleanSessionName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s*\((v[\d.]*\)?)?\s*$/i, '')
    .replace(/[\s-]+$/, '')
    .trim()
    .slice(0, MAX_SESSION_NAME);
  return cleaned || null;
}

export function toPlayerList(result: A2SQueryResult): PlayerEntry[] | null {
  if (!result.players) return null;
  return result.players.map((p) => ({ name: cleanName(p.name), durationSec: Math.max(0, Math.floor(p.durationSec)) }));
}

function heartbeatEntry(server: ServerRow, previous: ServerStatusEntry | undefined, now: Date, misses = 0): ServerStatusEntry {
  const online = isServerOnline(server.lastHeartbeat, now);
  return {
    id: server.id,
    online,
    players: online ? Math.max(0, server.playerCount ?? 0) : 0,
    maxPlayers: previous?.maxPlayers ?? null,
    version: previous?.version ?? null,
    map: previous?.map ?? null,
    name: previous?.name ?? null,
    source: 'heartbeat',
    playerList: null,
    playersRev: undefined,
    fetchedAt: previous?.fetchedAt ?? null,
    misses,
  };
}

/**
 * Builds the next entry for one server.
 *   result === undefined -> the server has no query target (heartbeat-only)
 *   result === null      -> it has a target but the A2S query failed this round
 */
export function computeEntry(
  server: ServerRow,
  result: A2SQueryResult | null | undefined,
  previous: ServerStatusEntry | undefined,
  now: Date,
): ServerStatusEntry {
  if (result === undefined) return heartbeatEntry(server, previous, now);

  if (result) {
    const list = toPlayerList(result) ?? previous?.playerList ?? null;
    return {
      id: server.id,
      online: true,
      players: result.info.players,
      maxPlayers: result.info.maxPlayers,
      version: parseArkVersion(result.info.name, result.info.version),
      map: result.info.map || null,
      name: cleanSessionName(result.info.name),
      source: 'a2s',
      playerList: list,
      playersRev: playersRevFor(list),
      fetchedAt: now.toISOString(),
      misses: 0,
    };
  }

  const misses = (previous?.misses ?? 0) + 1;
  // Anti-flap: a single lost UDP round keeps the last good A2S state.
  if (previous && previous.source === 'a2s' && previous.online && misses < A2S_MISS_THRESHOLD) {
    return { ...previous, misses };
  }
  if (isServerOnline(server.lastHeartbeat, now)) return heartbeatEntry(server, previous, now, misses);
  return {
    id: server.id,
    online: false,
    players: 0,
    maxPlayers: previous?.maxPlayers ?? null,
    version: previous?.version ?? null,
    map: previous?.map ?? null,
    name: previous?.name ?? null,
    source: 'a2s',
    playerList: [],
    playersRev: playersRevFor([]),
    fetchedAt: previous?.fetchedAt ?? null,
    misses,
  };
}

export function toPublicStatus(entry: ServerStatusEntry): ServerLiveStatus & { playersRev?: string } {
  return {
    id: entry.id,
    online: entry.online,
    players: entry.players,
    maxPlayers: entry.maxPlayers,
    version: entry.version ?? null,
    map: entry.map ?? null,
    ...(entry.name ? { name: entry.name } : {}),
    source: entry.source,
    ...(entry.playersRev ? { playersRev: entry.playersRev } : {}),
  };
}

export function toPublicSnapshot(snapshot: StoredSnapshot): ServersStatusEvent {
  return { at: snapshot.at, servers: snapshot.servers.map(toPublicStatus) };
}

/** True when any publicly visible field differs (ids added/removed included). */
export function hasVisibleChange(previous: StoredSnapshot | null, next: StoredSnapshot): boolean {
  if (!previous) return true;
  const key = (entry: ServerStatusEntry) => JSON.stringify(toPublicStatus(entry));
  const before = new Map(previous.servers.map((entry) => [entry.id, key(entry)]));
  if (before.size !== next.servers.length) return true;
  return next.servers.some((entry) => before.get(entry.id) !== key(entry));
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Service ───────────────────────────────────────────────────────────────────────────────

const RENEW_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export interface ServerQueryDeps {
  query?: (host: string, port: number, timeoutMs: number) => Promise<A2SQueryResult>;
  socketFactory?: UdpSocketFactory;
  now?: () => Date;
}

export class ServerQueryService {
  private readonly instanceId = crypto.randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false;
  private memo: { at: number; snapshot: StoredSnapshot } | null = null;
  private livePlayers = new Map<number, { at: number; promise: Promise<A2SQueryResult | null> }>();

  constructor(private readonly deps: ServerQueryDeps = {}) {}

  private now() {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private query(host: string, port: number, timeoutMs: number) {
    if (this.deps.query) return this.deps.query(host, port, timeoutMs);
    return queryA2S(host, port, { timeoutMs, socketFactory: this.deps.socketFactory });
  }

  // ── Poller lifecycle ──

  start(): void {
    const config = pollerConfig();
    if (!config.enabled || this.running) return;
    this.running = true;
    console.log(`[server-query] poller started (interval ${config.intervalMs}ms, instance ${this.instanceId.slice(0, 8)})`);
    this.schedule(2_000);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      await Promise.race([
        redis.eval(RELEASE_LOCK_LUA, 1, SERVER_POLLER_LOCK_KEY, this.instanceId),
        new Promise((resolve) => setTimeout(resolve, 1_000).unref?.()),
      ]);
    } catch {
      // lock expires on its own
    }
  }

  private schedule(delayMs: number) {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.tick().catch((error) => console.error('[server-query] tick failed:', error));
      this.schedule(pollerConfig().intervalMs);
    }, delayMs);
    this.timer.unref?.();
  }

  /** Acquire or renew the single-poller lock. */
  async acquireLock(ttlMs: number): Promise<boolean> {
    const acquired = await redis.set(SERVER_POLLER_LOCK_KEY, this.instanceId, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') return true;
    const renewed = await redis.eval(RENEW_LOCK_LUA, 1, SERVER_POLLER_LOCK_KEY, this.instanceId, String(ttlMs));
    return Number(renewed) === 1;
  }

  /** One polling round. Returns the stored snapshot, or null when another replica holds the lock. */
  async tick(): Promise<StoredSnapshot | null> {
    if (this.ticking) return null;
    this.ticking = true;
    try {
      const config = pollerConfig();
      if (!(await this.acquireLock(config.intervalMs * 3))) return null;

      const [servers, previous] = await Promise.all([this.loadServers(), this.readStored()]);
      const overrides = parseTargetOverrides(process.env.SERVER_QUERY_TARGETS);
      const prevById = new Map((previous?.servers ?? []).map((entry) => [entry.id, entry]));

      const results = await mapWithConcurrency(servers, config.concurrency, async (server) => {
        const target = resolveTarget(server, overrides);
        if (!target) return undefined;
        try {
          return await this.query(target.host, target.port, config.timeoutMs);
        } catch {
          return null;
        }
      });

      const now = this.now();
      const next: StoredSnapshot = {
        at: now.toISOString(),
        servers: servers.map((server, index) => computeEntry(server, results[index], prevById.get(server.id), now)),
      };
      await this.writeStored(next, config.intervalMs);
      if (hasVisibleChange(previous, next)) emitServersStatus(toPublicSnapshot(next));
      return next;
    } finally {
      this.ticking = false;
    }
  }

  private async loadServers(): Promise<ServerRow[]> {
    return prisma.server.findMany({
      where: { isActive: true },
      select: { id: true, connectHost: true, connectPort: true, lastHeartbeat: true, playerCount: true },
      orderBy: { id: 'asc' },
    }) as Promise<ServerRow[]>;
  }

  private async readStored(): Promise<StoredSnapshot | null> {
    try {
      const raw = await redis.get(SERVER_STATUS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSnapshot;
      return parsed && Array.isArray(parsed.servers) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeStored(snapshot: StoredSnapshot, intervalMs = pollerConfig().intervalMs) {
    const ttlSec = Math.max(120, Math.ceil((intervalMs * 6) / 1000));
    await redis.set(SERVER_STATUS_KEY, JSON.stringify(snapshot), 'EX', ttlSec);
    this.memo = { at: Date.now(), snapshot };
  }

  // ── Read side (any web replica) ──

  /** Full internal snapshot; falls back to a heartbeat-only view when the cache is empty. */
  async getSnapshot(): Promise<StoredSnapshot> {
    if (this.memo && Date.now() - this.memo.at < 3_000) return this.memo.snapshot;
    let snapshot = await this.readStored();
    if (!snapshot) {
      const now = this.now();
      const servers = await this.loadServers();
      snapshot = { at: now.toISOString(), servers: servers.map((server) => heartbeatEntry(server, undefined, now)) };
    }
    this.memo = { at: Date.now(), snapshot };
    return snapshot;
  }

  async getPublicStatus(): Promise<ServersStatusEvent> {
    return toPublicSnapshot(await this.getSnapshot());
  }

  /** Live status by server id, for merging into directory/summary responses. */
  async getStatusMap(): Promise<Map<number, ServerStatusEntry>> {
    try {
      const snapshot = await this.getSnapshot();
      return new Map(snapshot.servers.map((entry) => [entry.id, entry]));
    } catch (error) {
      console.error('[server-query] status unavailable:', error);
      return new Map();
    }
  }

  /**
   * Player list for one server. Served from the snapshot; when the cached list is older than
   * `maxAgeMs` and the server has a query target, a live query (deduplicated per server for
   * 10s in this process) refreshes it. Returns null for unknown/inactive servers.
   */
  async getPlayers(serverId: number, maxAgeMs = 20_000): Promise<PlayersResponse | null> {
    const snapshot = await this.getSnapshot();
    const entry = snapshot.servers.find((item) => item.id === serverId);
    if (!entry) return null;

    let list = entry.playerList;
    let fetchedAt = entry.fetchedAt;
    let online = entry.online;
    let source = entry.source;

    const stale = !fetchedAt || Date.now() - new Date(fetchedAt).getTime() > maxAgeMs;
    if (stale) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { id: true, connectHost: true, connectPort: true, lastHeartbeat: true, playerCount: true, isActive: true },
      });
      const target = server?.isActive ? resolveTarget(server as ServerRow, parseTargetOverrides(process.env.SERVER_QUERY_TARGETS)) : null;
      if (target) {
        const result = await this.liveQuery(serverId, target);
        if (result) {
          const fresh = toPlayerList(result);
          if (fresh) list = fresh;
          fetchedAt = new Date().toISOString();
          online = true;
          source = 'a2s';
        }
      }
    }

    return {
      serverId,
      players: (list ?? []).map((player) => ({
        name: player.name || ANONYMOUS_PLAYER_NAME,
        durationSec: player.durationSec,
      })),
      fetchedAt,
      online,
      source,
    };
  }

  private liveQuery(serverId: number, target: QueryTarget): Promise<A2SQueryResult | null> {
    const cached = this.livePlayers.get(serverId);
    if (cached && Date.now() - cached.at < 10_000) return cached.promise;
    const promise = this.query(target.host, target.port, pollerConfig().timeoutMs).catch(() => null);
    this.livePlayers.set(serverId, { at: Date.now(), promise });
    if (this.livePlayers.size > 200) {
      for (const [id, value] of this.livePlayers) if (Date.now() - value.at > 10_000) this.livePlayers.delete(id);
    }
    return promise;
  }

  /**
   * Called by the plugin heartbeat handler (gateway process) after the DB write: updates a
   * heartbeat-sourced entry immediately instead of waiting for the next poll, and emits if the
   * visible state changed. A2S-sourced entries are left to the poller.
   */
  async applyHeartbeat(serverId: number, playerCount: number): Promise<void> {
    try {
      const snapshot = await this.readStored();
      if (!snapshot) return;
      const index = snapshot.servers.findIndex((entry) => entry.id === serverId);
      if (index === -1) return;
      const current = snapshot.servers[index];
      if (current.source !== 'heartbeat') return;
      if (current.online && current.players === playerCount) return;
      const next: StoredSnapshot = {
        at: this.now().toISOString(),
        servers: snapshot.servers.map((entry, i) => (i === index ? { ...entry, online: true, players: Math.max(0, playerCount) } : entry)),
      };
      await this.writeStored(next);
      emitServersStatus(toPublicSnapshot(next));
    } catch (error) {
      console.error('[server-query] heartbeat merge failed:', error);
    }
  }
}

export const serverQueryService = new ServerQueryService();
export default serverQueryService;
