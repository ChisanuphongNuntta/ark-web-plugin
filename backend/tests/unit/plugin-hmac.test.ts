import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import prisma from '../../src/config/database.js';
import { authenticateSignedPlugin } from '../../src/middlewares/auth.js';
import { encryptDeterministic } from '../../src/utils/encryption.js';
import redis from '../../src/config/redis.js';

// Mock Redis: by default the nonce is fresh ('OK'); individual tests override for replay.
vi.mock('../../src/config/redis.js', () => ({
  default: { set: vi.fn().mockResolvedValue('OK') },
  redis: { set: vi.fn().mockResolvedValue('OK') },
}));

const db = prisma as any;

// Build a fully-signed request for a given secret + keyId. Crucially keyId and secret are
// DISTINCT values: the wire only ever carries keyId; the secret is what signs.
function signedReq(opts: {
  keyId: string;
  secret: string;
  serverId?: number;
  body?: Record<string, unknown>;
  method?: string;
  path?: string;
}) {
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/api/plugin/heartbeat';
  const body = opts.body ?? { playerCount: 3 };
  const hasBody = body && Object.keys(body).length > 0;
  const rawBody = hasBody ? JSON.stringify(body) : '';
  const contentSha = crypto.createHash('sha256').update(rawBody).digest('hex');
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(12).toString('hex'); // >= 16 chars
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${contentSha}`;
  const signature = crypto.createHmac('sha256', opts.secret).update(canonical).digest('hex');

  return {
    headers: {
      'x-plugin-key-id': opts.keyId,
      'x-plugin-version': '1.2.3',
      'x-request-timestamp': timestamp,
      'x-request-nonce': nonce,
      'x-content-sha256': contentSha,
      'x-signature': signature,
      ...(opts.serverId != null ? { 'x-server-id': String(opts.serverId) } : {}),
    } as Record<string, string>,
    method,
    originalUrl: path,
    query: {},
    body,
    socket: { remoteAddress: '203.0.113.5' },
    ip: '203.0.113.5',
  } as any;
}

describe('CR-PLUGIN-001 — HMAC keyId -> secret resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.set).mockResolvedValue('OK');
  });

  it('verifies a signed request where keyId and secret are DIFFERENT values (200)', async () => {
    const keyId = 'pk_publicidentifier001';
    const secret = 'totally-different-private-hmac-secret-001';
    // ServerCredential stores the secret encrypted; middleware resolves keyId -> secret.
    db.serverCredential.findUnique.mockResolvedValueOnce({
      id: 'cred-1',
      serverId: 7,
      keyId,
      secretEnc: encryptDeterministic(secret),
      status: 'active',
    });
    db.server.findUnique.mockResolvedValueOnce({ id: 7, name: 'PVE-7', isActive: true });

    const req = signedReq({ keyId, secret }); // signed with secret, NOT keyId
    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    // next() called with no error → authenticated
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    // Scope bound to the credential's server, not anything the client supplied.
    expect(req.serverId).toBe(7);
    expect(req.pluginCredential).toMatchObject({ id: 'cred-1', keyId, serverId: 7 });
    // User lookup must NOT have happened on the credential path.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a request signed with the WRONG secret (401)', async () => {
    const keyId = 'pk_publicidentifier002';
    const realSecret = 'the-real-secret-002';
    db.serverCredential.findUnique.mockResolvedValueOnce({
      id: 'cred-2',
      serverId: 7,
      keyId,
      secretEnc: encryptDeterministic(realSecret),
      status: 'active',
    });

    // Client signs with a guessed/incorrect secret.
    const req = signedReq({ keyId, secret: 'WRONG-secret-002' });
    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Invalid request signature' }),
    );
  });

  it('rejects when the keyId resolves but X-Server-Id disagrees with credential scope (403)', async () => {
    const keyId = 'pk_publicidentifier003';
    const secret = 'scoped-secret-003';
    db.serverCredential.findUnique.mockResolvedValueOnce({
      id: 'cred-3',
      serverId: 7,
      keyId,
      secretEnc: encryptDeterministic(secret),
      status: 'active',
    });

    const req = signedReq({ keyId, secret, serverId: 99 }); // wrong server
    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Server ID does not match credential scope' }),
    );
  });

  it('still rejects replayed nonces under the keyId path (401)', async () => {
    const keyId = 'pk_publicidentifier004';
    const secret = 'secret-004';
    vi.mocked(redis.set).mockResolvedValueOnce('FAIL'); // simulate replay

    const req = signedReq({ keyId, secret });
    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Duplicate request (nonce replayed)' }),
    );
    // Resolution must not even run once the nonce is rejected.
    expect(db.serverCredential.findUnique).not.toHaveBeenCalled();
  });

  it('still enforces the clock-skew window under the keyId path (401)', async () => {
    const keyId = 'pk_publicidentifier005';
    const secret = 'secret-005';
    const req = signedReq({ keyId, secret });
    req.headers['x-request-timestamp'] = (Date.now() - 360000).toString(); // 6 min old

    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Clock drift limit exceeded' }),
    );
  });

  it('falls back to the legacy User.apiKey path during the overlap window (keyId == secret)', async () => {
    const legacyKey = 'legacy-plain-api-key-value-006';
    // No ServerCredential for this keyId → fall back.
    db.serverCredential.findUnique.mockResolvedValueOnce(null);
    db.user.findUnique.mockResolvedValueOnce({
      id: 'u-legacy',
      discordId: 'd1',
      discordUsername: 'legacy',
      steamId: 's1',
      apiKey: encryptDeterministic(legacyKey),
      apiKeyIp: null,
      isBanned: false,
    });
    db.user.update.mockResolvedValueOnce({});
    db.server.findUnique.mockResolvedValueOnce({ id: 1, name: 'srv', isActive: true });

    // Legacy: the wire keyId doubles as the HMAC secret.
    const req = signedReq({ keyId: legacyKey, secret: legacyKey, serverId: 1 });
    const next = vi.fn();
    await authenticateSignedPlugin(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.pluginUser).toMatchObject({ id: 'u-legacy' });
    expect(req.serverId).toBe(1);
  });
});
