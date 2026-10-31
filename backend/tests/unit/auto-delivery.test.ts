// "Auto" delivery: the buyer does not pick a server. The cart sync resolves one, checkout flags the jobs, and
// when the buyer logs into another server the plugin login hook moves the waiting jobs there.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/playerPresence.service.js', () => ({
  recordLogin: vi.fn().mockResolvedValue(undefined),
  lastLoginServer: vi.fn().mockResolvedValue(null),
}));

import prisma from '../../src/config/database.js';
import cartController from '../../src/controllers/cart.controller.js';
import { PluginController } from '../../src/controllers/plugin.controller.js';
import { lastLoginServer, recordLogin } from '../../src/services/playerPresence.service.js';
import { releaseStreaks } from '../../src/services/deliveryRelease.service.js';
import {
  ANY_SERVER_FLAG,
  canRetarget,
  missingCapabilities,
  pickAutoServer,
  serverDeliveryBlock,
} from '../../src/services/deliveryTarget.service.js';

const db = prisma as any;
const plugin = new PluginController();

const server = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `S${id}`,
  isActive: true,
  drainMode: false,
  isAvailable: true,
  playerCount: 0,
  capabilities: [] as string[],
  credentials: [{ id: `cred-${id}` }],
  ...over,
});

describe('deliveryTarget: readiness and capability rules', () => {
  it('blocks inactive, closed, draining and credential-less servers', () => {
    expect(serverDeliveryBlock(server(1))).toBeNull();
    expect(serverDeliveryBlock(server(1, { isActive: false }))?.status).toBe(400);
    expect(serverDeliveryBlock(server(1, { isAvailable: false }))?.status).toBe(409);
    expect(serverDeliveryBlock(server(1, { drainMode: true }))?.status).toBe(409);
    expect(serverDeliveryBlock(server(1, { credentials: [] }))?.status).toBe(409);
  });

  it('lists the capabilities a server lacks', () => {
    expect(missingCapabilities(['a', 'b'], { capabilities: ['a'] })).toEqual(['b']);
    expect(missingCapabilities(undefined, { capabilities: null })).toEqual([]);
  });

  it('canRetarget needs a ready target that has every capability', () => {
    expect(canRetarget(['dino'], server(2, { capabilities: ['dino'] }))).toBe(true);
    expect(canRetarget(['dino'], server(2, { capabilities: [] }))).toBe(false);
    expect(canRetarget([], server(2, { drainMode: true }))).toBe(false);
  });
});

describe('pickAutoServer', () => {
  it('prefers the server of the last login when it can deliver', () => {
    const picked = pickAutoServer([server(1, { playerCount: 30 }), server(2, { playerCount: 1 })], [[]], 2);
    expect(picked?.id).toBe(2);
  });

  it('falls back to the busiest ready server, then the lowest id', () => {
    expect(pickAutoServer([server(1, { playerCount: 5 }), server(2, { playerCount: 9 })], [[]], null)?.id).toBe(2);
    expect(pickAutoServer([server(3), server(2)], [[]], null)?.id).toBe(2);
  });

  it('ignores a last-login server that is not ready', () => {
    const picked = pickAutoServer([server(1, { drainMode: true }), server(2)], [[]], 1);
    expect(picked?.id).toBe(2);
  });

  it('needs one server that satisfies every line, else returns null', () => {
    const servers = [server(1, { capabilities: ['items'] }), server(2, { capabilities: ['dino'] })];
    expect(pickAutoServer(servers, [['items'], ['dino']], null)).toBeNull();
    expect(pickAutoServer(servers, [['items']], null)?.id).toBe(1);
  });

  it('returns null when no server is ready', () => {
    expect(pickAutoServer([server(1, { credentials: [] })], [[]], null)).toBeNull();
  });
});

