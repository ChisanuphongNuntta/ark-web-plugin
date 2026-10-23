/**
 * Admin console API (orders, deliveries, audit log, P2P market, site settings,
 * plugin keys). Contracts:
 *   backend/contracts/ui-redesign-2026-10.md  (deliveries, audit-logs, market/listings, site settings, orders/refund)
 *   backend/contracts/vip-2026-10.md          (plugin keys + VIP; see vipApi.ts for VIP)
 *
 * Every list method has the admin-kit signature `(request, signal) => Promise<PageResult<Row>>`
 * so it can be passed straight to usePaginatedQuery. Rows are parsed defensively:
 * an unexpected payload degrades to '—' instead of crashing a page.
 */
import { api, type AdminListRequest } from '@/lib/api';
import {
  normalizePageResponse,
  normalizePageSize,
  normalizeSearch,
  parsePage,
  type PageRequest,
  type PageResult,
  type RawPagination,
} from '@/components/admin/paginationMath';
import { toVipBadge, type VipBadge } from '@/lib/vip';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
export const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
/** Integer IC / money as a string without arithmetic (numbers, bigint-ish strings). */
const amount = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  return null;
};

/** Thai error text from an axios error (`{ error }` / `{ message }` envelope). */
export function apiErrorText(error: unknown, fallback: string): string {
  const e = error as { response?: { status?: number; data?: { error?: unknown; message?: unknown } }; message?: unknown } | null;
  const fromApi = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof fromApi === 'string' && fromApi) return fromApi;
  if (e?.response?.status === 403) return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
  if (e?.response?.status === 404) return 'ไม่พบข้อมูล หรือระบบหลังบ้านยังไม่รองรับ';
  return fallback;
}

export function httpStatus(error: unknown): number | null {
  const st = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof st === 'number' ? st : null;
}

function toPageRequest(req: AdminListRequest): PageRequest {
  const filters: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.filters ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') filters[name] = value.trim();
  }
  return { page: parsePage(req.page), pageSize: normalizePageSize(req.pageSize), search: normalizeSearch(req.search ?? ''), filters };
}

export interface EnvelopeOptions<T> {
  signal?: AbortSignal;
  /** Keys tried in order for the rows array (default: items). */
  itemsKeys?: string[];
  mapItem: (raw: unknown) => T | null;
  /** Rewrite outgoing params only (e.g. search -> an exact filter). */
  mapOutgoing?: (request: PageRequest) => PageRequest;
  /** Also send `limit` (endpoints that historically used page/limit). */
  legacyLimit?: boolean;
  /**
   * Row check for filters an older backend may silently ignore: returns the names of
   * the requested filters this row violates. Collected into `ignoredFilters`.
   */
  verify?: (row: T, filters: Record<string, string>) => string[];
}

export type EnvelopePage<T> = PageResult<T> & {
  body: Raw;
  /** Requested filters the server evidently did not apply (rows that do not match came back). */
  ignoredFilters: string[];
};

/**
 * Fetch one page from an endpoint answering either
 *   `{ items, total, page, pageSize }`   (ui-redesign contract), or
 *   `{ <key>: [...], pagination: {...} }` (admin pagination contract).
 */
export async function fetchEnvelopePage<T>(
  url: string,
  req: AdminListRequest,
  options: EnvelopeOptions<T>,
): Promise<EnvelopePage<T>> {
  const request = toPageRequest(req);
  const outgoing = options.mapOutgoing ? options.mapOutgoing(request) : request;
  const params: Record<string, string | number> = { page: outgoing.page, pageSize: outgoing.pageSize };
  if (options.legacyLimit) params.limit = outgoing.pageSize;
  if (outgoing.search) params.search = outgoing.search;
  Object.assign(params, outgoing.filters);

  const { data } = await api.get(url, { params, signal: options.signal, timeout: 15_000 });
  const body: Raw = isObj(data) ? data : {};
  const keys = options.itemsKeys ?? ['items'];
  let rawItems: unknown[] = [];
  for (const key of [...keys, 'items']) {
    if (Array.isArray(body[key])) {
      rawItems = body[key] as unknown[];
      break;
    }
  }
  if (!rawItems.length && Array.isArray(data)) rawItems = data;
  const items = rawItems.map(options.mapItem).filter((x): x is T => x !== null);

  let rawPagination: RawPagination | undefined = isObj(body.pagination) ? (body.pagination as RawPagination) : undefined;
  if (!rawPagination && n(body.total) !== null) {
    rawPagination = { page: body.page, pageSize: body.pageSize ?? body.limit, total: body.total };
  }
  const ignored = new Set<string>();
  if (options.verify) {
    for (const row of items) for (const name of options.verify(row, outgoing.filters)) ignored.add(name);
  }
  return { ...normalizePageResponse<T>(items, rawPagination, request), body, ignoredFilters: [...ignored] };
}

