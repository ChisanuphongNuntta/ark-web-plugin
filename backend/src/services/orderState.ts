import { AppError } from '../middlewares/errorHandler.js';

// Order state machine (ENTERPRISE_REDESIGN_PLAN_TH.md §8).
//
//   draft -> pending_payment -> paid -> queued -> delivering -> delivered
//   plus terminal/branch states: failed, refunded, cancelled
//
// The backend ledger + DeliveryJob orchestrator are authoritative; the Order.status
// is a projection of "where this purchase is in its lifecycle". Every write that moves
// an order MUST go through `assertOrderTransition` so an illegal jump (e.g. delivered ->
// queued, or refunding a never-paid order) is rejected with a 409 instead of silently
// corrupting state.

export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'queued'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'draft',
  'pending_payment',
  'paid',
  'queued',
  'delivering',
  'delivered',
  'failed',
  'refunded',
  'cancelled',
] as const;

// Allowed forward/branch transitions. Terminal states (refunded, cancelled) have no
// outgoing edges. `delivered` and `failed` may only move to `refunded`.
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['pending_payment', 'cancelled'],
  pending_payment: ['paid', 'cancelled', 'failed'],
  // checkout commit pays then immediately queues for fulfillment
  paid: ['queued', 'refunded', 'cancelled'],
  // a queued job is picked up by a server plugin lease
  queued: ['delivering', 'failed', 'cancelled'],
  // delivering can succeed, be released back to queued, or exhaust retries -> failed
  delivering: ['delivered', 'queued', 'failed'],
  // happy terminal state — only a refund can move money back out
  delivered: ['refunded'],
  // permanent delivery failure (dead-letter) — refundable
  failed: ['refunded', 'queued'],
  refunded: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['refunded', 'cancelled'];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  if (from === to) return true; // idempotent re-write of the same state is a no-op, never an error
  return TRANSITIONS[from].includes(to);
}

// Throws a 409 AppError when the transition is not permitted by the state machine.
// Same-state is allowed (idempotent) so duplicate delivery callbacks do not error.
export function assertOrderTransition(from: string, to: string): void {
  if (canTransition(from, to)) return;
  throw new AppError(`Illegal order transition: ${from} -> ${to}`, 409);
}

// Convenience: which states still expect a delivery to happen.
export function isDeliveryPending(status: string): boolean {
  return status === 'paid' || status === 'queued' || status === 'delivering';
}

// Convenience: refunds are only allowed from a settled-but-undesirable state.
export function isRefundable(status: string): boolean {
  return status === 'delivered' || status === 'failed';
}
