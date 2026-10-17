import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../../src/config/database.js';
import auditService from '../../src/services/audit.service.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import {
  buildSiteSettings,
  parseUpdateSiteSettings,
} from '../../src/services/siteSettings.service.js';
import { decideRetry } from '../../src/services/deliveryAdmin.service.js';
import { parsePagination, queryString } from '../../src/controllers/adminConsole.controller.js';
import { AdminController, parseServerWrite } from '../../src/controllers/admin.controller.js';

// Replace JWT/session authentication with a header-driven stub so the REAL role guards in
// admin.routes.ts are exercised end to end.
vi.mock('../../src/middlewares/auth.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { AppError } = await import('../../src/middlewares/errorHandler.js');
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      const role = req.headers['x-test-role'];
      if (!role) return next(new AppError('Authentication required', 401));
      req.user = { id: `user-${role}`, discordId: 'd', role, isAdmin: role !== 'user', apiKeyServerId: null };
      next();
    },
  };
});

const { default: adminRoutes } = await import('../../src/routes/admin.routes.js');
const { default: siteRoutes } = await import('../../src/routes/site.routes.js');

const db = prisma as any;
db.siteSetting = { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), create: vi.fn() };
db.cluster = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
db.paymentIntent = { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() };
db.order.updateMany = vi.fn();
db.server.count = vi.fn();

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/site', siteRoutes);
  app.use('/api/admin', adminRoutes);
  app.use(errorHandler);
  return app;
}

const july = new Date('2026-07-01T05:00:00.000Z');