/** verify helper: filter name -> row value getter; a row whose value differs from the filter violates it. */
export function verifyFields<T>(getters: Record<string, (row: T) => unknown>) {
  return (row: T, filters: Record<string, string>): string[] =>
    Object.entries(getters)
      .filter(([name, get]) => filters[name] !== undefined && String(get(row) ?? '') !== filters[name])
      .map(([name]) => name);
}

/* ================================================================== */
/* Orders                                                              */
/* ================================================================== */

export const ORDER_STATUS_FILTERS = [
  'pending_payment',
  'paid',
  'queued',
  'delivering',
  'delivered',
  'failed',
  'refunded',
  'cancelled',
  'pending',
] as const;

export interface PersonRow {
  id: string | null;
  name: string | null;
  steamId: string | null;
  vip: VipBadge | null;
}

export interface AdminOrderRow {
  id: string;
  status: string;
  /** IC, integer string. */
  totalPrice: string | null;
  quantity: number | null;
  productId: number | null;
  productName: string | null;
  serverId: number | null;
  serverName: string | null;
  user: PersonRow | null;
  createdAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  refundedAt: string | null;
  lastError: string | null;
  deliveryAttempts: number | null;
}

function toPerson(raw: unknown, fallbackId?: unknown): PersonRow | null {
  if (!isObj(raw)) {
    const id = s(fallbackId);
    return id ? { id, name: null, steamId: null, vip: null } : null;
  }
  return {
    id: s(raw.id) ?? s(fallbackId),
    name: s(raw.discordUsername) ?? s(raw.name) ?? s(raw.username),
    steamId: s(raw.steamId),
    vip: toVipBadge(raw.vip),
  };
}

export function toOrderRow(raw: unknown): AdminOrderRow | null {
  if (!isObj(raw)) return null;
  const id = s(raw.id);
  if (!id) return null;
  const product = isObj(raw.product) ? raw.product : null;
  const server = isObj(raw.server) ? raw.server : null;
  const fulfillment = isObj(raw.fulfillment) ? raw.fulfillment : null;
  return {
    id,
    status: s(raw.status) ?? 'pending',
    totalPrice: amount(raw.totalPrice),
    quantity: n(raw.quantity),
    productId: n(raw.productId),
    productName: s(product?.name) ?? s(raw.productName),
    serverId: n(raw.serverId),
    serverName: s(server?.displayName) ?? s(server?.name) ?? s(raw.serverName),
    user: toPerson(raw.user, raw.userId),
    createdAt: s(raw.createdAt),
    paidAt: s(raw.paidAt),
    deliveredAt: s(raw.deliveredAt),
    refundedAt: s(raw.refundedAt),
    lastError: s(raw.lastError) ?? s(fulfillment?.lastError),
    deliveryAttempts: n(raw.deliveryAttempts) ?? n(fulfillment?.attempts),
  };
}

export interface TimelinePoint {
  status: string;
  at: string;
}

export interface AdminOrderDetail {
  order: AdminOrderRow;
  delivery: { status: string | null; attempts: number | null; lastError: string | null; receiptId: string | null } | null;
  timeline: TimelinePoint[];
  deliveries: AdminDeliveryRow[];
  /** Which endpoint answered (the admin one may not exist on an older backend). */
  source: 'admin' | 'customer';
}

