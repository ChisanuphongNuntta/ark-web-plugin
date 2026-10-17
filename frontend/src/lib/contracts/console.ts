/**
 * Typed clients for the UI redesign 2026-10 contract:
 * servers directory, deliverable servers, site settings (season +
 * announcement), and the admin console (clusters, servers, deliveries,
 * audit logs, market listings, stats).
 *
 * Contract: backend/contracts/ui-redesign-2026-10.md (Backend owns it).
 * Every method returns the exact frontend type; envelope variations
 * (`{ servers }` vs bare arrays, `{ logs, pagination }` vs `{ items, total }`)
 * are normalized here so pages never parse raw responses.
 *
 * RULE: transport only. No prices, totals or eligibility are computed here,
 * except the documented legacy fallback for `deliverable` (see
 * `normalizeServerSummary`) used only while an older backend omits it.
 */
import { api } from '../api';
import { serverDirectoryFixture } from './console-fixtures';
import type {
  ActiveSeason,
  AdminCluster,
  AdminClusterInput,
  AdminDeliveryRow,
  AdminMarketListing,
  AdminServer,
  AdminServerInput,
  AdminStatsResponse,
  AuditLogQuery,
  AuditLogRow,
  DeliveryQuery,
  DeliveryRetryResponse,
  GameMode,
  MarketListingQuery,
  Paginated,
  SeasonSetting,
  ServerDirectoryGroup,
  ServerDirectoryResponse,
  ServerSummary,
  SiteAnnouncement,
  SiteSettings,
  UpdateSiteSettingsInput,
} from './types';

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

function fixturesOn(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_FIXTURES === 'always';
}

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** Unwrap `{ [key]: X }` or return X itself. */
function unwrap(data: unknown, key: string): unknown {
  return isObj(data) && key in data ? data[key] : data;
}

const GAME_MODES: readonly GameMode[] = ['PVE', 'PVE_MOD', 'PVPVE'];
function gameMode(v: unknown): GameMode {
  return GAME_MODES.includes(v as GameMode) ? (v as GameMode) : 'PVE';
}

function gameModeOrNull(v: unknown): GameMode | null {
  return GAME_MODES.includes(v as GameMode) ? (v as GameMode) : null;
}

const SEASON_SETTINGS: readonly SeasonSetting[] = ['auto', 'default', 'winter', 'christmas', 'easter'];

/**
 * Normalize any paginated envelope to `Paginated<T>`. Accepts
 * `{ items, total, page, pageSize }`, `{ <key>, pagination: { page, limit, total } }`
 * and bare arrays.
 */
export function normalizePage<T>(data: unknown, listKeys: string[], query?: { page?: number; pageSize?: number }): Paginated<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, page: query?.page ?? 1, pageSize: query?.pageSize ?? data.length };
  }
  if (!isObj(data)) return { items: [], total: 0, page: 1, pageSize: query?.pageSize ?? 20 };
  const key = ['items', ...listKeys].find((k) => Array.isArray(data[k]));
  const items = (key ? data[key] : []) as T[];
  const pagination = isObj(data.pagination) ? data.pagination : {};
  return {
    items,
    total: num(data.total ?? pagination.total, items.length),
    page: num(data.page ?? pagination.page, query?.page ?? 1),
    pageSize: num(data.pageSize ?? pagination.pageSize ?? pagination.limit, query?.pageSize ?? items.length),
  };
}

/* ------------------------------------------------------------------------ */
/* Servers (public)                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Normalize a server row (new ServerSummary or legacy ServerStatus) to
 * `ServerSummary`. Legacy fallback for `deliverable` when the backend has not
 * shipped the field yet: `isActive !== false && drainMode !== true`.
 */
export function normalizeServerSummary(raw: unknown): ServerSummary {
  const r = isObj(raw) ? raw : {};
  const cluster = isObj(r.cluster)
    ? { id: String(r.cluster.id ?? ''), key: String(r.cluster.key ?? ''), name: String(r.cluster.name ?? '') }
    : null;
  const connectRaw = isObj(r.connect) ? r.connect : null;
  const host = str(connectRaw?.host) ?? str(r.connectHost);
  const port = num(connectRaw?.port ?? r.connectPort, 0);
  const online = typeof r.online === 'boolean' ? r.online : r.isOnline === true;
  const deliverable =
    typeof r.deliverable === 'boolean' ? r.deliverable : r.isActive !== false && r.drainMode !== true;
  const name = str(r.name) ?? `Server ${num(r.id)}`;
  return {
    id: num(r.id),
    name,
    map: str(r.map),
    displayName: str(r.displayName) ?? name,
    gameMode: gameMode(r.gameMode),
    cluster,
    connect: host && port > 0 ? { host, port } : null,
    rates: str(r.rates),
    isModded: r.isModded === true,
    available: typeof r.available === 'boolean' ? r.available : r.isAvailable !== false,
    online,
    playerCount: num(r.playerCount),
    deliverable,
    sortOrder: num(r.sortOrder),
    isActive: typeof r.isActive === 'boolean' ? r.isActive : undefined,
    isOnline: online,
    lastHeartbeat: str(r.lastHeartbeat),
    drainMode: typeof r.drainMode === 'boolean' ? r.drainMode : undefined,
    supportsDinoDelivery: typeof r.supportsDinoDelivery === 'boolean' ? r.supportsDinoDelivery : undefined,
    imageUrl: str(r.imageUrl),
  };
}

