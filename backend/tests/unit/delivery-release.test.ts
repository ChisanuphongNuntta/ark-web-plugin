// Delivery lease release fixes (admin transactions 2026-10, CONTEXT items a + b):
//   (a) a claim that ends in a release does not count as a delivery attempt, so a long
//       offline streak can never dead-letter the job on its first real failure;
//   (b) releases back off (30s -> 5 min cap) while the player stays offline, the backoff
//       resets when the player comes online, and delivery:updated is only emitted when the
//       buyer-visible status actually changes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/realtime/emit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/realtime/emit.js')>();
  return {
    ...actual,
    emitDeliveryUpdated: vi.fn().mockResolvedValue(undefined),
    emitOrderUpdated: vi.fn(),
    emitAdminDeliveryFailed: vi.fn(),
  };
});

import prisma from '../../src/config/database.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import { emitDeliveryUpdated, emitOrderUpdated } from '../../src/realtime/emit.js';
import { DEFAULT_MAX_ATTEMPTS } from '../../src/services/delivery.service.js';
import {
  RELEASE_BASE_BACKOFF_MS,
  RELEASE_MAX_BACKOFF_MS,
  RELEASE_STREAK_TTL_MS,
  createReleaseStreakStore,
  releaseBackoffMs,
  releaseStreakKey,
  releaseStreaks,
} from '../../src/services/deliveryRelease.service.js';

const db = prisma as any;
const plugin = new PluginController();
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeRedis(status = 'ready') {
  const store = new Map<string, number>();
  return {
    status,
    store,
    incr: vi.fn(async (key: string) => {
      const value = (store.get(key) ?? 0) + 1;
      store.set(key, value);
      return value;
    }),
    pexpire: vi.fn(async () => 1),
    mget: vi.fn(async (...keys: string[]) => keys.map((key) => (store.has(key) ? String(store.get(key)) : null))),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
      return keys.length;
    }),
  };
}

const leasedJob = (over: Record<string, unknown> = {}) => ({
  id: 'job-1',
  status: 'leased',
  leaseToken: 'lease-abc',
  deliveryType: 'order',
  referenceId: 'order-1',
  serverId: 1,
  playerSteamId: '76561198000000001',
  attempts: 1,
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  ...over,
});

const releaseReq = () => ({ params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc' }, serverId: 1 }) as any;
const resMock = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((ops: any) => (typeof ops === 'function' ? ops(db) : Promise.all(ops)));
});

afterEach(async () => {
  // Drain afterCommit/setImmediate emits so they never leak into the next test.
  await flush();
  vi.restoreAllMocks();
});

describe('releaseBackoffMs', () => {
  it('doubles from 30s per consecutive release and caps at 5 minutes', () => {
    expect(releaseBackoffMs(1)).toBe(30_000);
    expect(releaseBackoffMs(2)).toBe(60_000);
    expect(releaseBackoffMs(3)).toBe(120_000);
    expect(releaseBackoffMs(4)).toBe(240_000);
    expect(releaseBackoffMs(5)).toBe(RELEASE_MAX_BACKOFF_MS);
    expect(releaseBackoffMs(500)).toBe(RELEASE_MAX_BACKOFF_MS);
  });

  it('treats junk streaks as the first release', () => {
    expect(releaseBackoffMs(0)).toBe(RELEASE_BASE_BACKOFF_MS);
    expect(releaseBackoffMs(-3)).toBe(RELEASE_BASE_BACKOFF_MS);
    expect(releaseBackoffMs(Number.NaN)).toBe(RELEASE_BASE_BACKOFF_MS);
  });
});

describe('release streak store', () => {
  it('increments with a TTL, reads many, and clears', async () => {
    const redis = fakeRedis();
    const store = createReleaseStreakStore(() => redis);

    expect(await store.increment('job-1')).toBe(1);
    expect(await store.increment('job-1')).toBe(2);
    expect(redis.pexpire).toHaveBeenCalledWith(releaseStreakKey('job-1'), RELEASE_STREAK_TTL_MS);

    const streaks = await store.getMany(['job-1', 'job-2']);
    expect(streaks.get('job-1')).toBe(2);
    expect(streaks.get('job-2')).toBe(0);
    expect(streaks.known).toBe(true);
    expect(store.available()).toBe(true);

    await store.clear(['job-1']);
    expect((await store.getMany(['job-1'])).get('job-1')).toBe(0);
  });

  it('degrades to "first release" when Redis is not ready or errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const down = createReleaseStreakStore(() => fakeRedis('reconnecting'));
    expect(await down.increment('job-1')).toBe(1);
    const unknown = await down.getMany(['job-1']);
    expect(unknown.get('job-1')).toBe(0);
    // Callers can tell "0 because unknown" from "0 because no release".
    expect(unknown.known).toBe(false);
    expect(down.available()).toBe(false);
    // The degraded mode is logged, rate-limited (one warning per window, not per call).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('degraded');

    const broken = fakeRedis();
    broken.incr.mockRejectedValueOnce(new Error('boom'));
    broken.mget.mockRejectedValueOnce(new Error('boom'));
    const store = createReleaseStreakStore(() => broken);
    expect(await store.increment('job-1')).toBe(1);
    expect((await store.getMany(['job-1'])).get('job-1')).toBe(0);
    await expect(store.clear(['job-1'])).resolves.toBeUndefined();

    expect(await createReleaseStreakStore(() => null).increment('job-1')).toBe(1);
  });
});