describe('site settings validation', () => {
  it('accepts season and announcement updates', () => {
    expect(parseUpdateSiteSettings({ season: 'christmas' })).toEqual({ season: 'christmas' });
    expect(parseUpdateSiteSettings({ announcement: { text: ' Winter sale ', href: '/shop' } })).toEqual({
      announcement: { text: 'Winter sale', href: '/shop' },
    });
    expect(parseUpdateSiteSettings({ announcement: { text: 'Join', href: 'https://discord.gg/x' } }).announcement?.href)
      .toBe('https://discord.gg/x');
    expect(parseUpdateSiteSettings({ announcement: null })).toEqual({ announcement: null });
  });

  it.each([
    ['empty body', {}],
    ['unknown season', { season: 'summer' }],
    ['unknown key', { season: 'auto', theme: 'dark' }],
    ['javascript href', { announcement: { text: 'x', href: 'javascript:alert(1)' } }],
    ['protocol-relative href', { announcement: { text: 'x', href: '//evil.example' } }],
    ['http href', { announcement: { text: 'x', href: 'http://plain.example' } }],
    ['empty text', { announcement: { text: '   ' } }],
    ['too long text', { announcement: { text: 'x'.repeat(281) } }],
    ['extra announcement key', { announcement: { text: 'x', html: '<b>' } }],
  ])('rejects %s with 400', (_label, body) => {
    expect(() => parseUpdateSiteSettings(body)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('builds the public shape with safe fallbacks for missing/malformed rows', () => {
    expect(buildSiteSettings([], july)).toEqual({ season: 'auto', activeSeason: 'default', announcement: null });
    expect(buildSiteSettings([
      { key: 'season', value: 'bogus' },
      { key: 'announcement', value: { text: 'x', href: 'javascript:1' } },
    ], new Date('2026-12-10T05:00:00.000Z'))).toEqual({ season: 'auto', activeSeason: 'christmas', announcement: null });
    expect(buildSiteSettings([
      { key: 'season', value: 'easter' },
      { key: 'announcement', value: { text: 'Hi' } },
    ], july)).toEqual({ season: 'easter', activeSeason: 'easter', announcement: { text: 'Hi' } });
  });
});

describe('site settings routes + role guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.siteSetting.findMany.mockResolvedValue([{ key: 'season', value: 'winter' }]);
    db.$transaction.mockImplementation((cb: any) => (typeof cb === 'function' ? cb(db) : Promise.all(cb)));
  });

  it('GET /site/settings is public', async () => {
    const res = await request(buildApp()).get('/api/site/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ season: 'winter', activeSeason: 'winter', announcement: null });
  });

  it.each(['user', 'server_admin'])('PUT /admin/site/settings rejects role %s with 403', async (role) => {
    const res = await request(buildApp()).put('/api/admin/site/settings').set('x-test-role', role).send({ season: 'christmas' });
    expect(res.status).toBe(403);
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it('PUT /admin/site/settings requires authentication', async () => {
    const res = await request(buildApp()).put('/api/admin/site/settings').send({ season: 'christmas' });
    expect(res.status).toBe(401);
  });

  it('PUT /admin/site/settings rejects invalid bodies with 400 before writing', async () => {
    const res = await request(buildApp()).put('/api/admin/site/settings').set('x-test-role', 'admin').send({ season: 'summer' });
    expect(res.status).toBe(400);
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it.each(['admin', 'root'])('PUT /admin/site/settings succeeds for %s and is audited', async (role) => {
    db.siteSetting.findMany
      .mockResolvedValueOnce([{ key: 'season', value: 'auto' }])
      .mockResolvedValueOnce([
        { key: 'season', value: 'christmas' },
        { key: 'announcement', value: { text: 'Merry', href: '/shop' } },
      ]);
    const res = await request(buildApp())
      .put('/api/admin/site/settings')
      .set('x-test-role', role)
      .send({ season: 'christmas', announcement: { text: 'Merry', href: '/shop' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ season: 'christmas', activeSeason: 'christmas', announcement: { text: 'Merry', href: '/shop' } });
    expect(db.siteSetting.upsert).toHaveBeenCalledTimes(2);
    expect(db.siteSetting.upsert.mock.calls[0][0]).toMatchObject({ where: { key: 'season' }, update: { value: 'christmas', updatedById: `user-${role}` } });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'site_settings_update', userId: `user-${role}` }), expect.anything());
  });
});

describe('delivery retry guard (pure)', () => {
  it.each([
    [{ status: 'pending', deliveryType: 'order' }, { status: 'queued' }, 'already_queued'],
    [{ status: 'leased', deliveryType: 'order' }, { status: 'delivering' }, 'already_queued'],
    [{ status: 'dead_letter', deliveryType: 'order' }, { status: 'failed' }, 'retry'],
    [{ status: 'failed', deliveryType: 'dino_catalog' }, { status: 'delivering' }, 'retry'],
    [{ status: 'completed', deliveryType: 'order' }, { status: 'delivered' }, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'order' }, { status: 'refunded' }, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'order' }, { status: 'cancelled' }, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'order' }, { status: 'delivered' }, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'order' }, null, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'dino_marketplace' }, null, 'reject'],
    [{ status: 'dead_letter', deliveryType: 'mystery' }, null, 'reject'],
  ] as const)('%o with order %o -> %s', (job, order, kind) => {
    expect(decideRetry(job, order).kind).toBe(kind);
  });
});

