import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { AuthController } from '../../src/controllers/auth.controller.js';

const authController = new AuthController();
const db = prisma as any;

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
};

describe('IRIS ID — account linking proof-of-control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
    process.env.STEAM_RETURN_URL = 'https://example.test/api/auth/steam/callback';
    process.env.FRONTEND_URL = 'https://shop.example.test';
  });

  it('rejects a browser-supplied proof method without a verified callback cookie', async () => {
    const req: any = { user: { id: 'u1' }, cookies: {}, body: { steamId: '76561198000000001', proof: { method: 'steam_openid' } } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkSteam(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('verified Steam OpenID callback'),
    }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('keeps Epic linking disabled until verified provider OAuth exists', async () => {
    const req: any = { user: { id: 'u1' }, body: { epicId: 'e1', proof: { method: 'username' } } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkEpic(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 501 }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('links Steam only after Steam validates the OpenID callback server-to-server', async () => {
    const steamId = '76561198000000001';
    const state = 'state-from-http-only-cookie';
    const returnTo = `${process.env.STEAM_RETURN_URL}?state=${state}`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'),
    }));

    const callbackReq: any = {
      cookies: { steam_oauth_state: state },
      query: {
        state,
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        // Steam's documented claimed-id format uses HTTP even though the
        // provider endpoint and server-to-server verification use HTTPS.
        'openid.claimed_id': `http://steamcommunity.com/openid/id/${steamId}`,
        'openid.identity': `http://steamcommunity.com/openid/id/${steamId}`,
        'openid.return_to': returnTo,
        'openid.response_nonce': '2026-07-11T00:00:00Znonce',
        'openid.assoc_handle': '123',
        'openid.signed': 'signed,fields',
        'openid.sig': 'provider-signature',
      },
    };
    const callbackRes = mockRes();
    const callbackNext = vi.fn();
    await authController.steamCallback(callbackReq, callbackRes, callbackNext);
    expect(callbackNext).not.toHaveBeenCalled();

    const proofCookie = callbackRes.cookie.mock.calls.find((call: any[]) => call[0] === 'pending_steam_proof')?.[1];
    expect(proofCookie).toBeTruthy();
    db.user.findUnique.mockResolvedValueOnce(null); // steamId not taken
    const tx = {
      user: { update: vi.fn().mockResolvedValue({ id: 'u1', steamId, discordUsername: 'd' }) },
      legacyBalanceClaim: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    const req: any = { user: { id: 'u1' }, cookies: { pending_steam_proof: proofCookie }, body: { steamId } };
    const res = mockRes();
    const next = vi.fn();

    await authController.linkSteam(req, res, next);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { steamId } });
    expect(res.clearCookie).toHaveBeenCalledWith('pending_steam_proof', { path: '/api/auth' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('builds a Steam OpenID request from the configured callback realm', () => {
    process.env.STEAM_REALM = 'http://localhost:3001';
    process.env.STEAM_RETURN_URL = 'http://localhost:3001/api/auth/steam/callback';
    const req: any = {};
    const res = mockRes();

    authController.steamAuth(req, res);

    const redirect = new URL(res.redirect.mock.calls[0][0]);
    expect(`${redirect.origin}${redirect.pathname}`).toBe('https://steamcommunity.com/openid/login');
    expect(redirect.searchParams.get('openid.realm')).toBe('http://localhost:3001');
    expect(redirect.searchParams.get('openid.return_to')).toMatch(
      /^http:\/\/localhost:3001\/api\/auth\/steam\/callback\?state=[A-Za-z0-9_-]+$/,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'steam_oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/auth' }),
    );
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
