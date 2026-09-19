import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { OrderController } from '../../src/controllers/order.controller.js';
import { DinoMarketController } from '../../src/controllers/dino-market.controller.js';
import { AdminController } from '../../src/controllers/admin.controller.js';
import { UserController } from '../../src/controllers/user.controller.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import walletService from '../../src/services/wallet.service.js';

// The IRIS Wallet double-entry ledger is the single source of truth. These tests prove
// that the four controllers migrated away from the legacy dual-write (mutating
// User.pointsBalance directly AND inserting a PointTransaction row) and now move money
// exclusively through walletService.post with balanced, idempotent entries.
vi.mock('../../src/services/wallet.service.js', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    ensureUserAccounts: vi.fn().mockResolvedValue(undefined),
    getBalance: vi.fn(),
  },
  userAccountKey: (userId: string, type: string) => `user:${userId}:${type}:IC`,
  SYSTEM_ACCOUNTS: {
    issuance: 'system:issuance:IC',
    revenue: 'system:revenue:IC',
    clearing: 'system:clearing:IC',
  },
}));

// canAccessUser gates the admin endpoints; allow access in these unit tests.
vi.mock('../../src/services/serverAdmin.service.js', () => ({
  ServerAdminService: {
    canAccessUser: vi.fn().mockResolvedValue(true),
  },
}));

const db = prisma as any;
const post = vi.mocked(walletService.post);

const orderController = new OrderController();
const dinoController = new DinoMarketController();
const adminController = new AdminController();
const userController = new UserController();
const pluginController = new PluginController();

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

// Sum of every entry amount in a posted ledger transaction — must always be zero.
const entriesNet = (entries: Array<{ amount: bigint }>) => entries.reduce((s, e) => s + e.amount, 0n);