describe('releaseDelivery', () => {
  it('first release of a streak: undoes the claim attempt, backs off 30s, emits the visible change once', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 0]]));
    const increment = vi.spyOn(releaseStreaks, 'increment').mockResolvedValueOnce(1);
    db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 1, nextRetryAt: null }));
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const before = Date.now();
    const res = resMock();
    const next = vi.fn();
    await plugin.releaseDelivery(releaseReq(), res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    const update = db.deliveryJob.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'job-1', status: 'leased', leaseToken: 'lease-abc' });
    expect(update.data).toMatchObject({ status: 'pending', leaseToken: null, leaseExpiresAt: null, attempts: 0 });
    const retryAt = (update.data.nextRetryAt as Date).getTime();
    expect(retryAt - before).toBeGreaterThanOrEqual(RELEASE_BASE_BACKOFF_MS - 50);
    expect(retryAt - before).toBeLessThanOrEqual(RELEASE_BASE_BACKOFF_MS + 1_000);
    expect(db.fulfillment.updateMany).toHaveBeenCalledWith({ where: { orderId: 'order-1' }, data: { status: 'queued', attempts: 0 } });

    expect(emitDeliveryUpdated).toHaveBeenCalledTimes(1);
    expect(emitDeliveryUpdated).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 'job-1', status: 'pending' }));
    expect(emitOrderUpdated).toHaveBeenCalledWith('u1', 'order-1', 'queued');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, attempts: 0, retryInMs: RELEASE_BASE_BACKOFF_MS }));
    // The streak is recorded only after the release won its conditional update.
    expect(increment).toHaveBeenCalledWith('job-1');
    expect(increment.mock.invocationCallOrder[0]).toBeGreaterThan(db.deliveryJob.updateMany.mock.invocationCallOrder[0]);
  });

  it('later releases while the player stays offline: longer backoff and no realtime emit', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 3]]));
    vi.spyOn(releaseStreaks, 'increment').mockResolvedValueOnce(4);
    // The lease being released came from a silent probe claim (DB marker: nextRetryAt kept).
    db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 1, nextRetryAt: new Date('2026-10-18T00:00:00Z') }));
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.releaseDelivery(releaseReq(), res, vi.fn());
    await flush();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retryInMs: 240_000, attempts: 0 }));
    expect(emitDeliveryUpdated).not.toHaveBeenCalled();
    expect(emitOrderUpdated).not.toHaveBeenCalled();
  });

  it('never drives attempts below zero and refuses a stale lease (409) without touching the order or the streak', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 0]]));
    const increment = vi.spyOn(releaseStreaks, 'increment');
    db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 0 }));
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 0 });

    const next = vi.fn();
    await plugin.releaseDelivery(releaseReq(), resMock(), next);

    expect(db.deliveryJob.updateMany.mock.calls[0][0].data.attempts).toBe(0);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(db.order.update).not.toHaveBeenCalled();
    // A lost release must not inflate the streak (longer backoff / suppressed emit next time).
    expect(increment).not.toHaveBeenCalled();
  });

  it('Redis down: a release after a silent probe claim still does not re-emit (DB marker decides)', async () => {
    const unknown = Object.assign(new Map([['job-1', 0]]), { known: false });
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(unknown);
    vi.spyOn(releaseStreaks, 'increment').mockResolvedValueOnce(1);
    db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 1, nextRetryAt: new Date('2026-10-18T00:00:00Z') }));
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.releaseDelivery(releaseReq(), res, vi.fn());
    await flush();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, retryInMs: RELEASE_BASE_BACKOFF_MS }));
    expect(emitDeliveryUpdated).not.toHaveBeenCalled();
    expect(emitOrderUpdated).not.toHaveBeenCalled();
  });

  it('many offline releases then one real failure: retries instead of dead-lettering', async () => {
    // Each cycle: claim increments attempts 0 -> 1, release undoes it back to 0.
    for (let cycle = 1; cycle <= DEFAULT_MAX_ATTEMPTS + 5; cycle += 1) {
      vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', cycle - 1]]));
      vi.spyOn(releaseStreaks, 'increment').mockResolvedValueOnce(cycle);
      db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 1 }));
      db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
      db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
      db.order.update.mockResolvedValueOnce({});
      db.fulfillment.updateMany.mockResolvedValueOnce({});
      await plugin.releaseDelivery(releaseReq(), resMock(), vi.fn());
      expect(db.deliveryJob.updateMany.mock.lastCall[0].data.attempts).toBe(0);
    }

    // The player is online now; the next claim (attempts 0 -> 1) fails for real.
    vi.spyOn(releaseStreaks, 'clear').mockResolvedValue(undefined);
    db.deliveryJob.findUnique.mockResolvedValueOnce(leasedJob({ attempts: 1 }));
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce(leasedJob({ status: 'pending', attempts: 1 }));
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.failDelivery({ params: { deliveryKey: 'job-1' }, body: { leaseToken: 'lease-abc', error: 'inventory full' }, serverId: 1 } as any, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retry: true, deadLetter: false }));
    expect(db.deliveryJob.updateMany.mock.lastCall[0].data.status).toBe('pending');
    // A real attempt ends the release streak so the failure backoff takes over.
    expect(releaseStreaks.clear).toHaveBeenCalledWith(['job-1']);
  });
});

