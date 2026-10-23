import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/redis.js', () => ({
  default: { status: 'ready', set: vi.fn(), get: vi.fn(), del: vi.fn(), on: vi.fn() },
  redis: { status: 'ready', set: vi.fn(), get: vi.fn(), del: vi.fn(), on: vi.fn() },
}));

vi.mock('../../src/services/wallet.service.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, default: { creditUser: vi.fn(), post: vi.fn(), ensureUserAccounts: vi.fn() } };
});

import prisma from '../../src/config/database.js';
import auditService from '../../src/services/audit.service.js';
import walletService from '../../src/services/wallet.service.js';
import paymentService, { fulfillPaidIntent } from '../../src/services/payment.service.js';
import vipService, {
  PERMISSIONS_CAPABILITY,
  PERMISSION_GRANT_TYPE,
  PERMISSION_REVOKE_TYPE,
  permissionKeyAffinityMs,
  chainRowsFor,
  buildPermissionPayload,
  computeChainedPeriod,
  groupHoldUntil,
  isSellablePrice,
  membershipState,
  parsePermissionReferenceId,
  payloadHashOf,
  permissionReferenceId,
  pickBadge,
  vipPackageCreateSchema,
} from '../../src/services/vip.service.js';
import { VipExpiryScheduler, VIP_EXPIRY_LOCK_KEY } from '../../src/services/vipScheduler.service.js';
import { decideRetry } from '../../src/services/deliveryAdmin.service.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import { AdminPluginKeysController, toPluginKey } from '../../src/controllers/adminPluginKeys.controller.js';
import { parseUserIdList } from '../../src/controllers/vip.controller.js';
import { buildMembershipWhere } from '../../src/controllers/adminVip.controller.js';
import adminRouter from '../../src/routes/admin.routes.js';
import vipRouter from '../../src/routes/vip.routes.js';

const db = prisma as any;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-23T12:00:00.000Z');
const STEAM = '76561198000000001';

const pkg = {
  id: 'vippkg_vip_30d', key: 'vip-30d', name: 'VIP 30 วัน', description: null, permissionGroup: 'VIP',
  tierRank: 1, frameStyle: 'vip-gold', badgeLabel: 'VIP', priceThb: '199.00', durationDays: 30,
  isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
};

function resetDb() {
  db.vipMembership = {
    findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]),
  };
  db.vipPackage = { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() };
  db.paymentIntent = { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() };
  db.paymentWebhookEvent = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  db.server.findFirst = vi.fn().mockResolvedValue({ id: 7 });
  db.chatRank = { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) };
  db.serverCredential.count = vi.fn();
  db.deliveryJob.updateMany.mockResolvedValue({ count: 0 });
  db.deliveryJob.create.mockImplementation(({ data }: any) => Promise.resolve(data));
  db.$transaction.mockImplementation((arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg)));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
});

// ------------------------------------------------------------------------------------ pure rules