describe('admin deliveries routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((cb: any) => (typeof cb === 'function' ? cb(db) : Promise.all(cb)));
  });

  const deadJob = {
    id: 'order-1',
    status: 'dead_letter',
    deliveryType: 'order',
    referenceId: 'order-1',
    serverId: 2,
    playerSteamId: '7656',
    attempts: 5,
    maxAttempts: 5,
    error: 'Player offline',
    nextRetryAt: null,
    leaseToken: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T01:00:00Z'),
  };

  it('server_admin cannot list or retry deliveries', async () => {
    const app = buildApp();
    expect((await request(app).get('/api/admin/deliveries').set('x-test-role', 'server_admin')).status).toBe(403);
    expect((await request(app).post('/api/admin/deliveries/x/retry').set('x-test-role', 'user')).status).toBe(403);
    expect(db.deliveryJob.updateMany).not.toHaveBeenCalled();
  });

  it('lists deliveries with pagination and the documented item shape', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([{ ...deadJob, server: { name: 'Server2' } }]);
    db.deliveryJob.count.mockResolvedValueOnce(41);
    const res = await request(buildApp())
      .get('/api/admin/deliveries?status=dead_letter&serverId=2&page=2&pageSize=25')
      .set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(db.deliveryJob.findMany.mock.calls[0][0]).toMatchObject({ where: { status: 'dead_letter', serverId: 2 }, skip: 25, take: 25 });
    expect(res.body).toMatchObject({ total: 41, page: 2, pageSize: 25 });
    expect(res.body.items[0]).toEqual({
      id: 'order-1',
      status: 'dead_letter',
      deliveryType: 'order',
      referenceId: 'order-1',
      orderId: 'order-1',
      serverId: 2,
      serverName: 'Server2',
      steamId: '7656',
      attempts: 5,
      maxAttempts: 5,
      lastError: 'Player offline',
      nextRetryAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T01:00:00.000Z',
    });
  });

  it('deliveries snap pageSize to the contract set and clamp a past-the-end page', async () => {
    db.deliveryJob.count.mockResolvedValue(41);
    db.deliveryJob.findMany.mockResolvedValue([]);
    const res = await request(buildApp()).get('/api/admin/deliveries?page=99&pageSize=20').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    // 20 snaps to 25; 41 rows / 25 = 2 pages, so page 99 is served as page 2 (skip 25).
    expect(res.body).toMatchObject({ total: 41, page: 2, pageSize: 25 });
    expect(db.deliveryJob.findMany.mock.calls.at(-1)[0]).toMatchObject({ skip: 25, take: 25 });
    db.deliveryJob.count.mockReset();
    db.deliveryJob.findMany.mockReset();
  });

  it('rejects an invalid status filter', async () => {
    const res = await request(buildApp()).get('/api/admin/deliveries?status=lost').set('x-test-role', 'root');
    expect(res.status).toBe(400);
  });

  it('retries a dead-lettered order job through the existing queue and audits it', async () => {
    db.deliveryJob.findUnique.mockResolvedValueOnce(deadJob);
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'failed' });
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 1 });
    db.order.updateMany.mockResolvedValueOnce({ count: 1 });
    db.fulfillment.updateMany.mockResolvedValueOnce({ count: 1 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ ...deadJob, status: 'pending', maxAttempts: 10, server: { name: 'Server2' } });

    const res = await request(buildApp()).post('/api/admin/deliveries/order-1/retry').set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, retried: true, alreadyQueued: false, item: { status: 'pending', maxAttempts: 10 } });
    expect(db.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'dead_letter' },
      data: { status: 'pending', leaseToken: null, leaseExpiresAt: null, nextRetryAt: null, maxAttempts: 10 },
    });
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { id: 'order-1', status: 'failed' }, data: { status: 'queued' } });
    expect(db.fulfillment.updateMany).toHaveBeenCalledWith({ where: { orderId: 'order-1', status: 'failed' }, data: { status: 'queued', failedAt: null } });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delivery_retry', resourceId: 'order-1' }), expect.anything());
  });

  it('is idempotent: a concurrent retry that loses the conditional update reports alreadyQueued without auditing', async () => {
    db.deliveryJob.findUnique.mockResolvedValueOnce(deadJob);
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'failed' });
    db.deliveryJob.updateMany.mockResolvedValueOnce({ count: 0 });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ ...deadJob, status: 'pending', server: { name: 'Server2' } });

    const res = await request(buildApp()).post('/api/admin/deliveries/order-1/retry').set('x-test-role', 'root');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ retried: false, alreadyQueued: true });
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('a second retry on an already-pending job is a no-op', async () => {
    db.deliveryJob.findUnique.mockResolvedValueOnce({ ...deadJob, status: 'pending' });
    db.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'queued' });
    db.deliveryJob.findUniqueOrThrow.mockResolvedValueOnce({ ...deadJob, status: 'pending', server: { name: 'Server2' } });
    const res = await request(buildApp()).post('/api/admin/deliveries/order-1/retry').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ retried: false, alreadyQueued: true });
    expect(db.deliveryJob.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['refunded order', deadJob, { id: 'order-1', status: 'refunded' }],
    ['completed job', { ...deadJob, status: 'completed' }, { id: 'order-1', status: 'delivered' }],
    ['marketplace dino (escrow already refunded)', { ...deadJob, deliveryType: 'dino_marketplace', referenceId: 'listing-1' }, null],
  ])('refuses to retry a %s with 409', async (_label, job, order) => {
    db.deliveryJob.findUnique.mockResolvedValueOnce(job);
    if (order) db.order.findUnique.mockResolvedValueOnce(order);
    const res = await request(buildApp()).post('/api/admin/deliveries/order-1/retry').set('x-test-role', 'admin');
    expect(res.status).toBe(409);
    expect(db.deliveryJob.updateMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('404s an unknown job', async () => {
    db.deliveryJob.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp()).post('/api/admin/deliveries/nope/retry').set('x-test-role', 'admin');
    expect(res.status).toBe(404);
  });
});

