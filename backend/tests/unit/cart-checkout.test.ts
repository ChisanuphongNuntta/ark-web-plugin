import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import cartController from '../../src/controllers/cart.controller.js';
import checkoutController from '../../src/controllers/checkout.controller.js';
import walletService from '../../src/services/wallet.service.js';

const db = prisma as any;

// Mock walletService
vi.mock('../../src/services/wallet.service.js', () => ({
  default: {
    getBalance: vi.fn(),
    post: vi.fn(),
  },
  userAccountKey: (userId: string, type: string) => `user:${userId}:${type}:IC`,
  SYSTEM_ACCOUNTS: {
    issuance: 'system:issuance:IC',
    revenue: 'system:revenue:IC',
    clearing: 'system:clearing:IC',
  },
}));

describe('Cart & Checkout System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cart Controller', () => {
    it('getCart creates a cart if none exists and returns it', async () => {
      const mockCart = { id: 'c1', userId: 'u1', items: [] };
      db.cart.findUnique.mockResolvedValueOnce(null);
      db.cart.create.mockResolvedValueOnce(mockCart);

      const req: any = { user: { id: 'u1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await cartController.getCart(req, res, next);

      expect(db.cart.create).toHaveBeenCalledWith({
        data: { userId: 'u1' },
        include: expect.any(Object),
      });
      expect(res.json).toHaveBeenCalledWith(mockCart);
    });

    it('addToCart adds a new item to cart', async () => {
      const mockProduct = { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null };
      const mockServer = { id: 1, name: 'PVE', isActive: true };
      const mockCart = { id: 'c1' };

      db.product.findUnique.mockResolvedValueOnce(mockProduct);
      db.server.findUnique.mockResolvedValueOnce(mockServer);
      db.cart.findUnique.mockResolvedValueOnce(mockCart);
      db.cartItem.findUnique.mockResolvedValueOnce(null); // Not already in cart
      db.cartItem.create.mockResolvedValueOnce({});
      
      // Final fetch after adding
      const mockUpdatedCart = { id: 'c1', userId: 'u1', items: [{ productId: 1, serverId: 1, quantity: 2 }] };
      db.cart.findUnique.mockResolvedValueOnce(mockUpdatedCart);

      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 1, quantity: 2 } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await cartController.addToCart(req, res, next);

      expect(db.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 'c1', productId: 1, serverId: 1, quantity: 2 },
      });
      expect(res.json).toHaveBeenCalledWith(mockUpdatedCart);
    });

    it('addToCart rejects if product is out of stock', async () => {
      const mockProduct = { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 1, maxPerUser: null };
      db.product.findUnique.mockResolvedValueOnce(mockProduct);

      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 1, quantity: 2 } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await cartController.addToCart(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Not enough stock' }));
    });

    it('updateCartItem removes item if quantity is 0', async () => {
      const mockCart = { id: 'c1' };
      const mockItem = { id: 'ci1', cartId: 'c1', productId: 1, serverId: 1, quantity: 2 };
      
      db.cart.findUnique.mockResolvedValueOnce(mockCart);
      db.cartItem.findUnique.mockResolvedValueOnce(mockItem);
      db.cartItem.delete.mockResolvedValueOnce({});
      db.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] }); // Updated cart fetch

      const req: any = { user: { id: 'u1' }, body: { productId: 1, serverId: 1, quantity: 0 } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await cartController.updateCartItem(req, res, next);

      expect(db.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'ci1' } });
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('Checkout Controller', () => {
    it('createCheckoutSession creates session for a non-empty cart with sufficient balance', async () => {
      const mockCart = {
        id: 'c1',
        items: [
          {
            productId: 1,
            serverId: 1,
            quantity: 2,
            product: { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null, itemBlueprint: 'bp', quality: 1, isBlueprint: false },
            server: { id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, credentials: [{ id: 'cred-1' }] },
          },
        ],
      };

      db.cart.findUnique.mockResolvedValueOnce(mockCart);
      db.checkoutSession.findUnique.mockResolvedValueOnce(null);
      vi.mocked(walletService.getBalance).mockResolvedValueOnce({
        currency: 'IC',
        accounts: { available: '500', held: '0', promotional: '0', refundable: '0' },
        total: '500',
      });

      const mockSession = {
        id: 'cs1',
        userId: 'u1',
        cartSnapshot: [],
        totalAmount: 200n,
        status: 'pending',
        idempotencyKey: 'idem-1',
        expiresAt: new Date(),
      };
      db.checkoutSession.create.mockResolvedValueOnce(mockSession);

      const req: any = { user: { id: 'u1' }, body: { idempotencyKey: 'idem-1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.createCheckoutSession(req, res, next);

      expect(db.checkoutSession.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          totalAmount: 200n,
          status: 'pending',
        }),
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs1', totalAmount: '200' }));
    });

    it.each([
      ['has no active plugin credential', { credentials: [] }, 'is not connected for delivery yet'],
      ['is closed (isAvailable=false)', { isAvailable: false }, 'is closed'],
      ['is draining deliveries', { drainMode: true }, 'is temporarily draining deliveries'],
    ])('createCheckoutSession rejects a line whose server %s', async (_label, override, message) => {
      db.cart.findUnique.mockResolvedValueOnce({
        id: 'c1',
        items: [
          {
            productId: 1,
            serverId: 1,
            quantity: 1,
            product: { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null, itemBlueprint: 'bp', quality: 1, isBlueprint: false },
            server: { id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, credentials: [{ id: 'cred-1' }], ...override },
          },
        ],
      });
      db.checkoutSession.findUnique.mockResolvedValueOnce(null);

      const req: any = { user: { id: 'u1' }, body: { idempotencyKey: 'idem-blocked' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.createCheckoutSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, message: expect.stringContaining(message) }));
      expect(db.checkoutSession.create).not.toHaveBeenCalled();
      expect(db.cart.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        include: { items: { include: { product: true, server: { include: { credentials: expect.objectContaining({ where: { status: 'active' } }) } } } } },
      }));
    });

    it('commitCheckoutSession refuses a server that lost its credential after the session was created', async () => {
      const mockSession = {
        id: 'cs3',
        userId: 'u1',
        totalAmount: 100n,
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000),
        cartSnapshot: [
          { productId: 1, serverId: 1, quantity: 1, price: 100, name: 'Rifle', productType: 'item', itemBlueprint: 'bp', quality: 1, isBlueprint: false },
        ],
      };
      db.checkoutSession.findUnique.mockResolvedValueOnce(mockSession);
      const mockTx: any = {
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: 'steam-123' }) },
        product: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 1, name: 'Rifle', price: 100, categoryId: null, isActive: true, stock: 10, maxPerUser: null,
            productType: 'item', itemBlueprint: 'bp', quality: 1, isBlueprint: false, requiredCapabilities: [],
          }),
          update: vi.fn(),
        },
        server: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, capabilities: [], credentials: [] }),
        },
        deliveryJob: { create: vi.fn() },
        checkoutSession: { findUniqueOrThrow: vi.fn().mockResolvedValue(mockSession), update: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };
      db.$transaction.mockImplementationOnce((callback: any) => callback(mockTx));

      const req: any = { user: { id: 'u1' }, params: { id: 'cs3' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.commitCheckoutSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, message: 'Server "PVE" is unavailable for delivery' }));
      expect(mockTx.deliveryJob.create).not.toHaveBeenCalled();
      expect(vi.mocked(walletService.post)).not.toHaveBeenCalled();
    });

    it('createCheckoutSession rejects if user has insufficient wallet balance', async () => {
      const mockCart = {
        id: 'c1',
        items: [
          {
            productId: 1,
            serverId: 1,
            quantity: 2,
            product: { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null, itemBlueprint: 'bp', quality: 1, isBlueprint: false },
            server: { id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, credentials: [{ id: 'cred-1' }] },
          },
        ],
      };

      db.cart.findUnique.mockResolvedValueOnce(mockCart);
      db.checkoutSession.findUnique.mockResolvedValueOnce(null);
      vi.mocked(walletService.getBalance).mockResolvedValueOnce({
        currency: 'IC',
        accounts: { available: '150', held: '0', promotional: '0', refundable: '0' },
        total: '150',
      });

      const req: any = { user: { id: 'u1' }, body: { idempotencyKey: 'idem-2' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.createCheckoutSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Insufficient wallet balance' }));
    });

    it('commitCheckoutSession deducts balance, reserves stock, creates orders and queues deliveries', async () => {
      const mockSession = {
        id: 'cs1',
        userId: 'u1',
        totalAmount: 200n,
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000),
        cartSnapshot: [
          { productId: 1, serverId: 1, quantity: 2, price: 100, name: 'Rifle', productType: 'item', itemBlueprint: 'bp', quality: 1, isBlueprint: false },
        ],
      };

      db.checkoutSession.findUnique.mockResolvedValueOnce(mockSession);

      // Mock Transaction Context
      const mockTx: any = {
        user: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: 'steam-123' }),
        },
        product: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 1,
            name: 'Rifle',
            price: 100,
            categoryId: null,
            isActive: true,
            stock: 10,
            maxPerUser: null,
            productType: 'item',
            itemBlueprint: 'bp',
            quality: 1,
            isBlueprint: false,
            requiredCapabilities: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        server: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, capabilities: [], credentials: [{ id: 'cred-1' }] }),
        },
        order: {
          create: vi.fn().mockResolvedValue({ id: 'o1' }),
        },
        orderGroup: { create: vi.fn().mockResolvedValue({ id: 'og1' }) },
        orderItem: { create: vi.fn().mockResolvedValue({ id: 'oi1' }) },
        pointTransaction: {
          create: vi.fn().mockResolvedValue({}),
        },
        deliveryJob: {
          create: vi.fn().mockResolvedValue({}),
        },
        fulfillment: {
          create: vi.fn().mockResolvedValue({}),
        },
        cartItem: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        checkoutSession: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(mockSession),
          update: vi.fn().mockResolvedValue({}),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      db.$transaction.mockImplementationOnce((callback: any) => callback(mockTx));

      const req: any = { user: { id: 'u1' }, params: { id: 'cs1' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.commitCheckoutSession(req, res, next);

      expect(mockTx.product.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { stock: { decrement: 2 } },
      });
      expect(vi.mocked(walletService.post)).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: 'checkout:commit:cs1',
        type: 'checkout_purchase',
      }), mockTx);
      expect(mockTx.deliveryJob.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          serverId: 1,
          playerSteamId: 'steam-123',
          deliveryType: 'order',
        }),
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        orderIds: ['o1'],
        orderGroupId: 'og1',
        totalSpent: '200',
      });
    });

    it('commitCheckoutSession sets dino.cryopod only for a target server with delivery.dino.cryopod.v1', async () => {
      const legacy = await commitDinoCheckout(['delivery.dino.catalog.v1']);
      expect(legacy.dino).not.toHaveProperty('cryopod');
      expect(legacy.dino).toEqual(expect.objectContaining({ level: 150, forceTame: true, neutered: false }));

      const capable = await commitDinoCheckout(['delivery.dino.catalog.v1', 'delivery.dino.cryopod.v1']);
      expect(capable.dino).toEqual(expect.objectContaining({ level: 150, forceTame: true, neutered: false, cryopod: true }));
    });

    it('does NOT write a legacy PointTransaction (ledger is the single source of truth)', async () => {
      const mockSession = {
        id: 'cs2',
        userId: 'u1',
        totalAmount: 100n,
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000),
        cartSnapshot: [
          { productId: 1, serverId: 1, quantity: 1, price: 100, name: 'Rifle', productType: 'item', itemBlueprint: 'bp', quality: 1, isBlueprint: false },
        ],
      };

      db.checkoutSession.findUnique.mockResolvedValueOnce(mockSession);

      const mockTx: any = {
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: 'steam-123' }) },
        product: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 1,
            name: 'Rifle',
            price: 100,
            categoryId: null,
            isActive: true,
            stock: 10,
            maxPerUser: null,
            productType: 'item',
            itemBlueprint: 'bp',
            quality: 1,
            isBlueprint: false,
            requiredCapabilities: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        server: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: 'PVE', isActive: true, drainMode: false, isAvailable: true, capabilities: [], credentials: [{ id: 'cred-1' }] }) },
        order: { create: vi.fn().mockResolvedValue({ id: 'o2' }) },
        orderGroup: { create: vi.fn().mockResolvedValue({ id: 'og2' }) },
        orderItem: { create: vi.fn().mockResolvedValue({ id: 'oi2' }) },
        pointTransaction: { create: vi.fn().mockResolvedValue({}) },
        deliveryJob: { create: vi.fn().mockResolvedValue({}) },
        fulfillment: { create: vi.fn().mockResolvedValue({}) },
        cartItem: { deleteMany: vi.fn().mockResolvedValue({}) },
        checkoutSession: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(mockSession),
          update: vi.fn().mockResolvedValue({}),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      db.$transaction.mockImplementationOnce((callback: any) => callback(mockTx));

      const req: any = { user: { id: 'u1' }, params: { id: 'cs2' } };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await checkoutController.commitCheckoutSession(req, res, next);

      // The legacy dual-write ledger must be gone.
      expect(mockTx.pointTransaction.create).not.toHaveBeenCalled();
      // The wallet double-entry ledger is still the money record.
      expect(vi.mocked(walletService.post)).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: 'checkout:commit:cs2',
        type: 'checkout_purchase',
      }), mockTx);
    });
  });
});