describe('VIP extension math (computeChainedPeriod)', () => {
  it('a first purchase starts now and lasts durationDays', () => {
    const period = computeChainedPeriod(NOW, 30, []);
    expect(period.startsAt).toEqual(NOW);
    expect(period.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
  });

  it('a renewal before expiry adds the full duration after the current expiry', () => {
    const current = { status: 'active', startsAt: new Date(NOW.getTime() - 20 * DAY), expiresAt: new Date(NOW.getTime() + 10 * DAY) };
    const period = computeChainedPeriod(NOW, 30, [current]);
    expect(period.startsAt).toEqual(current.expiresAt);
    expect(period.expiresAt).toEqual(new Date(NOW.getTime() + 40 * DAY));
  });

  it('chains after the LATEST live row and ignores ended / revoked rows', () => {
    const rows = [
      { status: 'active', startsAt: new Date(NOW.getTime() - 5 * DAY), expiresAt: new Date(NOW.getTime() + 25 * DAY) },
      { status: 'active', startsAt: new Date(NOW.getTime() + 25 * DAY), expiresAt: new Date(NOW.getTime() + 55 * DAY) },
      { status: 'revoked', startsAt: NOW, expiresAt: new Date(NOW.getTime() + 999 * DAY) },
      { status: 'active', startsAt: new Date(NOW.getTime() - 60 * DAY), expiresAt: new Date(NOW.getTime() - 30 * DAY) },
    ];
    const period = computeChainedPeriod(NOW, 30, rows);
    expect(period.startsAt).toEqual(new Date(NOW.getTime() + 55 * DAY));
    expect(period.expiresAt).toEqual(new Date(NOW.getTime() + 85 * DAY));
  });

  it('after an expiry the new period starts now (no back-dating)', () => {
    const expired = { status: 'active', startsAt: new Date(NOW.getTime() - 40 * DAY), expiresAt: new Date(NOW.getTime() - DAY) };
    expect(computeChainedPeriod(NOW, 30, [expired]).startsAt).toEqual(NOW);
  });

  it('null duration = permanent; invalid durations are rejected', () => {
    expect(computeChainedPeriod(NOW, null, [])).toEqual({ startsAt: NOW, expiresAt: null });
    expect(() => computeChainedPeriod(NOW, 0, [])).toThrow();
    expect(() => computeChainedPeriod(NOW, 1.5, [])).toThrow();
  });
});

describe('VIP state / badge / group rules', () => {
  it('membershipState derives scheduled / active / expired / revoked', () => {
    expect(membershipState({ status: 'active', startsAt: new Date(NOW.getTime() + DAY), expiresAt: null }, NOW)).toBe('scheduled');
    expect(membershipState({ status: 'active', startsAt: NOW, expiresAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe('active');
    expect(membershipState({ status: 'active', startsAt: new Date(0), expiresAt: NOW }, NOW)).toBe('expired');
    expect(membershipState({ status: 'revoked', startsAt: new Date(0), expiresAt: null }, NOW)).toBe('revoked');
  });

  it('groupHoldUntil: permanent wins, otherwise the latest live expiry; undefined when not held', () => {
    const a = { permissionGroup: 'VIP', status: 'active', startsAt: new Date(0), expiresAt: new Date(NOW.getTime() + DAY) };
    const b = { permissionGroup: 'VIP', status: 'active', startsAt: new Date(NOW.getTime() + DAY), expiresAt: new Date(NOW.getTime() + 31 * DAY) };
    const gone = { permissionGroup: 'VIP', status: 'expired', startsAt: new Date(0), expiresAt: new Date(NOW.getTime() + 99 * DAY) };
    expect(groupHoldUntil([a, b, gone], 'VIP', NOW)).toEqual(b.expiresAt);
    expect(groupHoldUntil([a, { ...b, expiresAt: null }], 'VIP', NOW)).toBeNull();
    expect(groupHoldUntil([gone], 'VIP', NOW)).toBeUndefined();
    expect(groupHoldUntil([a], 'VIP_PLUS', NOW)).toBeUndefined();
  });

  it('pickBadge picks the highest effective tier and ignores scheduled rows', () => {
    const gold = { status: 'active', startsAt: new Date(0), expiresAt: new Date(NOW.getTime() + DAY), package: { tierRank: 1, frameStyle: 'vip-gold', badgeLabel: 'VIP' } };
    const diamond = { status: 'active', startsAt: new Date(0), expiresAt: new Date(NOW.getTime() + DAY), package: { tierRank: 3, frameStyle: 'vip-diamond', badgeLabel: 'VIP+' } };
    const future = { status: 'active', startsAt: new Date(NOW.getTime() + DAY), expiresAt: null, package: { tierRank: 9, frameStyle: 'vip-ruby', badgeLabel: 'X' } };
    expect(pickBadge([gold, diamond, future], NOW)).toEqual({ tierRank: 3, frameStyle: 'vip-diamond', label: 'VIP+' });
    expect(pickBadge([future], NOW)).toBeNull();
  });

  it('only priced packages are sellable', () => {
    expect(isSellablePrice('0')).toBe(false);
    expect(isSellablePrice('0.00')).toBe(false);
    expect(isSellablePrice('199.00')).toBe(true);
    expect(isSellablePrice('1.5')).toBe(true);
  });
});

describe('permission job payload', () => {
  it('add carries exactly schemaVersion/steamId/group/action/expiresAt', () => {
    const expiresAt = new Date('2026-11-22T12:00:00.000Z');
    const payload = buildPermissionPayload({ steamId: STEAM, group: 'VIP', action: 'add', expiresAt });
    expect(payload).toEqual({ schemaVersion: 1, steamId: STEAM, group: 'VIP', action: 'add', expiresAt: '2026-11-22T12:00:00.000Z' });
    expect(Object.keys(payload).sort()).toEqual(['action', 'expiresAt', 'group', 'schemaVersion', 'steamId']);
  });

  it('remove and permanent add carry no expiresAt', () => {
    expect(buildPermissionPayload({ steamId: STEAM, group: 'VIP', action: 'remove', expiresAt: NOW })).toEqual({ schemaVersion: 1, steamId: STEAM, group: 'VIP', action: 'remove' });
    expect(buildPermissionPayload({ steamId: STEAM, group: 'VIP', action: 'add', expiresAt: null })).not.toHaveProperty('expiresAt');
  });

  it('reference ids round-trip and reject garbage', () => {
    expect(parsePermissionReferenceId(permissionReferenceId('user-1', 'VIP'))).toEqual({ userId: 'user-1', group: 'VIP' });
    expect(parsePermissionReferenceId('order-123')).toBeNull();
    expect(parsePermissionReferenceId('vip:u1:bad group')).toBeNull();
  });

  it('enqueue supersedes older pending jobs for the same key and creates one hashed job', async () => {
    const result = await vipService.enqueuePermissionJob(db, { userId: 'u1', steamId: STEAM, group: 'VIP', action: 'add', expiresAt: new Date(NOW.getTime() + 30 * DAY) });
    expect(result.queued).toBe(true);
    expect(db.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { deliveryType: { in: [PERMISSION_GRANT_TYPE, PERMISSION_REVOKE_TYPE] }, referenceId: 'vip:u1:VIP', playerSteamId: STEAM, status: 'pending' },
      data: expect.objectContaining({ status: 'completed', receiptId: `superseded:${result.jobId}` }),
    });
    const created = db.deliveryJob.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ id: result.jobId, serverId: 7, playerSteamId: STEAM, deliveryType: PERMISSION_GRANT_TYPE, referenceId: 'vip:u1:VIP', status: 'pending' });
    expect(created.payloadHash).toBe(crypto.createHash('sha256').update(JSON.stringify(created.payload)).digest('hex'));
    expect(created.payloadHash).toBe(payloadHashOf(created.payload));
    // host preference: capable + not drained first
    expect(db.server.findFirst.mock.calls[0][0].where).toEqual({ isActive: true, drainMode: false, capabilities: { has: PERMISSIONS_CAPABILITY } });
  });

  it('no Steam link -> nothing queued', async () => {
    const result = await vipService.enqueuePermissionJob(db, { userId: 'u1', steamId: null, group: 'VIP', action: 'add' });
    expect(result).toEqual({ queued: false, jobId: null, reason: 'no_steam' });
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------------- payments

describe('VIP payment completion never credits IC', () => {
  const vipIntent = {
    id: 'pi-vip', userId: 'u1', packageId: null, vipPackageId: pkg.id, provider: 'stripe', providerIntentId: 'cs_test_1',
    reference: 'IRIS-VIP-1', idempotencyKey: 'k1', amountThb: '199.00', pointsAmount: 0n, status: 'pending',
    metadata: { kind: 'vip', vipSnapshot: { durationDays: 30, permissionGroup: 'VIP' } }, expiresAt: new Date(Date.now() + 60_000),
  };

  function primeGrant() {
    db.vipMembership.findUnique.mockResolvedValue(null);
    db.vipPackage.findUnique.mockResolvedValue(pkg);
    db.user.findUnique.mockResolvedValue({ id: 'u1', steamId: STEAM });
    db.vipMembership.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm-1', ...data }));
  }

  it('fulfillPaidIntent grants VIP and never calls the wallet, even if pointsAmount were non-zero', async () => {
    primeGrant();
    const result = await fulfillPaidIntent(db, { ...vipIntent, pointsAmount: 999n }, {
      idempotencyKey: 'payment:pi-vip:credit', type: 'payment_topup', options: { referenceType: 'payment_intent' },
    });
    expect(result).toEqual({ kind: 'vip', membershipId: 'm-1', duplicate: false });
    expect(walletService.creditUser).not.toHaveBeenCalled();
    expect(db.vipMembership.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', packageId: pkg.id, paymentIntentId: 'pi-vip', source: 'purchase', permissionGroup: 'VIP' });
    expect(db.deliveryJob.create.mock.calls[0][0].data.deliveryType).toBe(PERMISSION_GRANT_TYPE);
  });

  it('a top-up intent still credits IC with the caller ledger key', async () => {
    const result = await fulfillPaidIntent(db, { id: 'pi-ic', userId: 'u1', vipPackageId: null, pointsAmount: 110n }, {
      idempotencyKey: 'payment:pi-ic:credit', type: 'payment_topup', options: { referenceType: 'payment_intent' },
    });
    expect(result).toEqual({ kind: 'topup', points: '110' });
    expect(walletService.creditUser).toHaveBeenCalledWith('u1', 110n, 'payment:pi-ic:credit', 'payment_topup', 'pi-ic', db, { referenceType: 'payment_intent' });
  });

  it('a paid sandbox webhook for a VIP intent grants VIP once and credits nothing', async () => {
    process.env.PAYMENT_SANDBOX_WEBHOOK_SECRET = 'test-secret';
    const intent = { ...vipIntent, provider: 'sandbox', providerIntentId: 'sb-vip' };
    const payload = { eventId: 'evt-vip', providerIntentId: 'sb-vip', reference: intent.reference, status: 'paid', amountThb: '199.00' };
    const signature = crypto.createHmac('sha256', 'test-secret').update(JSON.stringify(payload)).digest('hex');
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentIntent.findUnique.mockResolvedValue(intent);
    db.paymentWebhookEvent.create.mockResolvedValue({ id: 'we-1', status: 'received' });
    db.paymentWebhookEvent.update.mockResolvedValue({});
    db.paymentIntent.updateMany.mockResolvedValue({ count: 1 });
    db.paymentIntent.update.mockResolvedValue({ ...intent, status: 'completed' });
    primeGrant();

    const result = await paymentService.processWebhook('sandbox', payload, signature);

    expect(result).toMatchObject({ accepted: true, credited: false, vipGranted: true, kind: 'vip' });
    expect(walletService.creditUser).not.toHaveBeenCalled();
    expect(db.vipMembership.create).toHaveBeenCalledTimes(1);
  });

  it('grant is idempotent per intent: an existing membership is returned, nothing new is created', async () => {
    db.vipMembership.findUnique.mockResolvedValue({ id: 'm-existing', paymentIntentId: 'pi-vip' });
    const result = await vipService.grantFromPaymentIntent(db, vipIntent);
    expect(result).toMatchObject({ duplicate: true, membership: { id: 'm-existing' } });
    expect(db.vipMembership.create).not.toHaveBeenCalled();
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });

  it('uses the checkout snapshot duration, not the (possibly edited) package duration', async () => {
    primeGrant();
    db.vipPackage.findUnique.mockResolvedValue({ ...pkg, durationDays: 7 });
    await vipService.grantFromPaymentIntent(db, vipIntent);
    const data = db.vipMembership.create.mock.calls[0][0].data;
    expect(data.expiresAt.getTime() - data.startsAt.getTime()).toBe(30 * DAY);
  });

  it('a non-VIP intent cannot be granted VIP', async () => {
    await expect(vipService.grantFromPaymentIntent(db, { ...vipIntent, vipPackageId: null })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('VIP checkout (createVipIntent)', () => {
  beforeEach(() => {
    db.paymentIntent.findUnique.mockResolvedValue(null);
    db.vipPackage.findUnique.mockResolvedValue(pkg);
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });
    db.paymentIntent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'pi-new', status: 'pending', createdAt: NOW, ...data }));
  });

  it('bank_slip creates a pending VIP intent with pointsAmount 0 and a package snapshot', async () => {
    const result = await paymentService.createVipIntent('u1', pkg.id, 'idem-1', 'bank_slip', { slipImageUrl: '/uploads/slip.png', transferRef: 'KB-1' });
    const data = db.paymentIntent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', packageId: null, vipPackageId: pkg.id, provider: 'bank_slip', pointsAmount: 0n, amountThb: '199.00' });
    expect(data.metadata.vipSnapshot).toMatchObject({ key: 'vip-30d', durationDays: 30, permissionGroup: 'VIP' });
    expect(result.intent).toMatchObject({ kind: 'vip', pointsAmount: '0' });
  });

  it('refuses unpriced / inactive packages, missing Steam link, unknown providers and bad slips', async () => {
    db.vipPackage.findUnique.mockResolvedValueOnce({ ...pkg, priceThb: '0.00' });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'bank_slip', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    db.vipPackage.findUnique.mockResolvedValueOnce({ ...pkg, isActive: false });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'bank_slip', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    db.user.findUnique.mockResolvedValueOnce({ steamId: null });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'bank_slip', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'sandbox')).rejects.toMatchObject({ statusCode: 400 });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'bank_slip', {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(paymentService.createVipIntent('u1', pkg.id, 'k', 'bank_slip', { slipImageUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('replays the same intent for the same Idempotency-Key and 409s for a different package', async () => {
    db.paymentIntent.findUnique.mockResolvedValue({ id: 'pi-old', vipPackageId: pkg.id, provider: 'bank_slip', amountThb: '199.00', pointsAmount: 0n });
    const replay = await paymentService.createVipIntent('u1', pkg.id, 'idem-1', 'bank_slip', { transferRef: 'x' });
    expect(replay.replayed).toBe(true);
    await expect(paymentService.createVipIntent('u1', 'other', 'idem-1', 'bank_slip', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ------------------------------------------------------------------------------- expiry / revoke

describe('VIP expiry and revoke rules', () => {
  const due = { id: 'm-1', userId: 'u1', permissionGroup: 'VIP', expiresAt: new Date(NOW.getTime() - 1000) };

  it('expiry queues a Permissions remove when no other live row keeps the group', async () => {
    db.vipMembership.findMany.mockResolvedValueOnce([due]);
    db.vipMembership.updateMany.mockResolvedValue({ count: 1 });
    db.vipMembership.count.mockResolvedValue(0);
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });

    const result = await vipService.expireDue(NOW);

    expect(result).toEqual({ checked: 1, expired: 1, removalsQueued: 1 });
    expect(db.vipMembership.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'm-1', status: 'active', expiresAt: { lte: NOW } },
      data: { status: 'expired' },
    });
    const job = db.deliveryJob.create.mock.calls[0][0].data;
    expect(job.deliveryType).toBe(PERMISSION_REVOKE_TYPE);
    expect(job.payload).toEqual({ schemaVersion: 1, steamId: STEAM, group: 'VIP', action: 'remove' });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'vip_expire', resourceId: 'm-1' }));
  });

  it('expiry keeps the group (no remove) while a chained / other live row still holds it', async () => {
    db.vipMembership.findMany.mockResolvedValueOnce([due]);
    db.vipMembership.updateMany.mockResolvedValue({ count: 1 });
    db.vipMembership.count.mockResolvedValue(1);

    const result = await vipService.expireDue(NOW);

    expect(result).toEqual({ checked: 1, expired: 1, removalsQueued: 0 });
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });

  it('a row already expired/revoked concurrently is skipped', async () => {
    db.vipMembership.findMany.mockResolvedValueOnce([due]);
    db.vipMembership.updateMany.mockResolvedValue({ count: 0 });
    expect(await vipService.expireDue(NOW)).toEqual({ checked: 1, expired: 0, removalsQueued: 0 });
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });

  it('admin revoke flips the row, queues remove when unheld, and audits with the reason', async () => {
    db.vipMembership.findUnique.mockResolvedValue({ id: 'm-1', userId: 'u1', permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: null });
    db.vipMembership.updateMany.mockResolvedValue({ count: 1 });
    db.vipMembership.count.mockResolvedValue(0);
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });

    const result = await vipService.adminRevoke('m-1', 'chargeback', 'admin-1', NOW);

    expect(result.job).toMatchObject({ queued: true, stillHeld: false });
    expect(db.vipMembership.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'm-1', status: 'active' },
      data: { status: 'revoked', revokedBy: 'admin-1', reason: 'chargeback' },
    });
    expect(db.deliveryJob.create.mock.calls[0][0].data.deliveryType).toBe(PERMISSION_REVOKE_TYPE);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'vip_admin_revoke', userId: 'admin-1' }));
  });

  it('revoking an already revoked row is a 409', async () => {
    db.vipMembership.findUnique.mockResolvedValue({ id: 'm-1', status: 'revoked' });
    await expect(vipService.adminRevoke('m-1', 'again', 'admin-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('admin extend shifts the row and later chained rows of the same permission group', async () => {
    const row = { id: 'm-1', userId: 'u1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: new Date(NOW.getTime() - DAY), expiresAt: new Date(NOW.getTime() + 10 * DAY) };
    const later = { id: 'm-2', startsAt: row.expiresAt, expiresAt: new Date(NOW.getTime() + 40 * DAY) };
    db.vipMembership.findUnique.mockResolvedValue(row);
    db.vipMembership.findMany.mockResolvedValueOnce([later]).mockResolvedValue([]);
    db.vipMembership.update.mockImplementation(({ where, data }: any) => Promise.resolve({ ...row, id: where.id, ...data }));
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });

    const result = await vipService.adminExtend('m-1', 5, 'compensation', 'admin-1', NOW);

    expect(result.shifted).toBe(1);
    expect(db.vipMembership.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { expiresAt: new Date(NOW.getTime() + 15 * DAY), syncStatus: 'pending' } });
    expect(db.vipMembership.update).toHaveBeenCalledWith({ where: { id: 'm-2' }, data: { startsAt: new Date(NOW.getTime() + 15 * DAY), expiresAt: new Date(NOW.getTime() + 45 * DAY), syncStatus: 'pending' } });
    expect(db.vipMembership.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', permissionGroup: 'VIP', status: 'active' });
    expect(db.vipMembership.findMany.mock.calls[0][0].where).not.toHaveProperty('packageId');
    expect(db.deliveryJob.create.mock.calls[0][0].data.deliveryType).toBe(PERMISSION_GRANT_TYPE);
  });

  it('permanent or ended memberships cannot be extended', async () => {
    db.vipMembership.findUnique.mockResolvedValueOnce({ id: 'm', status: 'active', startsAt: NOW, expiresAt: null });
    await expect(vipService.adminExtend('m', 5, 'x x x', 'a', NOW)).rejects.toMatchObject({ statusCode: 409 });
    db.vipMembership.findUnique.mockResolvedValueOnce({ id: 'm', status: 'expired', startsAt: NOW, expiresAt: NOW });
    await expect(vipService.adminExtend('m', 5, 'x x x', 'a', NOW)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('job completion marks the matching memberships synced; dead-letter marks them failed', async () => {
    db.vipMembership.updateMany.mockResolvedValue({ count: 2 });
    db.deliveryJob.findFirst.mockResolvedValue(null);
    await vipService.onPermissionJobFinished(db, { id: 'j', deliveryType: PERMISSION_GRANT_TYPE, referenceId: 'vip:u1:VIP' }, 'completed', NOW);
    expect(db.vipMembership.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', permissionGroup: 'VIP', status: 'active', syncStatus: { not: 'synced' } },
      data: { syncStatus: 'synced', syncedAt: NOW },
    });
    await vipService.onPermissionJobFinished(db, { id: 'j', deliveryType: PERMISSION_REVOKE_TYPE, referenceId: 'vip:u1:VIP' }, 'dead_letter', NOW);
    expect(db.vipMembership.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', permissionGroup: 'VIP', status: { in: ['expired', 'revoked'] } },
      data: { syncStatus: 'failed' },
    });
  });

  it('an older job finishing while a newer job for the key is open does not touch sync status', async () => {
    db.deliveryJob.findFirst.mockResolvedValue({ id: 'newer' });
    const job = { id: 'old', deliveryType: PERMISSION_GRANT_TYPE, referenceId: 'vip:u1:VIP', playerSteamId: STEAM };
    expect(await vipService.onPermissionJobFinished(db, job, 'completed', NOW)).toBe(0);
    expect(await vipService.onPermissionJobFinished(db, job, 'dead_letter', NOW)).toBe(0);
    expect(db.vipMembership.updateMany).not.toHaveBeenCalled();
    expect(db.deliveryJob.findFirst.mock.calls[0][0].where).toMatchObject({
      id: { not: 'old' }, referenceId: 'vip:u1:VIP', playerSteamId: STEAM, status: { in: ['pending', 'leased'] },
    });
  });

  it('no server row: rows become unqueued (not pending forever) and the scheduler re-queues them later', async () => {
    db.server.findFirst.mockResolvedValue(null);
    const result = await vipService.enqueuePermissionJob(db, { userId: 'u1', steamId: STEAM, group: 'VIP', action: 'add' });
    expect(result).toEqual({ queued: false, jobId: null, reason: 'no_server' });
    expect(db.vipMembership.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', permissionGroup: 'VIP', syncStatus: 'pending', status: 'active' },
      data: { syncStatus: 'unqueued' },
    });
    expect(db.deliveryJob.create).not.toHaveBeenCalled();

    // still no server: the scheduler step does nothing
    db.vipMembership.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);
    expect(await vipService.requeueUnqueued(NOW)).toBe(0);

    // a server is back: the user is resynced (add queued)
    db.server.findFirst.mockResolvedValue({ id: 7 });
    db.user.findUnique.mockResolvedValue({ id: 'u1', steamId: STEAM });
    db.vipMembership.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([{ id: 'm-1', permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: new Date(NOW.getTime() + 30 * DAY) }]);
    expect(await vipService.requeueUnqueued(NOW)).toBe(1);
    expect(db.deliveryJob.create.mock.calls[0][0].data).toMatchObject({ deliveryType: PERMISSION_GRANT_TYPE, playerSteamId: STEAM });
  });

  it('the expiry scheduler only runs while it holds the Redis lock', async () => {
    const run = vi.fn().mockResolvedValue({ checked: 0, expired: 0, removalsQueued: 0 });
    const held = new VipExpiryScheduler(60_000, { status: 'ready', set: vi.fn().mockResolvedValue(null) }, run);
    expect(await held.tick(NOW)).toBeNull();
    expect(run).not.toHaveBeenCalled();
    const lock = { status: 'ready', set: vi.fn().mockResolvedValue('OK') };
    const owner = new VipExpiryScheduler(60_000, lock, run);
    expect(await owner.tick(NOW)).toEqual({ checked: 0, expired: 0, removalsQueued: 0 });
    expect(lock.set).toHaveBeenCalledWith(VIP_EXPIRY_LOCK_KEY, expect.any(String), 'PX', 55_000, 'NX');
    const down = new VipExpiryScheduler(60_000, { status: 'reconnecting', set: vi.fn() }, run);
    expect(await down.tick(NOW)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------------------- plugin claim

describe('permission job claim (any capable server)', () => {
  const controller = new PluginController();
  const now = new Date();
  const job = (id: string, extra: Record<string, unknown> = {}) => ({
    id, serverId: 1, playerSteamId: STEAM, deliveryType: PERMISSION_GRANT_TYPE, referenceId: 'vip:u1:VIP',
    status: 'pending', leaseToken: null, attempts: 0, createdAt: now, ...extra,
  });

  it('a server without the capability (or draining) gets no permission jobs', async () => {
    db.server.findUnique.mockResolvedValueOnce({ isActive: true, drainMode: false, capabilities: ['delivery.item.v1'] });
    expect(await controller.claimablePermissionJobs(2, now)).toEqual([]);
    db.server.findUnique.mockResolvedValueOnce({ isActive: true, drainMode: true, capabilities: [PERMISSIONS_CAPABILITY] });
    expect(await controller.claimablePermissionJobs(2, now)).toEqual([]);
    expect(db.deliveryJob.findMany).not.toHaveBeenCalled();
  });

  it('hands out only the newest job per key, supersedes older expired leases, skips keys leased elsewhere', async () => {
    db.server.findUnique.mockResolvedValueOnce({ isActive: true, drainMode: false, capabilities: [PERMISSIONS_CAPABILITY] });
    db.deliveryJob.findMany
      .mockResolvedValueOnce([
        job('new'),
        job('old', { status: 'leased', leaseToken: 't', leaseExpiresAt: new Date(now.getTime() - 1000) }),
        job('other', { referenceId: 'vip:u2:VIP', playerSteamId: '76561198000000002' }),
      ])
      .mockResolvedValueOnce([{ referenceId: 'vip:u2:VIP', playerSteamId: '76561198000000002' }]);

    const claimable = await controller.claimablePermissionJobs(2, now);

    expect(claimable.map((j: any) => j.id)).toEqual(['new']);
    expect(db.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'old', status: 'leased', leaseExpiresAt: { lt: now } },
      data: expect.objectContaining({ status: 'completed', receiptId: 'superseded:new' }),
    });
    expect(db.deliveryJob.findMany.mock.calls[0][0].where.AND[0]).not.toHaveProperty('serverId');
  });

  it('keeps the next job for a key on the server that completed the previous one within the Permissions cache window', async () => {
    const recent = [
      { referenceId: 'vip:u1:VIP', playerSteamId: STEAM, serverId: 1, updatedAt: now, receiptId: 'perm-1' },
      { referenceId: 'vip:u2:VIP', playerSteamId: '76561198000000002', serverId: 1, updatedAt: now, receiptId: 'superseded:x' },
    ];
    const candidates = () => [job('revoke', { deliveryType: PERMISSION_REVOKE_TYPE }), job('other', { referenceId: 'vip:u2:VIP', playerSteamId: '76561198000000002' })];
    const capable = { isActive: true, drainMode: false, capabilities: [PERMISSIONS_CAPABILITY] };

    db.server.findUnique.mockResolvedValueOnce(capable);
    db.deliveryJob.findMany.mockResolvedValueOnce(candidates()).mockResolvedValueOnce([]).mockResolvedValueOnce(recent);
    // Server 2's cache may be stale for u1 (server 1 applied the add < ClusterSyncTime ago): skip.
    // A superseded lease never pins its key, so u2's job is still claimable.
    expect((await controller.claimablePermissionJobs(2, now)).map((j: any) => j.id)).toEqual(['other']);
    const window = db.deliveryJob.findMany.mock.calls[2][0].where;
    expect(window.status).toBe('completed');
    expect(now.getTime() - window.updatedAt.gte.getTime()).toBe(permissionKeyAffinityMs());

    db.server.findUnique.mockResolvedValueOnce(capable);
    db.deliveryJob.findMany.mockResolvedValueOnce(candidates()).mockResolvedValueOnce([]).mockResolvedValueOnce(recent);
    expect((await controller.claimablePermissionJobs(1, now)).map((j: any) => j.id)).toEqual(['revoke', 'other']);
  });

  it('affinity window follows PERMISSIONS_CLUSTER_SYNC_SECONDS (min 20s) plus a margin', () => {
    expect(permissionKeyAffinityMs({} as any)).toBe(90_000);
    expect(permissionKeyAffinityMs({ PERMISSIONS_CLUSTER_SYNC_SECONDS: '20' } as any)).toBe(50_000);
    expect(permissionKeyAffinityMs({ PERMISSIONS_CLUSTER_SYNC_SECONDS: '5' } as any)).toBe(90_000);
  });

  it('admin retry of a permission job is refused when a newer job exists', () => {
    const dead = { status: 'dead_letter', deliveryType: PERMISSION_GRANT_TYPE };
    expect(decideRetry(dead, null, { newerPermissionJob: false })).toEqual({ kind: 'retry' });
    expect(decideRetry(dead, null, { newerPermissionJob: true })).toMatchObject({ kind: 'reject', status: 409 });
  });
});

// ------------------------------------------------------------------------------- plugin keys

describe('admin plugin keys', () => {
  const controller = new AdminPluginKeysController();
  const row = {
    id: 'cred-1', serverId: 1, keyId: 'pk_abc', label: 'x', status: 'active', createdAt: NOW, rotatedAt: null, revokedAt: null, lastUsedAt: null,
    server: { id: 1, name: 'Server1', map: 'TheIsland', isActive: true, drainMode: false, lastHeartbeat: null },
  };
  const res = () => {
    const r: any = { headers: {} as Record<string, string> };
    r.status = vi.fn(() => r);
    r.json = vi.fn(() => r);
    r.setHeader = vi.fn((k: string, v: string) => { r.headers[k] = v; });
    return r;
  };

  it('issue returns the secret exactly once, no-store, and never audits it', async () => {
    db.server.findUnique.mockResolvedValue({ id: 1 });
    db.serverCredential.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'cred-1', ...data }));
    db.serverCredential.findUnique.mockResolvedValue(row);
    const r = res();
    const next = vi.fn();

    await controller.issue({ body: { serverId: 1, label: 'x' }, user: { id: 'root-1' } } as any, r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(201);
    const body = r.json.mock.calls[0][0];
    expect(body.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(body.key).not.toHaveProperty('secretEnc');
    expect(r.headers['Cache-Control']).toBe('no-store');
    const stored = db.serverCredential.create.mock.calls[0][0].data.secretEnc;
    expect(stored).not.toBe(body.secret);
    expect(JSON.stringify((auditService.log as any).mock.calls)).not.toContain(body.secret);
    expect(JSON.stringify((auditService.log as any).mock.calls)).not.toContain(stored);
  });

  it('list never exposes a secret column', async () => {
    db.serverCredential.count.mockResolvedValue(1);
    db.serverCredential.findMany.mockResolvedValue([{ ...row, secretEnc: 'should-not-leak' }]);
    const r = res();
    await controller.list({ query: {} } as any, r, vi.fn());
    const body = r.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('should-not-leak');
    expect(db.serverCredential.findMany.mock.calls[0][0].select).not.toHaveProperty('secretEnc');
    expect(toPluginKey({ ...row, secretEnc: 'x' })).not.toHaveProperty('secretEnc');
  });

  it('rotate issues a new secret and only revokes the old key when asked', async () => {
    db.serverCredential.findUnique.mockResolvedValue(row);
    db.server.findUnique.mockResolvedValue({ id: 1 });
    db.serverCredential.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'cred-2', ...data }));
    const r = res();
    await controller.rotate({ params: { id: 'cred-1' }, body: {}, user: { id: 'root-1' } } as any, r, vi.fn());
    expect(r.json.mock.calls[0][0].secret).toMatch(/^[a-f0-9]{64}$/);
    expect(db.serverCredential.updateMany).not.toHaveBeenCalled();

    const r2 = res();
    await controller.rotate({ params: { id: 'cred-1' }, body: { revokePrevious: true }, user: { id: 'root-1' } } as any, r2, vi.fn());
    expect(db.serverCredential.updateMany).toHaveBeenCalledWith({ where: { keyId: 'pk_abc', status: 'active' }, data: expect.objectContaining({ status: 'revoked' }) });
  });

  it('revoke needs a reason and is audited', async () => {
    const next = vi.fn();
    await controller.revoke({ params: { id: 'cred-1' }, body: {}, user: { id: 'root-1' } } as any, res(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    db.serverCredential.findUnique.mockResolvedValue(row);
    await controller.revoke({ params: { id: 'cred-1' }, body: { reason: 'leaked key' }, user: { id: 'root-1' } } as any, res(), vi.fn());
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'plugin_key_revoke', resourceId: 'cred-1' }), expect.anything());
  });
});