function normalizeDirectory(data: unknown): ServerDirectoryResponse {
  const d = isObj(data) ? data : {};
  const groups = Array.isArray(d.groups) ? d.groups : [];
  return {
    groups: groups.filter(isObj).map(
      (g): ServerDirectoryGroup => ({
        key: String(g.key ?? ''),
        name: String(g.name ?? ''),
        gameMode: gameModeOrNull(g.gameMode),
        rates: str(g.rates),
        isModded: g.isModded === true || g.modded === true,
        description: str(g.description),
        servers: (Array.isArray(g.servers) ? g.servers : []).map(normalizeServerSummary),
      })
    ),
    statusPages: Array.isArray(d.statusPages) ? d.statusPages.filter((s): s is string => typeof s === 'string') : [],
  };
}

export const serverDirectoryApi = {
  /**
   * GET /servers[?deliverable=true] -> ServerSummary[].
   * With `deliverable: true` the backend filters to shop-deliverable servers;
   * the result is filtered again client-side so a legacy backend that ignores
   * the query cannot leak non-deliverable targets into a buy flow.
   */
  listServers: async (params?: { deliverable?: boolean }): Promise<ServerSummary[]> => {
    if (fixturesOn()) {
      const all = serverDirectoryFixture.groups.flatMap((g) => g.servers);
      return params?.deliverable ? all.filter((s) => s.deliverable) : all;
    }
    const { data } = await api.get('/servers', {
      params: params?.deliverable ? { deliverable: true } : undefined,
    });
    const list = unwrap(data, 'servers');
    const servers = (Array.isArray(list) ? list : []).map(normalizeServerSummary);
    return params?.deliverable ? servers.filter((s) => s.deliverable) : servers;
  },

  /** GET /servers/directory -> { groups, statusPages } (listed servers only). */
  getDirectory: async (): Promise<ServerDirectoryResponse> => {
    if (fixturesOn()) return serverDirectoryFixture;
    const { data } = await api.get('/servers/directory');
    return normalizeDirectory(data);
  },
};

/* ------------------------------------------------------------------------ */
/* Site settings (public)                                                   */
/* ------------------------------------------------------------------------ */

export function normalizeSiteSettings(data: unknown): SiteSettings {
  const d = unwrap(data, 'settings');
  const s = isObj(d) ? d : {};
  const season = SEASON_SETTINGS.includes(s.season as SeasonSetting) ? (s.season as SeasonSetting) : 'auto';
  const active = SEASON_SETTINGS.includes(s.activeSeason as SeasonSetting) && s.activeSeason !== 'auto'
    ? (s.activeSeason as ActiveSeason)
    : 'default';
  let announcement: SiteAnnouncement | null = null;
  if (isObj(s.announcement) && str(s.announcement.text)) {
    announcement = { text: String(s.announcement.text) };
    const href = str(s.announcement.href);
    if (href) announcement.href = href;
  }
  return { season, activeSeason: active, announcement };
}

export const siteApi = {
  /** GET /site/settings -> { season, activeSeason, announcement } */
  getSettings: async (): Promise<SiteSettings> => {
    const { data } = await api.get('/site/settings');
    return normalizeSiteSettings(data);
  },
};

/* ------------------------------------------------------------------------ */
/* Admin console (admin|root unless noted)                                  */
/* ------------------------------------------------------------------------ */

