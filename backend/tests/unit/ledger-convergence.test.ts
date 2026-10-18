// Ledger convergence (admin transactions 2026-10): every money path posts exactly ONE balanced
// ledger transaction through walletService.post, with a stable idempotency key, a registered
// ledger type and a canonical referenceType — and never writes User.pointsBalance itself.
// User.pointsBalance is only maintained as a projection inside walletService.post.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import auditService from '../../src/services/audit.service.js';
import walletService, { walletRequestHashFor } from '../../src/services/wallet.service.js';
import { LEDGER_TYPES, REFERENCE_TYPES } from '../../src/services/ledgerTypes.js';
import { OrderController } from '../../src/controllers/order.controller.js';
import { DinoMarketController } from '../../src/controllers/dino-market.controller.js';
import { AdminController } from '../../src/controllers/admin.controller.js';
import { UserController } from '../../src/controllers/user.controller.js';

const db = prisma as any;
db.dinoListing.updateMany ??= vi.fn();
db.dinoTradeHistory ??= {};
db.dinoTradeHistory.create ??= vi.fn();
db.order.updateMany ??= vi.fn();
db.order.findUniqueOrThrow ??= vi.fn();
db.playerStats.update ??= vi.fn();
db.user.updateMany ??= vi.fn();
db.user.upsert ??= vi.fn();

const flush = () => new Promise((resolve) => setImmediate(resolve));
const resMock = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() }) as any;

let post: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((ops: any) => (typeof ops === 'function' ? ops(db) : Promise.all(ops)));
  vi.spyOn(walletService, 'ensureUserAccounts').mockResolvedValue(undefined);
  post = vi.spyOn(walletService, 'post').mockImplementation(async (input: any) => ({ id: `ltx-${input.idempotencyKey}` }) as any);
});

afterEach(async () => {
  await flush();
  vi.restoreAllMocks();
  delete process.env.ENABLE_LEGACY_SINGLE_ORDER;
});

/** The single posting this path made, after asserting it is balanced and well-labelled. */
function onlyPosting() {
  expect(post).toHaveBeenCalledTimes(1);
  const input = post.mock.calls[0][0] as any;
  expect(input.idempotencyKey).toEqual(expect.any(String));
  expect(input.idempotencyKey.length).toBeGreaterThan(0);
  expect(input.entries.length).toBeGreaterThanOrEqual(2);
  expect(input.entries.reduce((sum: bigint, entry: any) => sum + entry.amount, 0n)).toBe(0n);
  expect(Object.keys(LEDGER_TYPES)).toContain(input.type);
  expect(REFERENCE_TYPES as readonly string[]).toContain(input.referenceType);
  expect(input.referenceId).toEqual(expect.any(String));
  return input;
}

/** No prisma write anywhere in the path touched User.pointsBalance directly. */
function expectNoDirectPointsBalanceWrite() {
  for (const fn of [db.user.update, db.user.updateMany, db.user.upsert, db.user.create]) {
    for (const [args] of fn.mock.calls) {
      expect(JSON.stringify(args?.data ?? {}, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)))
        .not.toContain('pointsBalance');
      expect(Object.keys(args?.update ?? {})).not.toContain('pointsBalance');
    }
  }
}

