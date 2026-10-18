// Admin Rescue Console for delivery jobs (UI redesign 2026-10).
//
// Retry does NOT introduce a new delivery path: it only moves a failed / dead-lettered
// DeliveryJob back to `pending` so the existing plugin lease/complete/fail orchestrator
// (plugin.controller + delivery.service) picks it up again. Money-safety rules:
//   * completed jobs are never retried (409);
//   * dino_marketplace jobs are never retried: dead-lettering already refunded the buyer's
//     escrow, so re-delivery would hand out the dino AND the refund (409);
//   * order-backed jobs are retried only while the order is still `failed` (or still in a
//     delivery state). A refunded / cancelled / delivered order blocks the retry (409), and the
//     order moves failed -> queued in the same Serializable transaction so a concurrent refund
//     (which requires `failed`) cannot also succeed;
//   * the transition is a conditional update on the observed status, so double-clicks and
//     concurrent retries are idempotent (the loser reports alreadyQueued).
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { DEFAULT_MAX_ATTEMPTS } from './delivery.service.js';
import { canTransition } from './orderState.js';
import { paginateQuery } from '../utils/pagination.js';
import { afterCommit } from '../realtime/afterCommit.js';
import { emitDeliveryUpdated, emitOrderUpdated } from '../realtime/emit.js';

export const DELIVERY_JOB_STATUSES = ['pending', 'leased', 'completed', 'failed', 'dead_letter'] as const;
export type DeliveryJobStatusValue = (typeof DELIVERY_JOB_STATUSES)[number];

export const RETRYABLE_STATUSES: readonly DeliveryJobStatusValue[] = ['failed', 'dead_letter'];
const QUEUED_STATUSES: readonly DeliveryJobStatusValue[] = ['pending', 'leased'];
// Delivery types whose referenceId is an Order id.
const ORDER_BACKED_TYPES = new Set(['order', 'dino_catalog']);
const ORDER_BLOCKING_STATUSES = new Set(['refunded', 'cancelled', 'delivered']);

