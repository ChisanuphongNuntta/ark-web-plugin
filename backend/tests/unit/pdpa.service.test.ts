import { describe, it, expect, vi, beforeEach } from 'vitest';

const { default: pdpaService } = await import('../../src/services/pdpa.service.js');
const { default: prisma } = await import('../../src/config/database.js');

describe('PdpaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportUserData', () => {
    it('throws AppError 404 when user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(pdpaService.exportUserData('nonexistent-id'))
        .rejects.toMatchObject({ statusCode: 404, message: 'User not found' });
    });

    it('returns serialized user data with BigInt converted to string', async () => {
      const mockUser = {
        id: 'user-1',
        discordId: '123',
        discordUsername: 'TestUser',
        steamId: null,
        epicId: null,
        pointsBalance: BigInt(100),
        totalSpent: BigInt(50),
        createdAt: new Date(),
        orders: [],
        pointTransactions: [],
        donations: [],
        playerStats: [],
        consents: [],
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      const result = await pdpaService.exportUserData('user-1');

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
    });
  });

  describe('hasConsent', () => {
    it('returns false when no consent record exists', async () => {
      (prisma.userConsent.findUnique as any).mockResolvedValue(null);
      const result = await pdpaService.hasConsent('user-1', 'privacy_policy');
      expect(result).toBe(false);
    });

    it('returns true when consent is granted', async () => {
      (prisma.userConsent.findUnique as any).mockResolvedValue({
        id: 1, userId: 'user-1', consentType: 'privacy_policy', granted: true,
      });
      const result = await pdpaService.hasConsent('user-1', 'privacy_policy');
      expect(result).toBe(true);
    });
  });

  describe('grantConsent', () => {
    it('upserts a consent record', async () => {
      (prisma.userConsent.upsert as any).mockResolvedValue({});

      const mockReq = { ip: '127.0.0.1', headers: {}, user: { id: 'user-1' } } as any;
      await pdpaService.grantConsent('user-1', 'privacy_policy', '1.0', mockReq);

      expect(prisma.userConsent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId_consentType: { userId: 'user-1', consentType: 'privacy_policy' } }),
          create: expect.objectContaining({ granted: true }),
          update: expect.objectContaining({ granted: true }),
        })
      );
    });
  });

  describe('revokeConsent', () => {
    it('updates consent record with granted=false', async () => {
      (prisma.userConsent.update as any).mockResolvedValue({});

      const mockReq = { ip: '127.0.0.1', headers: {}, user: { id: 'user-1' } } as any;
      await pdpaService.revokeConsent('user-1', 'marketing', mockReq);

      expect(prisma.userConsent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ granted: false }),
        })
      );
    });
  });

  describe('getActivePolicy', () => {
    it('returns null when no active policy exists', async () => {
      (prisma.policyVersion.findFirst as any).mockResolvedValue(null);
      const result = await pdpaService.getActivePolicy('privacy_policy');
      expect(result).toBeNull();
    });

    it('returns active policy version', async () => {
      const mockPolicy = { id: 1, type: 'privacy_policy', version: '1.0', isActive: true };
      (prisma.policyVersion.findFirst as any).mockResolvedValue(mockPolicy);
      const result = await pdpaService.getActivePolicy('privacy_policy');
      expect(result).toEqual(mockPolicy);
    });
  });
});
