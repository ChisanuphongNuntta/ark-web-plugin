import axios from 'axios';
import {
  normalizePageResponse,
  normalizePageSize,
  normalizeSearch,
  parsePage,
  type PageRequest,
  type PageResult,
  type RawPagination,
} from '@/components/admin/paginationMath';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if not already on login/auth pages and visiting a protected route
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const authPaths = ['/login', '/auth/callback', '/auth/link-steam'];
        const protectedPrefixes = ['/orders', '/admin', '/market/my-listings', '/market/my-purchases'];

        const isProtected = protectedPrefixes.some(prefix => currentPath.startsWith(prefix));
        const isAuthPath = authPaths.some(path => currentPath.startsWith(path));

        if (isProtected && !isAuthPath) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  linkSteam: (steamId: string) => api.post('/auth/link-steam', { steamId }),
  unlinkSteam: () => api.post('/auth/unlink-steam'), // placeholder for unlink steam
  unlinkEpic: () => api.post('/auth/unlink-epic'),   // placeholder for unlink epic
};

// Wallet API
export const walletApi = {
  getBalance: () => api.get('/wallet'),
  getTransactions: (page = 1, limit = 10) => api.get('/wallet/transactions', { params: { page, limit } }),
};


// User API
export const userApi = {
  getProfile: () => api.get('/users/profile'),
  getPoints: () => api.get('/users/points'),
  getPointsHistory: (page = 1) => api.get(`/users/points/history?page=${page}`),
  claimPoints: () => api.post('/users/points/claim'),

  // User API Key Management
  getUserProfile: () => api.get('/user/profile'),
  generateApiKey: () => api.post('/user/generate-key'),
  resetIp: () => api.post('/user/reset-ip'),
  deleteApiKey: () => api.delete('/user/api-key'),
};

// Product API
export const productApi = {
  getAll: (params?: Record<string, any>) => api.get('/products', { params }),
  getFeatured: () => api.get('/products/featured'),
  getCategories: () => api.get('/products/categories'),
  getById: (id: number) => api.get(`/products/${id}`),
};

// Order API
export const orderApi = {
  create: (data: { productId: number; serverId: number; quantity?: number }) =>
    api.post('/orders', data),
  getAll: (page = 1, status?: string) =>
    api.get('/orders', { params: { page, status } }),
  getById: (id: string) => api.get(`/orders/${id}`),
};

// ===========================================================================
// Admin list pagination (contract: ?page&pageSize&search + endpoint filters)
// Response: { <itemsKey>: [...], pagination: { page, pageSize, total, totalPages } }
// Every *Page method returns a normalized PageResult and works against BOTH
// the paginated backend and an older backend that returns the whole list
// (the list is then filtered/sliced locally), so pages never break during a
// rolling deploy. See frontend/ADMIN_UI.md.
// ===========================================================================

export type { PageRequest, PageResult } from '@/components/admin/paginationMath';

/** Request accepted by every *Page method. A PageRequest from usePaginatedQuery fits as-is. */
export interface AdminListRequest<F extends string = string> {
  page: number;
  pageSize: number;
  search?: string;
  /** '' / undefined = no filter. */
  filters?: Partial<Record<F, string>>;
}

function toPageRequest(req: AdminListRequest): PageRequest {
  const filters: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.filters ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') filters[name] = value.trim();
  }
  return {
    page: parsePage(req.page),
    pageSize: normalizePageSize(req.pageSize),
    search: normalizeSearch(req.search ?? ''),
    filters,
  };
}

export interface FetchPageOptions<T> {
  signal?: AbortSignal;
  /** Also send `limit` (endpoints that historically used page/limit). */
  legacyLimit?: boolean;
  /** Local search/filter applied ONLY when the server returned an unpaginated list. */
  clientFilter?: (item: T, request: PageRequest) => boolean;
  /** Per-row mapping (e.g. strip secrets, coerce numbers). */
  mapItem?: (raw: any) => T;
  /**
   * Rewrites the request into outgoing query params only (e.g. search -> an
   * exact-match filter). The returned PageResult keeps the caller's request so
   * usePaginatedQuery can still match it and adopt the server-clamped page.
   */
  mapOutgoing?: (request: PageRequest) => PageRequest;
}

