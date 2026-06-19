import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../../src/config/database.js';
import { AuthController } from '../../src/controllers/auth.controller.js';

const authController = new AuthController();
const db = prisma as any;

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../contracts/fixtures/linked-identities.json'), 'utf8'),
);

describe('GET /auth/identities — LinkedIdentitiesResponse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all three providers, marking unlinked ones with null + canUnlink:false', async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      discordId: 'd-123',
      discordUsername: 'IrisPlayerOne',
      steamId: '76561198000000001',
      epicId: null,
      createdAt: new Date('2026-05-01T09:12:00.000Z'),
    });

    const req: any = { user: { id: 'u1' } };
    const res = mockRes();
    const next = vi.fn();
    await authController.getLinkedIdentities(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.userId).toBe('u1');
    expect(body.identities.map((i: any) => i.provider)).toEqual(['discord', 'steam', 'epic']);

    const epic = body.identities.find((i: any) => i.provider === 'epic');
    expect(epic.providerAccountId).toBeNull();
    expect(epic.canUnlink).toBe(false);

    // Two providers linked -> each linked one can be unlinked.
    const discord = body.identities.find((i: any) => i.provider === 'discord');
    const steam = body.identities.find((i: any) => i.provider === 'steam');
    expect(discord.canUnlink).toBe(true);
    expect(steam.canUnlink).toBe(true);
  });

  it('matches the published fixture shape (keys + rules)', async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: fixture.userId,
      discordId: '284736510028374016',
      discordUsername: 'IrisPlayerOne',
      steamId: '76561198000000001',
      epicId: null,
      createdAt: new Date('2026-05-01T09:12:00.000Z'),
    });

    const req: any = { user: { id: fixture.userId } };
    const res = mockRes();
    const next = vi.fn();
    await authController.getLinkedIdentities(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual(Object.keys(fixture).sort());
    expect(body.rules).toEqual(fixture.rules);
    // Identity object keys match the fixture's identity object keys.
    const bodyKeys = Object.keys(body.identities[0]).sort();
    const fixtureKeys = Object.keys(fixture.identities[0]).sort();
    expect(bodyKeys).toEqual(fixtureKeys);
  });

  it('forbids unlinking the last remaining provider (canUnlink:false when only one linked)', async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      discordId: '',
      discordUsername: null,
      steamId: 's-only',
      epicId: null,
      createdAt: new Date('2026-05-01T09:12:00.000Z'),
    });

    const req: any = { user: { id: 'u2' } };
    const res = mockRes();
    const next = vi.fn();
    await authController.getLinkedIdentities(req, res, next);

    const body = res.json.mock.calls[0][0];
    const steam = body.identities.find((i: any) => i.provider === 'steam');
    expect(steam.providerAccountId).toBe('s-only');
    expect(steam.canUnlink).toBe(false); // last linked provider must remain
  });
});
