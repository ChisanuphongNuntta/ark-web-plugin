/**
 * Admin-console data access that is not (yet) in the shared typed clients:
 * orders + refund (with the delivered-order reclaim body), pending slips, and
 * the extended dashboard stats. Everything else uses `adminConsoleApi` from
 * '@/lib/contracts/console'.
 *
 * Transport + envelope normalization only — no money arithmetic, no
 * eligibility decisions. Contract: backend/contracts/ui-redesign-2026-10.md.
 */
import { api } from '@/lib/api';
import { adminContractApi, toContractError } from '@/lib/contracts/client';
import { normalizePage } from '@/lib/contracts/console';
import type { AdminDeliveryRow, AuditLogRow, AdminMarketListing, Paginated, SlipTopupSubmission } from '@/lib/contracts/types';

/* ------------------------------------------------------------------------ */
/* Query keys + defaults                                                    */
/* ------------------------------------------------------------------------ */

export const adminKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  pendingSlips: ['admin', 'pending-slips'] as const,
  orders: (q: object) => ['admin', 'orders', q] as const,
  deliveries: (q: object) => ['admin', 'deliveries', q] as const,
  audit: (q: object) => ['admin', 'audit-logs', q] as const,
  market: (q: object) => ['admin', 'market-listings', q] as const,
  publicServers: ['admin', 'public-servers'] as const,
};

/**
 * Admin data should be fresh when an operator navigates between screens
 * (the app-wide default is 5 min stale + no refetch on mount).
 */
export const ADMIN_QUERY_OPTIONS = {
  staleTime: 15_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
} as const;

/** Backend error text for toasts/dialogs (never swallowed). */
export function errorText(err: unknown, fallback = 'ทำรายการไม่สำเร็จ'): string {
  return toContractError(err, fallback).message;
}

export const ADMIN_PAGE_SIZE = 25;

/* ------------------------------------------------------------------------ */
/* Dashboard stats (GET /admin/stats)                                       */
/* ------------------------------------------------------------------------ */

export interface DashboardStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number | string;
  pendingOrders: number;
  pendingSlips?: number;
  failedDeliveries?: number;
  onlineServers?: number;
  todayRevenue?: number | string;
  /** THB of completed top-ups since Bangkok midnight. */
  todayTopupThb?: number | string;
  todayStartsAt?: string;
}

export interface DashboardRecentOrder {
  id: string;
  status: string;
  totalPrice: number | string;
  quantity?: number;
  createdAt: string;
  user?: { discordUsername: string | null } | null;
  product?: { name: string } | null;
}

function n(v: unknown): number {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

function optN(v: unknown): number | undefined {
  return v === undefined || v === null ? undefined : n(v);
}

/** Money passes through untouched (number or decimal string) — display only. */
function money(v: unknown): number | string | undefined {
  return typeof v === 'number' || typeof v === 'string' ? v : undefined;
}

/**
 * GET /admin/stats → `{ stats, recentOrders }`. One request; maps every
 * documented counter including `todayTopupThb` (not in the shared type yet).
 */
export async function fetchDashboardStats(): Promise<{ stats: DashboardStats; recentOrders: DashboardRecentOrder[] }> {
  const { data } = await api.get('/admin/stats');
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const s = d.stats && typeof d.stats === 'object' ? (d.stats as Record<string, unknown>) : {};
  return {
    stats: {
      totalUsers: n(s.totalUsers),
      totalOrders: n(s.totalOrders),
      totalRevenue: money(s.totalRevenue) ?? 0,
      pendingOrders: n(s.pendingOrders),
      pendingSlips: optN(s.pendingSlips),
      failedDeliveries: optN(s.failedDeliveries),
      onlineServers: optN(s.onlineServers),
      todayRevenue: money(s.todayRevenue),
      todayTopupThb: money(s.todayTopupThb),
      todayStartsAt: typeof s.todayStartsAt === 'string' ? s.todayStartsAt : undefined,
    },
    recentOrders: (Array.isArray(d.recentOrders) ? d.recentOrders : []) as DashboardRecentOrder[],
  };
}

/* ------------------------------------------------------------------------ */
/* Orders                                                                   */
/* ------------------------------------------------------------------------ */

export interface AdminOrderRow {
  id: string;
  userId: string;
  productId: number;
  serverId: number;
  quantity: number;
  totalPrice: number | string;
  status: string;
  deliveredAt: string | null;
  deliveryAttempts: number;
  lastError: string | null;
  paidAt: string | null;
  queuedAt: string | null;
  refundedAt: string | null;
  checkoutSessionId: string | null;
  orderGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { discordUsername: string | null; steamId: string | null } | null;
  product?: { name: string } | null;
  server?: { name: string } | null;
}

export interface OrderQuery {
  page: number;
  pageSize: number;
  status?: string;
}

/** GET /admin/orders?page&limit&status → `{ orders, pagination }` normalized. */
export async function listAdminOrders(q: OrderQuery): Promise<Paginated<AdminOrderRow>> {
  const { data } = await api.get('/admin/orders', {
    params: { page: q.page, limit: q.pageSize, status: q.status || undefined },
  });
  return normalizePage<AdminOrderRow>(data, ['orders'], q);
}

export interface RefundInput {
  reason?: string;
  /** Required by the backend for `delivered` orders. */
  inventoryReclaimed?: boolean;
  reclaimReceipt?: string;
}

/** POST /admin/orders/:id/refund → `{ success, refundedAmount }`. Ledger-idempotent. */
export async function refundAdminOrder(id: string, input: RefundInput): Promise<{ success: boolean; refundedAmount?: number | string }> {
  const { data } = await api.post(`/admin/orders/${encodeURIComponent(id)}/refund`, input);
  return data as { success: boolean; refundedAmount?: number | string };
}

/* ------------------------------------------------------------------------ */
/* Pending slips                                                            */
/* ------------------------------------------------------------------------ */

export async function listPendingSlips(): Promise<SlipTopupSubmission[]> {
  const res = await adminContractApi.getPendingTopups();
  return Array.isArray(res?.topups) ? res.topups : [];
}

export async function approveSlip(id: string, notes?: string) {
  return adminContractApi.approveTopup(id, notes) as Promise<{
    success: boolean;
    creditedPoints: number;
    transactionId: string;
    alreadyApproved?: boolean;
  }>;
}

export async function rejectSlip(id: string, reason: string) {
  return adminContractApi.rejectTopup(id, reason) as Promise<{ success: boolean; message: string; alreadyRejected?: boolean }>;
}

/* ------------------------------------------------------------------------ */
/* Row aliases (shared types now match the backend contract exactly)        */
/* ------------------------------------------------------------------------ */

export type DeliveryRowFull = AdminDeliveryRow;
export type AuditRowFull = AuditLogRow;
export type MarketRowFull = AdminMarketListing;

export function auditActor(row: AuditLogRow): { id: string | null; label: string | null } {
  return { id: row.actorId ?? null, label: row.actorEmail ?? null };
}
