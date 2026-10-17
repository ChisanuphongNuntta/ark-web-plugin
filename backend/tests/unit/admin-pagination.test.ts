import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import {
  ADMIN_PRODUCT_ORDER,
  ADMIN_SERVER_ORDER,
  AdminController,
  buildAdminServerWhere,
  toGameModeCounts,
} from '../../src/controllers/admin.controller.js';
import { AdminConsoleController } from '../../src/controllers/adminConsole.controller.js';
import { ProtectionController } from '../../src/controllers/protection.controller.js';
import { ContentController } from '../../src/controllers/content.controller.js';
import { UserRole } from '../../src/middlewares/auth.js';
import { HEARTBEAT_ONLINE_WINDOW_MS } from '../../src/utils/serverStatus.js';
import {
  buildPagination,
  clampPage,
  MAX_REQUEST_PAGE,
  paginateQuery,
  parsePagination,
  parseSearch,
  parseStringFilter,
  snapPageSize,
  totalPagesFor,
  wantsPagination,
} from '../../src/utils/pagination.js';

const db = prisma as any;
db.server.count ??= vi.fn();
db.server.groupBy ??= vi.fn();
db.chatRank ??= {};
db.chatRank.findMany ??= vi.fn();
db.chatRank.count ??= vi.fn();
db.category ??= {};
db.category.findMany ??= vi.fn();
db.category.count ??= vi.fn();
db.playerProtection ??= {};
db.playerProtection.findMany ??= vi.fn();
db.playerProtection.count ??= vi.fn();
db.protectionLog ??= {};
db.protectionLog.findMany ??= vi.fn();
db.protectionLog.count ??= vi.fn();
db.mediaFile.count ??= vi.fn();

const controller = new AdminController();
const consoleController = new AdminConsoleController();
const protectionController = new ProtectionController();
const contentController = new ContentController();

