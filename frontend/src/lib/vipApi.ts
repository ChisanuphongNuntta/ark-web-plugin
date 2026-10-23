/**
 * VIP API client. Contract: backend/contracts/vip-2026-10.md.
 *
 * Player:  GET /vip/packages, GET /vip/me, POST /vip/checkout
 * Admin:   /admin/vip/packages (CRUD), /admin/vip/memberships (list, grant, extend, revoke, resync)
 *
 * VIP is paid with REAL money only (Stripe or bank slip). The backend creates a
 * PaymentIntent of kind 'vip'; it never credits IC for it.
 */
import { api, type AdminListRequest } from '@/lib/api';
import type { PaymentIntent } from '@/lib/contracts/types';
import { fetchEnvelopePage, verifyFields } from '@/lib/adminConsoleApi';
import {
  toVipMe,
  toVipMembership,
  toVipPackage,
  type VipMe,
  type VipMembership,
  type VipPackage,
} from '@/lib/vip';

export type VipProvider = 'stripe' | 'bank_slip';

export interface VipCheckoutSlip {
  transferBank: string;
  transferRef?: string;
  slipImageUrl?: string;
  notes?: string;
}

export interface VipCheckoutResult {
  intent: PaymentIntent;
  replayed: boolean;
}

/** Package fields an admin can write. priceThb is a decimal string ('199' / '199.00'). */
export interface VipPackageInput {
  key: string;
  name: string;
  description: string | null;
  permissionGroup: string;
  tierRank: number;
  frameStyle: string;
  badgeLabel: string;
  priceThb: string;
  durationDays: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface VipSummary {
  activeUsers: number | null;
  activeMemberships: number | null;
  expiringIn7Days: number | null;
  sync: { pending: number | null; failed: number | null; noSteam: number | null };
  pendingVipSlips: number | null;
  permissionJobsFailed: number | null;
}

export type VipMembershipFilter = 'status' | 'state' | 'source' | 'syncStatus' | 'packageId' | 'userId';

export interface VipGrantInput {
  userId: string;
  packageId: string;
  /** Override the package duration; omit to use it. null = permanent. */
  durationDays?: number | null;
  /** 'legacy' = carried over from the old iris-th.cloud VIP list (default 'admin'). */
  source?: 'admin' | 'legacy';
  reason: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function packagesFrom(data: unknown): VipPackage[] {
  const body = isObj(data) ? data : {};
  const raw = Array.isArray(body.packages) ? body.packages : Array.isArray(body.items) ? body.items : Array.isArray(data) ? data : [];
  return (raw as unknown[])
    .map(toVipPackage)
    .filter((p): p is VipPackage => p !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.tierRank - b.tierRank);
}

function membershipFrom(data: unknown): VipMembership | null {
  const body = isObj(data) ? data : {};
  return toVipMembership(body.membership ?? body.item ?? data);
}

function newIdempotencyKey(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const vipApi = {
  /** Active packages, ordered for display. */
  getPackages: async (signal?: AbortSignal): Promise<VipPackage[]> => {
    const { data } = await api.get('/vip/packages', { signal });
    return packagesFrom(data).filter((p) => p.isActive);
  },

  /** The signed-in player's VIP status. */
  getMe: async (signal?: AbortSignal): Promise<VipMe> => {
    const { data } = await api.get('/vip/me', { signal });
    return toVipMe(data);
  },

  /**
   * POST /vip/checkout. The same Idempotency-Key must be reused for retries of the
   * same attempt (a double click never creates two intents).
   */
  checkout: async (
    payload: { packageId: string; provider: VipProvider } & Partial<VipCheckoutSlip>,
    idempotencyKey: string,
  ): Promise<VipCheckoutResult> => {
    const { data } = await api.post('/vip/checkout', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: 60_000,
    });
    const body = isObj(data) ? data : {};
    const intent = (isObj(body.intent) ? body.intent : body) as unknown as PaymentIntent;
    if (!intent || typeof intent.id !== 'string') throw new Error('missing intent');
    return { intent, replayed: body.replayed === true };
  },

  /** Poll a VIP intent (same endpoint as top-ups). */
  getIntent: async (id: string, signal?: AbortSignal): Promise<PaymentIntent> => {
    const { data } = await api.get(`/payments/intents/${encodeURIComponent(id)}`, { signal });
    const body = isObj(data) && isObj(data.intent) ? data.intent : data;
    return body as PaymentIntent;
  },

  newIdempotencyKey,
};

export const vipAdminApi = {
  /** Every package (active and inactive). */
  getPackages: async (signal?: AbortSignal): Promise<VipPackage[]> => {
    const { data } = await api.get('/admin/vip/packages', { signal });
    return packagesFrom(data);
  },
  createPackage: async (input: VipPackageInput): Promise<VipPackage | null> => {
    const { data } = await api.post('/admin/vip/packages', input);
    return toVipPackage(isObj(data) ? (data.package ?? data) : data);
  },
  updatePackage: async (id: string, input: Partial<VipPackageInput>): Promise<VipPackage | null> => {
    const { data } = await api.put(`/admin/vip/packages/${encodeURIComponent(id)}`, input);
    return toVipPackage(isObj(data) ? (data.package ?? data) : data);
  },

  /** GET /admin/vip/summary — counts for tab badges and the dashboard. */
  getSummary: async (signal?: AbortSignal): Promise<VipSummary> => {
    const { data } = await api.get('/admin/vip/summary', { signal });
    const b = isObj(data) ? data : {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const sync = isObj(b.sync) ? b.sync : {};
    return {
      activeUsers: num(b.activeUsers),
      activeMemberships: num(b.activeMemberships),
      expiringIn7Days: num(b.expiringIn7Days),
      sync: { pending: num(sync.pending), failed: num(sync.failed), noSteam: num(sync.noSteam) },
      pendingVipSlips: num(b.pendingVipSlips),
      permissionJobsFailed: num(b.permissionJobsFailed),
    };
  },

  /** GET /admin/vip/memberships — filters: status, state, source, syncStatus, packageId, userId. search: name / Steam ID / membership id / intent id. */
  getMembershipsPage: (req: AdminListRequest<VipMembershipFilter>, signal?: AbortSignal) =>
    fetchEnvelopePage<VipMembership>('/admin/vip/memberships', req, {
      signal,
      itemsKeys: ['items', 'memberships'],
      mapItem: toVipMembership,
      verify: verifyFields<VipMembership>({
        status: (m) => m.status,
        state: (m) => m.state,
        source: (m) => m.source,
        syncStatus: (m) => m.sync?.status,
        packageId: (m) => m.packageId,
        userId: (m) => m.userId,
      }),
    }),

  /** POST /admin/vip/grant { userId, packageId, durationDays?, reason } (undefined = package duration, null = permanent). */
  grant: async (input: VipGrantInput): Promise<VipMembership | null> => {
    const { data } = await api.post('/admin/vip/grant', input, {
      headers: { 'Idempotency-Key': newIdempotencyKey('vip-grant') },
    });
    return membershipFrom(data);
  },
  /** POST /admin/vip/memberships/:id/extend { days, reason } */
  extend: async (id: string, days: number, reason: string): Promise<VipMembership | null> => {
    const { data } = await api.post(`/admin/vip/memberships/${encodeURIComponent(id)}/extend`, { days, reason });
    return membershipFrom(data);
  },
  /** POST /admin/vip/memberships/:id/revoke { reason } */
  revoke: async (id: string, reason: string): Promise<VipMembership | null> => {
    const { data } = await api.post(`/admin/vip/memberships/${encodeURIComponent(id)}/revoke`, { reason });
    return membershipFrom(data);
  },
  /** POST /admin/vip/users/:userId/resync { reason? } — re-enqueue the Permissions group sync for one player. */
  resyncUser: async (userId: string, reason?: string): Promise<{ steamLinked: boolean; jobs: number }> => {
    const { data } = await api.post(`/admin/vip/users/${encodeURIComponent(userId)}/resync`, reason ? { reason } : {});
    const b = isObj(data) ? data : {};
    return { steamLinked: b.steamLinked !== false, jobs: Array.isArray(b.jobs) ? b.jobs.length : 0 };
  },
};
