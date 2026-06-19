import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import prisma from '../../src/config/database.js';
import { authenticatePluginFlexible } from '../../src/middlewares/auth.js';
import { encryptDeterministic } from '../../src/utils/encryption.js';
import redis from '../../src/config/redis.js';

vi.mock('../../src/config/redis.js', () => ({
  default: { set: vi.fn().mockResolvedValue('OK') },
  redis: { set: vi.fn().mockResolvedValue('OK') },
}));

const db = prisma as any;

describe('CR-PLUGIN-006 — flexible legacy plugin auth (hmacAuth + X-API-Key overlap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.set).mockResolvedValue('OK');
    delete process.env.NODE_ENV;
    process.env.BYPASS_PLUGIN_IP_CHECK = 'true';
  });

  it('routes signed requests (X-Signature + X-Plugin-Key-Id) through the HMAC path', async () => {
    const keyId = 'pk_flex001';
    const secret = 'flex-secret-001';
    db.serverCredential.findUnique.mockResolvedValueOnce({
      id: 'cred-flex-1',
      serverId: 5,
      keyId,
      secretEnc: encryptDeterministic(secret),
      status: 'active',
    });
    db.server.findUnique.mockResolvedValueOnce({ id: 5, name: 'srv5', isActive: true });

    const method = 'GET';
    const path = '/api/plugin/verify';
    const contentSha = crypto.createHash('sha256').update('').digest('hex');
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(12).toString('hex');
    const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${contentSha}`;
    const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

    const req: any = {
      headers: {
        'x-plugin-key-id': keyId,
        'x-plugin-version': '1.0',
        'x-request-timestamp': timestamp,
        'x-request-nonce': nonce,
        'x-content-sha256': contentSha,
        'x-signature': signature,
      },
      method,
      originalUrl: path,
      query: {},
      body: {},
      socket: { remoteAddress: '203.0.113.9' },
      ip: '203.0.113.9',
    };
    const next = vi.fn();
    await authenticatePluginFlexible(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.serverId).toBe(5);
    expect(req.pluginCredential).toMatchObject({ keyId, serverId: 5 });
  });

  it('falls back to the legacy X-API-Key path when no signature headers are present', async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: 'u-flex',
      discordId: 'd',
      discordUsername: 'flex',
      steamId: 's',
      apiKey: encryptDeterministic('legacy-key-006'),
      apiKeyIp: null,
      apiKeyCreatedAt: null,
      isBanned: false,
    });
    db.user.update.mockResolvedValueOnce({});
    db.server.findUnique.mockResolvedValueOnce({ id: 1, name: 'srv1', isActive: true });

    const req: any = {
      headers: { 'x-api-key': 'legacy-key-006', 'x-server-id': '1' },
      method: 'GET',
      originalUrl: '/api/plugin/verify',
      query: {},
      socket: { remoteAddress: '203.0.113.10' },
      ip: '203.0.113.10',
    };
    const next = vi.fn();
    await authenticatePluginFlexible(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.pluginUser).toMatchObject({ id: 'u-flex' });
    expect(req.serverId).toBe(1);
    // The HMAC credential path must not have been consulted.
    expect(db.serverCredential.findUnique).not.toHaveBeenCalled();
  });

  it('rejects with 401 when neither signature nor API key is provided', async () => {
    const req: any = { headers: {}, method: 'GET', originalUrl: '/api/plugin/verify', query: {} };
    const next = vi.fn();
    await authenticatePluginFlexible(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'API key required' }),
    );
  });
});
