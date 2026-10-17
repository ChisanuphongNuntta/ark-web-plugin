/* ======================================================================== *
 * UI redesign 2026-10 — servers, seasons, admin console.
 *
 * SOURCE OF TRUTH: backend/contracts/ui-redesign-2026-10.md (Backend team).
 * Shapes below follow the agreed contract; `console.ts` normalizes envelope
 * variations so pages always receive exactly these types.
 * Re-exported from `./types` — import from '@/lib/contracts/types'.
 * ======================================================================== */

export type GameMode = 'PVE' | 'PVE_MOD' | 'PVPVE';

export interface ServerClusterRef {
  id: string;
  key: string;
  name: string;
}

export interface ServerConnect {
  host: string;
  port: number;
}

/**
 * Public server summary (GET /servers, GET /servers/directory).
 * `online` = heartbeat within the backend staleness window.
 * `deliverable` = backend-authoritative "shop delivery can target it"
 *   (isActive && !drainMode && has an active ServerCredential).
 */
export interface ServerSummary {
  id: number;
  name: string;
  map: string | null;
  displayName: string;
  gameMode: GameMode;
  cluster: ServerClusterRef | null;
  connect: ServerConnect | null;
  rates: string | null;
  isModded: boolean;
  available: boolean;
  online: boolean;
  playerCount: number;
  deliverable: boolean;
  sortOrder: number;
  /** Backward-compatible fields the legacy GET /servers still returns. */
  isActive?: boolean;
  isOnline?: boolean;
  lastHeartbeat?: string | null;
  drainMode?: boolean;
  supportsDinoDelivery?: boolean;
  imageUrl?: string | null;
}

export interface ServerDirectoryGroup {
  key: string;
  name: string;
  /** `null` for the trailing `unassigned` group (servers without a cluster). */
  gameMode: GameMode | null;
  rates: string | null;
  isModded: boolean;
  description: string | null;
  servers: ServerSummary[];
}

/** GET /servers/directory — only isListed servers, ordered by cluster.sortOrder then server.sortOrder. */
export interface ServerDirectoryResponse {
  groups: ServerDirectoryGroup[];
  statusPages: string[];
}

export type SeasonSetting = 'auto' | 'default' | 'winter' | 'christmas' | 'easter';
export type ActiveSeason = Exclude<SeasonSetting, 'auto'>;

export interface SiteAnnouncement {
  text: string;
  href?: string;
}

/** GET /site/settings (public) and PUT /admin/site/settings (admin|root). */
export interface SiteSettings {
  season: SeasonSetting;
  activeSeason: ActiveSeason;
  announcement: SiteAnnouncement | null;
}

export interface UpdateSiteSettingsInput {
  season?: SeasonSetting;
  /** `null` clears the announcement. */
  announcement?: SiteAnnouncement | null;
}

/** Common paginated envelope used by the admin console. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/* --------------------------- Admin: clusters ---------------------------- */

/** Row of GET /admin/clusters (root). */
export interface AdminCluster {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  gameMode: GameMode | null;
  description: string | null;
  rates: string | null;
  isModded: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  serverCount: number;
}