export const adminConsoleApi = {
  /* Site settings ---------------------------------------------------------- */

  /** PUT /admin/site/settings { season?, announcement? } -> SiteSettings. Audited. */
  updateSiteSettings: async (input: UpdateSiteSettingsInput): Promise<SiteSettings> => {
    const { data } = await api.put('/admin/site/settings', input);
    return normalizeSiteSettings(data);
  },

  /* Clusters (root) ------------------------------------------------------- */

  /** GET /admin/clusters -> AdminCluster[] (with `serverCount`). */
  listClusters: async (): Promise<AdminCluster[]> => {
    const { data } = await api.get('/admin/clusters');
    const list = unwrap(data, 'clusters');
    return (Array.isArray(list) ? list : []).filter(isObj).map((c) => {
      const count = isObj(c._count) ? c._count.servers : undefined;
      return { ...c, serverCount: num(c.serverCount ?? count) } as unknown as AdminCluster;
    });
  },

  /** POST /admin/clusters -> AdminCluster */
  createCluster: async (input: AdminClusterInput & { key: string; name: string }): Promise<AdminCluster> => {
    const { data } = await api.post('/admin/clusters', input);
    return unwrap(data, 'cluster') as AdminCluster;
  },

  /** PUT /admin/clusters/:id -> AdminCluster */
  updateCluster: async (id: string, input: AdminClusterInput): Promise<AdminCluster> => {
    const { data } = await api.put(`/admin/clusters/${encodeURIComponent(id)}`, input);
    return unwrap(data, 'cluster') as AdminCluster;
  },

  /* Servers (root) -------------------------------------------------------- */

  /** GET /admin/servers -> AdminServer[] */
  listServers: async (): Promise<AdminServer[]> => {
    const { data } = await api.get('/admin/servers');
    const list = unwrap(data, 'servers');
    return (Array.isArray(list) ? list : []) as AdminServer[];
  },

  /** POST /admin/servers -> AdminServer (name + map required). */
  createServer: async (input: AdminServerInput & { name: string; map: string }): Promise<AdminServer> => {
    const { data } = await api.post('/admin/servers', input);
    return unwrap(data, 'server') as AdminServer;
  },

  /** PUT /admin/servers/:id -> AdminServer */
  updateServer: async (id: number, input: AdminServerInput): Promise<AdminServer> => {
    const { data } = await api.put(`/admin/servers/${id}`, input);
    return unwrap(data, 'server') as AdminServer;
  },

  /* Deliveries ------------------------------------------------------------ */

  /** GET /admin/deliveries?status&serverId&page&pageSize -> Paginated<AdminDeliveryRow> */
  listDeliveries: async (query: DeliveryQuery = {}): Promise<Paginated<AdminDeliveryRow>> => {
    const { data } = await api.get('/admin/deliveries', { params: query });
    return normalizePage<AdminDeliveryRow>(data, ['deliveries', 'jobs'], query);
  },

  /**
   * POST /admin/deliveries/:id/retry -> { success, retried, alreadyQueued, item }.
   * failed/dead_letter only (409 otherwise); idempotent and audited. Reuses the
   * backend delivery orchestrator (no new delivery path).
   */
  retryDelivery: async (id: string): Promise<DeliveryRetryResponse> => {
    const { data } = await api.post(`/admin/deliveries/${encodeURIComponent(id)}/retry`);
    const d = isObj(data) ? data : {};
    return {
      success: d.success !== false,
      retried: d.retried === true,
      alreadyQueued: d.alreadyQueued === true,
      item: isObj(d.item) ? (d.item as unknown as AdminDeliveryRow) : null,
    };
  },

  /* Audit logs ------------------------------------------------------------ */

  /** GET /admin/audit-logs?action&actorId&resource&page&pageSize -> Paginated<AuditLogRow> */
  listAuditLogs: async (query: AuditLogQuery = {}): Promise<Paginated<AuditLogRow>> => {
    const { data } = await api.get('/admin/audit-logs', { params: query });
    return normalizePage<AuditLogRow>(data, ['logs', 'auditLogs'], query);
  },

  /* Market listings (read-only) ------------------------------------------ */

  /** GET /admin/market/listings?status&page&pageSize -> Paginated<AdminMarketListing> */
  listMarketListings: async (query: MarketListingQuery = {}): Promise<Paginated<AdminMarketListing>> => {
    const { data } = await api.get('/admin/market/listings', { params: query });
    return normalizePage<AdminMarketListing>(data, ['listings'], query);
  },
  // No admin cancel: the backend has no escrow-safe cancel service (contract §8).

  /* Stats ----------------------------------------------------------------- */

  /** GET /admin/stats -> { stats, recentOrders } (extended counters optional). */
  getStats: async (): Promise<AdminStatsResponse> => {
    const { data } = await api.get('/admin/stats');
    const d = isObj(data) ? data : {};
    const stats = isObj(d.stats) ? d.stats : {};
    return {
      stats: {
        totalUsers: num(stats.totalUsers),
        totalOrders: num(stats.totalOrders),
        totalRevenue: (stats.totalRevenue as number | string | undefined) ?? 0,
        pendingOrders: num(stats.pendingOrders),
        pendingSlips: stats.pendingSlips === undefined ? undefined : num(stats.pendingSlips),
        failedDeliveries: stats.failedDeliveries === undefined ? undefined : num(stats.failedDeliveries),
        onlineServers: stats.onlineServers === undefined ? undefined : num(stats.onlineServers),
        todayRevenue: stats.todayRevenue as number | string | undefined,
        todayTopupThb: stats.todayTopupThb as number | string | undefined,
        todayStartsAt: str(stats.todayStartsAt) ?? undefined,
      },
      recentOrders: (Array.isArray(d.recentOrders) ? d.recentOrders : []) as AdminStatsResponse['recentOrders'],
    };
  },
};
