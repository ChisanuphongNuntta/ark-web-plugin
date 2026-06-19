import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';

function serializeCheckoutSession(session: any) {
  return {
    ...session,
    totalAmount: session.totalAmount.toString(),
  };
}

export class CheckoutController {
  createCheckoutSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { idempotencyKey } = req.body;

      if (!idempotencyKey?.trim()) {
        throw new AppError('Idempotency key is required', 400);
      }

      // Check if session already exists
      const existingSession = await prisma.checkoutSession.findUnique({
        where: { idempotencyKey },
      });

      if (existingSession) {
        return res.json(serializeCheckoutSession(existingSession));
      }

      // Fetch user's cart
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.id },
        include: {
          items: {
            include: {
              product: true,
              server: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new AppError('Cart is empty', 400);
      }

      // Validate items and calculate total
      let totalAmount = 0n;
      const snapshot = [];

      for (const item of cart.items) {
        if (!item.product.isActive) {
          throw new AppError(`Product "${item.product.name}" is no longer active`, 400);
        }

        if (!item.server.isActive) {
          throw new AppError(`Server "${item.server.name}" is inactive`, 400);
        }

        if (item.product.stock !== null && item.product.stock < item.quantity) {
          throw new AppError(`Product "${item.product.name}" is out of stock or insufficient`, 400);
        }

        // Check user limits
        if (item.product.maxPerUser !== null) {
          const userOrders = await prisma.order.count({
            where: {
              userId: req.user!.id,
              productId: item.productId,
              status: { not: 'refunded' },
            },
          });
          if (userOrders + item.quantity > item.product.maxPerUser) {
            throw new AppError(`Purchase limit exceeded for "${item.product.name}". Max allowed: ${item.product.maxPerUser}`, 400);
          }
        }

        totalAmount += BigInt(item.product.price) * BigInt(item.quantity);

        snapshot.push({
          productId: item.productId,
          serverId: item.serverId,
          quantity: item.quantity,
          price: item.product.price,
          name: item.product.name,
          itemBlueprint: item.product.itemBlueprint,
          quality: item.product.quality,
          isBlueprint: item.product.isBlueprint,
        });
      }

      // Verify wallet balance
      const walletBalance = await walletService.getBalance(req.user!.id);
      const availableBalance = BigInt(walletBalance.accounts.available || '0');

      if (availableBalance < totalAmount) {
        throw new AppError('Insufficient wallet balance', 400);
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

      const session = await prisma.checkoutSession.create({
        data: {
          userId: req.user!.id,
          cartSnapshot: snapshot,
          totalAmount,
          status: 'pending',
          idempotencyKey,
          expiresAt,
        },
      });

      res.json(serializeCheckoutSession(session));
    } catch (error) {
      next(error);
    }
  };

  commitCheckoutSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const session = await prisma.checkoutSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new AppError('Checkout session not found', 404);
      }

      if (session.userId !== req.user!.id) {
        throw new AppError('Access denied', 403);
      }

      if (session.status !== 'pending') {
        throw new AppError(`Checkout session status is already ${session.status}`, 400);
      }

      if (session.expiresAt < new Date()) {
        throw new AppError('Checkout session has expired', 400);
      }

      const snapshot = session.cartSnapshot as any[];

      // Commit the checkout session in a serializable transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch and verify user's Steam ID
        const user = await tx.user.findUniqueOrThrow({
          where: { id: session.userId },
        });

        if (!user.steamId) {
          throw new AppError('Steam account must be linked to receive in-game items', 400);
        }

        // 2. Lock products and verify stock and limits under transaction
        for (const item of snapshot) {
          // Row-level lock on Postgres products
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`;

          const product = await tx.product.findUniqueOrThrow({
            where: { id: item.productId },
          });

          if (!product.isActive) {
            throw new AppError(`Product "${product.name}" is no longer active`, 400);
          }

          if (product.stock !== null && product.stock < item.quantity) {
            throw new AppError(`Product "${product.name}" does not have enough stock`, 409);
          }

          // Check user limits
          if (product.maxPerUser !== null) {
            const userOrders = await tx.order.count({
              where: {
                userId: session.userId,
                productId: product.id,
                status: { not: 'refunded' },
              },
            });
            if (userOrders + item.quantity > product.maxPerUser) {
              throw new AppError(`Purchase limit exceeded for "${product.name}". Max allowed: ${product.maxPerUser}`, 400);
            }
          }
        }

        // 3. Deduct stock
        for (const item of snapshot) {
          const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
          if (product.stock !== null) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
          }
        }

        // 4. Deduct user's wallet balance using Ledger double-entry
        await walletService.post({
          idempotencyKey: `checkout:commit:${session.id}`,
          type: 'checkout_purchase',
          referenceType: 'checkout',
          referenceId: session.id,
          entries: [
            { accountKey: userAccountKey(session.userId, 'available'), amount: -1n * (session.totalAmount as bigint) },
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: session.totalAmount as bigint },
          ],
        }, tx);

        // 5. Create Orders and queue DeliveryJobs
        const orderIds = [];
        for (const item of snapshot) {
          const totalPrice = item.price * item.quantity;
          const order = await tx.order.create({
            data: {
              userId: session.userId,
              productId: item.productId,
              serverId: item.serverId,
              quantity: item.quantity,
              totalPrice,
              status: 'pending',
              checkoutSessionId: session.id,
            } as any,
          });
          orderIds.push(order.id);

          // For backward compatibility, record PointTransaction log
          const currentUser = await tx.user.findUniqueOrThrow({ where: { id: session.userId } });
          await tx.pointTransaction.create({
            data: {
              userId: session.userId,
              amount: -totalPrice,
              balanceAfter: currentUser.pointsBalance,
              type: 'purchase',
              description: `Purchased ${item.name} x${item.quantity}`,
              referenceId: order.id,
            },
          });

          // Queue DeliveryJob
          const payload = {
            orderId: order.id,
            item: {
              blueprint: item.itemBlueprint,
              quantity: item.quantity,
              quality: item.quality,
              isBlueprint: item.isBlueprint,
            },
            productName: item.name,
          };
          const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

          await tx.deliveryJob.create({
            data: {
              id: order.id,
              serverId: item.serverId,
              playerSteamId: user.steamId,
              deliveryType: 'order',
              referenceId: order.id,
              payload,
              payloadHash,
              status: 'pending',
            },
          });
        }

        // 6. Clear Cart items corresponding to snapshot
        await tx.cartItem.deleteMany({
          where: {
            cart: { userId: session.userId },
            OR: snapshot.map(item => ({
              productId: item.productId,
              serverId: item.serverId,
            })),
          },
        });

        // 7. Update CheckoutSession status to completed
        await tx.checkoutSession.update({
          where: { id: session.id },
          data: { status: 'completed' },
        });

        return { orderIds };
      }, { isolationLevel: 'Serializable' });

      res.json({
        success: true,
        orderIds: result.orderIds,
        totalSpent: session.totalAmount.toString(),
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new CheckoutController();