/** Commits a one-line dino checkout to a server with the given capabilities; returns the queued payload. */
async function commitDinoCheckout(capabilities: string[]) {
  const blueprint = "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'";
  const deliveryPayload = { schemaVersion: 1, type: 'dino', spawn: { blueprint, level: 150, forceTame: true, neutered: false } };
  const line = {
    productId: 7, serverId: 3, quantity: 1, price: 120, name: 'Rex (Lv.150)', productType: 'dino',
    itemBlueprint: blueprint, deliveryQuantity: 1, quality: 0, isBlueprint: false, deliveryPayload,
    requiredCapabilities: ['delivery.dino.catalog.v1'],
  };
  const mockSession = {
    id: 'cs-dino', userId: 'u1', totalAmount: 120n, status: 'pending',
    expiresAt: new Date(Date.now() + 100000), cartSnapshot: [line],
  };
  db.checkoutSession.findUnique.mockResolvedValueOnce(mockSession);
  const mockTx: any = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: 'steam-123' }) },
    product: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 7, name: 'Rex (Lv.150)', price: 120, categoryId: null, isActive: true, stock: null, maxPerUser: null,
        productType: 'dino', itemBlueprint: blueprint, quantity: 1, quality: 0, isBlueprint: false,
        deliveryPayload, requiredCapabilities: ['delivery.dino.catalog.v1'],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    server: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 3, name: 'PVP', isActive: true, drainMode: false, isAvailable: true, capabilities, credentials: [{ id: 'cred-3' }],
      }),
    },
    order: { create: vi.fn().mockResolvedValue({ id: 'o-dino' }) },
    orderGroup: { create: vi.fn().mockResolvedValue({ id: 'og-dino' }) },
    orderItem: { create: vi.fn().mockResolvedValue({ id: 'oi-dino' }) },
    pointTransaction: { create: vi.fn().mockResolvedValue({}) },
    deliveryJob: { create: vi.fn().mockResolvedValue({}) },
    fulfillment: { create: vi.fn().mockResolvedValue({}) },
    cartItem: { deleteMany: vi.fn().mockResolvedValue({}) },
    checkoutSession: { findUniqueOrThrow: vi.fn().mockResolvedValue(mockSession), update: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  db.$transaction.mockImplementationOnce((callback: any) => callback(mockTx));
  const next = vi.fn();
  await checkoutController.commitCheckoutSession({ user: { id: 'u1' }, params: { id: 'cs-dino' } } as any, { json: vi.fn() } as any, next);
  expect(next).not.toHaveBeenCalled();
  expect(mockTx.deliveryJob.create).toHaveBeenCalledTimes(1);
  const job = mockTx.deliveryJob.create.mock.calls[0][0].data;
  expect(job).toEqual(expect.objectContaining({ serverId: 3, deliveryType: 'dino_catalog' }));
  return job.payload;
}
