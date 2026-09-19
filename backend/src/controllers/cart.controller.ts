import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';

async function fetchFullCart(userId: string) {
  let cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
          server: {
            select: { id: true, name: true, map: true }
          }
        }
      }
    }
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: true,
            server: {
              select: { id: true, name: true, map: true }
            }
          }
        }
      }
    });
  }

  return cart;
}

export class CartController {
  getCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const cart = await fetchFullCart(req.user!.id);
      res.json(cart);
    } catch (error) {
      next(error);
    }
  };

  addToCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { productId, serverId, quantity = 1 } = req.body;

      if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
        throw new AppError('Quantity must be a positive integer', 400);
      }

      if (!productId || !serverId) {
        throw new AppError('Product ID and Server ID are required', 400);
      }

      const product = await prisma.product.findUnique({
        where: { id: Number(productId) },
      });

      if (!product || !product.isActive) {
        throw new AppError('Product not found or unavailable', 404);
      }

      // Check stock limit
      if (product.stock !== null && product.stock < Number(quantity)) {
        throw new AppError('Not enough stock', 400);
      }

      const server = await prisma.server.findUnique({
        where: { id: Number(serverId) },
      });

      if (!server || !server.isActive) {
        throw new AppError('Server not found or inactive', 404);
      }

      // Check user limits
      if (product.maxPerUser !== null) {
        const userOrders = await prisma.order.aggregate({
          where: {
            userId: req.user!.id,
            productId: product.id,
            status: { not: 'refunded' },
          }, _sum: { quantity: true },
        });
        if ((userOrders._sum.quantity ?? 0) + Number(quantity) > product.maxPerUser) {
          throw new AppError(`You can only buy ${product.maxPerUser} of this item`, 400);
        }
      }

      let cart = await prisma.cart.findUnique({
        where: { userId: req.user!.id },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: req.user!.id },
        });
      }

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId_serverId: {
            cartId: cart.id,
            productId: product.id,
            serverId: server.id,
          },
        },
      });

      if (existingItem) {
        const newQty = existingItem.quantity + Number(quantity);
        if (product.stock !== null && product.stock < newQty) {
          throw new AppError('Not enough stock', 400);
        }
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQty },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            serverId: server.id,
            quantity: Number(quantity),
          },
        });
      }

      const updatedCart = await fetchFullCart(req.user!.id);
      res.json(updatedCart);
    } catch (error) {
      next(error);
    }
  };

  updateCartItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { productId, serverId, quantity } = req.body;

      if (productId === undefined || serverId === undefined || quantity === undefined) {
        throw new AppError('Product ID, Server ID, and quantity are required', 400);
      }
      if (!Number.isInteger(Number(quantity))) throw new AppError('Quantity must be an integer', 400);

      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.id },
      });

      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId_serverId: {
            cartId: cart.id,
            productId: Number(productId),
            serverId: Number(serverId),
          },
        },
      });

      if (!existingItem) {
        throw new AppError('Item not found in cart', 404);
      }

      if (Number(quantity) <= 0) {
        await prisma.cartItem.delete({
          where: { id: existingItem.id },
        });
      } else {
        const product = await prisma.product.findUnique({
          where: { id: Number(productId) },
        });

        if (product && product.stock !== null && product.stock < Number(quantity)) {
          throw new AppError('Not enough stock', 400);
        }

        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: Number(quantity) },
        });
      }

      const updatedCart = await fetchFullCart(req.user!.id);
      res.json(updatedCart);
    } catch (error) {
      next(error);
    }
  };

  // POST /cart/sync — bulk "replace cart" (ENTERPRISE_REDESIGN_PLAN_TH.md §16, M3).
  //
  // Accepts the full line set the user sees ({ productId, serverId, quantity }[]) and
  // atomically REPLACES the server cart with it, after re-validating price/stock/server
  // compatibility + per-user limits server-side. The server cart remains authoritative
  // (contract decision M2->M3): the frontend calls this once before POST /checkout/session
  // instead of replaying line-by-line add/update/delete. Re-running with the same lines is
  // naturally idempotent because the cart is fully replaced each time.
  syncCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { lines } = req.body;

      if (!Array.isArray(lines)) {
        throw new AppError('lines must be an array', 400);
      }
      if (lines.length > 100) {
        throw new AppError('Too many cart lines (max 100)', 400);
      }

      // Normalize + merge duplicate (productId, serverId) lines by summing quantity, and
      // drop non-positive quantities (a quantity <= 0 means "not in cart").
      const merged = new Map<string, { productId: number; serverId: number; quantity: number }>();
      for (const raw of lines) {
        const productId = Number(raw?.productId);
        const serverId = Number(raw?.serverId);
        const quantity = Number(raw?.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(serverId)) {
          throw new AppError('Each line requires integer productId and serverId', 400);
        }
        if (!Number.isInteger(quantity)) {
          throw new AppError('Each line requires an integer quantity', 400);
        }
        if (quantity <= 0) continue;
        const key = `${productId}:${serverId}`;
        const existing = merged.get(key);
        merged.set(key, { productId, serverId, quantity: (existing?.quantity || 0) + quantity });
      }
      const desired = [...merged.values()];

      // Validate every line BEFORE touching the cart so we never half-apply a sync.
      for (const line of desired) {
        const product = await prisma.product.findUnique({ where: { id: line.productId } });
        if (!product || !product.isActive) {
          throw new AppError(`Product ${line.productId} not found or unavailable`, 404);
        }
        const server = await prisma.server.findUnique({ where: { id: line.serverId } });
        if (!server || !server.isActive) {
          throw new AppError(`Server ${line.serverId} not found or inactive`, 404);
        }
        if (product.stock !== null && product.stock < line.quantity) {
          throw new AppError(`Not enough stock for "${product.name}"`, 400);
        }
        if (product.maxPerUser !== null) {
          const userOrders = await prisma.order.aggregate({
            where: { userId: req.user!.id, productId: product.id, status: { not: 'refunded' } },
            _sum: { quantity: true },
          });
          if ((userOrders._sum.quantity ?? 0) + line.quantity > product.maxPerUser) {
            throw new AppError(`Purchase limit exceeded for "${product.name}". Max allowed: ${product.maxPerUser}`, 400);
          }
        }
      }

      // Atomically replace the cart contents.
      await prisma.$transaction(async (tx) => {
        const cart = await tx.cart.upsert({
          where: { userId: req.user!.id },
          create: { userId: req.user!.id },
          update: {},
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        if (desired.length > 0) {
          await tx.cartItem.createMany({
            data: desired.map((line) => ({
              cartId: cart.id,
              productId: line.productId,
              serverId: line.serverId,
              quantity: line.quantity,
            })),
          });
        }
      });

      const updatedCart = await fetchFullCart(req.user!.id);
      res.json(updatedCart);
    } catch (error) {
      next(error);
    }
  };

  removeFromCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { productId, serverId } = req.body;

      if (productId === undefined || serverId === undefined) {
        throw new AppError('Product ID and Server ID are required', 400);
      }

      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.id },
      });

      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId_serverId: {
            cartId: cart.id,
            productId: Number(productId),
            serverId: Number(serverId),
          },
        },
      });

      if (!existingItem) {
        throw new AppError('Item not found in cart', 404);
      }

      await prisma.cartItem.delete({
        where: { id: existingItem.id },
      });

      const updatedCart = await fetchFullCart(req.user!.id);
      res.json(updatedCart);
    } catch (error) {
      next(error);
    }
  };
}

export default new CartController();
