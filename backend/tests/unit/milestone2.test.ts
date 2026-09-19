import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import prisma from '../../src/config/database.js';
import { authenticateSignedPlugin } from '../../src/middlewares/auth.js';
import { AuthController } from '../../src/controllers/auth.controller.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import { encryptDeterministic } from '../../src/utils/encryption.js';

const authController = new AuthController();
const pluginController = new PluginController();
import redis from '../../src/config/redis.js';

// Mock Redis
vi.mock('../../src/config/redis.js', () => ({
  default: {
    set: vi.fn().mockResolvedValue('OK'),
  },
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

const db = prisma as any;

describe('Milestone 2 - IRIS ID & Signed Plugin Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HMAC Signed Request Middleware', () => {
    const mockRes = () => {
      const res: any = {};
      res.status = vi.fn().mockReturnValue(res);
      res.json = vi.fn().mockReturnValue(res);
      return res;
    };

    it('rejects requests with missing signature headers', async () => {
      const req: any = { headers: {}, method: 'POST', originalUrl: '/api/plugin/heartbeat' };
      const res = mockRes();
      const next = vi.fn();

      await authenticateSignedPlugin(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Missing required signed plugin headers' }));
    });

    it('rejects requests with clock drift > 5 minutes', async () => {
      const req: any = {
        headers: {
          'x-plugin-key-id': 'key-123',
          'x-plugin-version': '1.0',
          'x-request-timestamp': (Date.now() - 360000).toString(), // 6 minutes ago
          'x-request-nonce': 'nonce-string-12345678',
          'x-content-sha256': 'hash',
          'x-signature': 'sig',
        },
        method: 'POST',
        originalUrl: '/api/plugin/heartbeat',
      };
      const res = mockRes();
      const next = vi.fn();

      await authenticateSignedPlugin(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Clock drift limit exceeded' }));
    });

    it('rejects replayed nonces', async () => {
      vi.mocked(redis.set).mockResolvedValueOnce('FAIL'); // Mock replay

      const req: any = {
        headers: {
          'x-plugin-key-id': 'key-123',
          'x-plugin-version': '1.0',
          'x-request-timestamp': Date.now().toString(),
          'x-request-nonce': 'nonce-string-12345678',
          'x-content-sha256': 'hash',
          'x-signature': 'sig',
        },
        method: 'POST',
        originalUrl: '/api/plugin/heartbeat',
      };
      const res = mockRes();
      const next = vi.fn();

      await authenticateSignedPlugin(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Duplicate request (nonce replayed)' }));
    });
  });

  describe('IRIS ID Account Unlinking Constraints', () => {
    it('prevents unlinking Steam if no other provider linked', async () => {
      const user = { id: 'u1', discordId: '', steamId: 's1', epicId: null };
      db.user.findUniqueOrThrow.mockResolvedValueOnce(user);

      const req: any = { user: { id: 'u1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await authController.unlinkSteam(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: expect.stringContaining('Cannot unlink last identity provider') }));
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('allows unlinking Steam if Discord is linked', async () => {
      const user = { id: 'u1', discordId: 'd1', steamId: 's1', epicId: null };
      db.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      db.user.update.mockResolvedValueOnce({ id: 'u1', steamId: null });

      const req: any = { user: { id: 'u1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await authController.unlinkSteam(req, res, next);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { steamId: null },
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('Atomic Claim & Lease / Asset Locks', () => {
    it('claims pending orders and moves them to delivery_jobs', async () => {
      db.order.findMany.mockResolvedValueOnce([
        {
          id: 'order-1',
          serverId: 1,
          quantity: 1,
          product: { itemBlueprint: 'bp-path', quantity: 1, quality: 1, isBlueprint: false, name: 'Item Name' },
          user: { steamId: 'steam-123' },
        },
      ]);
      db.deliveryJob.findMany.mockResolvedValueOnce([]); // No jobs leased yet

      const req: any = { body: { serverId: 1 }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await pluginController.claimDeliveries(req, res, next);

      expect(db.deliveryJob.upsert).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('prepares asset lock successfully', async () => {
      process.env.ENABLE_DINO_TRADING = 'true';
      const steamId = '76561198000000001';
      const lock = { id: 'lock-1', species: 'Rex', level: 100, sellerSteamId: steamId, expiresAt: new Date() };
      db.dinoAssetLock.create.mockResolvedValueOnce(lock);
      db.server.findUnique.mockResolvedValueOnce({
        id: 1,
        capabilities: ['marketplace.asset-lock.v1', 'marketplace.dino-native.v2'],
      });

      const req: any = { body: { species: 'Rex', level: 100, sellerSteamId: steamId }, serverId: 1 };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await pluginController.prepareLock(req, res, next);
      expect(db.dinoAssetLock.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        assetLockId: 'lock-1',
        expiresAt: lock.expiresAt.toISOString(),
      });
    });

    it('confirms asset lock and creates listing', async () => {
      process.env.ENABLE_DINO_TRADING = 'true';
      const lock = { id: 'lock-1', species: 'Rex', level: 100, sellerSteamId: '76561198000000001', originServerId: 1, status: 'prepared', expiresAt: new Date(Date.now() + 100000) };
      db.dinoAssetLock.findUnique.mockResolvedValueOnce(lock);
      db.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      const tx: any = {
        dinoAssetLock: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
        dinoListing: { create: vi.fn().mockResolvedValue({ id: 'list-1' }) },
      };
      db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

      const req: any = {
        body: {
          assetLockId: 'lock-1',
          assetFingerprint: 'abcdef0123456789',
          price: 100,
          dinoDataVersion: 1,
          cryopodData: Buffer.from('native-dino').toString('base64'),
          dinoDataSize: Buffer.byteLength('native-dino'),
          dinoDataSha256: crypto.createHash('sha256').update('native-dino').digest('hex'),
        },
        serverId: 1,
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await pluginController.confirmLock(req, res, next);

      expect(tx.dinoListing.create).toHaveBeenCalled();
      expect(tx.dinoAssetLock.update).toHaveBeenCalledWith({
        where: { id: 'lock-1' },
        data: {
          status: 'confirmed',
          listingId: 'list-1',
        },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, listingId: 'list-1' });
    });
  });
});