function call(handler: (req: any, res: any, next: any) => Promise<void>, query: Record<string, unknown>, user: any = { id: 'root', role: UserRole.ROOT }) {
  const res: any = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  return handler({ query, user, params: {} }, res, next).then(() => ({ res, next, body: res.json.mock.calls[0]?.[0] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
});

// ---------------------------------------------------------------- helper

describe('parsePagination', () => {
  it('defaults to page 1 / size 25', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
    expect(parsePagination(undefined)).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
  });

  it('treats page 0, negative, NaN, decimals and junk as page 1', () => {
    for (const page of ['0', '-3', 'abc', 'NaN', '1.5', '2abc', '', ' ', 'Infinity', -1, 0, Number.NaN, 2.5]) {
      expect(parsePagination({ page }).page).toBe(1);
    }
  });

  it('caps absurd pages so skip stays a safe int (real clamp happens after count)', () => {
    const p = parsePagination({ page: '99999999999999999999', pageSize: '100' });
    expect(p.page).toBe(MAX_REQUEST_PAGE);
    expect(p.skip).toBe((MAX_REQUEST_PAGE - 1) * 100);
    expect(p.skip).toBeLessThan(2 ** 31);
  });

  it('snaps pageSize to the allowed set and caps at 100', () => {
    expect(parsePagination({ pageSize: '7' }).pageSize).toBe(10);
    expect(parsePagination({ pageSize: '1' }).pageSize).toBe(10);
    expect(parsePagination({ pageSize: '20' }).pageSize).toBe(25);
    expect(parsePagination({ pageSize: '40' }).pageSize).toBe(50);
    expect(parsePagination({ pageSize: '75' }).pageSize).toBe(50); // tie snaps down
    expect(parsePagination({ pageSize: '80' }).pageSize).toBe(100);
    expect(parsePagination({ pageSize: '1000' }).pageSize).toBe(100);
    expect(parsePagination({ pageSize: '0' }).pageSize).toBe(25);
    expect(parsePagination({ pageSize: '-10' }).pageSize).toBe(25);
    expect(parsePagination({ pageSize: 'lots' }).pageSize).toBe(25);
    for (const size of [10, 25, 50, 100]) expect(parsePagination({ pageSize: String(size) }).pageSize).toBe(size);
  });

  it('accepts limit as an alias; pageSize wins when both are present', () => {
    expect(parsePagination({ limit: '50' }).pageSize).toBe(50);
    expect(parsePagination({ limit: '50', pageSize: '10' }).pageSize).toBe(10);
  });

  it('uses only the first value of repeated query params', () => {
    expect(parsePagination({ page: ['3', '9'], pageSize: ['10', '100'] })).toMatchObject({ page: 3, pageSize: 10 });
  });

  it('supports a non-snapping mode bounded to [1, 100]', () => {
    expect(parsePagination({}, { defaultPageSize: 24, snap: false }).pageSize).toBe(24);
    expect(parsePagination({ limit: '24' }, { defaultPageSize: 24, snap: false }).pageSize).toBe(24);
    expect(parsePagination({ limit: '5000' }, { defaultPageSize: 24, snap: false }).pageSize).toBe(100);
  });

  it('computes skip/take', () => {
    expect(parsePagination({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });
});

describe('parseStringFilter', () => {
  it('trims, takes the first repeated value and treats empty/all as no filter', () => {
    expect(parseStringFilter('  admin_grant ')).toBe('admin_grant');
    expect(parseStringFilter(['new_player', 'admin_granted'])).toBe('new_player');
    expect(parseStringFilter('')).toBeUndefined();
    expect(parseStringFilter('ALL')).toBeUndefined();
    expect(parseStringFilter(undefined)).toBeUndefined();
  });

  it('ignores non-string input and caps the length', () => {
    expect(parseStringFilter({ a: 'b' })).toBeUndefined();
    expect(parseStringFilter(5)).toBeUndefined();
    expect(parseStringFilter('x'.repeat(500))).toHaveLength(100);
    expect(parseStringFilter('x'.repeat(50), 32)).toHaveLength(32);
  });
});

describe('buildPagination / clampPage', () => {
  it('total=0 -> totalPages 1, page 1', () => {
    expect(buildPagination(0, 1, 25)).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
    expect(buildPagination(0, 7, 25)).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  });

  it('clamps past-the-end pages to the last page', () => {
    expect(buildPagination(51, 99, 25)).toEqual({ page: 3, pageSize: 25, total: 51, totalPages: 3 });
    expect(buildPagination(50, 3, 25)).toEqual({ page: 2, pageSize: 25, total: 50, totalPages: 2 });
    expect(clampPage(0, 100, 10)).toBe(1);
    expect(clampPage(-5, 100, 10)).toBe(1);
    expect(clampPage(Number.NaN, 100, 10)).toBe(1);
  });

  it('totalPages = max(1, ceil(total/pageSize))', () => {
    expect(totalPagesFor(1, 25)).toBe(1);
    expect(totalPagesFor(25, 25)).toBe(1);
    expect(totalPagesFor(26, 25)).toBe(2);
    expect(totalPagesFor(-4, 25)).toBe(1);
  });

  it('wantsPagination / parseSearch', () => {
    expect(wantsPagination({})).toBe(false);
    expect(wantsPagination({ page: '' })).toBe(false);
    expect(wantsPagination({ page: '1' })).toBe(true);
    expect(parseSearch('  island  ')).toBe('island');
    expect(parseSearch('   ')).toBeUndefined();
    expect(parseSearch({ x: 1 })).toBeUndefined();
    expect(parseSearch('a'.repeat(250))).toHaveLength(100);
  });
});

describe('paginateQuery', () => {
  it('uses one round trip when the page is in range', async () => {
    const run = vi.fn().mockResolvedValue([30, ['row']]);
    const out = await paginateQuery(parsePagination({ page: '2', pageSize: '10' }), run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(10, 10);
    expect(out.pagination).toEqual({ page: 2, pageSize: 10, total: 30, totalPages: 3 });
  });

  it('re-queries the clamped last page after counting', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce([23, []])
      .mockResolvedValueOnce([23, ['a', 'b', 'c']]);
    const out = await paginateQuery(parsePagination({ page: '9', pageSize: '10' }), run);
    expect(run).toHaveBeenNthCalledWith(1, 80, 10);
    expect(run).toHaveBeenNthCalledWith(2, 20, 10);
    expect(out.pagination).toEqual({ page: 3, pageSize: 10, total: 23, totalPages: 3 });
    expect(out.result[1]).toEqual(['a', 'b', 'c']);
  });

  it('returns page 1 for an empty list', async () => {
    const run = vi.fn().mockResolvedValueOnce([0, []]).mockResolvedValueOnce([0, []]);
    const out = await paginateQuery(parsePagination({ page: '5' }), run);
    expect(out.pagination).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
    expect(run).toHaveBeenLastCalledWith(0, 25);
  });

  it('is bounded when the list keeps shrinking concurrently', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce([100, []])
      .mockResolvedValueOnce([50, []])
      .mockResolvedValueOnce([20, []])
      .mockResolvedValueOnce([20, ['x']]);
    const out = await paginateQuery(parsePagination({ page: '20', pageSize: '10' }), run);
    expect(run).toHaveBeenCalledTimes(4);
    expect(run).toHaveBeenLastCalledWith(10, 10);
    expect(out.pagination).toEqual({ page: 2, pageSize: 10, total: 20, totalPages: 2 });
    expect(out.result[1]).toEqual(['x']);
  });

  it('never reports page > totalPages even if the list never settles', async () => {
    let total = 1000;
    const run = vi.fn(async () => { total = Math.floor(total / 3); return [total, []] as [number, unknown[]]; });
    const out = await paginateQuery(parsePagination({ page: '100', pageSize: '10' }), run);
    expect(run).toHaveBeenCalledTimes(4);
    expect(out.pagination.page).toBeLessThanOrEqual(out.pagination.totalPages);
    expect(out.pagination.page).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- servers

const now = new Date();
const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'IRIS-PVE-01',
  map: 'TheIsland',
  apiKey: 'legacy-secret-key-ABCD',
  isActive: true,
  drainMode: false,
  lastHeartbeat: now,
  gameMode: 'PVE',
  cluster: { id: 'c1', key: 'pve', name: 'PvE' },
  credentials: [{ id: 'cred' }],
  ...overrides,
});

describe('GET /admin/servers', () => {
  it('legacy (no page): returns every server with counts, ordered, without the full apiKey', async () => {
    db.server.findMany.mockResolvedValueOnce([serverRow(), serverRow({ id: 2, apiKey: 'other-key-WXYZ' })]);
    db.server.groupBy.mockResolvedValueOnce([
      { gameMode: 'PVE', _count: { _all: 2 } },
      { gameMode: 'PVPVE', _count: { _all: 1 } },
    ]);

    const { body, next } = await call(controller.getServers, {});
    expect(next).not.toHaveBeenCalled();
    expect(body.pagination).toBeUndefined();
    expect(body.servers).toHaveLength(2);
    expect(body.counts).toEqual({ all: 3, PVE: 2, PVE_MOD: 0, PVPVE: 1, NONE: 0 });
    expect(db.server.count).not.toHaveBeenCalled();

    const args = db.server.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual(ADMIN_SERVER_ORDER);
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();

    for (const s of body.servers) {
      expect(s.apiKey).toBeUndefined();
      expect(JSON.stringify(s)).not.toContain('legacy-secret-key');
      expect(JSON.stringify(s)).not.toContain('other-key');
      expect(s).not.toHaveProperty('credentials');
    }
    expect(body.servers[0].apiKeyLast4).toBe('ABCD');
    expect(body.servers[1].apiKeyLast4).toBe('WXYZ');
    expect(body.servers[0].online).toBe(true);
    expect(body.servers[0].activeCredentialCount).toBe(1);
  });

  it('ordering is cluster sortOrder, cluster name, server sortOrder, id', () => {
    expect(ADMIN_SERVER_ORDER).toEqual([
      { cluster: { sortOrder: 'asc' } },
      { cluster: { name: 'asc' } },
      { sortOrder: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('paginated: returns pagination + counts, applies skip/take', async () => {
    db.server.count.mockResolvedValueOnce(60);
    db.server.findMany.mockResolvedValueOnce([serverRow({ id: 11 })]);
    db.server.groupBy.mockResolvedValueOnce([{ gameMode: 'PVE', _count: { _all: 60 } }]);

    const { body } = await call(controller.getServers, { page: '2', pageSize: '10' });
    expect(body.pagination).toEqual({ page: 2, pageSize: 10, total: 60, totalPages: 6 });
    expect(body.counts.all).toBe(60);
    const args = db.server.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 10, take: 10, orderBy: ADMIN_SERVER_ORDER });
    expect(body.servers[0].apiKey).toBeUndefined();
    expect(body.servers[0].apiKeyLast4).toBe('ABCD');
  });

  it('paginated: clamps a past-the-end page and re-queries', async () => {
    db.server.count.mockResolvedValueOnce(12).mockResolvedValueOnce(12);
    db.server.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([serverRow({ id: 12 }), serverRow({ id: 13 })]);
    db.server.groupBy.mockResolvedValue([{ gameMode: 'PVE', _count: { _all: 12 } }]);

    const { body } = await call(controller.getServers, { page: '50', pageSize: '10' });
    expect(body.pagination).toEqual({ page: 2, pageSize: 10, total: 12, totalPages: 2 });
    expect(body.servers.map((s: any) => s.id)).toEqual([12, 13]);
    expect(db.server.findMany.mock.calls[1][0]).toMatchObject({ skip: 10, take: 10 });
  });

  it('applies search / gameMode / clusterId / status filters; counts ignore gameMode', async () => {
    db.server.count.mockResolvedValueOnce(0);
    db.server.findMany.mockResolvedValueOnce([]);
    db.server.groupBy.mockResolvedValueOnce([]);

    await call(controller.getServers, { page: '1', search: '  island ', gameMode: 'pvpve', clusterId: 'c1', status: 'online' });

    const rowWhere = db.server.findMany.mock.calls[0][0].where;
    const countsWhere = db.server.groupBy.mock.calls[0][0].where;
    const text = JSON.stringify(rowWhere);
    expect(text).toContain('"gameMode":"PVPVE"');
    expect(text).toContain('"clusterId":"c1"');
    expect(text).toContain('"contains":"island"');
    expect(text).toContain('displayName');
    expect(text).toContain('connectHost');
    expect(JSON.stringify(countsWhere)).not.toContain('gameMode');
    expect(JSON.stringify(countsWhere)).toContain('"clusterId":"c1"');
    expect(db.server.count.mock.calls[0][0].where).toEqual(rowWhere);
  });

  it('status filters mirror isServerOnline()', () => {
    const at = new Date('2026-10-17T00:00:00.000Z');
    const cutoff = new Date(at.getTime() - HEARTBEAT_ONLINE_WINDOW_MS);
    expect(buildAdminServerWhere({ status: 'online' }, at).where).toEqual({ AND: [{ lastHeartbeat: { gte: cutoff } }] });
    expect(buildAdminServerWhere({ status: 'offline' }, at).where).toEqual({
      AND: [{ OR: [{ lastHeartbeat: null }, { lastHeartbeat: { lt: cutoff } }] }],
    });
    expect(buildAdminServerWhere({ status: 'active' }, at).where).toEqual({ AND: [{ isActive: true }] });
    expect(buildAdminServerWhere({ status: 'inactive' }, at).where).toEqual({ AND: [{ isActive: false }] });
    expect(buildAdminServerWhere({ status: 'all', gameMode: '' }, at)).toEqual({ where: {}, gameMode: undefined });
    expect(buildAdminServerWhere({ clusterId: 'none' }, at).where).toEqual({ AND: [{ clusterId: null }] });
  });

  it('gameMode=NONE matches no rows (Server.gameMode is non-null)', async () => {
    db.server.findMany.mockResolvedValueOnce([]);
    db.server.groupBy.mockResolvedValueOnce([]);
    await call(controller.getServers, { gameMode: 'NONE' });
    expect(JSON.stringify(db.server.findMany.mock.calls[0][0].where)).toContain('"in":[]');
  });

  it('rejects unknown filter values with 400', async () => {
    const bad = await call(controller.getServers, { page: '1', gameMode: 'PVP' });
    expect(bad.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    const bad2 = await call(controller.getServers, { status: 'sleeping' });
    expect(bad2.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('toGameModeCounts totals every bucket', () => {
    expect(toGameModeCounts([
      { gameMode: 'PVE', _count: { _all: 3 } },
      { gameMode: 'PVE_MOD', _count: { _all: 2 } },
      { gameMode: null, _count: { _all: 1 } },
    ])).toEqual({ all: 6, PVE: 3, PVE_MOD: 2, PVPVE: 0, NONE: 1 });
    expect(toGameModeCounts(undefined)).toEqual({ all: 0, PVE: 0, PVE_MOD: 0, PVPVE: 0, NONE: 0 });
  });
});

// ---------------------------------------------------------------- products

describe('GET /admin/products', () => {
  it('legacy (no page): returns every product ordered isActive, name, id', async () => {
    db.product.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const { body } = await call(controller.getProducts, {});
    expect(body).toEqual({ products: [{ id: 1 }, { id: 2 }] });
    const args = db.product.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ isActive: 'asc' }, { name: 'asc' }, { id: 'asc' }]);
    expect(args.orderBy).toEqual(ADMIN_PRODUCT_ORDER);
    expect(args.skip).toBeUndefined();
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it('paginated with filters', async () => {
    db.product.count.mockResolvedValueOnce(120);
    db.product.findMany.mockResolvedValueOnce([{ id: 5 }]);
    const { body } = await call(controller.getProducts, {
      page: '3', pageSize: '50', search: ' rex ', categoryId: '4', productType: 'dino', isActive: 'false',
    });
    expect(body.pagination).toEqual({ page: 3, pageSize: 50, total: 120, totalPages: 3 });
    const args = db.product.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 100, take: 50, orderBy: ADMIN_PRODUCT_ORDER });
    expect(args.where).toEqual({
      AND: [
        { OR: [{ name: { contains: 'rex', mode: 'insensitive' } }, { externalKey: { contains: 'rex', mode: 'insensitive' } }] },
        { categoryId: 4 },
        { productType: 'dino' },
        { isActive: false },
      ],
    });
    expect(db.product.count.mock.calls[0][0].where).toEqual(args.where);
  });

  it('rejects bad filters with 400', async () => {
    for (const query of [{ categoryId: 'x' }, { productType: 'spaceship' }, { isActive: 'maybe' }]) {
      const { next } = await call(controller.getProducts, { page: '1', ...query });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    }
  });
});

// ---------------------------------------------------------------- users / api keys

describe('GET /admin/users and /admin/api-keys', () => {
  it('users: pageSize alias, snapped, limit kept for compat, id tiebreaker', async () => {
    db.user.count.mockResolvedValueOnce(30);
    db.user.findMany.mockResolvedValueOnce([{ id: 'u1', pointsBalance: 5n, totalSpent: 1n }]);
    const { body } = await call(controller.getUsers, { page: '2', pageSize: '7' });
    expect(body.pagination).toEqual({ page: 2, pageSize: 10, limit: 10, total: 30, totalPages: 3 });
    expect(body.users[0].pointsBalance).toBe(5);
    const args = db.user.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  });

  it('users: unbounded limit is capped at 100', async () => {
    db.user.count.mockResolvedValueOnce(5);
    db.user.findMany.mockResolvedValueOnce([]);
    const { body } = await call(controller.getUsers, { limit: '100000' });
    expect(body.pagination.pageSize).toBe(100);
    expect(db.user.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('api-keys: masked keys and clamped page', async () => {
    db.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    db.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'u1', apiKey: 'abcd1234efgh5678' }]);
    const { body } = await call(controller.getAllApiKeys, { page: '4' });
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 25, limit: 25, total: 3, totalPages: 1 });
    expect(body.apiKeys[0].apiKey).toBe('abcd...5678');
  });

  it('server admins stay scoped to their server', async () => {
    db.user.count.mockResolvedValueOnce(0);
    db.user.findMany.mockResolvedValueOnce([]);
    await call(controller.getUsers, { page: '1' }, { id: 'sa', role: UserRole.SERVER_ADMIN, apiKeyServerId: 7 });
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ apiKeyServerId: 7 });
  });
});

// ---------------------------------------------------------------- chat ranks / categories

describe('GET /admin/chat-ranks and /admin/categories', () => {
  it('chat ranks: legacy returns all; paginated returns pagination', async () => {
    db.chatRank.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const legacy = await call(controller.getChatRanks, {});
    expect(legacy.body).toEqual({ ranks: [{ id: 1 }] });

    db.chatRank.count.mockResolvedValueOnce(11);
    db.chatRank.findMany.mockResolvedValueOnce([{ id: 11 }]);
    const paged = await call(controller.getChatRanks, { page: '2', pageSize: '10', serverId: '0' });
    expect(paged.body.pagination).toEqual({ page: 2, pageSize: 10, total: 11, totalPages: 2 });
    expect(db.chatRank.findMany.mock.calls[1][0].where).toEqual({ AND: [{ serverId: null }] });
  });

  it('chat ranks: junk serverId is a 400, not a NaN query', async () => {
    const { next } = await call(controller.getChatRanks, { serverId: 'abc' });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('categories: legacy returns all; paginated returns pagination', async () => {
    db.category.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const legacy = await call(consoleController.getCategories, {});
    expect(legacy.body).toEqual({ categories: [{ id: 1 }] });

    db.category.count.mockResolvedValueOnce(2);
    db.category.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const paged = await call(consoleController.getCategories, { page: '1', pageSize: '10' });
    expect(paged.body.pagination).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
  });
});

describe('GET /admin/protection and /admin/protection/logs', () => {
  it('protection list: search matches Steam ID or tribe name and combines with filters', async () => {
    db.playerProtection.count.mockResolvedValueOnce(1);
    db.playerProtection.findMany.mockResolvedValueOnce([{ id: 1, tribeProtection: null }]);
    const { body } = await call(protectionController.getAllProtections, {
      page: '1', pageSize: '25', search: ' 7656 ', type: 'admin_granted', isActive: 'false',
    });
    expect(body.pagination).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1, limit: 25 });
    const where = db.playerProtection.count.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { protectionType: 'admin_granted' },
      { OR: [{ isActive: false }, { protectionEndAt: { lt: expect.any(Date) } }] },
      {
        OR: [
          { steamId: { contains: '7656', mode: 'insensitive' } },
          { tribeProtection: { is: { tribeName: { contains: '7656', mode: 'insensitive' } } } },
        ],
      },
    ]);
  });

  it('protection list: repeated / object filters never reach Prisma raw', async () => {
    db.playerProtection.count.mockResolvedValueOnce(0);
    db.playerProtection.findMany.mockResolvedValueOnce([]);
    await call(protectionController.getAllProtections, { type: ['new_player', 'x'], isActive: { a: 1 } });
    expect(db.playerProtection.count.mock.calls[0][0].where).toEqual({ AND: [{ protectionType: 'new_player' }] });
  });

  it('protection logs: junk serverId is a 400; serverId 0 is allowed', async () => {
    const bad = await call(protectionController.getProtectionLogs, { serverId: '12abc' });
    expect(bad.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    db.protectionLog.count.mockResolvedValueOnce(0);
    db.protectionLog.findMany.mockResolvedValueOnce([]);
    await call(protectionController.getProtectionLogs, { serverId: '0', eventType: 'admin_revoke' });
    expect(db.protectionLog.count.mock.calls[0][0].where).toEqual({ eventType: 'admin_revoke', serverId: 0 });
  });
});

describe('GET /content/admin/media', () => {
  it('folder / mimeType filters: repeated or object params never reach Prisma raw', async () => {
    db.mediaFile.count.mockResolvedValueOnce(0);
    db.mediaFile.findMany.mockResolvedValueOnce([]);
    const { next } = await call(contentController.getMediaFiles, {
      page: '1',
      folder: { a: 'b' },
      mimeType: ['image/', 'video/'],
    });
    expect(next).not.toHaveBeenCalled();
    expect(db.mediaFile.count.mock.calls[0][0].where).toEqual({ mimeType: { startsWith: 'image/' } });
  });

  it('plain string filters are trimmed and applied', async () => {
    db.mediaFile.count.mockResolvedValueOnce(0);
    db.mediaFile.findMany.mockResolvedValueOnce([]);
    await call(contentController.getMediaFiles, { folder: ' banners ', mimeType: 'image/' });
    expect(db.mediaFile.count.mock.calls[0][0].where).toEqual({ folder: 'banners', mimeType: { startsWith: 'image/' } });
  });
});