// ------------------------------------------------------------------------------- guards / input

describe('route guards', () => {
  const routes = (router: any) => router.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({ path: layer.route.path, method: Object.keys(layer.route.methods)[0], handlers: layer.route.stack.map((s: any) => s.handle.name) }));

  it('plugin keys are root-only; VIP admin is admin|root; order detail and payments are admin|root', () => {
    const list = routes(adminRouter);
    for (const path of ['/plugin-keys', '/plugin-keys/:id/rotate', '/plugin-keys/:id/revoke']) {
      for (const route of list.filter((r: any) => r.path === path)) expect(route.handlers[0]).toBe('requireRoot');
    }
    const vip = list.filter((r: any) => r.path.startsWith('/vip/'));
    expect(vip.length).toBeGreaterThanOrEqual(10);
    for (const route of vip) expect(route.handlers[0]).toBe('requireWebsiteAdmin');
    expect(list.find((r: any) => r.path === '/orders/:id').handlers[0]).toBe('requireWebsiteAdmin');
    expect(list.find((r: any) => r.path === '/payments').handlers[0]).toBe('requireWebsiteAdmin');
  });

  it('VIP checkout and /me need a session; packages and badges are public', () => {
    const list = routes(vipRouter);
    expect(list.find((r: any) => r.path === '/checkout').handlers[0]).toBe('authenticate');
    expect(list.find((r: any) => r.path === '/me').handlers[0]).toBe('authenticate');
    expect(list.find((r: any) => r.path === '/packages').handlers).not.toContain('authenticate');
    expect(list.find((r: any) => r.path === '/badges').handlers).not.toContain('authenticate');
  });

  it('badge lookups are bounded and membership filters are validated', () => {
    expect(parseUserIdList('a, b,a')).toEqual(['a', 'b']);
    expect(() => parseUserIdList(Array.from({ length: 101 }, (_, i) => `u${i}`).join(','))).toThrow();
    expect(() => buildMembershipWhere({ state: 'nope' }, NOW)).toThrow();
    expect(buildMembershipWhere({ state: 'active' }, NOW)).toEqual({
      AND: [{ status: 'active', startsAt: { lte: NOW }, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] }],
    });
  });
});

