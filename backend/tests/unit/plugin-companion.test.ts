import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import pluginCompanionService from '../../src/services/pluginCompanion.service.js';

const db = prisma as any;

describe('CR-PLUGIN-007/008 — game companion (server-scoped, read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('player wallet', () => {
    it('returns WalletBalance (decimal strings) for a linked player on this server', async () => {
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1', steamId: 's1', isBanned: false });
      db.order.count.mockResolvedValueOnce(1); // associated via order
      db.deliveryJob.count.mockResolvedValueOnce(0);
      // walletService.getBalance -> ensureUserAccounts (findUnique) + findMany
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1', pointsBalance: 13500n });
      db.walletAccount.upsert.mockResolvedValue({});
      db.walletAccount.findMany.mockResolvedValueOnce([
        { type: 'available', balance: 12500n },
        { type: 'held', balance: 1000n },
      ]);

      const result = await pluginCompanionService.getPlayerWallet('s1', 7);
      expect(result.currency).toBe('IC');
      expect(result.accounts).toEqual({ available: '12500', held: '1000' });
      expect(result.total).toBe('13500');
    });

    it('404s when the steamId is not linked to any IRIS account', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      await expect(pluginCompanionService.getPlayerWallet('unknown', 7)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Player not linked to an IRIS account',
      });
    });

    it('403s when the linked player is not associated with the calling server', async () => {
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1', steamId: 's1', isBanned: false });
      db.order.count.mockResolvedValueOnce(0);
      db.deliveryJob.count.mockResolvedValueOnce(0);
      await expect(pluginCompanionService.getPlayerWallet('s1', 7)).rejects.toMatchObject({
        statusCode: 403,
        message: 'Player is not associated with this server',
      });
    });
  });

  describe('pending deliveries', () => {
    it('counts non-completed jobs for the player on this server', async () => {
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1', steamId: 's1', isBanned: false });
      db.order.count.mockResolvedValueOnce(0);
      db.deliveryJob.count.mockResolvedValueOnce(3); // resolveServerPlayer association check
      db.deliveryJob.count.mockResolvedValueOnce(2); // pending count

      const result = await pluginCompanionService.getPendingDeliveries('s1', 7);
      expect(result).toEqual({ pending: 2 });
    });
  });

  describe('wallet events', () => {
    it('emits server-scoped events with additive playerSteamId + userId and a cursor', async () => {
      db.deliveryJob.findMany.mockResolvedValueOnce([{ playerSteamId: 's1' }]);
      db.user.findMany.mockResolvedValueOnce([{ id: 'u1', steamId: 's1' }]);
      db.ledgerTransaction.findMany.mockResolvedValueOnce([
        {
          id: 'tx1',
          type: 'topup_credit',
          referenceType: 'external',
          referenceId: 'pi_1',
          createdAt: new Date('2026-06-20T04:15:30.000Z'),
          entries: [
            {
              amount: 5000n,
              account: { userId: 'u1', key: 'user:u1:available:IC', currency: 'IC' },
            },
          ],
        },
      ]);

      const result = await pluginCompanionService.getWalletEvents(7, undefined, 50);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      const ev = result.events[0];
      expect(ev.eventType).toBe('wallet.transaction.posted');
      expect(ev.playerSteamId).toBe('s1');
      expect(ev.userId).toBe('u1');
      expect(ev.entries[0]).toEqual({ accountKey: 'user:u1:available:IC', amount: '5000', currency: 'IC' });
      expect(result.lastTimestamp).toBe('2026-06-20T04:15:30.000Z');
    });

    it('returns an empty page (no events) when the server has no associated players', async () => {
      db.deliveryJob.findMany.mockResolvedValueOnce([]);
      const result = await pluginCompanionService.getWalletEvents(7, '2026-06-20T00:00:00.000Z');
      expect(result).toEqual({ success: true, events: [], lastTimestamp: '2026-06-20T00:00:00.000Z' });
      expect(db.ledgerTransaction.findMany).not.toHaveBeenCalled();
    });

    it('passes the since cursor as a strict-greater-than createdAt filter', async () => {
      db.deliveryJob.findMany.mockResolvedValueOnce([{ playerSteamId: 's1' }]);
      db.user.findMany.mockResolvedValueOnce([{ id: 'u1', steamId: 's1' }]);
      db.ledgerTransaction.findMany.mockResolvedValueOnce([]);

      await pluginCompanionService.getWalletEvents(7, '2026-06-20T03:06:00.000Z');
      const callArg = db.ledgerTransaction.findMany.mock.calls[0][0];
      expect(callArg.where.createdAt.gt).toBeInstanceOf(Date);
      expect(callArg.where.createdAt.gt.toISOString()).toBe('2026-06-20T03:06:00.000Z');
      expect(callArg.orderBy).toEqual({ createdAt: 'asc' });
    });
  });
});