export interface DeliveryItem {
  id: string;
  status: string;
  deliveryType: string;
  referenceId: string;
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

export function isDeliveryJobStatus(value: unknown): value is DeliveryJobStatusValue {
  return typeof value === 'string' && (DELIVERY_JOB_STATUSES as readonly string[]).includes(value);
}

export function toDeliveryItem(job: any): DeliveryItem {
  const iso = (value: Date | string | null | undefined) =>
    value ? (value instanceof Date ? value.toISOString() : String(value)) : null;
  return {
    id: job.id,
    status: job.status,
    deliveryType: job.deliveryType,
    referenceId: job.referenceId,
    orderId: ORDER_BACKED_TYPES.has(job.deliveryType) ? job.referenceId : null,
    serverId: job.serverId,
    serverName: job.server?.name ?? null,
    steamId: job.playerSteamId,
    attempts: job.attempts ?? 0,
    maxAttempts: job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    lastError: job.error ?? null,
    nextRetryAt: iso(job.nextRetryAt),
    createdAt: iso(job.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(job.updatedAt) ?? new Date(0).toISOString(),
  };
}

export type RetryDecision =
  | { kind: 'retry' }
  | { kind: 'already_queued' }
  | { kind: 'reject'; status: number; message: string };

// Pure guard: may this job be retried, given its order (if any)?
export function decideRetry(
  job: { status: string; deliveryType: string },
  order: { status: string } | null | undefined,
): RetryDecision {
  if ((QUEUED_STATUSES as readonly string[]).includes(job.status)) return { kind: 'already_queued' };
  if (job.status === 'completed') {
    return { kind: 'reject', status: 409, message: 'Delivery already completed' };
  }
  if (!(RETRYABLE_STATUSES as readonly string[]).includes(job.status)) {
    return { kind: 'reject', status: 409, message: `Delivery in status "${job.status}" cannot be retried` };
  }
  if (job.deliveryType === 'dino_marketplace') {
    return {
      kind: 'reject',
      status: 409,
      message: 'Marketplace dino deliveries cannot be retried: the buyer escrow was refunded when the job dead-lettered',
    };
  }
  if (ORDER_BACKED_TYPES.has(job.deliveryType)) {
    if (!order) return { kind: 'reject', status: 409, message: 'Order for this delivery no longer exists' };
    if (ORDER_BLOCKING_STATUSES.has(order.status)) {
      return { kind: 'reject', status: 409, message: `Order is ${order.status}; delivery cannot be retried` };
    }
    return { kind: 'retry' };
  }
  return { kind: 'reject', status: 409, message: `Unsupported delivery type "${job.deliveryType}"` };
}

export interface ListDeliveriesQuery {
  status?: DeliveryJobStatusValue;
  serverId?: number;
  page: number;
  pageSize: number;
}

class DeliveryAdminService {
  async list(query: ListDeliveriesQuery) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.serverId !== undefined) where.serverId = query.serverId;

    // Count + rows from one snapshot; the served page is clamped to [1, totalPages].
    const { result, pagination } = await paginateQuery(
      { page: query.page, pageSize: query.pageSize, skip: 0, take: query.pageSize },
      (skip, take) =>
        prisma.$transaction([
          prisma.deliveryJob.count({ where }),
          prisma.deliveryJob.findMany({
            where,
            include: { server: { select: { name: true } } },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]) as Promise<[number, any[]]>,
    );
    const [total, jobs] = result;

    return { items: jobs.map(toDeliveryItem), total, page: pagination.page, pageSize: query.pageSize };
  }

  async retry(jobId: string): Promise<{ item: DeliveryItem; retried: boolean; alreadyQueued: boolean; previousStatus: string }> {
    return prisma.$transaction(async (tx) => {
      const job = await tx.deliveryJob.findUnique({ where: { id: jobId } });
      if (!job) throw new AppError('Delivery job not found', 404);

      const order = ORDER_BACKED_TYPES.has(job.deliveryType)
        ? await tx.order.findUnique({ where: { id: job.referenceId }, select: { id: true, status: true, userId: true } })
        : null;

      const decision = decideRetry(job, order);
      if (decision.kind === 'reject') throw new AppError(decision.message, decision.status);

      if (decision.kind === 'retry') {
        const changed = await tx.deliveryJob.updateMany({
          where: { id: job.id, status: job.status },
          data: {
            status: 'pending',
            leaseToken: null,
            leaseExpiresAt: null,
            nextRetryAt: null,
            // Keep the attempt history; grant a fresh retry budget.
            maxAttempts: (job.attempts ?? 0) + DEFAULT_MAX_ATTEMPTS,
          },
        });

        if (changed.count === 1) {
          if (order && order.status !== 'queued' && canTransition(order.status, 'queued')) {
            const moved = await tx.order.updateMany({
              where: { id: order.id, status: order.status },
              data: { status: 'queued' },
            });
            if (moved.count !== 1) throw new AppError('Order changed concurrently; retry again', 409);
          }
          // Realtime after commit: the buyer sees the retried delivery / re-queued order.
          const requeued = Boolean(order && order.status !== 'queued' && canTransition(order.status, 'queued'));
          afterCommit(async () => {
            await emitDeliveryUpdated({
              deliveryId: job.id,
              deliveryType: job.deliveryType,
              referenceId: job.referenceId,
              status: 'pending',
              userId: order?.userId,
            });
            if (order && requeued) emitOrderUpdated(order.userId, order.id, 'queued');
          });
          if (order) {
            await tx.fulfillment.updateMany({
              where: { orderId: order.id, status: 'failed' },
              data: { status: 'queued', failedAt: null },
            });
          }
        }

        const updated = await tx.deliveryJob.findUniqueOrThrow({
          where: { id: job.id },
          include: { server: { select: { name: true } } },
        });
        return {
          item: toDeliveryItem(updated),
          retried: changed.count === 1,
          alreadyQueued: changed.count !== 1,
          previousStatus: job.status,
        };
      }

      const current = await tx.deliveryJob.findUniqueOrThrow({
        where: { id: job.id },
        include: { server: { select: { name: true } } },
      });
      return { item: toDeliveryItem(current), retried: false, alreadyQueued: true, previousStatus: job.status };
    }, { isolationLevel: 'Serializable' });
  }
}

export const deliveryAdminService = new DeliveryAdminService();
export default deliveryAdminService;