describe('converged money paths', () => {
  it('POST /orders (legacy single order): one order_purchase, buyer available -> revenue', async () => {
    process.env.ENABLE_LEGACY_SINGLE_ORDER = 'true';
    db.product.findUnique.mockResolvedValueOnce({ id: 7, name: 'Rifle', price: 150, isActive: true, stock: null, maxPerUser: null });
    db.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', pointsBalance: 1000n })
      .mockResolvedValueOnce({ pointsBalance: 700n });
    db.server.findUnique.mockResolvedValueOnce({ id: 1, isActive: true });
    db.order.create.mockResolvedValueOnce({ id: 'order-1', status: 'pending' });
    db.user.update.mockResolvedValue({});

    const res = resMock();
    const next = vi.fn();
    await new OrderController().createOrder({ user: { id: 'u1' }, body: { productId: 7, serverId: 1, quantity: 2 } } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    expect(input).toMatchObject({ idempotencyKey: 'order:purchase:order-1', type: 'order_purchase', referenceType: 'order', referenceId: 'order-1' });
    expect(input.entries).toEqual([
      { accountKey: 'user:u1:available:IC', amount: -300n },
      { accountKey: 'system:revenue:IC', amount: 300n },
    ]);
    expect(post.mock.calls[0][1]).toBe(db); // inside the caller's transaction
    expectNoDirectPointsBalanceWrite();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ newBalance: 700 }));
  });

  it('dino market P2P buy: one dino_escrow_hold, buyer available -> clearing', async () => {
    db.dinoListing.findUnique.mockResolvedValueOnce({
      id: 'listing-1', status: 'listed', sellerId: 'seller', price: 500, species: 'Rex', level: 150,
      cryopodData: Buffer.from('native-snapshot'), seller: { id: 'seller' },
    });
    db.user.findUnique.mockResolvedValueOnce({ id: 'buyer', steamId: '76561198000000002', pointsBalance: 900n });
    db.server.findUnique.mockResolvedValueOnce({ id: 3, isActive: true, drainMode: false, capabilities: ['delivery.dino.v2'] });
    db.dinoListing.updateMany.mockResolvedValueOnce({ count: 1 });
    db.user.update.mockResolvedValue({});
    db.dinoTradeHistory.create.mockResolvedValueOnce({});
    db.deliveryJob.create.mockResolvedValueOnce({});

    const res = resMock();
    const next = vi.fn();
    await new DinoMarketController().buyDino({ params: { id: 'listing-1' }, body: { serverId: 3 }, user: { id: 'buyer' } } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    expect(input).toMatchObject({ idempotencyKey: 'dino:escrow:hold:listing-1', type: 'dino_escrow_hold', referenceType: 'dino_listing', referenceId: 'listing-1' });
    expect(input.entries).toEqual([
      { accountKey: 'user:buyer:available:IC', amount: -500n },
      { accountKey: 'system:clearing:IC', amount: 500n },
    ]);
    expectNoDirectPointsBalanceWrite();
  });

  it('admin manual credit: one admin_adjustment with reason + createdBy, audited', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ pointsBalance: 100n })
      .mockResolvedValueOnce({ pointsBalance: 350n });

    const res = resMock();
    const next = vi.fn();
    await new AdminController().adjustPoints({
      params: { id: 'u1' },
      body: { amount: 250, reason: 'ชดเชยของหาย' },
      user: { id: 'admin-1', role: 'root' },
      headers: {},
    } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    expect(input).toMatchObject({
      type: 'admin_adjustment',
      referenceType: 'admin_adjustment',
      referenceId: 'u1',
      description: 'ชดเชยของหาย',
      createdBy: 'admin-1',
    });
    expect(input.idempotencyKey).toMatch(/^admin:adjust:/);
    expect(input.entries).toEqual(expect.arrayContaining([
      { accountKey: 'user:u1:available:IC', amount: 250n },
      { accountKey: 'system:issuance:IC', amount: -250n },
    ]));
    expectNoDirectPointsBalanceWrite();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1',
      action: 'points_adjust',
      resourceId: 'u1',
      newValue: expect.objectContaining({ amount: '250', reason: 'ชดเชยของหาย', ledgerTransactionId: `ltx-${input.idempotencyKey}` }),
    }), expect.anything());
    expect(res.json).toHaveBeenCalledWith({ success: true, newBalance: 350, transactionId: `ltx-${input.idempotencyKey}` });
  });

  it('admin manual debit: available -> issuance; a caller idempotency key is namespaced', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ pointsBalance: 100n })
      .mockResolvedValueOnce({ pointsBalance: 60n });

    await new AdminController().adjustPoints({
      params: { id: 'u1' },
      body: { amount: -40, reason: 'หักคืนยอดเติมซ้ำ', idempotencyKey: 'ticket-77' },
      user: { id: 'admin-1', role: 'root' },
      headers: {},
    } as any, resMock(), vi.fn());

    const input = onlyPosting();
    expect(input.idempotencyKey).toBe('admin:adjust:admin-1:ticket-77');
    expect(input.entries).toEqual(expect.arrayContaining([
      { accountKey: 'user:u1:available:IC', amount: -40n },
      { accountKey: 'system:issuance:IC', amount: 40n },
    ]));
    expectNoDirectPointsBalanceWrite();
  });

  it('admin adjustment: a client key can never reuse a system flow key', async () => {
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 100n }).mockResolvedValueOnce({ pointsBalance: 150n });
    await new AdminController().adjustPoints({
      params: { id: 'u1' },
      body: { amount: 50, reason: 'พยายามชนคีย์', idempotencyKey: 'payment:pi-1:credit' },
      user: { id: 'sa-1', role: 'root' },
      headers: {},
    } as any, resMock(), vi.fn());
    expect(onlyPosting().idempotencyKey).toBe('admin:adjust:sa-1:payment:pi-1:credit');
  });

  it('admin adjustment replay (same client key): returns the original posting, no second success audit', async () => {
    // First request posts.
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 100n }).mockResolvedValueOnce({ pointsBalance: 140n });
    const body = { amount: 40, reason: 'ชดเชยรอบ 2', idempotencyKey: 'ticket-88' };
    const user = { id: 'admin-1', role: 'root' };
    await new AdminController().adjustPoints({ params: { id: 'u1' }, body, user, headers: {} } as any, resMock(), vi.fn());
    const first = onlyPosting();
    const sorted = [...first.entries].sort((a: any, b: any) => a.accountKey.localeCompare(b.accountKey));
    const requestHash = walletRequestHashFor(first, sorted);
    vi.clearAllMocks();

    // Sequential replay: found before opening a transaction.
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 140n }).mockResolvedValueOnce({ pointsBalance: 140n });
    db.ledgerTransaction.findUnique.mockResolvedValueOnce({ id: 'ltx-original', requestHash });
    const res = resMock();
    const next = vi.fn();
    await new AdminController().adjustPoints({ params: { id: 'u1' }, body, user, headers: {} } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, replayed: true, transactionId: 'ltx-original', newBalance: 140 });
    expect(auditService.log).not.toHaveBeenCalled();

    // Concurrent double-click: the transaction loses with P2002 -> same replay answer, no failure audit.
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 140n }).mockResolvedValueOnce({ pointsBalance: 140n });
    db.ledgerTransaction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ltx-original', requestHash });
    post.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const raced = resMock();
    const racedNext = vi.fn();
    await new AdminController().adjustPoints({ params: { id: 'u1' }, body, user, headers: {} } as any, raced, racedNext);
    expect(racedNext).not.toHaveBeenCalled();
    expect(raced.json).toHaveBeenCalledWith({ success: true, replayed: true, transactionId: 'ltx-original', newBalance: 140 });
    expect(auditService.log).not.toHaveBeenCalled();

    // Same key, different amount: 409, never a silent replay.
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 140n });
    db.ledgerTransaction.findUnique.mockResolvedValueOnce({ id: 'ltx-original', requestHash });
    const conflictNext = vi.fn();
    await new AdminController().adjustPoints({ params: { id: 'u1' }, body: { ...body, amount: 41 }, user, headers: {} } as any, resMock(), conflictNext);
    expect(conflictNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  it('admin adjustment without a reason is refused before any posting', async () => {
    const next = vi.fn();
    await new AdminController().adjustPoints({
      params: { id: 'u1' }, body: { amount: 50, reason: '  ' }, user: { id: 'admin-1', role: 'root' }, headers: {},
    } as any, resMock(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(post).not.toHaveBeenCalled();
  });

  it('a failed admin adjustment (e.g. insufficient balance) is still audited as a failure', async () => {
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 10n });
    post.mockRejectedValueOnce(Object.assign(new Error('Insufficient or unavailable wallet balance'), { statusCode: 409 }));

    const next = vi.fn();
    await new AdminController().adjustPoints({
      params: { id: 'u1' }, body: { amount: -500, reason: 'หักยอดผิด' }, user: { id: 'admin-1', role: 'root' }, headers: {},
    } as any, resMock(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'points_adjust', status: 'failure' }), expect.anything());
  });

  it('admin order refund: one order_refund revenue -> available, createdBy recorded, audited', async () => {
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-9', userId: 'u1', status: 'failed', totalPrice: 120, user: { id: 'u1' } });
    db.order.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = resMock();
    const next = vi.fn();
    await new AdminController().refundOrder({
      params: { id: 'order-9' }, body: { reason: 'ส่งของไม่สำเร็จ' }, user: { id: 'admin-1', role: 'admin' }, headers: {},
    } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    expect(input).toMatchObject({ idempotencyKey: 'order:refund:order-9', type: 'order_refund', referenceType: 'order', referenceId: 'order-9', createdBy: 'admin-1' });
    expect(input.entries).toEqual([
      { accountKey: 'system:revenue:IC', amount: -120n },
      { accountKey: 'user:u1:available:IC', amount: 120n },
    ]);
    expectNoDirectPointsBalanceWrite();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1', action: 'order_refund', resourceId: 'order-9',
      newValue: expect.objectContaining({ amount: '120', customerUserId: 'u1' }),
    }), expect.anything());
  });

  it('owner refund of a failed order: one order_refund with createdBy = requester', async () => {
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-5', userId: 'u1', status: 'failed', totalPrice: 80 });
    db.order.findUniqueOrThrow.mockResolvedValueOnce({ id: 'order-5', userId: 'u1', status: 'failed', totalPrice: 80 });
    db.order.update.mockResolvedValueOnce({ id: 'order-5', status: 'refunded' });

    const next = vi.fn();
    await new OrderController().refundOrder({ params: { id: 'order-5' }, body: {}, user: { id: 'u1', isAdmin: false } } as any, resMock(), next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    expect(input).toMatchObject({ idempotencyKey: 'order:refund:order-5', type: 'order_refund', createdBy: 'u1' });
    expectNoDirectPointsBalanceWrite();
  });

  it('gameplay reward claim: one earn_playtime issuance -> available, referenceType reward', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        playerStats: [{ id: 's1', serverId: 1, playtimeMinutes: 120, dinosKilled: 3, resourcesHarvested: 5000n }],
      })
      .mockResolvedValueOnce({ pointsBalance: 128n });
    db.playerStats.update.mockResolvedValueOnce({});

    const res = resMock();
    const next = vi.fn();
    await new UserController().claimPoints({ user: { id: 'u1' } } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const input = onlyPosting();
    // 2h * 10 + 3 kills + 5000/1000 harvest = 28
    expect(input).toMatchObject({ type: 'earn_playtime', referenceType: 'reward', referenceId: 'u1' });
    expect(input.idempotencyKey).toMatch(/^earn:playtime:u1:/);
    expect(input.entries).toEqual([
      { accountKey: 'system:issuance:IC', amount: -28n },
      { accountKey: 'user:u1:available:IC', amount: 28n },
    ]);
    expectNoDirectPointsBalanceWrite();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pointsEarned: 28, newBalance: 128 }));
  });

  it('a reward claim with nothing to claim posts nothing', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', playerStats: [{ id: 's1', serverId: 1, playtimeMinutes: 10, dinosKilled: 0, resourcesHarvested: 0n }] });

    const res = resMock();
    await new UserController().claimPoints({ user: { id: 'u1' } } as any, res, vi.fn());

    expect(post).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, pointsEarned: 0 }));
  });
});

