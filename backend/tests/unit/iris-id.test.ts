import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('IRIS ID — account linking proof-of-control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('rejects linking that attempts to merge by email', async () => {
    const req: any = { user: { id: 'u1' }, body: { steamId: 's1', proof: { method: 'email' } } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkSteam(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('proof-of-control is required'),
    }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects linking by name/username for epic', async () => {
    const req: any = { user: { id: 'u1' }, body: { epicId: 'e1', proof: { method: 'username' } } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkEpic(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('requires proof-of-control in production', async () => {
    process.env.NODE_ENV = 'production';
    const req: any = { user: { id: 'u1' }, body: { steamId: 's1' } }; // no proof
    const res = mockRes();
    const next = vi.fn();

    await authController.linkSteam(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('Proof-of-control is required'),
    }));
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('links Steam with a valid steam_openid proof', async () => {
    db.user.findUnique.mockResolvedValueOnce(null); // steamId not taken
    db.user.update.mockResolvedValueOnce({ id: 'u1', steamId: 's1', discordUsername: 'd' });

    const req: any = { user: { id: 'u1' }, body: { steamId: 's1', proof: { method: 'steam_openid', claimedId: 'https://steamcommunity.com/openid/id/s1' } } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkSteam(req, res, next);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { steamId: 's1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('IRIS ID — recovery stub', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a pending proof-of-control ticket and never confirms account existence', async () => {
    const req: any = { body: { provider: 'discord', providerAccountId: 'abc' } };
    const res = mockRes();
    const next = vi.fn();

    await authController.requestRecovery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(202);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('pending_proof_of_control');
    expect(body.recoveryTicketId).toBeTruthy();
    expect(body.challengeNonce).toBeTruthy();
    // Must not leak whether the account exists
    expect(JSON.stringify(body)).not.toContain('exists');
  });

  it('rejects an unknown provider', async () => {
    const req: any = { body: { provider: 'facebook', providerAccountId: 'abc' } };
    const res = mockRes();
    const next = vi.fn();

    await authController.requestRecovery(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('IRIS ID — session risk flags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags non-current sessions on a new IP / device', async () => {
    db.userSession.findMany.mockResolvedValueOnce([
      { id: 's-current', ipAddress: '203.0.113.10', userAgent: 'IRIS-Web', isActive: true },
      { id: 's-other', ipAddress: '198.51.100.42', userAgent: 'IRIS-Mobile', isActive: true },
    ]);

    const req: any = { user: { id: 'u1' }, ip: '203.0.113.10', headers: { 'user-agent': 'IRIS-Web' } };
    const res = mockRes();
    const next = vi.fn();

    await authController.listSessions(req, res, next);
    const sessions = res.json.mock.calls[0][0];

    const current = sessions.find((s: any) => s.id === 's-current');
    const other = sessions.find((s: any) => s.id === 's-other');
    expect(current.isCurrent).toBe(true);
    expect(current.riskFlag).toBe(false);
    expect(other.isCurrent).toBe(false);
    expect(other.riskFlag).toBe(true);
    expect(other.riskReasons).toEqual(expect.arrayContaining(['new_ip', 'new_device']));
  });
});