describe('Wallet ledger migration — controllers post to the double-entry ledger (no dual-write)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_LEGACY_SINGLE_ORDER = 'true';
    post.mockResolvedValue({} as any);
    vi.mocked(walletService.ensureUserAccounts).mockResolvedValue(undefined as any);
  });

  describe('OrderController.createOrder (Official Store purchase)', () => {
    it('debits buyer available -> platform revenue and writes NO PointTransaction', async () => {
      db.product.findUnique.mockResolvedValueOnce({ id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null });
      db.user.findUnique
        .mockResolvedValueOnce({ id: 'u1', pointsBalance: 1000n }) // balance pre-check
        .mockResolvedValueOnce({ pointsBalance: 800n });            // post-tx projection read
      db.server.findUnique.mockResolvedValueOnce({ id: 2, isActive: true });

      const tx: any = {
        order: { create: vi.fn().mockResolvedValue({ id: 'o1', product: {}, server: {} }) },
        user: { update: vi.fn().mockResolvedValue({}) },
        product: { update: vi.fn().mockResolvedValue({}) },
        pointTransaction: { create: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 2, quantity: 2 } };
      const res = mockRes();
      const next = vi.fn();

      await orderController.createOrder(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(tx.pointTransaction.create).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(1);
      const [input, client] = post.mock.calls[0];
      expect(client).toBe(tx);
      expect(input).toMatchObject({ idempotencyKey: 'order:purchase:o1', type: 'order_purchase', referenceId: 'o1' });
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'user:u1:available:IC', amount: -200n },
        { accountKey: 'system:revenue:IC', amount: 200n },
      ]));
      // totalSpent is a lifetime stat, kept current separately from the money ledger.
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { totalSpent: { increment: 200 } } });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, newBalance: 800 }));
    });

    it('rejects with 400 before posting when the projected balance is insufficient', async () => {
      db.product.findUnique.mockResolvedValueOnce({ id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null });
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1', pointsBalance: 50n });
      db.server.findUnique.mockResolvedValueOnce({ id: 2, isActive: true });

      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 2, quantity: 1 } };
      const res = mockRes();
      const next = vi.fn();

      await orderController.createOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Insufficient points' }));
      expect(post).not.toHaveBeenCalled();
    });

    it('rejects a negative quantity before reading product or posting money', async () => {
      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 2, quantity: -5 } };
      const res = mockRes();
      const next = vi.fn();

      await orderController.createOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(db.product.findUnique).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('DinoMarketController P2P escrow (§17 — seller is NOT paid before delivery)', () => {
    it('buyDino HOLDS the price into the clearing account and does not credit the seller', async () => {
      db.dinoListing.findUnique.mockResolvedValueOnce({
        id: 'list-1', status: 'listed', sellerId: 's1', price: 200, species: 'Rex', level: 100,
        dinoName: 'Rexy', cryopodData: Buffer.from('native-dino'), seller: { id: 's1', pointsBalance: 0n },
      });
      db.user.findUnique.mockResolvedValueOnce({ id: 'b1', pointsBalance: 1000n, steamId: '76561198000000001' });
      db.server.findUnique.mockReset();
      db.server.findUnique.mockResolvedValueOnce({ id: 1, isActive: true, drainMode: false, capabilities: ['delivery.dino.v2'] });

      const tx: any = {
        dinoListing: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        user: { update: vi.fn().mockResolvedValue({}) },
        dinoTradeHistory: { create: vi.fn().mockResolvedValue({}) },
        deliveryJob: { create: vi.fn().mockResolvedValue({}) },
        pointTransaction: { create: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'b1' }, params: { id: 'list-1' }, body: { serverId: 1 } };
      const res = mockRes();
      const next = vi.fn();

      await dinoController.buyDino(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(tx.pointTransaction.create).not.toHaveBeenCalled();
      // Conditional listed -> sold transition prevents double-buy.
      expect(tx.dinoListing.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'list-1', status: 'listed' },
      }));
      expect(post).toHaveBeenCalledTimes(1);
      const [input] = post.mock.calls[0];
      expect(input).toMatchObject({ idempotencyKey: 'dino:escrow:hold:list-1', type: 'dino_escrow_hold' });
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'user:b1:available:IC', amount: -200n },
        { accountKey: 'system:clearing:IC', amount: 200n },
      ]));
      // No entry credits the seller at purchase time.
      expect(input.entries.some((e: any) => e.accountKey === 'user:s1:available:IC')).toBe(false);
    });

    it('durable delivery completion RELEASES escrow: clearing -> seller net + platform fee', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'dino-market:list-1', status: 'leased', leaseToken: 'lease-1', playerSteamId: '76561198000000001',
        payloadHash: 'hash-1', deliveryType: 'dino_marketplace', referenceId: 'list-1', serverId: 3,
      });

      const tx: any = {
        deliveryJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn() },
        dinoListing: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 'list-1', status: 'sold', deliveryStatus: 'pending', buyerId: 'b1', sellerId: 's1',
            price: 200, species: 'Rex', level: 100,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = {
        params: { deliveryKey: 'dino-market:list-1' },
        body: {
          leaseToken: 'lease-1', playerSteamId: '76561198000000001', payloadHash: 'hash-1',
          localJournalReceiptId: 'dino-marketplace:dino-market:list-1',
        },
        serverId: 3,
      };
      const res = mockRes();
      const next = vi.fn();

      await pluginController.completeDelivery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(tx.dinoListing.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'list-1', status: 'sold', deliveryStatus: 'pending' },
      }));
      expect(post).toHaveBeenCalledTimes(1);
      const [input] = post.mock.calls[0];
      expect(input).toMatchObject({ idempotencyKey: 'dino:escrow:release:list-1', type: 'dino_escrow_release' });
      // 5% of 200 = 10 fee, 190 to seller.
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'system:clearing:IC', amount: -200n },
        { accountKey: 'user:s1:available:IC', amount: 190n },
        { accountKey: 'system:revenue:IC', amount: 10n },
      ]));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: false }));
    });

    it('buyDino loses the listed->sold race and fails with 400 (no escrow held)', async () => {
      db.dinoListing.findUnique.mockResolvedValueOnce({
        id: 'list-1', status: 'listed', sellerId: 's1', price: 200, species: 'Rex', level: 100,
        cryopodData: Buffer.from('native-dino'), seller: { id: 's1' },
      });
      db.user.findUnique.mockResolvedValueOnce({ id: 'b1', pointsBalance: 1000n, steamId: '76561198000000001' });
      db.server.findUnique.mockReset();
      db.server.findUnique.mockResolvedValueOnce({ id: 1, isActive: true, drainMode: false, capabilities: ['delivery.dino.v2'] });

      const tx: any = {
        dinoListing: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, // another buyer won
        user: { update: vi.fn() },
        dinoTradeHistory: { create: vi.fn() },
        deliveryJob: { create: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'b1' }, params: { id: 'list-1' }, body: { serverId: 1 } };
      const res = mockRes();
      const next = vi.fn();

      await dinoController.buyDino(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(post).not.toHaveBeenCalled();
      expect(tx.dinoTradeHistory.create).not.toHaveBeenCalled();
    });

    it('durable delivery completion is idempotent after settlement', async () => {
      db.deliveryJob.findUnique.mockResolvedValueOnce({
        id: 'dino-market:list-1', status: 'completed', receiptId: 'receipt-1',
      });

      const req: any = { params: { deliveryKey: 'dino-market:list-1' }, body: {}, serverId: 3 };
      const res = mockRes();
      const next = vi.fn();

      await pluginController.completeDelivery(req, res, next);

      expect(post).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: true, receiptId: 'receipt-1' }));
    });
  });

  describe('AdminController.adjustPoints (manual credit/debit)', () => {
    it('positive amount mints from issuance into the user available balance', async () => {
      db.$transaction.mockImplementationOnce((cb: any) => cb({}));
      db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 1500n });

      const req: any = { user: { id: 'admin1', discordId: 'admin-d', role: 'root' }, params: { id: 'u1' }, body: { amount: 500, reason: 'goodwill' } };
      const res = mockRes();
      const next = vi.fn();

      await adminController.adjustPoints(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(1);
      const [input] = post.mock.calls[0];
      expect(input).toMatchObject({ type: 'admin_adjustment', referenceId: 'u1', createdBy: 'admin1', description: 'goodwill' });
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'user:u1:available:IC', amount: 500n },
        { accountKey: 'system:issuance:IC', amount: -500n },
      ]));
      expect(res.json).toHaveBeenCalledWith({ success: true, newBalance: 1500 });
    });

    it('negative amount burns from the user available balance back to issuance', async () => {
      db.$transaction.mockImplementationOnce((cb: any) => cb({}));
      db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 700n });

      const req: any = { user: { id: 'admin1', discordId: 'admin-d', role: 'root' }, params: { id: 'u1' }, body: { amount: -300 } };
      const res = mockRes();
      const next = vi.fn();

      await adminController.adjustPoints(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const [input] = post.mock.calls[0];
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'user:u1:available:IC', amount: -300n },
        { accountKey: 'system:issuance:IC', amount: 300n },
      ]));
    });

    it('honours a caller-supplied idempotencyKey for retry-safe admin tooling', async () => {
      db.$transaction.mockImplementationOnce((cb: any) => cb({}));
      db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 100n });

      const req: any = { user: { id: 'admin1', discordId: 'admin-d', role: 'root' }, params: { id: 'u1' }, body: { amount: 100, idempotencyKey: 'manual-credit-42' } };
      const res = mockRes();
      const next = vi.fn();

      await adminController.adjustPoints(req, res, next);

      expect(post.mock.calls[0][0]).toMatchObject({ idempotencyKey: 'manual-credit-42' });
    });

    it('rejects a zero adjustment before posting', async () => {
      const req: any = { user: { id: 'admin1', discordId: 'admin-d', role: 'root' }, params: { id: 'u1' }, body: { amount: 0 } };
      const res = mockRes();
      const next = vi.fn();

      await adminController.adjustPoints(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('AdminController.refundOrder', () => {
    it('refunds platform revenue -> buyer refundable (matches OrderController refund path)', async () => {
      db.order.findUnique.mockResolvedValueOnce({ id: 'o9', userId: 'u1', totalPrice: 250, status: 'delivered', user: { id: 'u1' } });

      const tx: any = {
        order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        pointTransaction: { create: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = {
        user: { id: 'admin1', discordId: 'admin-d' },
        params: { id: 'o9' },
        body: { inventoryReclaimed: true, reclaimReceipt: 'reclaim-0009' },
      };
      const res = mockRes();
      const next = vi.fn();

      await adminController.refundOrder(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(tx.pointTransaction.create).not.toHaveBeenCalled();
      const [input] = post.mock.calls[0];
      expect(input).toMatchObject({ idempotencyKey: 'order:refund:o9', type: 'order_refund' });
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'system:revenue:IC', amount: -250n },
        { accountKey: 'user:u1:refundable:IC', amount: 250n },
      ]));
      expect(res.json).toHaveBeenCalledWith({ success: true, refundedAmount: 250 });
    });
  });

  describe('UserController.claimPoints (gameplay rewards)', () => {
    it('mints earned points from issuance into available and resets stats; no PointTransaction', async () => {
      const tx: any = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'u1', pointsBalance: 0n,
            playerStats: [
              { id: 'ps1', serverId: 1, playtimeMinutes: 120, dinosKilled: 5, resourcesHarvested: 3000n },
            ],
          }),
        },
        playerStats: { update: vi.fn().mockResolvedValue({}) },
        pointTransaction: { create: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));
      db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 28n }); // 20 (playtime) + 5 (kills) + 3 (harvest)

      const req: any = { user: { id: 'u1' } };
      const res = mockRes();
      const next = vi.fn();

      await userController.claimPoints(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(tx.pointTransaction.create).not.toHaveBeenCalled();
      expect(tx.playerStats.update).toHaveBeenCalledTimes(1);
      const [input] = post.mock.calls[0];
      expect(input).toMatchObject({ type: 'earn_playtime' });
      expect(entriesNet(input.entries)).toBe(0n);
      expect(input.entries).toEqual(expect.arrayContaining([
        { accountKey: 'system:issuance:IC', amount: -28n },
        { accountKey: 'user:u1:available:IC', amount: 28n },
      ]));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pointsEarned: 28, newBalance: 28 }));
    });

    it('claims nothing (and posts nothing) when there are no accrued stats', async () => {
      const tx: any = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'u1', pointsBalance: 0n,
            playerStats: [{ id: 'ps1', serverId: 1, playtimeMinutes: 10, dinosKilled: 0, resourcesHarvested: 0n }],
          }),
        },
        playerStats: { update: vi.fn() },
      };
      db.$transaction.mockImplementationOnce((cb: any) => cb(tx));

      const req: any = { user: { id: 'u1' } };
      const res = mockRes();
      const next = vi.fn();

      await userController.claimPoints(req, res, next);

      expect(post).not.toHaveBeenCalled();
      expect(tx.playerStats.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'No points to claim', pointsEarned: 0 });
    });
  });
});