export async function fetchAdminPage<T>(
  url: string,
  itemsKey: string,
  req: AdminListRequest,
  options: FetchPageOptions<T> = {},
): Promise<{ result: PageResult<T>; body: Record<string, unknown>; request: PageRequest }> {
  const request = toPageRequest(req);
  const outgoing = options.mapOutgoing ? options.mapOutgoing(request) : request;
  const params: Record<string, string | number> = { page: outgoing.page, pageSize: outgoing.pageSize };
  if (options.legacyLimit) params.limit = outgoing.pageSize;
  if (outgoing.search) params.search = outgoing.search;
  Object.assign(params, outgoing.filters);

  const { data } = await api.get(url, { params, signal: options.signal });
  const body: Record<string, unknown> = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const rawItems: unknown[] = Array.isArray(body[itemsKey])
    ? (body[itemsKey] as unknown[])
    : Array.isArray(data)
      ? data
      : [];
  const items = options.mapItem ? rawItems.map(options.mapItem) : (rawItems as T[]);
  const result = normalizePageResponse<T>(items, body.pagination as RawPagination | undefined, request, options.clientFilter);
  return { result, body, request };
}

const includesText = (value: unknown, needle: string) =>
  typeof value === 'string' && value.toLowerCase().includes(needle.toLowerCase());

// --- Servers ---------------------------------------------------------------

export type GameMode = 'PVE' | 'PVE_MOD' | 'PVPVE';
export type GameModeFilter = GameMode | 'NONE';
export type ServerStatusFilter = 'active' | 'inactive' | 'online' | 'offline';
export type AdminServerFilter = 'gameMode' | 'clusterId' | 'status';
export const GAME_MODE_FILTERS: readonly GameModeFilter[] = ['PVE', 'PVE_MOD', 'PVPVE', 'NONE'];
export const SERVER_STATUS_FILTERS: readonly ServerStatusFilter[] = ['active', 'inactive', 'online', 'offline'];

/** One row of GET /admin/servers. The full plugin apiKey is never present in list rows. */
export interface AdminServerRow {
  id: number;
  name: string;
  map: string | null;
  displayName: string | null;
  gameMode: GameMode | null;
  clusterId: string | null;
  cluster: { id: string; key: string; name: string } | null;
  directoryKey?: string | null;
  connectHost: string | null;
  connectPort: number | null;
  rates: string | null;
  isModded: boolean;
  isListed: boolean;
  isAvailable: boolean;
  sortOrder: number;
  imageUrl?: string | null;
  webhookUrl?: string | null;
  isActive: boolean;
  drainMode: boolean;
  lastHeartbeat: string | null;
  playerCount: number;
  pluginVersion: string | null;
  pluginBuildHash?: string | null;
  arkApiVersion?: string | null;
  protocolVersion?: number;
  capabilities?: string[];
  chatTag: string | null;
  chatColor: string | null;
  chatIcon: string | null;
  /** Derived server-side: heartbeat within the online window. */
  online: boolean;
  /** Derived: isActive && !drainMode && an active credential. */
  deliverable: boolean;
  activeCredentialCount: number;
  /** Last 4 chars of the legacy plugin apiKey (null when none). */
  apiKeyLast4: string | null;
}

export interface ServerModeCounts {
  all: number;
  PVE: number;
  PVE_MOD: number;
  PVPVE: number;
  NONE: number;
}

export type AdminServersPage = PageResult<AdminServerRow> & {
  /** Rows per game mode under the current search/cluster/status filters (ignores the gameMode filter). */
  counts: ServerModeCounts | null;
};

