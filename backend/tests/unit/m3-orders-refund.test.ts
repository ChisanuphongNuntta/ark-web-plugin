import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { OrderController } from '../../src/controllers/order.controller.js';
import walletService from '../../src/services/wallet.service.js';

const db = prisma as any;
const orders = new OrderController();

vi.mock('../../src/services/wallet.service.js', () => ({
  default: {
    getBalance: vi.fn(),
    post: vi.fn(),
    ensureUserAccounts: vi.fn().mockResolvedValue(undefined),
  },
  userAccountKey: (userId: string, type: string) => `user:${userId}:${type}:IC`,
  SYSTEM_ACCOUNTS: { issuance: 'system:issuance:IC', revenue: 'system:revenue:IC', clearing: 'system:clearing:IC' },
}));

describe('M3 Orders — list / detail with timeline / refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /orders/:id delivery timeline', () => {
    it('returns the order, delivery summary, and a chronological timeline', async () => {
      const created = new Date('2026-06-20T03:00:00.000Z');
      const paid = new Date('2026-06-20T03:01:00.000Z');
      const queued = new Date('2026-06-20T03:01:00.000Z');
      const claimed = new Date('2026-06-20T03:02:00.000Z');
      const delivered = new Date('2026-06-20T03:03:00.000Z');

      db.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        userId: 'u1',
        status: 'delivered',
        createdAt: created,
        paidAt: paid,
        queuedAt: queued,
        deliveredAt: delivered,
        refundedAt: null,
        product: { id: 1, name: 'Rifle' },
        server: { id: 1, name: 'PVE' },
        fulfillment: {
          status: 'delivered',
          attempts: 1,
          lastError: null,
          receiptId: 'rcpt-1',
          queuedAt: queued,
          claimedAt: claimed,
          deliveredAt: delivered,
          failedAt: null,
        },
      });

      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await orders.getOrderById(req, res, next);

      const payload = res.json.mock.calls[0][0];
      expect(payload.delivery).toEqual({ status: 'delivered', attempts: 1, lastError: null, receiptId: 'rcpt-1' });
      const statuses = payload.timeline.map((e: any) => e.status);
      expect(statuses).toEqual(['created', 'paid', 'queued', 'delivering', 'delivered']);
      // timeline is strictly chronological
      const times = payload.timeline.map((e: any) => e.at);
      expect([...times].sort()).toEqual(times);
    });

    it('403s when a non-owner non-admin requests the order', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'someone-else', status: 'delivered', createdAt: new Date(), product: {}, server: {}, fulfillment: null });
      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();
      await orders.getOrderById(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  describe('POST /orders/:id/refund', () => {
    it('allows an administrator to refund a delivered order after recovery review', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivered', totalPrice: 500 });

      const tx: any = {
        order: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'order-1', status: 'delivered' }),
          update: vi.fn().mockResolvedValue({ id: 'order-1', status: 'refunded' }),
        },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'admin', isAdmin: true }, params: { id: 'order-1' }, body: { reason: 'item recovered' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await orders.refundOrder(req, res, next);

      // Money flows ONLY through the wallet ledger; entries are zero-sum.
      const postArg = vi.mocked(walletService.post).mock.calls[0][0] as any;
      expect(postArg.idempotencyKey).toBe('order:refund:order-1');
      expect(postArg.type).toBe('order_refund');
      const entries = postArg.entries;
      const sum = entries.reduce((acc: bigint, e: any) => acc + e.amount, 0n);
      expect(sum).toBe(0n); // zero-sum double entry
      const revenue = entries.find((e: any) => e.accountKey === 'system:revenue:IC');
      const refundable = entries.find((e: any) => e.accountKey === 'user:u1:refundable:IC');
      expect(revenue.amount).toBe(-500n);
      expect(refundable.amount).toBe(500n);

      // Order transitioned to refunded; pointsBalance is NEVER touched directly here.
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'refunded', refundedAt: expect.any(Date) }),
      });
      expect(db.user.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status: 'refunded', refundedAmount: '500' }));
    });

    it('refunds a failed (dead-lettered) order', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-2', userId: 'u1', status: 'failed', totalPrice: 250 });
      const tx: any = {
        order: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'order-2', status: 'failed' }),
          update: vi.fn().mockResolvedValue({ id: 'order-2', status: 'refunded' }),
        },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-2' }, body: {} };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await orders.refundOrder(req, res, next);
      expect(vi.mocked(walletService.post)).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, refundedAmount: '250' }));
    });

    it('rejects refunding a queued (not-yet-delivered) order with 409', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-3', userId: 'u1', status: 'queued', totalPrice: 100 });

      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-3' }, body: {} };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await orders.refundOrder(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
      expect(vi.mocked(walletService.post)).not.toHaveBeenCalled();
    });

    it('is idempotent: a concurrent refund that already flipped the order returns alreadyRefunded without double-posting', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-4', userId: 'u1', status: 'delivered', totalPrice: 500 });
      const tx: any = {
        order: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'order-4', status: 'refunded' }), // already refunded under tx
          update: vi.fn(),
        },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'admin', isAdmin: true }, params: { id: 'order-4' }, body: {} };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await orders.refundOrder(req, res, next);

      expect(vi.mocked(walletService.post)).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, alreadyRefunded: true }));
    });

    it('403s when a non-owner non-admin tries to refund', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-5', userId: 'other', status: 'delivered', totalPrice: 100 });
      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-5' }, body: {} };
      const res: any = { json: vi.fn() };
      const next = vi.fn();
      await orders.refundOrder(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('requires admin review when an owner requests a delivered-order refund', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-6', userId: 'u1', status: 'delivered', totalPrice: 100 });
      const req: any = { user: { id: 'u1', isAdmin: false }, params: { id: 'order-6' }, body: {} };
      const res: any = { json: vi.fn() };
      const next = vi.fn();
      await orders.refundOrder(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(vi.mocked(walletService.post)).not.toHaveBeenCalled();
    });
  });
});
