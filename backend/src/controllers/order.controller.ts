import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';

export class OrderController {
  // Create order (buy item)
  createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { productId, serverId, quantity = 1 } = req.body;

      if (!productId || !serverId) {
        throw new AppError('Product ID and Server ID are required', 400);
      }

      // Get product
      const product = await prisma.product.findUnique({
        where: { id: parseInt(productId) },
      });

      if (!product || !product.isActive) {
        throw new AppError('Product not found or unavailable', 404);
      }

      // Check stock
      if (product.stock !== null && product.stock < quantity) {
        throw new AppError('Not enough stock', 400);
      }

      // Check max per user
      if (product.maxPerUser !== null) {
        const userOrders = await prisma.order.count({
          where: {
            userId: req.user!.id,
            productId: product.id,
            status: { not: 'refunded' },
          },
        });

        if (userOrders + quantity > product.maxPerUser) {
          throw new AppError(`You can only buy ${product.maxPerUser} of this item`, 400);
        }
      }

      // Calculate total price
      const totalPrice = product.price * quantity;

      // Get user and check balance
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (Number(user.pointsBalance) < totalPrice) {
        throw new AppError('Insufficient points', 400);
      }

      // Check if server exists
      const server = await prisma.server.findUnique({
        where: { id: parseInt(serverId) },
      });

      if (!server || !server.isActive) {
        throw new AppError('Server not found or inactive', 404);
      }

      // Create order and deduct points in transaction
      const [order, updatedUser] = await prisma.$transaction([
        prisma.order.create({
          data: {
            userId: req.user!.id,
            productId: product.id,
            serverId: server.id,
            quantity,
            totalPrice,
            status: 'pending',
          },
          include: {
            product: true,
            server: true,
          },
        }),
        prisma.user.update({
          where: { id: req.user!.id },
          data: {
            pointsBalance: { decrement: totalPrice },
            totalSpent: { increment: totalPrice },
          },
        }),
      ]);

      // Record transaction
      await prisma.pointTransaction.create({
        data: {
          userId: req.user!.id,
          amount: -totalPrice,
          balanceAfter: updatedUser.pointsBalance,
          type: 'purchase',
          description: `Purchased ${product.name} x${quantity}`,
          referenceId: order.id,
        },
      });

      // Update stock if applicable
      if (product.stock !== null) {
        await prisma.product.update({
          where: { id: product.id },
          data: { stock: { decrement: quantity } },
        });
      }

      res.status(201).json({
        success: true,
        order,
        newBalance: Number(updatedUser.pointsBalance),
      });
    } catch (error) {
      next(error);
    }
  };

  // Get user's orders
  getUserOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const skip = (page - 1) * limit;

      const where: any = { userId: req.user!.id };
      if (status) {
        where.status = status;
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            product: true,
            server: { select: { id: true, name: true, map: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      res.json({
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get order by ID
  getOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          product: true,
          server: true,
        },
      });

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Check ownership
      if (order.userId !== req.user!.id && !req.user!.isAdmin) {
        throw new AppError('Access denied', 403);
      }

      res.json({ order });
    } catch (error) {
      next(error);
    }
  };
}