function toServerRow(raw: any): AdminServerRow {
  // Strip the legacy full apiKey if an older backend still sends it: list rows never hold it.
  const { apiKey, ...rest } = raw ?? {};
  const last4 =
    typeof rest.apiKeyLast4 === 'string'
      ? rest.apiKeyLast4
      : typeof apiKey === 'string' && apiKey
        ? apiKey.slice(-4)
        : null;
  return {
    ...rest,
    gameMode: rest.gameMode ?? null,
    cluster: rest.cluster ?? null,
    online: Boolean(rest.online),
    deliverable: Boolean(rest.deliverable),
    activeCredentialCount: Number(rest.activeCredentialCount ?? 0),
    apiKeyLast4: last4,
  } as AdminServerRow;
}

function serverMatches(server: AdminServerRow, request: PageRequest, ignoreGameMode = false): boolean {
  const { search, filters } = request;
  if (search && ![server.name, server.map, server.displayName, server.connectHost].some((v) => includesText(v, search))) {
    return false;
  }
  if (!ignoreGameMode && filters.gameMode) {
    if (filters.gameMode === 'NONE' ? server.gameMode : server.gameMode !== filters.gameMode) return false;
  }
  if (filters.clusterId) {
    if (filters.clusterId.toLowerCase() === 'none' ? server.clusterId : server.clusterId !== filters.clusterId) return false;
  }
  switch (filters.status) {
    case 'active':
      return server.isActive;
    case 'inactive':
      return !server.isActive;
    case 'online':
      return server.online;
    case 'offline':
      return !server.online;
    default:
      return true;
  }
}

function countModes(servers: AdminServerRow[]): ServerModeCounts {
  const counts: ServerModeCounts = { all: 0, PVE: 0, PVE_MOD: 0, PVPVE: 0, NONE: 0 };
  for (const s of servers) {
    counts.all += 1;
    if (s.gameMode === 'PVE' || s.gameMode === 'PVE_MOD' || s.gameMode === 'PVPVE') counts[s.gameMode] += 1;
    else counts.NONE += 1;
  }
  return counts;
}

function toServerCounts(raw: unknown): ServerModeCounts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { all: n(r.all), PVE: n(r.PVE), PVE_MOD: n(r.PVE_MOD), PVPVE: n(r.PVPVE), NONE: n(r.NONE) };
}

// --- Products --------------------------------------------------------------

export type ProductType = 'item' | 'dino' | 'engram' | 'kit' | 'bundle' | 'command' | 'entitlement';
export const PRODUCT_TYPES: readonly ProductType[] = ['item', 'dino', 'engram', 'kit', 'bundle', 'command', 'entitlement'];
export type AdminProductFilter = 'categoryId' | 'productType' | 'isActive';

export interface AdminProductRow {
  id: number;
  categoryId: number | null;
  category: { id: number; name: string; icon?: string | null; sortOrder?: number; isActive?: boolean } | null;
  name: string;
  description: string | null;
  price: number;
  productType: ProductType;
  externalKey: string | null;
  deliveryPayload?: unknown;
  requiredCapabilities?: string[];
  itemBlueprint: string | null;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  imageUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  maxPerUser: number | null;
  stock: number | null;
  createdAt: string;
  updatedAt: string;
}

function productMatches(p: AdminProductRow, request: PageRequest): boolean {
  const { search, filters } = request;
  if (search && !includesText(p.name, search) && !includesText(p.externalKey, search)) return false;
  if (filters.categoryId) {
    if (filters.categoryId === 'none' ? p.categoryId !== null : String(p.categoryId) !== filters.categoryId) return false;
  }
  if (filters.productType && p.productType !== filters.productType) return false;
  if (filters.isActive === 'true' && !p.isActive) return false;
  if (filters.isActive === 'false' && p.isActive) return false;
  return true;
}

// --- Users / API keys ------------------------------------------------------

export interface AdminUserRow {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  epicId: string | null;
  pointsBalance: number;
  totalSpent: number;
  isAdmin: boolean;
  isBanned: boolean;
  role: string;
  apiKeyServerId?: number | null;
  apiKeyServerName?: string | null;
  createdAt: string;
}