// ------------------------------------------------------------------------------ static guard

const SRC = path.resolve(__dirname, '../../src');
const PROJECTION_OWNER = path.join(SRC, 'services', 'wallet.service.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Bodies of every `data: { ... }` / `update: { ... }` / `create: { ... }` object literal. */
function writeObjects(source: string): string[] {
  const bodies: string[] = [];
  const opener = /\b(data|update|create)\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(source.slice(match.index, end + 1));
  }
  return bodies;
}

describe('no direct pointsBalance writes outside walletService.post', () => {
  it('only wallet.service.ts writes User.pointsBalance (the ledger projection)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      const rel = path.relative(SRC, file);
      if (/points_balance/.test(source) && file !== PROJECTION_OWNER) offenders.push(`${rel}: raw SQL on points_balance`);
      if (/pointsBalance\s*:\s*\{\s*(increment|decrement|set|multiply|divide)\b/.test(source) && file !== PROJECTION_OWNER) {
        offenders.push(`${rel}: atomic pointsBalance update`);
      }
      for (const body of writeObjects(source)) {
        if (/\bpointsBalance\b/.test(body) && file !== PROJECTION_OWNER) offenders.push(`${rel}: ${body.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the projection owner writes it in exactly one place, from the posted account balance', () => {
    const source = readFileSync(PROJECTION_OWNER, 'utf8');
    const writes = writeObjects(source).filter((body) => /\bpointsBalance\b/.test(body));
    expect(writes).toEqual(['data: { pointsBalance: current.balance }']);
  });
});