describe('claimDeliveries after a release', () => {
  it('re-claims a released job as a silent probe (no leased flash), but still counts the attempt', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 2]]));
    db.order.findMany.mockResolvedValueOnce([]);
    db.deliveryJob.findMany.mockResolvedValueOnce([
      { id: 'job-1', status: 'pending', leaseToken: null, deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {} },
    ]);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'job-1', status: 'leased', deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {}, attempts: 1,
    });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'queued' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.claimDeliveries({ body: { serverId: 1 }, serverId: 1 } as any, res, vi.fn());
    await flush();

    expect(db.deliveryJob.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'leased', attempts: { increment: 1 } });
    // Probe lease keeps a nextRetryAt stamp: the DB marker releaseDelivery uses for visibility.
    expect(db.deliveryJob.updateMany.mock.calls[0][0].data.nextRetryAt).toBeInstanceOf(Date);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ deliveryKey: 'job-1' })]);
    expect(emitDeliveryUpdated).not.toHaveBeenCalled();
    expect(emitOrderUpdated).not.toHaveBeenCalled();
  });

  it('a fresh claim (no release streak) is a visible change', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 0]]));
    db.order.findMany.mockResolvedValueOnce([]);
    db.deliveryJob.findMany.mockResolvedValueOnce([
      { id: 'job-1', status: 'pending', leaseToken: null, deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {} },
    ]);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'job-1', status: 'leased', deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {}, attempts: 1,
    });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'queued' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    await plugin.claimDeliveries({ body: { serverId: 1 }, serverId: 1 } as any, resMock(), vi.fn());
    await flush();

    expect(emitDeliveryUpdated).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 'job-1', status: 'leased' }));
    expect(emitOrderUpdated).toHaveBeenCalledWith('u1', 'order-1', 'delivering');
    expect(db.deliveryJob.updateMany.mock.calls[0][0].data.nextRetryAt).toBeNull();
  });

  it('Redis down: a released job (pending + backoff stamp) is still re-claimed as a silent probe', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(Object.assign(new Map([['job-1', 0]]), { known: false }));
    const stamp = new Date('2026-10-18T00:00:00Z');
    db.order.findMany.mockResolvedValueOnce([]);
    db.deliveryJob.findMany.mockResolvedValueOnce([
      { id: 'job-1', status: 'pending', leaseToken: null, nextRetryAt: stamp, deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {} },
    ]);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'job-1', status: 'leased', deliveryType: 'order', referenceId: 'order-1', playerSteamId: 's', payloadHash: 'h', payload: {}, attempts: 1,
    });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'queued' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    await plugin.claimDeliveries({ body: { serverId: 1 }, serverId: 1 } as any, resMock(), vi.fn());
    await flush();

    expect(db.deliveryJob.updateMany.mock.calls[0][0].data.nextRetryAt).toEqual(stamp);
    expect(emitDeliveryUpdated).not.toHaveBeenCalled();
    expect(emitOrderUpdated).not.toHaveBeenCalled();
  });
});