export interface AdminApiKeyRow {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  /** Masked by the server ("abcd...wxyz"). */
  apiKey: string | null;
  apiKeyIp: string | null;
  apiKeyCreatedAt: string | null;
  apiKeyServerId: number | null;
  apiKeyServerName: string | null;
  apiKeyServerMap: string | null;
  apiKeyServerPort: number | null;
  apiKeyLastUsed: string | null;
  isBanned: boolean;
}

// --- Categories / chat ranks ----------------------------------------------

export interface AdminCategoryRow {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}

export interface AdminChatRankRow {
  id: number;
  name: string;
  groupKey: string;
  color: string;
  icon: string | null;
  priority: number;
  serverId: number | null;
  server?: { id: number; name: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Protection / content (row shapes owned by those pages; typed loosely on purpose) ---

export type AdminProtectionRow = Record<string, any> & { id: number | string };
export type AdminProtectionLogRow = Record<string, any> & { id: number | string };
export type AdminContentPageRow = Record<string, any> & { id: number; slug: string; title: string };

// Admin API
export const adminApi = {
  // Dashboard
  getStats: () => api.get('/admin/stats'),

  // Users
  getUsers: (page = 1, search?: string) =>
    api.get('/admin/users', { params: { page, search } }),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  updateUser: (id: string, data: { isBanned?: boolean; isAdmin?: boolean }) =>
    api.put(`/admin/users/${id}`, data),
  updateUserRole: (id: string, role: string) =>
    api.put(`/admin/users/${id}/role`, { role }),
  adjustPoints: (id: string, amount: number, reason?: string) =>
    api.post(`/admin/users/${id}/points`, { amount, reason }),

  // Products
  getProducts: () => api.get('/admin/products'),
  createProduct: (data: any) => api.post('/admin/products', data),
  updateProduct: (id: number, data: any) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: number) => api.delete(`/admin/products/${id}`),

  // Categories
  createCategory: (data: any) => api.post('/admin/categories', data),
  updateCategory: (id: number, data: any) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: number) => api.delete(`/admin/categories/${id}`),

  // Orders
  getAllOrders: (page = 1, status?: string) =>
    api.get('/admin/orders', { params: { page, status } }),
  refundOrder: (id: string) => api.post(`/admin/orders/${id}/refund`),

  // Servers
  getServers: () => api.get('/admin/servers'),
  createServer: (data: { name: string; map?: string; webhookUrl?: string }) =>
    api.post('/admin/servers', data),
  updateServer: (id: number, data: any) => api.put(`/admin/servers/${id}`, data),
  deleteServer: (id: number) => api.delete(`/admin/servers/${id}`),
  regenerateServerKey: (id: number) => api.post(`/admin/servers/${id}/regenerate-key`),

  // Chat Ranks
  getChatRanks: (params?: { serverId?: number }) =>
    api.get('/admin/chat-ranks', { params }),
  createChatRank: (data: any) => api.post('/admin/chat-ranks', data),
  updateChatRank: (id: number, data: any) => api.put(`/admin/chat-ranks/${id}`, data),
  deleteChatRank: (id: number) => api.delete(`/admin/chat-ranks/${id}`),

  // Audit Logs
  getAuditLogs: (params?: { userId?: string; action?: string; resource?: string; page?: number }) =>
    api.get('/audit/logs', { params }),
  getSecurityEvents: (params?: { eventType?: string; severity?: string; page?: number }) =>
    api.get('/audit/security', { params }),
  getSecurityStats: () => api.get('/audit/security/stats'),

  // Data Requests (PDPA)
  getDataRequests: (params?: { status?: string; page?: number }) =>
    api.get('/pdpa/admin/requests', { params }),
  processDataRequest: (id: number, status: string, response?: string) =>
    api.patch(`/pdpa/admin/requests/${id}`, { status, response }),
  createPolicy: (data: { type: string; version: string; content: string; contentTh?: string; effectiveAt: string }) =>
    api.post('/pdpa/admin/policy', data),

  // Plugin Management
  getPluginStatus: () => api.get('/admin/plugin/status'),
  compilePlugin: () => api.post('/admin/plugin/compile'),

