import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import cartController from '../../src/controllers/cart.controller.js';

const db = prisma as any;

describe('POST /cart/sync — bulk atomic replace (§16, M3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const activeProduct = (over: any = {}) => ({
    id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null, ...over,
  });
  const activeServer = (over: any = {}) => ({ id: 1, name: 'PVE', isActive: true, ...over });

  function mockReplaceTx() {
    const tx: any = {
      cart: { upsert: vi.fn().mockResolvedValue({ id: 'c1' }) },
      cartItem: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
    };
    db.$transaction.mockImplementationOnce((cb: any) => cb(tx));
    return tx;
  }

  it('replaces the server cart with the posted line set after re-validation', async () => {
    db.product.findUnique.mockResolvedValue(activeProduct());
    db.server.findUnique.mockResolvedValue(activeServer());
    const tx = mockReplaceTx();
    db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] }); // fetchFullCart

    const req: any = { user: { id: 'u1' }, body: { lines: [{ productId: 1, serverId: 1, quantity: 3 }] } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);

    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'c1' } });
    expect(tx.cartItem.createMany).toHaveBeenCalledWith({
      data: [{ cartId: 'c1', productId: 1, serverId: 1, quantity: 3 }],
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('merges duplicate (productId, serverId) lines by summing quantity', async () => {
    db.product.findUnique.mockResolvedValue(activeProduct({ stock: 10 }));
    db.server.findUnique.mockResolvedValue(activeServer());
    const tx = mockReplaceTx();
    db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] });

    const req: any = {
      user: { id: 'u1' },
      body: { lines: [
        { productId: 1, serverId: 1, quantity: 2 },
        { productId: 1, serverId: 1, quantity: 3 },
      ] },
    };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);

    expect(tx.cartItem.createMany).toHaveBeenCalledWith({
      data: [{ cartId: 'c1', productId: 1, serverId: 1, quantity: 5 }],
    });
  });

  it('drops non-positive quantities and clears the cart when all lines drop out', async () => {
    const tx = mockReplaceTx();
    db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] });

    const req: any = { user: { id: 'u1' }, body: { lines: [{ productId: 1, serverId: 1, quantity: 0 }] } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);

    // No product/server lookups needed because the only line was dropped.
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'c1' } });
    expect(tx.cartItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects (and does NOT mutate the cart) when stock is insufficient', async () => {
    db.product.findUnique.mockResolvedValue(activeProduct({ stock: 1 }));
    db.server.findUnique.mockResolvedValue(activeServer());

    const req: any = { user: { id: 'u1' }, body: { lines: [{ productId: 1, serverId: 1, quantity: 5 }] } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(db.$transaction).not.toHaveBeenCalled(); // validated BEFORE touching the cart
  });

  it('enforces per-user purchase limits against prior non-refunded orders', async () => {
    db.product.findUnique.mockResolvedValue(activeProduct({ maxPerUser: 2 }));
    db.server.findUnique.mockResolvedValue(activeServer());
    db.order.aggregate.mockResolvedValueOnce({ _sum: { quantity: 1 } }); // already bought 1

    const req: any = { user: { id: 'u1' }, body: { lines: [{ productId: 1, serverId: 1, quantity: 2 }] } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-array body', async () => {
    const req: any = { user: { id: 'u1' }, body: { lines: 'nope' } };
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await cartController.syncCart(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'lines must be an array' }));
  });
});