function toTimeline(raw: unknown): TimelinePoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => (isObj(e) && s(e.status) && s(e.at) ? { status: s(e.status)!, at: s(e.at)! } : null))
    .filter((e): e is TimelinePoint => e !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Same steps as the customer timeline (order.controller buildDeliveryTimeline), from raw order fields. */
function timelineFromOrder(raw: Raw): TimelinePoint[] {
  const f = isObj(raw.fulfillment) ? raw.fulfillment : {};
  const points: [string, unknown][] = [
    ['created', raw.createdAt],
    ['paid', raw.paidAt],
    ['queued', raw.queuedAt ?? f.queuedAt],
    ['delivering', f.claimedAt],
    ['delivered', raw.deliveredAt ?? f.deliveredAt],
    ['failed', f.failedAt],
    ['refunded', raw.refundedAt],
  ];
  return toTimeline(points.filter(([, at]) => s(at)).map(([status, at]) => ({ status, at })));
}

function toOrderDetail(data: unknown, source: AdminOrderDetail['source']): AdminOrderDetail | null {
  const body = isObj(data) ? data : {};
  const rawOrder = isObj(body.order) ? body.order : body;
  const order = toOrderRow(rawOrder);
  if (!order) return null;
  const d = isObj(body.delivery) ? body.delivery : isObj(rawOrder.fulfillment) ? rawOrder.fulfillment : null;
  const jobs = body.deliveries ?? body.deliveryJobs ?? body.jobs;
  const timeline = toTimeline(body.timeline);
  return {
    order,
    delivery: d ? { status: s(d.status), attempts: n(d.attempts), lastError: s(d.lastError), receiptId: s(d.receiptId) } : null,
    timeline: timeline.length ? timeline : timelineFromOrder(rawOrder),
    deliveries: Array.isArray(jobs) ? jobs.map(toDeliveryRow).filter((x): x is AdminDeliveryRow => x !== null) : [],
    source,
  };
}

export interface RefundOrderPayload {
  reason: string;
  /** Required (true) for delivered orders: staff confirmed the items were taken back in game. */
  inventoryReclaimed?: boolean;
  /** Required for delivered orders (>= 8 chars): what was reclaimed / evidence reference. */
  reclaimReceipt?: string;
}

/* ================================================================== */
/* Deliveries                                                          */
/* ================================================================== */

export const DELIVERY_STATUS_FILTERS = ['pending', 'leased', 'completed', 'failed', 'dead_letter'] as const;
export const DELIVERY_TYPE_FILTERS = [
  'order',
  'dino_catalog',
  'dino_marketplace',
  'permission_grant',
  'permission_revoke',
] as const;

export interface AdminDeliveryRow {
  id: string;
  status: string;
  deliveryType: string;
  referenceId: string | null;
  orderId: string | null;
  serverId: number | null;
  serverName: string | null;
  steamId: string | null;
  attempts: number | null;
  maxAttempts: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toDeliveryRow(raw: unknown): AdminDeliveryRow | null {
  if (!isObj(raw)) return null;
  const id = s(raw.id);
  if (!id) return null;
  const server = isObj(raw.server) ? raw.server : null;
  return {
    id,
    status: s(raw.status) ?? 'pending',
    deliveryType: s(raw.deliveryType) ?? 'order',
    referenceId: s(raw.referenceId),
    orderId: s(raw.orderId),
    serverId: n(raw.serverId),
    serverName: s(raw.serverName) ?? s(server?.name),
    steamId: s(raw.steamId) ?? s(raw.playerSteamId),
    attempts: n(raw.attempts),
    maxAttempts: n(raw.maxAttempts),
    lastError: s(raw.lastError) ?? s(raw.error),
    nextRetryAt: s(raw.nextRetryAt),
    createdAt: s(raw.createdAt),
    updatedAt: s(raw.updatedAt),
  };
}

export interface RetryDeliveryResult {
  retried: boolean;
  alreadyQueued: boolean;
  item: AdminDeliveryRow | null;
}

/* ================================================================== */
/* Audit log                                                           */
/* ================================================================== */

export interface AdminAuditRow {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  actorId: string | null;
  actorName: string | null;
  ipAddress: string | null;
  status: string | null;
  errorMessage: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: string | null;
}

/** JSON-encoded string columns -> value (left as the string when it is not JSON). */
function parseJsonish(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  const t = v.trim();
  if (!t) return null;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      return v;
    }
  }
  return v;
}

