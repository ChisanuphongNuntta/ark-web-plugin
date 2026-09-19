import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import { DEFAULT_MAX_ATTEMPTS } from '../../src/services/delivery.service.js';

const db = prisma as any;
const plugin = new PluginController();

describe('M3 Delivery Orchestrator (§18) — idempotent complete / retry / dead-letter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('completeDelivery idempotency', () => {
    it('first complete: flips order delivering -> delivered and writes the receipt ONCE', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1',
        status: 'leased',
        leaseToken: 'lease-abc',
        playerSteamId: 'steam-1',
        payloadHash: 'hash-1',
        deliveryType: 'order',
        referenceId: 'order-1',
      });
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 }); // won the conditional complete
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'delivering' }); // advanceOrder read
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});
      db.$transaction.mockImplementationOnce((callback: any) => callback(db));

      const req: any = {
        params: { deliveryKey: 'job-1' },
        body: { leaseToken: 'lease-abc', playerSteamId: 'steam-1', payloadHash: 'hash-1', localJournalReceiptId: 'rcpt-1' },
        serverId: 1,
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.completeDelivery(req, res, next);

      expect(db.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'delivered' }),
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: false, receiptId: 'rcpt-1' }));
    });

    it('duplicate complete on an already-completed job returns the ORIGINAL receipt and does NOT deliver again', async () => {
      // job is already completed from a prior call
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1',
        status: 'completed',
        leaseToken: 'lease-abc',
        playerSteamId: 'steam-1',
        payloadHash: 'hash-1',
        deliveryType: 'order',
        referenceId: 'order-1',
        receiptId: 'rcpt-1',
      });

      const req: any = {
        params: { deliveryKey: 'job-1' },
        body: { leaseToken: 'lease-abc', playerSteamId: 'steam-1', payloadHash: 'hash-1', localJournalReceiptId: 'rcpt-DUPLICATE' },
        serverId: 1,
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.completeDelivery(req, res, next);

      // No second deliver: no job update, no order update.
      expect(db.deliveryJob.updateMany).not.toHaveBeenCalled();
      expect(db.order.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        duplicate: true,
        receiptId: 'rcpt-1', // original receipt, NOT the duplicate's
      }));
    });

    it('a callback that loses the completion race still gets the original receipt (no double-deliver)', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', leaseToken: 'lease-abc',
        playerSteamId: 'steam-1', payloadHash: 'hash-1', deliveryType: 'order', referenceId: 'order-1',
      });
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race
      db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ id: 'job-1', status: 'completed', receiptId: 'rcpt-winner' });
      db.$transaction.mockImplementationOnce((callback: any) => callback(db));

      const req: any = {
        params: { deliveryKey: 'job-1' },
        body: { leaseToken: 'lease-abc', playerSteamId: 'steam-1', payloadHash: 'hash-1', localJournalReceiptId: 'rcpt-loser' },
        serverId: 1,
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.completeDelivery(req, res, next);

      expect(db.order.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true, receiptId: 'rcpt-winner' }));
    });

    it('rejects a complete with an invalid lease token on a still-pending job', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', leaseToken: 'real-lease',
        playerSteamId: 'steam-1', payloadHash: 'hash-1', deliveryType: 'order', referenceId: 'order-1',
      });

      const req: any = {
        params: { deliveryKey: 'job-1' },
        body: { leaseToken: 'WRONG', playerSteamId: 'steam-1', payloadHash: 'hash-1', localJournalReceiptId: 'r' },
        serverId: 1,
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.completeDelivery(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Invalid lease token' }));
    });
  });

  describe('failDelivery retry & dead-letter', () => {
    it('transient failure under the limit -> pending with backoff + order delivering -> queued', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', leaseToken: 'lease-abc', attempts: 1, maxAttempts: DEFAULT_MAX_ATTEMPTS,
        deliveryType: 'order', referenceId: 'order-1',
      });
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
      db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ id: 'job-1', status: 'pending', attempts: 1 });
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'delivering' });
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});
      db.$transaction.mockImplementationOnce((callback: any) => callback(db));

      const req: any = { params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc', error: 'player offline mid-give' }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.failDelivery(req, res, next);

      // job goes back to pending with a backoff window
      expect(db.deliveryJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'job-1', status: 'leased', leaseToken: 'lease-abc' },
        data: expect.objectContaining({ status: 'pending', nextRetryAt: expect.any(Date) }),
      }));
      // order moves delivering -> queued (retryable)
      expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: expect.objectContaining({ status: 'queued' }) });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retry: true, deadLetter: false }));
    });

    it('failure at the attempt limit -> dead_letter + order -> failed (refundable)', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', leaseToken: 'lease-abc', attempts: DEFAULT_MAX_ATTEMPTS, maxAttempts: DEFAULT_MAX_ATTEMPTS,
        deliveryType: 'order', referenceId: 'order-1',
      });
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
      db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ id: 'job-1', status: 'dead_letter', attempts: DEFAULT_MAX_ATTEMPTS });
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'delivering' });
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});
      db.$transaction.mockImplementationOnce((callback: any) => callback(db));

      const req: any = { params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc', error: 'permanent' }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.failDelivery(req, res, next);

      expect(db.deliveryJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'dead_letter', nextRetryAt: null }),
      }));
      expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: expect.objectContaining({ status: 'failed' }) });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retry: false, deadLetter: true }));
    });

    it('failing an already-completed job is an idempotent no-op success (never un-delivers)', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({ id: 'job-1', status: 'completed', leaseToken: 'lease-abc', attempts: 1 });

      const req: any = { params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc', error: 'late fail' }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.failDelivery(req, res, next);

      expect(db.deliveryJob.update).not.toHaveBeenCalled();
      expect(db.order.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: true }));
    });
  });

  describe('releaseDelivery (player offline)', () => {
    it('returns the job to pending and order delivering -> queued without consuming an attempt', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', leaseToken: 'lease-abc', deliveryType: 'order', referenceId: 'order-1',
      });
      db.deliveryJob.update.mockResolvedValueOnce({});
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'delivering' });
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});

      const req: any = { params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc' }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.releaseDelivery(req, res, next);

      expect(db.deliveryJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', leaseToken: null }),
      }));
      expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'queued' } });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('claimDeliveries binds order to delivering', () => {
    it('claims a pending job, moves order queued -> delivering and records claimedAt', async () => {
      db.order.findMany.mockResolvedValueOnce([]); // no legacy pending orders to sync
      db.deliveryJob.findMany.mockResolvedValueOnce([
        { id: 'job-1', status: 'pending', leaseToken: null, deliveryType: 'order', referenceId: 'order-1', playerSteamId: 'steam-1', payloadHash: 'h', payload: {} },
      ]);
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
      db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'job-1', status: 'leased', deliveryType: 'order', referenceId: 'order-1', playerSteamId: 'steam-1', payloadHash: 'h', payload: {}, attempts: 1,
      });
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'queued' });
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});

      const req: any = { body: { serverId: 1 }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await plugin.claimDeliveries(req, res, next);

      expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: expect.objectContaining({ status: 'delivering' }) });
      expect(db.fulfillment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { orderId: 'order-1' },
        data: expect.objectContaining({ status: 'claimed' }),
      }));
      const claimed = res.json.mock.calls[0][0];
      expect(claimed).toHaveLength(1);
      expect(claimed[0].deliveryKey).toBe('job-1');
    });
  });
});
