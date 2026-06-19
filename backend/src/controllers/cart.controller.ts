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
        const userOrders = await prisma.order.count({
          where: {
            userId: req.user!.id,
            productId: product.id,
            status: { not: 'refunded' },
          },
        });
        if (userOrders + Number(quantity) > product.maxPerUser) {
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