export function toAuditRow(raw: unknown): AdminAuditRow | null {
  if (!isObj(raw)) return null;
  const id = raw.id === undefined || raw.id === null ? null : String(raw.id);
  if (!id) return null;
  const actor = isObj(raw.actor) ? raw.actor : isObj(raw.user) ? raw.user : null;
  return {
    id,
    action: s(raw.action) ?? '—',
    resource: s(raw.resource),
    resourceId: s(raw.resourceId) ?? (typeof raw.resourceId === 'number' ? String(raw.resourceId) : null),
    actorId: s(raw.actorId) ?? s(raw.userId) ?? s(actor?.id),
    actorName: s(actor?.discordUsername) ?? s(actor?.name) ?? s(raw.actorName) ?? s(raw.actorEmail),
    ipAddress: s(raw.ipAddress),
    status: s(raw.status),
    errorMessage: s(raw.errorMessage),
    oldValue: parseJsonish(raw.oldValue),
    newValue: parseJsonish(raw.newValue),
    metadata: parseJsonish(raw.metadata),
    createdAt: s(raw.createdAt),
  };
}

/** Known audit actions (labels for the filter; any other action still shows raw). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  order_refund: 'คืนเหรียญคำสั่งซื้อ',
  delivery_retry: 'ส่งของใหม่',
  payment_slip_approve: 'อนุมัติสลิป',
  payment_slip_reject: 'ปฏิเสธสลิป',
  site_settings_update: 'แก้ไขการตั้งค่าเว็บ',
  server_create: 'เพิ่มเซิร์ฟเวอร์',
  server_update: 'แก้ไขเซิร์ฟเวอร์',
  cluster_create: 'เพิ่มคลัสเตอร์',
  cluster_update: 'แก้ไขคลัสเตอร์',
  admin_points_adjust: 'ปรับยอดเหรียญ',
  ledger_reconcile_degraded: 'ตรวจยอดบัญชี (ไม่มีล็อก)',
  plugin_key_issue: 'ออกคีย์ปลั๊กอิน',
  plugin_key_rotate: 'หมุนคีย์ปลั๊กอิน',
  plugin_key_revoke: 'เพิกถอนคีย์ปลั๊กอิน',
  vip_package_create: 'สร้างแพ็กเกจ VIP',
  vip_package_update: 'แก้ไขแพ็กเกจ VIP',
  vip_purchase_grant: 'ซื้อ VIP (ชำระเงินสำเร็จ)',
  vip_admin_grant: 'มอบ VIP',
  vip_admin_extend: 'ต่ออายุ VIP',
  vip_admin_revoke: 'เพิกถอน VIP',
  vip_expire: 'VIP หมดอายุ',
  vip_resync: 'ซิงก์ VIP กับ Permissions',
  vip_steam_link_changed: 'เปลี่ยน Steam ของสมาชิก VIP',
};

export const AUDIT_RESOURCE_LABEL: Record<string, string> = {
  order: 'คำสั่งซื้อ',
  delivery_job: 'งานส่งของ',
  payment_intent: 'การชำระเงิน',
  site_settings: 'การตั้งค่าเว็บ',
  server: 'เซิร์ฟเวอร์',
  cluster: 'คลัสเตอร์',
  user: 'ผู้ใช้',
  server_credential: 'คีย์ปลั๊กอิน',
  vip_package: 'แพ็กเกจ VIP',
  vip_membership: 'สมาชิก VIP',
};

/* ================================================================== */
/* P2P market (read-only)                                              */
/* ================================================================== */

export const LISTING_STATUS_FILTERS = ['listed', 'sold', 'cancelled', 'expired'] as const;

export interface AdminListingRow {
  id: string;
  species: string | null;
  dinoName: string | null;
  level: number | null;
  gender: string | null;
  price: string | null;
  status: string;
  deliveryStatus: string | null;
  originServerId: number | null;
  deliveryServerId: number | null;
  seller: PersonRow | null;
  buyer: PersonRow | null;
  createdAt: string | null;
  soldAt: string | null;
  expiresAt: string | null;
  deliveredAt: string | null;
}

export function toListingRow(raw: unknown): AdminListingRow | null {
  if (!isObj(raw)) return null;
  const id = s(raw.id);
  if (!id) return null;
  return {
    id,
    species: s(raw.species),
    dinoName: s(raw.dinoName),
    level: n(raw.level),
    gender: s(raw.gender),
    price: amount(raw.price),
    status: s(raw.status) ?? 'listed',
    deliveryStatus: s(raw.deliveryStatus),
    originServerId: n(raw.originServerId),
    deliveryServerId: n(raw.deliveryServerId),
    seller: toPerson(raw.seller, raw.sellerId),
    buyer: toPerson(raw.buyer, raw.buyerId),
    createdAt: s(raw.createdAt),
    soldAt: s(raw.soldAt),
    expiresAt: s(raw.expiresAt),
    deliveredAt: s(raw.deliveredAt),
  };
}