  // API Keys Management
  getApiKeys: (page = 1, search?: string) =>
    api.get('/admin/api-keys', { params: { page, search } }),
  getApiKeyByUser: (userId: string) => api.get(`/admin/api-keys/${userId}`),
  resetApiKeyIp: (userId: string) => api.post(`/admin/api-keys/${userId}/reset-ip`),
  revokeApiKey: (userId: string) => api.delete(`/admin/api-keys/${userId}`),
  downloadPlugin: (userId: string, serverId?: number) => {
    const params = serverId ? `?serverId=${serverId}` : '';
    return api.get(`/admin/api-keys/${userId}/download-plugin${params}`, {
      responseType: 'blob',
    });
  },

  // ---- Paginated list methods (admin kit). Signature: (request, signal?) ----
  // Pass straight to usePaginatedQuery: `fetcher: adminApi.getServersPage`.

  /** GET /admin/servers — filters: gameMode (PVE|PVE_MOD|PVPVE|NONE), clusterId (id|'none'), status (active|inactive|online|offline). */
  getServersPage: async (req: AdminListRequest<AdminServerFilter>, signal?: AbortSignal): Promise<AdminServersPage> => {
    const { result, body, request } = await fetchAdminPage<AdminServerRow>('/admin/servers', 'servers', req, {
      signal,
      mapItem: toServerRow,
      clientFilter: (s, r) => serverMatches(s, r),
    });
    let counts = toServerCounts(body.counts);
    if (!counts && !result.serverPaginated) {
      // Older backend: derive per-mode counts from the full list (ignoring the gameMode filter).
      const all = (Array.isArray(body.servers) ? body.servers : []).map(toServerRow);
      counts = countModes(all.filter((s) => serverMatches(s, request, true)));
    }
    return { ...result, counts };
  },

  /** GET /admin/products — filters: categoryId (id|'none'), productType, isActive ('true'|'false'). */
  getProductsPage: async (req: AdminListRequest<AdminProductFilter>, signal?: AbortSignal): Promise<PageResult<AdminProductRow>> =>
    (await fetchAdminPage<AdminProductRow>('/admin/products', 'products', req, { signal, clientFilter: productMatches })).result,

  /** GET /admin/users — search: username / steamId / discordId. Sends pageSize and legacy limit. */
  getUsersPage: async (req: AdminListRequest<never>, signal?: AbortSignal): Promise<PageResult<AdminUserRow>> =>
    (
      await fetchAdminPage<AdminUserRow>('/admin/users', 'users', req, {
        signal,
        legacyLimit: true,
        mapItem: (u: any) => ({ ...u, pointsBalance: Number(u?.pointsBalance ?? 0), totalSpent: Number(u?.totalSpent ?? 0) }),
      })
    ).result,

  /** GET /admin/api-keys — keys arrive masked. search: username / steamId / server name. */
  getApiKeysPage: async (req: AdminListRequest<never>, signal?: AbortSignal): Promise<PageResult<AdminApiKeyRow>> =>
    (await fetchAdminPage<AdminApiKeyRow>('/admin/api-keys', 'apiKeys', req, { signal, legacyLimit: true })).result,

  /** GET /admin/categories — search: name. Rows include _count.products. */
  getCategoriesPage: async (req: AdminListRequest<never>, signal?: AbortSignal): Promise<PageResult<AdminCategoryRow>> =>
    (
      await fetchAdminPage<AdminCategoryRow>('/admin/categories', 'categories', req, {
        signal,
        clientFilter: (c, r) => !r.search || includesText(c.name, r.search),
      })
    ).result,

  /** GET /admin/chat-ranks — filters: serverId (id; '0' = global ranks only). search: name / groupKey. */
  getChatRanksPage: async (req: AdminListRequest<'serverId'>, signal?: AbortSignal): Promise<PageResult<AdminChatRankRow>> =>
    (
      await fetchAdminPage<AdminChatRankRow>('/admin/chat-ranks', 'ranks', req, {
        signal,
        clientFilter: (rank, r) => {
          if (r.search && !includesText(rank.name, r.search) && !includesText(rank.groupKey, r.search)) return false;
          if (r.filters.serverId) {
            const wanted = Number(r.filters.serverId);
            return wanted === 0 ? rank.serverId === null : rank.serverId === wanted;
          }
          return true;
        },
      })
    ).result,
};

