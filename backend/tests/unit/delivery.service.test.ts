import { describe, expect, it } from 'vitest';
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  DEFAULT_MAX_ATTEMPTS,
  backoffMs,
  nextRetryAt,
  classifyFailure,
  claimWhere,
} from '../../src/services/delivery.service.js';

describe('Delivery orchestrator policy (§18)', () => {
  describe('backoff', () => {
    it('grows exponentially from the base', () => {
      expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
      expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2);
      expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4);
    });

    it('caps at MAX_BACKOFF_MS', () => {
      expect(backoffMs(100)).toBe(MAX_BACKOFF_MS);
    });

    it('treats attempts < 1 as 1', () => {
      expect(backoffMs(0)).toBe(BASE_BACKOFF_MS);
    });

    it('nextRetryAt is now + backoff', () => {
      const now = new Date('2026-06-20T00:00:00.000Z');
      const at = nextRetryAt(2, now);
      expect(at.getTime()).toBe(now.getTime() + BASE_BACKOFF_MS * 2);
    });
  });

  describe('classifyFailure', () => {
    it('retries (pending + backoff) while under the attempt limit', () => {
      const d = classifyFailure(1, DEFAULT_MAX_ATTEMPTS);
      expect(d.status).toBe('pending');
      expect(d.retry).toBe(true);
      expect(d.nextRetryAt).toBeInstanceOf(Date);
    });

    it('dead-letters once attempts reach the limit', () => {
      const d = classifyFailure(DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
      expect(d.status).toBe('dead_letter');
      expect(d.retry).toBe(false);
      expect(d.nextRetryAt).toBeNull();
    });

    it('respects a custom maxAttempts', () => {
      expect(classifyFailure(2, 3).retry).toBe(true);
      expect(classifyFailure(3, 3).retry).toBe(false);
    });
  });

  describe('claimWhere', () => {
    it('selects pending (past backoff) and expired-lease jobs, excludes dead_letter/completed', () => {
      const now = new Date('2026-06-20T00:00:00.000Z');
      const where: any = clone(claimWhere(7, now));
      expect(where.serverId).toBe(7);
      // first branch: pending with no/elapsed backoff
      const pendingBranch = where.OR[0];
      expect(pendingBranch.status).toBe('pending');
      expect(pendingBranch.OR).toEqual([{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]);
      // second branch: leased with an expired lease
      const leasedBranch = where.OR[1];
      expect(leasedBranch.status).toBe('leased');
      expect(leasedBranch.leaseExpiresAt).toEqual({ lt: now });
    });
  });
});

function clone<T>(v: T): T {
  return v;
}