describe('claimDeliveries with an expired lease', () => {
  const expired = (over: Record<string, unknown> = {}) => ({
    id: 'job-1', status: 'leased', leaseToken: 'old-lease', leaseExpiresAt: new Date(Date.now() - 1_000),
    deliveryType: 'order', referenceId: 'order-1', serverId: 1, playerSteamId: 's', payloadHash: 'h', payload: {},
    maxAttempts: DEFAULT_MAX_ATTEMPTS, ...over,
  });

  it('attempts left: re-claims it and the expired lease keeps its attempt (counts as one)', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 0]]));
    db.order.findMany.mockResolvedValueOnce([]);
    db.deliveryJob.findMany.mockResolvedValueOnce([expired({ attempts: 2 })]);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ ...expired({ attempts: 3 }), leaseToken: 'new' });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.claimDeliveries({ body: { serverId: 1 }, serverId: 1 } as any, res, vi.fn());

    const claim = db.deliveryJob.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'job-1', status: 'leased', leaseToken: 'old-lease' });
    expect(claim.data).toMatchObject({ status: 'leased', attempts: { increment: 1 }, nextRetryAt: null });
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ deliveryKey: 'job-1' })]);
  });

  it('no attempts left (poison payload / repeated crashes): dead-letters instead of re-claiming forever', async () => {
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-1', 0]]));
    const clear = vi.spyOn(releaseStreaks, 'clear').mockResolvedValue(undefined);
    db.order.findMany.mockResolvedValueOnce([]);
    db.deliveryJob.findMany.mockResolvedValueOnce([expired({ attempts: DEFAULT_MAX_ATTEMPTS })]);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', userId: 'u1', status: 'delivering' });
    db.order.update.mockResolvedValueOnce({});
    db.fulfillment.updateMany.mockResolvedValueOnce({});

    const res = resMock();
    await plugin.claimDeliveries({ body: { serverId: 1 }, serverId: 1 } as any, res, vi.fn());
    await flush();

    const dead = db.deliveryJob.updateMany.mock.calls[0][0];
    expect(dead.where).toMatchObject({ id: 'job-1', status: 'leased', leaseToken: 'old-lease' });
    expect(dead.data).toMatchObject({ status: 'dead_letter', leaseToken: null, leaseExpiresAt: null, nextRetryAt: null });
    expect(String(dead.data.error)).toContain('Lease expired');
    // Same outcome as failDelivery at the limit: order -> failed (refundable).
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: expect.objectContaining({ status: 'failed' }) });
    expect(db.fulfillment.updateMany).toHaveBeenCalledWith({ where: { orderId: 'order-1' }, data: expect.objectContaining({ status: 'failed' }) });
    expect(emitDeliveryUpdated).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 'job-1', status: 'dead_letter' }));
    expect(clear).toHaveBeenCalledWith(['job-1']);
    // Not handed to the plugin again.
    expect(res.json).toHaveBeenCalledWith([]);
  });
});

describe('player comes online', () => {
  it('clears the release backoff and streak of release-backed jobs only', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'job-released' }, { id: 'job-failed' }]);
    vi.spyOn(releaseStreaks, 'getMany').mockResolvedValueOnce(new Map([['job-released', 3], ['job-failed', 0]]));
    const clear = vi.spyOn(releaseStreaks, 'clear').mockResolvedValueOnce(undefined);
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const reset = await plugin.resetOfflineBackoff(1, '76561198000000001');

    expect(reset).toBe(1);
    expect(db.deliveryJob.findMany.mock.calls[0][0].where).toMatchObject({
      serverId: 1, playerSteamId: '76561198000000001', status: 'pending',
    });
    expect(db.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['job-released'] }, status: 'pending' },
      data: { nextRetryAt: null },
    });
    expect(clear).toHaveBeenCalledWith(['job-released']);
  });

  it('GET /plugin/player/:steamId triggers the reset and never fails the lookup on reset errors', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', discordUsername: 'Heart', pointsBalance: 10n, steamId: '76561198000000001' });
    db.deliveryJob.findMany.mockRejectedValueOnce(new Error('db hiccup'));
    db.order.count.mockResolvedValueOnce(0);

    const res = resMock();
    const next = vi.fn();
    await plugin.getPlayerBySteamId({ params: { steamId: '76561198000000001' }, serverId: 1 } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.deliveryJob.findMany).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ player: expect.objectContaining({ id: 'u1', pointsBalance: 10 }) });
  });
});
