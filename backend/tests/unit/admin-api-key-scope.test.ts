import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { AdminController } from '../../src/controllers/admin.controller.js';

const db = prisma as any;
const controller = new AdminController();

const request = () => ({
  user: { id: 'admin-1', role: 'server_admin', apiKeyServerId: 1 },
  params: { userId: 'target-user' },
});

describe('server-admin API-key scope', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [name, invoke] of [
    ['read', (req: any, res: any, next: any) => controller.getApiKeyByUser(req, res, next)],
    ['reset IP', (req: any, res: any, next: any) => controller.resetApiKeyIp(req, res, next)],
    ['revoke', (req: any, res: any, next: any) => controller.revokeApiKey(req, res, next)],
  ] as const) {
    it(`blocks ${name} for a user assigned to another server`, async () => {
      db.user.findUnique.mockResolvedValueOnce({ apiKeyServerId: 2 });
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await invoke(request(), res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(db.user.update).not.toHaveBeenCalled();
    });
  }
});