export interface AdminClusterInput {
  key?: string;
  name?: string;
  gameMode?: GameMode | null;
  description?: string | null;
  rates?: string | null;
  isModded?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/* ---------------------------- Admin: servers ---------------------------- */

/** Row of GET /admin/servers (root). Secrets (apiKey) are never rendered by the UI. */
export interface AdminServer {
  id: number;
  clusterId: string | null;
  directoryKey?: string | null;
  name: string;
  displayName: string | null;
  map: string | null;
  isActive: boolean;
  lastHeartbeat: string | null;
  playerCount: number;
  pluginVersion?: string | null;
  pluginBuildHash?: string | null;
  protocolVersion?: number;
  capabilities?: string[];
  drainMode: boolean;
  chatTag: string | null;
  chatColor: string | null;
  chatIcon: string | null;
  webhookUrl?: string | null;
  gameMode: GameMode;
  connectHost: string | null;
  connectPort: number | null;
  rates: string | null;
  isModded: boolean;
  isListed: boolean;
  isAvailable: boolean;
  sortOrder: number;
  imageUrl: string | null;
  cluster?: ServerClusterRef | null;
  /** Derived: heartbeat within the staleness window. */
  online: boolean;
  /** Derived: isActive && !drainMode && activeCredentialCount > 0. */
  deliverable: boolean;
  activeCredentialCount: number;
  /** Root-only; never rendered, only copied to the clipboard. */
  apiKey?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminServerInput {
  name?: string;
  map?: string | null;
  displayName?: string | null;
  isActive?: boolean;
  clusterId?: string | null;
  chatTag?: string | null;
  chatColor?: string | null;
  chatIcon?: string | null;
  gameMode?: GameMode;
  connectHost?: string | null;
  connectPort?: number | null;
  rates?: string | null;
  isModded?: boolean;
  isListed?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
  imageUrl?: string | null;
}

/* -------------------------- Admin: deliveries --------------------------- */

export type DeliveryJobStatus = 'pending' | 'leased' | 'completed' | 'failed' | 'dead_letter';

export interface AdminDeliveryRow {
  id: string;
  status: DeliveryJobStatus;
  /** `order` | `dino_catalog` (order-backed) | `dino_marketplace` (never retryable). */
  deliveryType: string;
  referenceId: string;
  /** Set for order-backed jobs, else null. */
  orderId: string | null;
  serverId: number;
  serverName: string | null;
  steamId: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryQuery extends PageQuery {
  status?: DeliveryJobStatus;
  serverId?: number;
}

/** POST /admin/deliveries/:id/retry — only failed/dead_letter jobs; idempotent. */
export interface DeliveryRetryResponse {
  success: boolean;
  /** True when this call moved the job back to `pending`. */
  retried: boolean;
  /** True when the job was already pending/leased (idempotent replay). */
  alreadyQueued: boolean;
  item: AdminDeliveryRow | null;
}

/* -------------------------- Admin: audit logs --------------------------- */

/** Row of GET /admin/audit-logs. JSON columns arrive as encoded strings. */
export interface AuditLogRow {
  id: number;
  action: string;
  resource: string;
  resourceId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  status: string;
  errorMessage: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface AuditLogQuery extends PageQuery {
  action?: string;
  actorId?: string;
  resource?: string;
}

/* ------------------------ Admin: market listings ------------------------ */

export type MarketListingStatus = 'listed' | 'sold' | 'cancelled' | 'expired';

export interface AdminMarketListing {
  id: string;
  species: string;
  dinoName: string | null;
  level: number;
  gender: string;
  price: number;
  status: MarketListingStatus | (string & {});
  imageUrl: string | null;
  seller: MarketParty | null;
  buyer: MarketParty | null;
  deliveryStatus: string | null;
  originServerId: number | null;
  deliveryServerId: number | null;
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
  expiresAt: string | null;
  deliveredAt: string | null;
}

export interface MarketParty {
  id: string;
  discordUsername: string | null;
  steamId: string | null;
}

export interface MarketListingQuery extends PageQuery {
  status?: MarketListingStatus;
}

/* ---------------------------- Admin: stats ------------------------------ */

export interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  /** Iris Coin. Backend may serialize as number or decimal string. */
  totalRevenue: number | string;
  pendingOrders: number;
  /** Added by the 2026-10 contract (optional until the backend ships it). */
  pendingSlips?: number;
  failedDeliveries?: number;
  onlineServers?: number;
  /** IC of orders created since Bangkok midnight. */
  todayRevenue?: number | string;
  /** THB of completed top-ups since Bangkok midnight. */
  todayTopupThb?: number | string;
  /** ISO instant of the Bangkok midnight the "today" counters start from. */
  todayStartsAt?: string;
}

export interface AdminRecentOrder {
  id: string;
  status: string;
  totalPrice: number | string;
  createdAt: string;
  user?: { discordUsername: string | null } | null;
  product?: { name: string } | null;
}

export interface AdminStatsResponse {
  stats: AdminStats;
  recentOrders: AdminRecentOrder[];
}