/* ================================================================== */
/* Site settings                                                       */
/* ================================================================== */

export const SEASON_SETTINGS = ['auto', 'default', 'winter', 'christmas', 'easter'] as const;
export type SeasonSetting = (typeof SEASON_SETTINGS)[number];

export interface SiteSettings {
  season: SeasonSetting;
  activeSeason: string;
  announcement: { text: string; href: string | null } | null;
}

function toSiteSettings(raw: unknown): SiteSettings {
  const body = isObj(raw) ? (isObj(raw.settings) ? raw.settings : raw) : {};
  const season = (SEASON_SETTINGS as readonly string[]).includes(String(body.season)) ? (body.season as SeasonSetting) : 'auto';
  const a = isObj(body.announcement) ? body.announcement : null;
  return {
    season,
    activeSeason: s(body.activeSeason) ?? 'default',
    announcement: a && s(a.text) ? { text: s(a.text)!, href: s(a.href) } : null,
  };
}

/* ================================================================== */
/* Plugin keys (ServerCredential) — root only                         */
/* ================================================================== */

export const CREDENTIAL_STATUS_FILTERS = ['active', 'revoked'] as const;

export interface AdminCredentialRow {
  id: string;
  keyId: string;
  serverId: number | null;
  serverName: string | null;
  label: string | null;
  status: string;
  createdAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export function toCredentialRow(raw: unknown): AdminCredentialRow | null {
  if (!isObj(raw)) return null;
  const id = s(raw.id);
  if (!id) return null;
  const server = isObj(raw.server) ? raw.server : null;
  return {
    id,
    keyId: s(raw.keyId) ?? '—',
    serverId: n(raw.serverId) ?? n(server?.id),
    serverName: s(raw.serverName) ?? s(server?.displayName) ?? s(server?.name),
    label: s(raw.label),
    status: s(raw.status) ?? 'active',
    createdAt: s(raw.createdAt),
    rotatedAt: s(raw.rotatedAt),
    revokedAt: s(raw.revokedAt),
    lastUsedAt: s(raw.lastUsedAt),
  };
}

/** A freshly issued / rotated secret. Shown once, never cached. */
export interface IssuedCredential {
  credential: AdminCredentialRow | null;
  keyId: string | null;
  secret: string;
}

function toIssued(data: unknown): IssuedCredential {
  const body = isObj(data) ? data : {};
  const credential = toCredentialRow(body.key ?? body.credential ?? body.item ?? body);
  const secret = s(body.secret) ?? (isObj(body.credential) ? s(body.credential.secret) : null);
  if (!secret) throw new Error('missing secret');
  return { credential, keyId: s(body.keyId) ?? credential?.keyId ?? null, secret };
}

/* ================================================================== */
/* Payments (top-up + VIP, every provider) — read-only                 */
/* ================================================================== */

export const PAYMENT_PROVIDER_FILTERS = ['stripe', 'bank_slip', 'sandbox'] as const;
export const PAYMENT_STATUS_FILTERS = ['pending', 'processing', 'completed', 'failed', 'expired', 'refunded'] as const;
export const PAYMENT_KIND_FILTERS = ['topup', 'vip'] as const;

export interface AdminPaymentRow {
  id: string;
  kind: 'topup' | 'vip';
  provider: string;
  status: string;
  reference: string | null;
  providerIntentId: string | null;
  /** Decimal string (THB). */
  amountThb: string | null;
  /** IC credited (always '0' for VIP). */
  pointsAmount: string | null;
  packageName: string | null;
  vipPackageName: string | null;
  vipMembership: { id: string; status: string | null; startsAt: string | null; expiresAt: string | null } | null;
  user: PersonRow | null;
  /** Only a same-site path or https URL (never blob:/data:). */
  slipImageUrl: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

function safeImageUrl(v: unknown): string | null {
  const url = s(v);
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function toPaymentRow(raw: unknown): AdminPaymentRow | null {
  if (!isObj(raw)) return null;
  const id = s(raw.id);
  if (!id) return null;
  const vm = isObj(raw.vipMembership) ? raw.vipMembership : null;
  const vipPackage = isObj(raw.vipPackage) ? raw.vipPackage : null;
  return {
    id,
    kind: raw.kind === 'vip' || vipPackage ? 'vip' : 'topup',
    provider: s(raw.provider) ?? '—',
    status: s(raw.status) ?? 'pending',
    reference: s(raw.reference),
    providerIntentId: s(raw.providerIntentId),
    amountThb: amount(raw.amountThb),
    pointsAmount: amount(raw.pointsAmount),
    packageName: isObj(raw.package) ? s(raw.package.name) : null,
    vipPackageName: s(vipPackage?.name) ?? s(vipPackage?.key),
    vipMembership: vm && s(vm.id) ? { id: s(vm.id)!, status: s(vm.status), startsAt: s(vm.startsAt), expiresAt: s(vm.expiresAt) } : null,
    user: toPerson(raw.user, raw.userId),
    slipImageUrl: safeImageUrl(raw.slipImageUrl),
    approvedBy: s(raw.approvedBy),
    rejectedBy: s(raw.rejectedBy),
    rejectReason: s(raw.rejectReason),
    expiresAt: s(raw.expiresAt),
    completedAt: s(raw.completedAt),
    createdAt: s(raw.createdAt),
  };
}

/* ================================================================== */
/* Client                                                              */
/* ================================================================== */

export const adminConsoleApi = {
  /** GET /admin/orders — filters: status, serverId, userId. search: order id / player (when the backend supports it). */
  getOrdersPage: (req: AdminListRequest<'status' | 'serverId' | 'userId'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminOrderRow>('/admin/orders', req, {
      signal,
      itemsKeys: ['orders', 'items'],
      mapItem: toOrderRow,
      legacyLimit: true,
      verify: verifyFields<AdminOrderRow>({ status: (r) => r.status, serverId: (r) => r.serverId, userId: (r) => r.user?.id }),
    }),

  /** Order + delivery timeline. GET /admin/orders/:id, falling back to GET /orders/:id (admins may read any order). */
  getOrderDetail: async (id: string, signal?: AbortSignal): Promise<AdminOrderDetail> => {
    const enc = encodeURIComponent(id);
    try {
      const { data } = await api.get(`/admin/orders/${enc}`, { signal, timeout: 15_000 });
      const detail = toOrderDetail(data, 'admin');
      if (detail) return detail;
    } catch (error) {
      const st = httpStatus(error);
      if (st !== 404 && st !== 405) throw error;
    }
    const { data } = await api.get(`/orders/${enc}`, { signal, timeout: 15_000 });
    const detail = toOrderDetail(data, 'customer');
    if (!detail) throw new Error('order not found');
    return detail;
  },

  /** POST /admin/orders/:id/refund (admin|root). Delivered orders need inventoryReclaimed + reclaimReceipt. */
  refundOrder: async (id: string, payload: RefundOrderPayload) => {
    const { data } = await api.post(`/admin/orders/${encodeURIComponent(id)}/refund`, payload, { timeout: 30_000 });
    return { refundedAmount: amount(isObj(data) ? data.refundedAmount : null) };
  },

  /** GET /admin/payments — filters: provider, status, kind (topup|vip), userId. search: id / reference / player. */
  getPaymentsPage: (req: AdminListRequest<'provider' | 'status' | 'kind' | 'userId'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminPaymentRow>('/admin/payments', req, {
      signal,
      itemsKeys: ['items', 'payments'],
      mapItem: toPaymentRow,
      verify: verifyFields<AdminPaymentRow>({
        provider: (r) => r.provider,
        status: (r) => r.status,
        kind: (r) => r.kind,
        userId: (r) => r.user?.id,
      }),
    }),

  /** GET /admin/deliveries — filters: status, serverId, deliveryType. search: job id / referenceId (order id) prefix, exact Steam ID. */
  getDeliveriesPage: (req: AdminListRequest<'status' | 'serverId' | 'deliveryType'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminDeliveryRow>('/admin/deliveries', req, {
      signal,
      itemsKeys: ['items', 'deliveries'],
      mapItem: toDeliveryRow,
      verify: verifyFields<AdminDeliveryRow>({
        status: (r) => r.status,
        serverId: (r) => r.serverId,
        deliveryType: (r) => r.deliveryType,
      }),
    }),

  /** POST /admin/deliveries/:id/retry */
  retryDelivery: async (id: string): Promise<RetryDeliveryResult> => {
    const { data } = await api.post(`/admin/deliveries/${encodeURIComponent(id)}/retry`, undefined, { timeout: 30_000 });
    const body = isObj(data) ? data : {};
    return { retried: body.retried === true, alreadyQueued: body.alreadyQueued === true, item: toDeliveryRow(body.item) };
  },

  /**
   * GET /admin/audit-logs — filters: action, resource, actorId, status (success|failure) (exact).
   * search: action/resource contains, resourceId prefix, exact actor id, text in metadata/newValue.
   */
  getAuditPage: (req: AdminListRequest<'action' | 'resource' | 'actorId' | 'status'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminAuditRow>('/admin/audit-logs', req, {
      signal,
      itemsKeys: ['items', 'logs'],
      mapItem: toAuditRow,
      verify: verifyFields<AdminAuditRow>({
        action: (r) => r.action,
        resource: (r) => r.resource,
        actorId: (r) => r.actorId,
        status: (r) => r.status,
      }),
    }),

  /** GET /admin/market/listings — filters: status. search: listing id prefix, species, dino name, seller/buyer name, seller Steam ID prefix. */
  getListingsPage: (req: AdminListRequest<'status'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminListingRow>('/admin/market/listings', req, {
      signal,
      itemsKeys: ['items', 'listings'],
      mapItem: toListingRow,
      verify: verifyFields<AdminListingRow>({ status: (r) => r.status }),
    }),

  /** GET /site/settings (public). */
  getSiteSettings: async (signal?: AbortSignal): Promise<SiteSettings> => {
    const { data } = await api.get('/site/settings', { signal });
    return toSiteSettings(data);
  },

  /** PUT /admin/site/settings (admin|root). */
  updateSiteSettings: async (payload: {
    season?: SeasonSetting;
    announcement?: { text: string; href?: string } | null;
  }): Promise<SiteSettings> => {
    const { data } = await api.put('/admin/site/settings', payload);
    return toSiteSettings(data);
  },

  /** GET /admin/plugin-keys (root) — filters: serverId, status. search: keyId / label. */
  getPluginKeysPage: (req: AdminListRequest<'serverId' | 'status'>, signal?: AbortSignal) =>
    fetchEnvelopePage<AdminCredentialRow>('/admin/plugin-keys', req, {
      signal,
      itemsKeys: ['items', 'credentials', 'keys'],
      mapItem: toCredentialRow,
      verify: verifyFields<AdminCredentialRow>({ status: (r) => r.status, serverId: (r) => r.serverId }),
    }),

  /** POST /admin/plugin-keys { serverId, label? } -> secret shown once. */
  issuePluginKey: async (payload: { serverId: number; label?: string }): Promise<IssuedCredential> => {
    const { data } = await api.post('/admin/plugin-keys', payload, { timeout: 30_000 });
    return toIssued(data);
  },

  /**
   * POST /admin/plugin-keys/:id/rotate { revokePrevious? } -> a NEW key for the same server, secret shown once.
   * The old key stays active (zero-downtime overlap) unless revokePrevious is true.
   */
  rotatePluginKey: async (id: string, revokePrevious: boolean): Promise<IssuedCredential> => {
    const { data } = await api.post(
      `/admin/plugin-keys/${encodeURIComponent(id)}/rotate`,
      revokePrevious ? { revokePrevious: true } : {},
      { timeout: 30_000 },
    );
    return toIssued(data);
  },

  /** POST /admin/plugin-keys/:id/revoke { reason } */
  revokePluginKey: async (id: string, reason: string) => {
    await api.post(`/admin/plugin-keys/${encodeURIComponent(id)}/revoke`, { reason }, { timeout: 30_000 });
  },
};

/* ================================================================== */
/* Shared formatting                                                   */
/* ================================================================== */

/** Integer IC string with thousands separators ('1500' -> '1,500'). */
export function formatIcAmount(value: string | null): string {
  if (!value || !/^-?\d+$/.test(value)) return '—';
  const neg = value.startsWith('-');
  const digits = (neg ? value.slice(1) : value).replace(/^0+(?=\d)/, '');
  return `${neg ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Short id for tables: first 8 chars. */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