// ------------------------------------------------------------------------------- admin lists

import { buildAdminOrderWhere } from '../../src/controllers/admin.controller.js';
import { AdminConsoleController } from '../../src/controllers/adminConsole.controller.js';

describe('admin list filters (orders / deliveries / audit)', () => {
  it('orders: status/serverId validated, search spans id, buyer and product', () => {
    expect(buildAdminOrderWhere({})).toEqual({});
    expect(() => buildAdminOrderWhere({ status: 'bogus' })).toThrow();
    expect(() => buildAdminOrderWhere({ serverId: '2abc' })).toThrow();
    const where: any = buildAdminOrderWhere({ status: 'delivered', serverId: '3', search: 'abc' });
    expect(where.AND[0]).toEqual({ status: 'delivered' });
    expect(where.AND[1]).toEqual({ serverId: 3 });
    expect(where.AND[2].OR).toHaveLength(4);
  });

  it('deliveries reject unknown deliveryType; audit rejects bad status / dates', async () => {
    const controller = new AdminConsoleController();
    const next = vi.fn();
    await controller.getDeliveries({ query: { deliveryType: 'teleport' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 400 }));
    await controller.getAuditLogs({ query: { status: 'maybe' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 400 }));
    await controller.getAuditLogs({ query: { from: 'not-a-date' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('deliveries accept permission job types', async () => {
    const controller = new AdminConsoleController();
    db.deliveryJob.count.mockResolvedValue(0);
    db.deliveryJob.findMany.mockResolvedValue([]);
    const res: any = { json: vi.fn() };
    const next = vi.fn();
    await controller.getDeliveries({ query: { deliveryType: 'permission_grant', search: STEAM } } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(db.deliveryJob.findMany.mock.calls[0][0].where).toMatchObject({ deliveryType: 'permission_grant' });
  });
});

describe('integration reconciliation (plugin timed groups, /vip, reserved groups)', () => {
  it('revoking a chained renewal re-asserts the shorter in-game hold with a new add', async () => {
    const earlyEnd = new Date(NOW.getTime() + 5 * DAY);
    const lateEnd = new Date(NOW.getTime() + 35 * DAY);
    const renewal = { id: 'm-2', userId: 'u1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: earlyEnd, expiresAt: lateEnd };
    const current = { id: 'm-1', userId: 'u1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: earlyEnd };
    db.vipMembership.findUnique.mockResolvedValue(renewal);
    db.vipMembership.updateMany.mockResolvedValue({ count: 1 });
    db.vipMembership.count.mockResolvedValue(1);
    // live rows before the revoke, later chained rows (none), live rows after the revoke
    db.vipMembership.findMany.mockResolvedValueOnce([current, renewal]).mockResolvedValueOnce([]).mockResolvedValue([current]);
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });

    const result = await vipService.adminRevoke('m-2', 'refunded renewal', 'admin-1', NOW);

    expect(result.job).toMatchObject({ queued: true });
    const job = db.deliveryJob.create.mock.calls[0][0].data;
    expect(job.deliveryType).toBe(PERMISSION_GRANT_TYPE);
    expect(job.payload).toEqual({ schemaVersion: 1, steamId: STEAM, group: 'VIP', action: 'add', expiresAt: earlyEnd.toISOString() });
  });

  it('revoking the CURRENT row of a chain moves the renewal earlier (no web/game gap) and re-queues the shorter add', async () => {
    const t1 = new Date(NOW.getTime() + 5 * DAY);
    const t2 = new Date(NOW.getTime() + 35 * DAY);
    const current = { id: 'm-1', userId: 'u1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: new Date(NOW.getTime() - 25 * DAY), expiresAt: t1 };
    const renewal = { id: 'm-2', userId: 'u1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: t1, expiresAt: t2 };
    const moved = { ...renewal, startsAt: NOW, expiresAt: new Date(NOW.getTime() + 30 * DAY) };
    db.vipMembership.findUnique.mockResolvedValue(current);
    db.vipMembership.updateMany.mockResolvedValue({ count: 1 });
    db.vipMembership.count.mockResolvedValue(1);
    db.vipMembership.findMany.mockResolvedValueOnce([current, renewal]).mockResolvedValueOnce([renewal]).mockResolvedValue([moved]);
    db.user.findUnique.mockResolvedValue({ steamId: STEAM });

    const result = await vipService.adminRevoke('m-1', 'chargeback', 'admin-1', NOW);

    expect(result.shifted).toBe(1);
    expect(db.vipMembership.findMany.mock.calls[1][0].where).toMatchObject({ permissionGroup: 'VIP', status: 'active', id: { not: 'm-1' }, startsAt: { gte: t1 } });
    expect(db.vipMembership.update).toHaveBeenCalledWith({ where: { id: 'm-2' }, data: { startsAt: NOW, expiresAt: moved.expiresAt, syncStatus: 'pending' } });
    const job = db.deliveryJob.create.mock.calls[0][0].data;
    expect(job.payload).toEqual({ schemaVersion: 1, steamId: STEAM, group: 'VIP', action: 'add', expiresAt: moved.expiresAt.toISOString() });
  });

  it('buying another package of the same group/tier chains after the current one (no lost days); a higher tier starts now', async () => {
    const pkg90 = { ...pkg, id: 'vippkg_vip_90d', key: 'vip-90d', durationDays: 90 };
    const running = { id: 'm-1', packageId: pkg.id, permissionGroup: 'VIP', status: 'active', startsAt: new Date(NOW.getTime() - 10 * DAY), expiresAt: new Date(NOW.getTime() + 20 * DAY), package: { tierRank: 1 } };
    db.vipPackage.findUnique.mockResolvedValue(pkg90);
    db.user.findUnique.mockResolvedValue({ id: 'u1', steamId: STEAM });
    db.vipMembership.findMany.mockResolvedValue([running]);
    db.vipMembership.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm-2', ...data }));

    await vipService.grantMembership(db, { userId: 'u1', packageId: pkg90.id, source: 'purchase', now: NOW });
    const data = db.vipMembership.create.mock.calls[0][0].data;
    expect(data.startsAt).toEqual(running.expiresAt);
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 110 * DAY));
    expect(db.deliveryJob.create.mock.calls[0][0].data.payload.expiresAt).toBe(new Date(NOW.getTime() + 110 * DAY).toISOString());

    db.vipPackage.findUnique.mockResolvedValue({ ...pkg90, id: 'vippkg_diamond', tierRank: 3 });
    await vipService.grantMembership(db, { userId: 'u1', packageId: 'vippkg_diamond', source: 'purchase', now: NOW });
    expect(db.vipMembership.create.mock.calls[1][0].data.startsAt).toEqual(NOW);
  });

  it('chainRowsFor keeps same-group rows of the same or higher tier only', () => {
    const rows = [
      { permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: NOW, package: { tierRank: 1 } },
      { permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: NOW, package: { tierRank: 3 } },
      { permissionGroup: 'VIP_PLUS', status: 'active', startsAt: NOW, expiresAt: NOW, package: { tierRank: 5 } },
    ];
    expect(chainRowsFor(rows, 'VIP', 1)).toHaveLength(2);
    expect(chainRowsFor(rows, 'VIP', 2)).toEqual([rows[1]]);
  });

  it('revoking a row that does not change the hold queues nothing', async () => {
    const end = new Date(NOW.getTime() + 30 * DAY);
    const other = { id: 'm-1', userId: 'u1', packageId: 'p2', permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: end };
    const revoked = { ...other, id: 'm-2', expiresAt: new Date(NOW.getTime() + 2 * DAY) };
    db.vipMembership.findUnique.mockResolvedValue(revoked);
    db.vipMembership.count.mockResolvedValue(1);
    db.vipMembership.findMany.mockResolvedValueOnce([other, revoked]).mockResolvedValueOnce([]).mockResolvedValue([other]);

    const result = await vipService.adminRevoke('m-2', 'duplicate grant', 'admin-1', NOW);

    expect(result.job).toMatchObject({ queued: false, stillHeld: true });
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });

  it('plugin /vip status: unknown Steam ID is unlinked, bad ids 400, VIP shows the group hold', async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    expect(await vipService.getPluginVipStatus(STEAM, NOW)).toMatchObject({ linked: false, isVip: false, vip: null });
    await expect(vipService.getPluginVipStatus('123', NOW)).rejects.toMatchObject({ statusCode: 400 });

    const end = new Date(NOW.getTime() + 10 * DAY);
    const renewalEnd = new Date(NOW.getTime() + 40 * DAY);
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
    db.vipMembership.findMany.mockResolvedValueOnce([
      { id: 'm-1', userId: 'u1', permissionGroup: 'VIP', status: 'active', startsAt: NOW, expiresAt: end, package: pkg },
      { id: 'm-2', userId: 'u1', permissionGroup: 'VIP', status: 'active', startsAt: end, expiresAt: renewalEnd, package: pkg },
    ]);
    const status = await vipService.getPluginVipStatus(STEAM, NOW);
    expect(status).toMatchObject({
      linked: true,
      isVip: true,
      vip: { tierRank: 1, frameStyle: 'vip-gold', label: 'VIP' },
      active: { state: 'active', permissionGroup: 'VIP', expiresAt: end.toISOString() },
      groups: [{ group: 'VIP', expiresAt: renewalEnd.toISOString() }],
    });
  });

  it('packages cannot target the built-in Admins / Default Permissions groups', () => {
    for (const group of ['Admins', 'admins', 'Default']) {
      expect(vipPackageCreateSchema.safeParse({ key: 'bad-pkg', name: 'x', permissionGroup: group }).success).toBe(false);
    }
    expect(vipPackageCreateSchema.safeParse({ key: 'vip-plus', name: 'VIP+', permissionGroup: 'VIP_Plus' }).success).toBe(true);
  });

  it('the plugin gateway routes GET /player/:steamId/vip with signed auth', async () => {
    const pluginRouter = (await import('../../src/routes/plugin.routes.js')).default as any;
    const layer = pluginRouter.stack.find((l: any) => l.route?.path === '/player/:steamId/vip');
    expect(layer?.route?.methods?.get).toBe(true);
  });
});
