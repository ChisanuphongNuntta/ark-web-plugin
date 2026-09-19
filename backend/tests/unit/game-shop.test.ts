import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import gameShopController from '../../src/controllers/game-shop.controller.js';
import walletService from '../../src/services/wallet.service.js';

vi.mock('../../src/services/wallet.service.js', () => ({
  default: {
    getBalance: vi.fn(),
    ensureUserAccounts: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue({}),
  },
  userAccountKey: (userId: string, type: string) => `user:${userId}:${type}:IC`,
  SYSTEM_ACCOUNTS: { revenue: 'system:revenue:IC', clearing: 'system:clearing:IC', issuance: 'system:issuance:IC' },
}));

const db = prisma as any;
const response = () => ({ json: vi.fn() } as any);

describe('in-game shop quote and confirmation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows read-only catalog browsing while the server is draining', async () => {
    db.server.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      drainMode: true,
      capabilities: ['delivery.item.v1', 'game-shop.quote-confirm.v1'],
    });
    db.product.findMany.mockResolvedValueOnce([]);
    db.user.findUnique.mockResolvedValueOnce(null);

    const req: any = {
      serverId: 1,
      query: { steamId: '76561198000000001' },
    };
    const res = response();
    const next = vi.fn();
    await gameShopController.listCatalog(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ products: [], serverId: 1, currency: 'IC' });
  });

  it('creates a short-lived backend-authoritative quote', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'u1', steamId: '76561198000000001' });
    db.product.findUnique.mockResolvedValueOnce({
      id: 10, name: 'Metal', price: 25, isActive: true, productType: 'item', itemBlueprint: '/Game/Metal',
      quantity: 1, quality: 0, isBlueprint: false, stock: null, deliveryPayload: null,
      requiredCapabilities: ['delivery.item.v1'],
    });
    db.server.findUnique.mockResolvedValueOnce({
      id: 1, isActive: true, drainMode: false, capabilities: ['delivery.item.v1', 'game-shop.quote-confirm.v1'],
    });
    vi.mocked(walletService.getBalance).mockResolvedValueOnce({
      currency: 'IC', accounts: { available: '500', held: '0', promotional: '0', refundable: '0' }, total: '500',
    });
    db.gamePurchaseQuote.create.mockResolvedValueOnce({ id: 'q1', expiresAt: new Date('2026-07-11T12:00:00Z') });

    const req: any = { serverId: 1, body: { steamId: '76561198000000001', productId: 10, quantity: 2 } };
    const res = response();
    const next = vi.fn();
    await gameShopController.createQuote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.gamePurchaseQuote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u1', serverId: 1, productId: 10, quantity: 2, totalPrice: 50 }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ quoteId: 'q1', totalPrice: 50 }));
  });

  it('confirms once, posts balanced wallet entries and queues durable delivery', async () => {
    const quote = {
      id: 'q1', userId: 'u1', serverId: 1, productId: 10, quantity: 2,
      unitPrice: 25, totalPrice: 50, status: 'pending', orderId: null,
      expiresAt: new Date(Date.now() + 60_000),
      productSnapshot: {
        productType: 'item', itemBlueprint: '/Game/Metal', quality: 0,
        isBlueprint: false, deliveryPayload: null,
      },
    };
    const product = {
      id: 10, name: 'Metal', price: 25, isActive: true, productType: 'item', itemBlueprint: '/Game/Metal',
      quantity: 1, quality: 0, isBlueprint: false, stock: 100, maxPerUser: null,
      deliveryPayload: null, requiredCapabilities: ['delivery.item.v1'],
    };
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      gamePurchaseQuote: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(quote),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: '76561198000000001' }),
        update: vi.fn().mockResolvedValue({}),
      },
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(product),
        update: vi.fn().mockResolvedValue({}),
      },
      server: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, isActive: true, drainMode: false, capabilities: ['delivery.item.v1', 'game-shop.quote-confirm.v1'] }) },
      order: { aggregate: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'order-1' }) },
      orderGroup: { create: vi.fn().mockResolvedValue({ id: 'group-1' }) },
      orderItem: { create: vi.fn().mockResolvedValue({ id: 'item-1' }) },
      deliveryJob: { create: vi.fn().mockResolvedValue({}) },
      fulfillment: { create: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    const req: any = { serverId: 1, body: { quoteId: 'q1', steamId: '76561198000000001' } };
    const res = response();
    const next = vi.fn();
    await gameShopController.confirmQuote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const ledgerInput = vi.mocked(walletService.post).mock.calls[0][0];
    expect(ledgerInput.idempotencyKey).toBe('game-purchase:q1');
    expect(ledgerInput.entries.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(0n);
    expect(tx.deliveryJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: 'order-1', serverId: 1, deliveryType: 'order', status: 'pending' }),
    }));
    expect(tx.gamePurchaseQuote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q1' }, data: expect.objectContaining({ status: 'completed', orderId: 'order-1' }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, orderId: 'order-1', duplicate: false }));
  });

  it('queues a catalog dino as a player-owned dino delivery', async () => {
    const dinoPayload = {
      schemaVersion: 1,
      source: 'arkshop',
      type: 'dino',
      spawn: {
        blueprint: "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'",
        level: 380,
        forceTame: true,
        neutered: false,
      },
    };
    const quote = {
      id: 'q-dino', userId: 'u1', serverId: 1, productId: 20, quantity: 1,
      unitPrice: 195, totalPrice: 195, status: 'pending', orderId: null,
      expiresAt: new Date(Date.now() + 60_000),
      productSnapshot: {
        productType: 'dino',
        itemBlueprint: dinoPayload.spawn.blueprint,
        quality: 0,
        isBlueprint: false,
        deliveryPayload: dinoPayload,
      },
    };
    const product = {
      id: 20, name: 'Rex (Lv.380)', price: 195, isActive: true,
      productType: 'dino', itemBlueprint: dinoPayload.spawn.blueprint,
      quantity: 1, quality: 0, isBlueprint: false, stock: null, maxPerUser: null,
      deliveryPayload: dinoPayload, requiredCapabilities: ['delivery.dino.catalog.v1'],
    };
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      gamePurchaseQuote: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(quote),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: '76561198000000001' }),
        update: vi.fn().mockResolvedValue({}),
      },
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(product),
        update: vi.fn().mockResolvedValue({}),
      },
      server: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 1, isActive: true, drainMode: false,
          capabilities: ['delivery.dino.catalog.v1', 'game-shop.quote-confirm.v1'],
        }),
      },
      order: { aggregate: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'order-dino' }) },
      orderGroup: { create: vi.fn().mockResolvedValue({ id: 'group-dino' }) },
      orderItem: { create: vi.fn().mockResolvedValue({ id: 'item-dino' }) },
      deliveryJob: { create: vi.fn().mockResolvedValue({}) },
      fulfillment: { create: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    const req: any = { serverId: 1, body: { quoteId: 'q-dino', steamId: '76561198000000001' } };
    const res = response();
    const next = vi.fn();
    await gameShopController.confirmQuote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(tx.deliveryJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'order-dino',
        deliveryType: 'dino_catalog',
        payload: expect.objectContaining({
          productType: 'dino',
          dino: expect.objectContaining({ level: 380, forceTame: true }),
        }),
      }),
    }));
  });
});