describe('POST /cart/sync with auto lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lastLoginServer as any).mockResolvedValue(null);
  });

  const product = (over: Record<string, unknown> = {}) => ({
    id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null, requiredCapabilities: [], ...over,
  });

  function mockReplaceTx() {
    const tx: any = {
      cart: { upsert: vi.fn().mockResolvedValue({ id: 'c1' }) },
      cartItem: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction.mockImplementationOnce((cb: any) => cb(tx));
    return tx;
  }

  const run = async (lines: unknown[], steamId: string | null = '76561198000000001') => {
    const req: any = { user: { id: 'u1', steamId }, body: { lines } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();
    await cartController.syncCart(req, res, next);
    return { next, res };
  };

  it('stores a line without a server on the server of the buyer\'s last login', async () => {
    db.product.findUnique.mockResolvedValue(product());
    db.server.findMany.mockResolvedValueOnce([server(1, { playerCount: 20 }), server(2)]);
    (lastLoginServer as any).mockResolvedValueOnce(2);
    const tx = mockReplaceTx();
    db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] });

    const { next } = await run([{ productId: 1, quantity: 2 }]);

    expect(next).not.toHaveBeenCalled();
    expect(lastLoginServer).toHaveBeenCalledWith('76561198000000001');
    expect(tx.cartItem.createMany).toHaveBeenCalledWith({ data: [{ cartId: 'c1', productId: 1, serverId: 2, quantity: 2 }] });
  });

  it('merges an auto line with an explicit line that lands on the same server', async () => {
    db.product.findUnique.mockResolvedValue(product());
    db.server.findUnique.mockResolvedValue(server(1));
    db.server.findMany.mockResolvedValueOnce([server(1)]);
    const tx = mockReplaceTx();
    db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] });

    await run([{ productId: 1, serverId: 1, quantity: 1 }, { productId: 1, quantity: 2 }]);

    expect(tx.cartItem.createMany).toHaveBeenCalledWith({ data: [{ cartId: 'c1', productId: 1, serverId: 1, quantity: 3 }] });
  });

  it('answers 409 when no single server can deliver every auto line', async () => {
    db.product.findUnique
      .mockResolvedValueOnce(product({ id: 1, requiredCapabilities: ['items'] }))
      .mockResolvedValueOnce(product({ id: 2, requiredCapabilities: ['dino'] }));
    db.server.findMany.mockResolvedValueOnce([server(1, { capabilities: ['items'] }), server(2, { capabilities: ['dino'] })]);

    const { next, res } = await run([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }]);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(res.json).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-integer serverId', async () => {
    const { next } = await run([{ productId: 1, serverId: 'x', quantity: 1 }]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('login hook: waiting auto deliveries follow the buyer', () => {
  const STEAM = '76561198000000001';
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(releaseStreaks, 'clear').mockResolvedValue(undefined);
  });

  function mockTx(movedJobs: Array<{ id: string; referenceId: string }>) {
    const tx: any = {
      deliveryJob: { updateMany: vi.fn().mockResolvedValue({ count: movedJobs.length }), findMany: vi.fn().mockResolvedValue(movedJobs) },
      order: { updateMany: vi.fn().mockResolvedValue({}) },
      orderItem: { updateMany: vi.fn().mockResolvedValue({}) },
      fulfillment: { updateMany: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction.mockImplementationOnce((cb: any) => cb(tx));
    return tx;
  }

  it('moves pending auto jobs, their orders, items and fulfillments to the server just joined', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'j1', referenceId: 'o1' }, { id: 'j2', referenceId: 'o2' }]);
    db.server.findUnique.mockResolvedValueOnce(server(7, { capabilities: ['items'] }));
    db.order.findMany.mockResolvedValueOnce([
      { id: 'o1', product: { requiredCapabilities: ['items'] } },
      { id: 'o2', product: { requiredCapabilities: [] } },
    ]);
    const tx = mockTx([{ id: 'j1', referenceId: 'o1' }, { id: 'j2', referenceId: 'o2' }]);

    const moved = await plugin.retargetAnyServerJobs(7, STEAM);

    expect(moved).toBe(2);
    const where = db.deliveryJob.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      playerSteamId: STEAM, status: 'pending', serverId: { not: 7 }, payload: { path: [ANY_SERVER_FLAG], equals: true },
    });
    expect(tx.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['j1', 'j2'] }, status: 'pending', serverId: { not: 7 } },
      data: { serverId: 7, nextRetryAt: null },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['o1', 'o2'] } }, data: { serverId: 7 } });
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({ where: { legacyOrderId: { in: ['o1', 'o2'] } }, data: { serverId: 7 } });
    expect(tx.fulfillment.updateMany).toHaveBeenCalledWith({ where: { orderId: { in: ['o1', 'o2'] } }, data: { serverId: 7 } });
    expect(releaseStreaks.clear).toHaveBeenCalledWith(['j1', 'j2']);
  });

  it('leaves a job whose product needs a capability the new server lacks', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'j1', referenceId: 'o1' }, { id: 'j2', referenceId: 'o2' }]);
    db.server.findUnique.mockResolvedValueOnce(server(7, { capabilities: ['items'] }));
    db.order.findMany.mockResolvedValueOnce([
      { id: 'o1', product: { requiredCapabilities: ['dino'] } },
      { id: 'o2', product: { requiredCapabilities: ['items'] } },
    ]);
    const tx = mockTx([{ id: 'j2', referenceId: 'o2' }]);

    const moved = await plugin.retargetAnyServerJobs(7, STEAM);

    expect(moved).toBe(1);
    expect(tx.deliveryJob.updateMany.mock.calls[0][0].where.id).toEqual({ in: ['j2'] });
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['o2'] } }, data: { serverId: 7 } });
  });

  it('only updates orders of jobs that really moved (a job leased in between stays put)', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'j1', referenceId: 'o1' }, { id: 'j2', referenceId: 'o2' }]);
    db.server.findUnique.mockResolvedValueOnce(server(7));
    db.order.findMany.mockResolvedValueOnce([
      { id: 'o1', product: { requiredCapabilities: [] } },
      { id: 'o2', product: { requiredCapabilities: [] } },
    ]);
    const tx = mockTx([{ id: 'j1', referenceId: 'o1' }]); // j2 got leased before the update

    expect(await plugin.retargetAnyServerJobs(7, STEAM)).toBe(1);
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['o1'] } }, data: { serverId: 7 } });
  });

  it('does nothing when there is no waiting auto job, or the new server is not ready', async () => {
    db.deliveryJob.findMany.mockResolvedValueOnce([]);
    expect(await plugin.retargetAnyServerJobs(7, STEAM)).toBe(0);
    expect(db.server.findUnique).not.toHaveBeenCalled();

    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'j1', referenceId: 'o1' }]);
    db.server.findUnique.mockResolvedValueOnce(server(7, { drainMode: true }));
    db.order.findMany.mockResolvedValueOnce([{ id: 'o1', product: { requiredCapabilities: [] } }]);
    expect(await plugin.retargetAnyServerJobs(7, STEAM)).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('never throws: a database error returns 0', async () => {
    db.deliveryJob.findMany.mockRejectedValueOnce(new Error('db down'));
    expect(await plugin.retargetAnyServerJobs(7, STEAM)).toBe(0);
  });

  it('GET /plugin/player/:steamId records the login and retargets before resetting the backoff', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', discordUsername: 'Heart', pointsBalance: 10n, steamId: STEAM });
    db.deliveryJob.findMany.mockResolvedValue([]);
    db.order.count.mockResolvedValueOnce(0);
    const retarget = vi.spyOn(plugin, 'retargetAnyServerJobs');

    const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    const next = vi.fn();
    await plugin.getPlayerBySteamId({ params: { steamId: STEAM }, serverId: 7 } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(recordLogin).toHaveBeenCalledWith(STEAM, 7);
    expect(retarget).toHaveBeenCalledWith(7, STEAM);
    expect(res.json).toHaveBeenCalled();
  });
});