describe('admin console misc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((cb: any) => (typeof cb === 'function' ? cb(db) : Promise.all(cb)));
  });

  it('parsePagination clamps page size and defaults', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 25 });
    expect(parsePagination({ page: '3', pageSize: '500' })).toEqual({ page: 3, pageSize: 100 });
    expect(parsePagination({ page: '-1', pageSize: 'abc' })).toEqual({ page: 1, pageSize: 25 });
  });

  it('parsePagination follows the shared contract (strict ints, snapped size, capped page)', () => {
    expect(parsePagination({ page: '2abc', pageSize: '30' })).toEqual({ page: 1, pageSize: 25 });
    expect(parsePagination({ pageSize: '7' }).pageSize).toBe(10);
    expect(parsePagination({ page: '1000000000000000' }).page).toBe(1_000_000);
  });

  it('clusters are root-only', async () => {
    db.cluster.findMany.mockResolvedValue([]);
    const app = buildApp();
    expect((await request(app).get('/api/admin/clusters').set('x-test-role', 'admin')).status).toBe(403);
    expect((await request(app).get('/api/admin/clusters').set('x-test-role', 'root')).status).toBe(200);
  });

  it('cluster create validates key format', async () => {
    const res = await request(buildApp()).post('/api/admin/clusters').set('x-test-role', 'root').send({ key: 'Bad Key', name: 'x' });
    expect(res.status).toBe(400);
    expect(db.cluster.create).not.toHaveBeenCalled();
  });

  it('audit-logs maps rows to the documented shape', async () => {
    db.auditLog.findMany.mockResolvedValueOnce([{
      id: 9, action: 'delivery_retry', resource: 'delivery_job', resourceId: 'j1', userId: 'u1', userEmail: null,
      ipAddress: '1.2.3.4', status: 'success', errorMessage: null, oldValue: null, newValue: '{}', metadata: null,
      createdAt: new Date('2026-10-17T00:00:00Z'),
    }]);
    db.auditLog.count.mockResolvedValueOnce(1);
    const res = await request(buildApp()).get('/api/admin/audit-logs?action=delivery_retry&actorId=u1').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({ action: 'delivery_retry', userId: 'u1' });
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 25, items: [{ id: 9, actorId: 'u1', createdAt: '2026-10-17T00:00:00.000Z' }] });
  });

  it('queryString trims strings and rejects arrays/objects with 400', () => {
    expect(queryString({ action: '  x  ' }, 'action')).toBe('x');
    expect(queryString({ action: '   ' }, 'action')).toBeUndefined();
    expect(queryString({}, 'action')).toBeUndefined();
    expect(() => queryString({ status: ['a', 'b'] }, 'status')).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => queryString({ action: { x: '1' } }, 'action')).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('audit-logs and promotions answer 400 (not 500) for non-string filters', async () => {
    const app = buildApp();
    const audit = await request(app).get('/api/admin/audit-logs?action[x]=1').set('x-test-role', 'admin');
    expect(audit.status).toBe(400);
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
    const promos = await request(app).get('/api/admin/promotions?status=a&status=b').set('x-test-role', 'admin');
    expect(promos.status).toBe(400);
  });

  it('audit-logs clamp a past-the-end page to the last page', async () => {
    db.auditLog.count.mockResolvedValue(3);
    db.auditLog.findMany.mockResolvedValue([]);
    const res = await request(buildApp()).get('/api/admin/audit-logs?page=50&pageSize=10').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 10 });
    expect(db.auditLog.findMany.mock.calls.at(-1)[0]).toMatchObject({ skip: 0, take: 10 });
    db.auditLog.count.mockReset();
    db.auditLog.findMany.mockReset();
  });

  it('server delete / regenerate-key validate the id and write an audit entry without the key', async () => {
    const app = buildApp();
    for (const bad of ['abc', '2abc', '0']) {
      expect((await request(app).post(`/api/admin/servers/${bad}/regenerate-key`).set('x-test-role', 'root')).status).toBe(400);
      expect((await request(app).delete(`/api/admin/servers/${bad}`).set('x-test-role', 'root')).status).toBe(400);
    }
    expect(db.server.update).not.toHaveBeenCalled();

    db.server.findUnique.mockResolvedValueOnce({ id: 7 });
    db.server.update.mockImplementationOnce(async ({ data }: any) => ({
      id: 7, name: 'S7', isActive: true, drainMode: false, lastHeartbeat: null, apiKey: data.apiKey,
      webhookUrl: null, cluster: null, credentials: [{ id: 'c1' }],
    }));
    const regen = await request(app).post('/api/admin/servers/7/regenerate-key').set('x-test-role', 'root');
    expect(regen.status).toBe(200);
    const newKey: string = regen.body.server.apiKey;
    expect(typeof newKey).toBe('string');
    expect(regen.body.server).toMatchObject({ id: 7, activeCredentialCount: 1, online: false });
    expect(regen.body.server.credentials).toBeUndefined();
    const regenAudit = (auditService.log as any).mock.calls.find((c: any[]) => c[0].action === 'server_regenerate_key');
    expect(regenAudit?.[0]).toMatchObject({ resource: 'server', resourceId: '7' });
    expect(JSON.stringify(regenAudit?.[0])).not.toContain(newKey);

    db.server.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).delete('/api/admin/servers/8').set('x-test-role', 'root')).status).toBe(404);

    db.server.delete = vi.fn().mockResolvedValueOnce({});
    db.server.findUnique.mockResolvedValueOnce({ id: 9, name: 'S9', map: 'TheIsland', clusterId: null, apiKey: 'secret-key-9' });
    expect((await request(app).delete('/api/admin/servers/9').set('x-test-role', 'root')).status).toBe(200);
    const delAudit = (auditService.log as any).mock.calls.find((c: any[]) => c[0].action === 'server_delete');
    expect(delAudit?.[0]).toMatchObject({ resourceId: '9', oldValue: { name: 'S9', map: 'TheIsland' } });
    expect(JSON.stringify(delAudit?.[0])).not.toContain('secret-key-9');
  });

  it('market listings never select cryopod bytes', async () => {
    db.dinoListing.findMany.mockResolvedValueOnce([]);
    db.dinoListing.count = vi.fn().mockResolvedValueOnce(0);
    const res = await request(buildApp()).get('/api/admin/market/listings?status=listed').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    const args = db.dinoListing.findMany.mock.calls[0][0];
    expect(args.select.cryopodData).toBeUndefined();
    expect(args.where).toEqual({ status: 'listed' });
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('server write schema accepts directory fields and rejects drainMode / bad ports', () => {
    expect(parseServerWrite({ gameMode: 'PVE_MOD', connectHost: 'ark.iris-th.cloud', connectPort: 28025, isListed: true, displayName: '' }))
      .toEqual({ gameMode: 'PVE_MOD', connectHost: 'ark.iris-th.cloud', connectPort: 28025, isListed: true, displayName: null });
    expect(() => parseServerWrite({ drainMode: false })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parseServerWrite({ connectPort: 70000 })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parseServerWrite({ gameMode: 'PVP' })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parseServerWrite({ imageUrl: 'javascript:alert(1)' })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('bank slip approval hardening', () => {
  const controller = new AdminController();
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_ADMIN_DEMO_FIXTURES;
  });

  it('404s an unknown slip id instead of crediting the admin', async () => {
    db.paymentIntent.findUnique.mockResolvedValueOnce(null);
    const next = vi.fn();
    await controller.approveSlip({ params: { id: 'topup-slip-001' }, body: {}, user: { id: 'admin-1', role: 'admin' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to approve a non bank-slip intent', async () => {
    db.paymentIntent.findUnique.mockResolvedValueOnce({ id: 'pi-1', provider: 'stripe', status: 'pending', pointsAmount: 100n, userId: 'u1' });
    const next = vi.fn();
    await controller.approveSlip({ params: { id: 'pi-1' }, body: {}, user: { id: 'admin-1' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  it('refuses to approve an expired/failed slip', async () => {
    db.paymentIntent.findUnique.mockResolvedValueOnce({ id: 'pi-2', provider: 'bank_slip', status: 'failed', pointsAmount: 100n, userId: 'u1' });
    const next = vi.fn();
    await controller.approveSlip({ params: { id: 'pi-2' }, body: {}, user: { id: 'admin-1' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  it('refuses to reject an already-credited slip', async () => {
    db.paymentIntent.findUnique.mockResolvedValueOnce({ id: 'pi-3', provider: 'bank_slip', status: 'completed', userId: 'u1' });
    const next = vi.fn();
    await controller.rejectSlip({ params: { id: 'pi-3' }, body: {}, user: { id: 'admin-1' } } as any, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(db.paymentIntent.updateMany).not.toHaveBeenCalled();
  });

  it('pending-slips returns no fake fixtures unless demo mode is explicitly enabled', async () => {
    db.paymentIntent.findMany.mockResolvedValueOnce([]);
    const res: any = { json: vi.fn() };
    await controller.getPendingSlips({ user: { id: 'admin-1' } } as any, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ topups: [], count: 0 });
  });
});

describe('GET /admin/stats additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps existing fields and adds slip/delivery/server/today figures', async () => {
    db.user.count.mockResolvedValueOnce(10);
    db.order.count.mockResolvedValueOnce(20).mockResolvedValueOnce(2);
    db.order.aggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: 5000 } })
      .mockResolvedValueOnce({ _sum: { totalPrice: 300 } });
    db.order.findMany.mockResolvedValueOnce([]);
    db.paymentIntent.count.mockResolvedValueOnce(3);
    db.deliveryJob.count.mockResolvedValueOnce(4);
    db.server.count.mockResolvedValueOnce(2);
    db.paymentIntent.aggregate.mockResolvedValueOnce({ _sum: { amountThb: '598.00' } });

    const res = await request(buildApp()).get('/api/admin/stats').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      totalUsers: 10,
      totalOrders: 20,
      totalRevenue: 5000,
      pendingOrders: 2,
      pendingSlips: 3,
      failedDeliveries: 4,
      onlineServers: 2,
      todayRevenue: 300,
      todayTopupThb: 598,
    });
    expect(db.deliveryJob.count).toHaveBeenCalledWith({ where: { status: { in: ['failed', 'dead_letter'] } } });
    expect(db.paymentIntent.count).toHaveBeenCalledWith({ where: { provider: 'bank_slip', status: 'pending' } });
  });
});
