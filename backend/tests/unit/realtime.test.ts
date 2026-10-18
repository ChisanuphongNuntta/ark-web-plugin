import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../src/config/database.js';
import {
  afterCommit,
  inTransactionScope,
  installAfterCommitHooks,
  withAfterCommitScope,
} from '../../src/realtime/afterCommit.js';
import {
  emitCatalogUpdated,
  emitDeliveryUpdated,
  emitOrderUpdated,
  emitServersStatus,
  emitWalletUpdated,
  walletReasonFor,
} from '../../src/realtime/emit.js';
import { setRealtimeServer } from '../../src/realtime/io.js';
import {
  allowedSocketOrigins,
  extractSocketToken,
  isTrustedSocketOrigin,
  parseCookieHeader,
  verifySocketToken,
} from '../../src/realtime/socketAuth.js';
import { readServerId } from '../../src/websocket/chat.handler.js';
import walletService from '../../src/services/wallet.service.js';

const db = prisma as any;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeIo() {
  const emitted: Array<{ room: string | null; event: string; payload: any }> = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }),
    emit: (event: string, payload: any) => emitted.push({ room: null, event, payload }),
  };
  return { io: io as any, emitted };
}

describe('afterCommit', () => {
  it('defers callbacks until the scope resolves and drops them on rollback', async () => {
    const calls: string[] = [];
    await withAfterCommitScope(async () => {
      expect(inTransactionScope()).toBe(true);
      afterCommit(() => { calls.push('committed'); });
      await flush();
      expect(calls).toEqual([]); // not yet: still "inside the transaction"
    });
    expect(calls).toEqual(['committed']);

    await expect(withAfterCommitScope(async () => {
      afterCommit(() => { calls.push('rolled-back'); });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await flush();
    expect(calls).toEqual(['committed']);
  });

  it('runs on the next tick outside a transaction and never throws into the caller', async () => {
    const calls: string[] = [];
    afterCommit(() => { throw new Error('boom'); });
    afterCommit(() => { calls.push('ran'); });
    expect(calls).toEqual([]);
    await flush();
    expect(calls).toEqual(['ran']);
  });

  it('wraps only the interactive form of $transaction, once', async () => {
    const original = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg('tx') : Promise.all(arg)));
    const client: any = { $transaction: original };
    installAfterCommitHooks(client);
    installAfterCommitHooks(client);
    const order: string[] = [];
    const result = await client.$transaction(async (tx: string) => {
      afterCommit(() => { order.push('hook'); });
      order.push(`body:${tx}`);
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(['body:tx', 'hook']);
    expect(await client.$transaction([Promise.resolve(1)])).toEqual([1]);
    expect(original).toHaveBeenCalledTimes(2);
  });
});

describe('socket authentication', () => {
  const secret = process.env.JWT_SECRET!;
  beforeEach(() => vi.clearAllMocks());

  it('reads the token from auth, Bearer header, or the httpOnly cookie (in that order)', () => {
    expect(parseCookieHeader('a=1; token=abc%2Edef; b="x"')).toEqual({ a: '1', token: 'abc.def', b: 'x' });
    expect(extractSocketToken({ auth: { token: 'A' }, headers: { authorization: 'Bearer B', cookie: 'token=C' } })).toEqual({ token: 'A', source: 'auth' });
    expect(extractSocketToken({ headers: { authorization: 'Bearer B', cookie: 'token=C' } })).toEqual({ token: 'B', source: 'header' });
    expect(extractSocketToken({ headers: { cookie: 'other=1; token=C' } })).toEqual({ token: 'C', source: 'cookie' });
    expect(extractSocketToken({ headers: {} })).toBeNull();
  });

  it('verifies like REST: valid session + not banned; admins flagged', async () => {
    const token = jwt.sign({ userId: 'u1' }, secret);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.userSession.findUnique.mockResolvedValueOnce({ userId: 'u1', isActive: true, expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', discordUsername: 'Heart', discordAvatar: null, isBanned: false, isAdmin: false, role: 'root' });
    await expect(verifySocketToken(token)).resolves.toEqual({ userId: 'u1', userName: 'Heart', userAvatar: undefined, isAdmin: true, canJoinAdminRoom: true });
    expect(db.userSession.findUnique).toHaveBeenCalledWith({ where: { token: tokenHash } });

    db.userSession.findUnique.mockResolvedValueOnce({ userId: 'u1', isActive: false, expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', isBanned: false, role: 'user' });
    await expect(verifySocketToken(token)).resolves.toBeNull();

    db.userSession.findUnique.mockResolvedValueOnce({ userId: 'u1', isActive: true, expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', isBanned: true, role: 'user' });
    await expect(verifySocketToken(token)).resolves.toBeNull();

    // Legacy isAdmin flag (role user/server_admin): chat moderator, but NOT the admin room, the
    // same rule as REST requireWebsiteAdmin (role ADMIN|ROOT).
    db.userSession.findUnique.mockResolvedValueOnce({ id: 's-9', userId: 'u1', isActive: true, expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', discordUsername: 'Mod', discordAvatar: null, isBanned: false, isAdmin: true, role: 'server_admin' });
    await expect(verifySocketToken(token)).resolves.toEqual({
      userId: 'u1', userName: 'Mod', userAvatar: undefined, isAdmin: true, canJoinAdminRoom: false, sessionId: 's-9',
    });

    await expect(verifySocketToken('not-a-jwt')).resolves.toBeNull();
    await expect(verifySocketToken(jwt.sign({ userId: 'u1' }, 'another-secret-another-secret-another-secret'))).resolves.toBeNull();
  });

  it('trusts the cookie only from the site itself (allow-list or same-origin), not sibling origins', () => {
    const allowed = allowedSocketOrigins({ FRONTEND_URL: 'http://localhost:3000/', SOCKET_ALLOWED_ORIGINS: ' https://shop.example.com , bad' } as any);
    expect([...allowed]).toEqual(['http://localhost:3000', 'https://shop.example.com']);
    // Non-browser client (no Origin) / allow-listed / same-origin behind nginx.
    expect(isTrustedSocketOrigin({ headers: {} }, allowed)).toBe(true);
    expect(isTrustedSocketOrigin({ headers: { origin: 'http://localhost:3000', host: 'localhost:3001' } }, allowed)).toBe(true);
    expect(isTrustedSocketOrigin({ headers: { origin: 'https://iris.example.com', host: 'iris.example.com' } }, allowed)).toBe(true);
    // Sibling same-site subdomain, other site, garbage.
    expect(isTrustedSocketOrigin({ headers: { origin: 'https://evil.iris.example.com', host: 'iris.example.com' } }, allowed)).toBe(false);
    expect(isTrustedSocketOrigin({ headers: { origin: 'https://attacker.test', host: 'localhost:3001' } }, allowed)).toBe(false);
    expect(isTrustedSocketOrigin({ headers: { origin: 'null', host: 'localhost:3001' } }, allowed)).toBe(false);
  });
});

describe('chat socket payload guard', () => {
  it('accepts only positive safe-integer server ids and never throws on junk payloads', () => {
    expect(readServerId({ serverId: 2 })).toBe(2);
    for (const junk of [undefined, null, 0, 'x', [], {}, { serverId: '2' }, { serverId: -1 }, { serverId: 1.5 }, { serverId: Number.MAX_VALUE }, { serverId: null }]) {
      expect(readServerId(junk)).toBeUndefined();
    }
  });
});

describe('realtime emit helpers', () => {
  let emitted: ReturnType<typeof fakeIo>['emitted'];
  beforeEach(() => {
    vi.clearAllMocks();
    const fake = fakeIo();
    emitted = fake.emitted;
    setRealtimeServer(fake.io);
  });
  afterEach(() => setRealtimeServer(null));

  it('maps ledger types to wallet reasons', () => {
    expect(walletReasonFor('checkout_purchase')).toBe('purchase');
    expect(walletReasonFor('game_purchase')).toBe('purchase');
    expect(walletReasonFor('dino_escrow_hold')).toBe('purchase');
    expect(walletReasonFor('order_refund')).toBe('refund');
    expect(walletReasonFor('dino_escrow_refund')).toBe('refund');
    expect(walletReasonFor('stripe_topup')).toBe('topup');
    expect(walletReasonFor('bank_slip_approval')).toBe('topup');
    expect(walletReasonFor('admin_adjustment')).toBe('admin');
    expect(walletReasonFor('earn_playtime')).toBe('reward');
    expect(walletReasonFor('dino_escrow_release')).toBe('transfer');
    expect(walletReasonFor('something_new')).toBe('something_new');
  });

  it('emits wallet:updated to the user room with the GET /wallet balance format', async () => {
    db.walletAccount.findMany.mockResolvedValueOnce([
      { type: 'available', balance: 900n },
      { type: 'held', balance: 0n },
      { type: 'refundable', balance: 100n },
    ]);
    await emitWalletUpdated(['u1', 'u1'], 'purchase');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      room: 'user:u1',
      event: 'wallet:updated',
      payload: { balance: '900', total: '1000', currency: 'IC', accounts: { available: '900', held: '0', refundable: '100' }, reason: 'purchase' },
    });
    expect(typeof emitted[0].payload.at).toBe('string');
  });

  it('routes order and delivery events to the owner only', async () => {
    emitOrderUpdated('u2', 'o1', 'queued');
    db.order.findUnique.mockResolvedValueOnce({ userId: 'u2' });
    await emitDeliveryUpdated({ deliveryId: 'o1', deliveryType: 'dino_catalog', referenceId: 'o1', status: 'completed' });
    db.dinoListing.findUnique.mockResolvedValueOnce({ buyerId: 'u3' });
    await emitDeliveryUpdated({ deliveryId: 'j9', deliveryType: 'dino_marketplace', referenceId: 'l1', status: 'leased' });
    db.order.findUnique.mockResolvedValueOnce(null);
    await emitDeliveryUpdated({ deliveryId: 'gone', deliveryType: 'order', referenceId: 'gone', status: 'pending' });

    expect(emitted.map((e) => [e.room, e.event])).toEqual([
      ['user:u2', 'order:updated'],
      ['user:u2', 'delivery:updated'],
      ['user:u3', 'delivery:updated'],
    ]);
    expect(emitted[1].payload).toMatchObject({ deliveryId: 'o1', orderId: 'o1', status: 'completed' });
    expect(emitted[2].payload.orderId).toBeUndefined();
  });

  it('broadcasts servers:status to the servers room and coalesces catalog:updated', async () => {
    vi.useFakeTimers();
    try {
      emitServersStatus({ at: 'now', servers: [] });
      emitCatalogUpdated('products');
      emitCatalogUpdated('products');
      emitCatalogUpdated('categories');
      expect(emitted.filter((e) => e.event === 'catalog:updated')).toHaveLength(0);
      vi.advanceTimersByTime(1000);
      const catalog = emitted.filter((e) => e.event === 'catalog:updated');
      expect(catalog).toHaveLength(1);
      expect(catalog[0]).toMatchObject({ room: null, payload: { scope: 'all' } });
      expect(emitted[0]).toMatchObject({ room: 'servers', event: 'servers:status' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op without a Socket.IO server', async () => {
    setRealtimeServer(null);
    emitOrderUpdated('u1', 'o', 'queued');
    await emitWalletUpdated(['u1'], 'purchase');
    expect(db.walletAccount.findMany).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });
});

describe('walletService.post realtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fake = fakeIo();
    setRealtimeServer(fake.io);
  });
  afterEach(() => setRealtimeServer(null));

  function ledgerTx(accounts: any[]) {
    return {
      ledgerTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'tx-1' }),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'tx-1', entries: [] }),
      },
      walletAccount: {
        findMany: vi.fn().mockResolvedValue(accounts),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }: any) => Promise.resolve({ ...accounts.find((a) => a.id === where.id), balance: 5n })),
      },
      ledgerEntry: { create: vi.fn() },
      user: { update: vi.fn() },
    };
  }

  const accounts = [
    { id: 'a1', key: 'user:u1:available:IC', userId: 'u1', type: 'available', status: 'active', balance: 10n },
    { id: 'a2', key: 'system:revenue:IC', userId: null, type: 'system', status: 'active', balance: 0n },
  ];
  const input = {
    idempotencyKey: 'checkout:commit:s1',
    type: 'checkout_purchase',
    entries: [
      { accountKey: 'user:u1:available:IC', amount: -5n },
      { accountKey: 'system:revenue:IC', amount: 5n },
    ],
  };

  it('emits wallet:updated for the touched user only after the caller transaction commits', async () => {
    db.walletAccount.findMany.mockResolvedValue([{ type: 'available', balance: 5n }]);
    const tx = ledgerTx(accounts);
    await withAfterCommitScope(async () => {
      await walletService.post(input, tx as any);
      await flush();
      expect(db.walletAccount.findMany).not.toHaveBeenCalled(); // nothing leaves before commit
    });
    await flush();
    expect(db.walletAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', currency: 'IC' } }));
  });

  it('emits nothing when the caller transaction rolls back', async () => {
    const tx = ledgerTx(accounts);
    await expect(withAfterCommitScope(async () => {
      await walletService.post(input, tx as any);
      throw new Error('stock check failed');
    })).rejects.toThrow();
    await flush();
    expect(db.walletAccount.findMany).not.toHaveBeenCalled();
  });
});