// Content Builder API
export const contentApi = {
  // Public
  getBlockTypes: () => api.get('/content/block-types'),
  getPublicPages: () => api.get('/content/pages'),
  getPublicPageBySlug: (slug: string) => api.get(`/content/pages/slug/${slug}`),

  // Admin - Pages
  getPages: (params?: { pageType?: string; search?: string; page?: number }) =>
    api.get('/content/admin/pages', { params }),
  /** Admin kit: GET /content/admin/pages — filters: pageType. search: title / slug. */
  getPagesPage: async (req: AdminListRequest<'pageType'>, signal?: AbortSignal): Promise<PageResult<AdminContentPageRow>> =>
    (await fetchAdminPage<AdminContentPageRow>('/content/admin/pages', 'pages', req, { signal, legacyLimit: true })).result,
  getPageById: (id: number) => api.get(`/content/admin/pages/${id}`),
  createPage: (data: {
    slug: string;
    title: string;
    description?: string;
    pageType?: string;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    layout?: string;
    settings?: any;
  }) => api.post('/content/admin/pages', data),
  updatePage: (id: number, data: any) => api.put(`/content/admin/pages/${id}`, data),
  deletePage: (id: number) => api.delete(`/content/admin/pages/${id}`),
  duplicatePage: (id: number, data?: { newSlug?: string; newTitle?: string }) =>
    api.post(`/content/admin/pages/${id}/duplicate`, data),

  // Admin - Blocks
  getBlocks: (pageId: number) => api.get(`/content/admin/pages/${pageId}/blocks`),
  createBlock: (pageId: number, data: {
    blockType: string;
    content: any;
    settings?: any;
    sortOrder?: number;
    isVisible?: boolean;
  }) => api.post(`/content/admin/pages/${pageId}/blocks`, data),
  updateBlock: (blockId: number, data: any) => api.put(`/content/admin/blocks/${blockId}`, data),
  deleteBlock: (blockId: number) => api.delete(`/content/admin/blocks/${blockId}`),
  reorderBlocks: (pageId: number, blockOrders: { id: number; sortOrder: number }[]) =>
    api.post(`/content/admin/pages/${pageId}/blocks/reorder`, { blockOrders }),

  // Admin - Media
  getMediaFiles: (params?: { folder?: string; mimeType?: string; search?: string; page?: number }) =>
    api.get('/content/admin/media', { params }),
  getFolders: () => api.get('/content/admin/media/folders'),
  uploadMedia: (file: File, data?: { alt?: string; caption?: string; folder?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (data?.alt) formData.append('alt', data.alt);
    if (data?.caption) formData.append('caption', data.caption);
    if (data?.folder) formData.append('folder', data.folder);
    return api.post('/content/admin/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateMedia: (id: number, data: { alt?: string; caption?: string; folder?: string }) =>
    api.put(`/content/admin/media/${id}`, data),
  deleteMedia: (id: number) => api.delete(`/content/admin/media/${id}`),
};

// Protection API
export const protectionApi = {
  // User - Get my protection status
  getMyProtection: () => api.get('/protection/me'),
};

// Admin Protection API
export const protectionAdminApi = {
  // Get all protections
  getProtections: (params?: { type?: string; isActive?: string; page?: number; limit?: number }) =>
    api.get('/admin/protection', { params }),
  /** Admin kit: GET /admin/protection — filters: type, isActive ('true'|'false'). */
  getProtectionsPage: async (
    req: AdminListRequest<'type' | 'isActive'>,
    signal?: AbortSignal,
  ): Promise<PageResult<AdminProtectionRow>> =>
    (await fetchAdminPage<AdminProtectionRow>('/admin/protection', 'protections', req, { signal, legacyLimit: true })).result,

  // Grant protection
  grantProtection: (data: {
    steamId: string;
    protectionDays: number;
    reason?: string;
    protectTribe?: boolean;
    tribeId?: string;
    tribeName?: string;
    serverId?: number;
  }) => api.post('/admin/protection/grant', data),

  // Revoke protection
  revokeProtection: (steamId: string, data?: { reason?: string; revokeTribe?: boolean }) =>
    api.delete(`/admin/protection/${steamId}`, { data }),

  // Get protection logs
  getLogs: (params?: { eventType?: string; steamId?: string; serverId?: number; page?: number; limit?: number }) =>
    api.get('/admin/protection/logs', { params }),
  /**
   * Admin kit: GET /admin/protection/logs — filters: eventType, steamId, serverId.
   * The endpoint has no free-text search, so `search` is sent as the exact
   * steamId filter (an explicit steamId filter wins). The result keeps the
   * caller's request unchanged.
   */
  getLogsPage: async (
    req: AdminListRequest<'eventType' | 'steamId' | 'serverId'>,
    signal?: AbortSignal,
  ): Promise<PageResult<AdminProtectionLogRow>> =>
    (
      await fetchAdminPage<AdminProtectionLogRow>('/admin/protection/logs', 'logs', req, {
        signal,
        legacyLimit: true,
        mapOutgoing: (r) => {
          const steamId = r.filters.steamId || r.search;
          return { ...r, search: '', filters: steamId ? { ...r.filters, steamId } : r.filters };
        },
      })
    ).result,

  // Get protection stats
  getStats: () => api.get('/admin/protection/stats'),
};

// Dino Marketplace API
export const dinoMarketApi = {
  // Public
  getListings: (params?: {
    species?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    minLevel?: number;
    maxLevel?: number;
    gender?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => api.get('/market/listings', { params }),
  getListingById: (id: string) => api.get(`/market/listings/${id}`),
  getSpeciesList: () => api.get('/market/species'),
  getStats: () => api.get('/market/stats'),
  getDeliveryServers: () => api.get('/servers'),

  // Authenticated
  getMyListings: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/market/my/listings', { params }),
  getMyPurchases: (params?: { page?: number; limit?: number }) =>
    api.get('/market/my/purchases', { params }),
  cancelListing: (id: string) => api.post(`/market/listings/${id}/cancel`),
  publishListing: (id: string, input: { price: number; description?: string }) => api.post(`/market/listings/${encodeURIComponent(id)}/publish`, input),
  publishBatch: (items: { id: string; price: number; description?: string }[]) => api.post('/market/my/publish', { items }),
  buyDino: (id: string, serverId: number) => api.post(`/market/listings/${id}/buy`, { serverId }),
};

// PDPA API
export const pdpaApi = {
  // Policy
  getPolicy: (type: string) => api.get(`/pdpa/policy/${type}`),

  // Consents
  getConsents: () => api.get('/pdpa/consents'),
  grantConsent: (consentType: string, version: string) =>
    api.post('/pdpa/consents/grant', { consentType, version }),
  revokeConsent: (consentType: string) =>
    api.post('/pdpa/consents/revoke', { consentType }),

  // Data Requests
  getMyRequests: () => api.get('/pdpa/requests'),
  createRequest: (requestType: string, description?: string) =>
    api.post('/pdpa/requests', { requestType, description }),

  // Export/Delete
  exportData: () => api.get('/pdpa/export'),
  deleteData: (confirmation: string) =>
    api.post('/pdpa/delete', { confirmation }),
};

// Payment API
export const paymentApi = {
  getPackages: () => api.get('/payments/packages').then((r) => r.data),
  createIntent: (payload: { packageId: string; provider: string; autoCredit?: boolean }, idempotencyKey?: string) => {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    return api
      .post('/payments/intents', payload, {
        headers: { 'Idempotency-Key': key },
      })
      .then((r) => r.data);
  },
  submitSlip: (payload: any) => api.post('/payments/slips', payload).then((r) => r.data),
  verifyStripeSession: (sessionId: string) => api.post('/payments/verify-session', { sessionId }).then((r) => r.data),
};

export default api;
