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
            server: { id: 1, name: 'PVE', isActive: true },
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

    it('createCheckoutSession rejects if user has insufficient wallet balance', async () => {
      const mockCart = {
        id: 'c1',
        items: [
          {
            productId: 1,
            serverId: 1,
            quantity: 2,
            product: { id: 1, name: 'Rifle', price: 100, isActive: true, stock: 10, maxPerUser: null },
            server: { id: 1, name: 'PVE', isActive: true },
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
          { productId: 1, serverId: 1, quantity: 2, price: 100, name: 'Rifle', itemBlueprint: 'bp', quality: 1, isBlueprint: false },
        ],
      };

      db.checkoutSession.findUnique.mockResolvedValueOnce(mockSession);

      // Mock Transaction Context
      const mockTx: any = {
        user: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', steamId: 'steam-123' }),
        },
        product: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: 'Rifle', isActive: true, stock: 10, maxPerUser: null }),
          update: vi.fn().mockResolvedValue({}),
        },
        order: {
          create: vi.fn().mockResolvedValue({ id: 'o1' }),
        },
        pointTransaction: {
          create: vi.fn().mockResolvedValue({}),
        },
        deliveryJob: {
          create: vi.fn().mockResolvedValue({}),
        },
        cartItem: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        checkoutSession: {
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
        totalSpent: '200',
      });
    });
  });
});
