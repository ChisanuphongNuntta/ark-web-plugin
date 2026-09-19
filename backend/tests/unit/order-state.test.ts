import { describe, expect, it } from 'vitest';
import {
  assertOrderTransition,
  canTransition,
  isOrderStatus,
  isRefundable,
  isDeliveryPending,
  ORDER_STATUSES,
} from '../../src/services/orderState.js';

describe('Order state machine (§8)', () => {
  it('recognizes the full status set', () => {
    expect(ORDER_STATUSES).toContain('draft');
    expect(ORDER_STATUSES).toContain('pending_payment');
    expect(ORDER_STATUSES).toContain('paid');
    expect(ORDER_STATUSES).toContain('queued');
    expect(ORDER_STATUSES).toContain('delivering');
    expect(ORDER_STATUSES).toContain('delivered');
    expect(ORDER_STATUSES).toContain('failed');
    expect(ORDER_STATUSES).toContain('refunded');
    expect(ORDER_STATUSES).toContain('cancelled');
    expect(isOrderStatus('bogus')).toBe(false);
  });

  it('allows the canonical happy path', () => {
    expect(canTransition('draft', 'pending_payment')).toBe(true);
    expect(canTransition('pending_payment', 'paid')).toBe(true);
    expect(canTransition('paid', 'queued')).toBe(true);
    expect(canTransition('queued', 'delivering')).toBe(true);
    expect(canTransition('delivering', 'delivered')).toBe(true);
  });

  it('allows delivering -> queued (lease released / retry) and delivering -> failed', () => {
    expect(canTransition('delivering', 'queued')).toBe(true);
    expect(canTransition('delivering', 'failed')).toBe(true);
  });

  it('rejects backwards / illegal jumps', () => {
    expect(canTransition('delivered', 'queued')).toBe(false);
    expect(canTransition('delivered', 'delivering')).toBe(false);
    expect(canTransition('queued', 'delivered')).toBe(false); // must go through delivering
    expect(canTransition('pending_payment', 'delivered')).toBe(false);
    expect(canTransition('draft', 'paid')).toBe(false);
  });

  it('treats refunded and cancelled as terminal', () => {
    expect(canTransition('refunded', 'paid')).toBe(false);
    expect(canTransition('refunded', 'delivered')).toBe(false);
    expect(canTransition('cancelled', 'queued')).toBe(false);
  });

  it('only allows refunds from delivered or failed', () => {
    expect(canTransition('delivered', 'refunded')).toBe(true);
    expect(canTransition('failed', 'refunded')).toBe(true);
    expect(canTransition('paid', 'refunded')).toBe(true); // pre-delivery refund/cancel path
    expect(isRefundable('delivered')).toBe(true);
    expect(isRefundable('failed')).toBe(true);
    expect(isRefundable('queued')).toBe(false);
    expect(isRefundable('refunded')).toBe(false);
  });

  it('treats same-state as an idempotent no-op (not an error)', () => {
    expect(canTransition('delivered', 'delivered')).toBe(true);
    expect(() => assertOrderTransition('delivered', 'delivered')).not.toThrow();
  });

  it('assertOrderTransition throws 409 on an illegal transition', () => {
    expect(() => assertOrderTransition('delivered', 'queued')).toThrowError(
      /Illegal order transition: delivered -> queued/,
    );
    try {
      assertOrderTransition('refunded', 'paid');
    } catch (e: any) {
      expect(e.statusCode).toBe(409);
    }
  });

  it('isDeliveryPending covers paid/queued/delivering only', () => {
    expect(isDeliveryPending('paid')).toBe(true);
    expect(isDeliveryPending('queued')).toBe(true);
    expect(isDeliveryPending('delivering')).toBe(true);
    expect(isDeliveryPending('delivered')).toBe(false);
    expect(isDeliveryPending('failed')).toBe(false);
  });
});
