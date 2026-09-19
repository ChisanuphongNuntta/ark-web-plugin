import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';
import { assertOrderTransition, isRefundable } from '../services/orderState.js';

// Build a normalized delivery timeline (status + timestamps) for GET /orders/{id}.
// Sourced from the durable Order lifecycle timestamps plus the Fulfillment row, ordered
// chronologically with null timestamps omitted. The frontend renders this directly.
function buildDeliveryTimeline(order: any, fulfillment: any): Array<{ status: string; at: string }> {
  const events: Array<{ status: string; at: Date | null | undefined }> = [
    { status: 'created', at: order.createdAt },
    { status: 'paid', at: order.paidAt },
    { status: 'queued', at: order.queuedAt ?? fulfillment?.queuedAt },
    { status: 'delivering', at: fulfillment?.claimedAt },
    { status: 'delivered', at: order.deliveredAt ?? fulfillment?.deliveredAt },
    { status: 'failed', at: fulfillment?.failedAt },
    { status: 'refunded', at: order.refundedAt },
  ];
  return events
    .filter((e): e is { status: string; at: Date } => e.at != null)
    .map((e) => ({ status: e.status, at: new Date(e.at).toISOString() }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export class OrderController {
  // Create order (buy item)
  createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { productId, serverId, quantity = 1 } = req.body;

      // This endpoint predates the cart/checkout orchestrator and does not create the
      // complete OrderGroup/OrderItem/DeliveryJob chain. Keep it off by default so a
      // client cannot bypass authoritative checkout, promotions and fulfillment.
      if (process.env.ENABLE_LEGACY_SINGLE_ORDER !== 'true') {
        throw new AppError('Legacy single-item checkout is disabled; use /api/checkout/session', 410);
      }

      if (!productId || !serverId) {
        throw new AppError('Product ID and Server ID are required', 400);
      }

      const parsedProductId = Number(productId);
      const parsedServerId = Number(serverId);
      const parsedQuantity = Number(quantity);
      if (!Number.isSafeInteger(parsedProductId) || parsedProductId <= 0) {
        throw new AppError('Product ID must be a positive integer', 400);
      }
      if (!Number.isSafeInteger(parsedServerId) || parsedServerId <= 0) {
        throw new AppError('Server ID must be a positive integer', 400);
      }
      if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100) {
        throw new AppError('Quantity must be an integer between 1 and 100', 400);
      }

      // Get product
      const product = await prisma.product.findUnique({
        where: { id: parsedProductId },
      });

      if (!product || !product.isActive) {
        throw new AppError('Product not found or unavailable', 404);
      }

      // Check stock
      if (product.stock !== null && product.stock < parsedQuantity) {
        throw new AppError('Not enough stock', 400);
      }

      // Check max per user
      if (product.maxPerUser !== null) {
        const userOrders = await prisma.order.aggregate({
          where: {
            userId: req.user!.id,
            productId: product.id,
            status: { not: 'refunded' },
          },
          _sum: { quantity: true },
        });

        const alreadyPurchased = userOrders._sum.quantity ?? 0;
        if (alreadyPurchased + parsedQuantity > product.maxPerUser) {
          throw new AppError(`You can only buy ${product.maxPerUser} of this item`, 400);
        }
      }

      // Calculate total price
      const totalPrice = product.price * parsedQuantity;

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
        where: { id: parsedServerId },
      });

      if (!server || !server.isActive) {
        throw new AppError('Server not found or inactive', 404);
      }

      // Create the order and settle payment atomically through the IRIS Wallet
      // double-entry ledger. The ledger is the SINGLE source of truth for money:
      // walletService.post moves the spend from the buyer's available account to
      // platform revenue and keeps User.pointsBalance in sync as a read-only
      // projection inside the same transaction. No legacy PointTransaction is
      // written — a second ledger would re-introduce the dual-write/divergence
      // problem (see ENTERPRISE_REDESIGN_PLAN_TH.md §14 IRIS Wallet).
      const order = await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(req.user!.id, tx);

        const created = await tx.order.create({
          data: {
            userId: req.user!.id,
            productId: product.id,
            serverId: server.id,
            quantity: parsedQuantity,
            totalPrice,
            status: 'pending',
          },
          include: {
            product: true,
            server: true,
          },
        });

        // Idempotent per created order id: a duplicate post for the same order is a
        // no-op, so retries inside this transaction never double-charge the buyer.
        await walletService.post({
          idempotencyKey: `order:purchase:${created.id}`,
          type: 'order_purchase',
          referenceType: 'order',
          referenceId: created.id,
          description: `Purchased ${product.name} x${parsedQuantity}`,
          entries: [
            { accountKey: userAccountKey(req.user!.id, 'available'), amount: -BigInt(totalPrice) },
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: BigInt(totalPrice) },
          ],
        }, tx);

        // totalSpent is a lifetime stat, not the money ledger; keep it current.
        await tx.user.update({
          where: { id: req.user!.id },
          data: { totalSpent: { increment: totalPrice } },
        });

        // Update stock if applicable
        if (product.stock !== null) {
          await tx.product.update({
            where: { id: product.id },
            data: { stock: { decrement: parsedQuantity } },
          });
        }

        return created;
      }, { isolationLevel: 'Serializable' });

      // pointsBalance is now the read-only projection maintained by the ledger.
      const updated = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { pointsBalance: true },
      });

      res.status(201).json({
        success: true,
        order,
        newBalance: Number(updated?.pointsBalance ?? 0n),
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

  // Get order by ID with delivery timeline (status + timestamps).
  getOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          product: true,
          server: true,
          fulfillment: true,
        },
      });

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Check ownership
      if (order.userId !== req.user!.id && !req.user!.isAdmin) {
        throw new AppError('Access denied', 403);
      }

      const fulfillment = (order as any).fulfillment ?? null;
      const timeline = buildDeliveryTimeline(order, fulfillment);

      res.json({
        order,
        delivery: fulfillment
          ? {
              status: fulfillment.status,
              attempts: fulfillment.attempts,
              lastError: fulfillment.lastError,
              receiptId: fulfillment.receiptId,
            }
          : null,
        timeline,
      });
    } catch (error) {
      next(error);
    }
  };

  // POST /orders/:id/refund — refund a delivered or failed order back to the user's wallet.
  //
  // Money flows through the IRIS Wallet double-entry ledger ONLY (§14): platform revenue ->
  // the buyer's `refundable` account. pointsBalance is never touched directly — it is the
  // read-only projection maintained inside walletService.post. The refund is zero-sum
  // (revenue debit == refundable credit). The order transitions delivered|failed -> refunded
  // guarded by the state machine, and the ledger idempotency key prevents double-refund.
  refundOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reason } = req.body ?? {};

      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // A failed delivery is safe for its owner to refund because no game asset was
      // delivered. A delivered order requires an operator-controlled reclaim workflow;
      // otherwise a buyer could keep the item and recover the full purchase price.
      if (order.userId !== req.user!.id && !req.user!.isAdmin) {
        throw new AppError('Access denied', 403);
      }
      if (order.status === 'delivered' && !req.user!.isAdmin) {
        throw new AppError('Delivered orders require administrator review and verified item recovery', 403);
      }

      if (!isRefundable(order.status)) {
        throw new AppError(`Order in status "${order.status}" is not refundable`, 409);
      }
      // Explicit state-machine guard (also catches already-refunded / cancelled).
      assertOrderTransition(order.status, 'refunded');

      const refundAmount = BigInt(order.totalPrice);

      const result = await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(order.userId, tx);

        // Re-read under transaction to avoid racing a concurrent refund.
        const fresh = await tx.order.findUniqueOrThrow({ where: { id } });
        if (fresh.status === 'refunded') {
          return { alreadyRefunded: true as const };
        }
        assertOrderTransition(fresh.status, 'refunded');

        await walletService.post({
          idempotencyKey: `order:refund:${order.id}`,
          type: 'order_refund',
          referenceType: 'order',
          referenceId: order.id,
          description: reason ? `Refund: ${reason}` : `Refund for order ${order.id}`,
          entries: [
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: -refundAmount },
            { accountKey: userAccountKey(order.userId, 'refundable'), amount: refundAmount },
          ],
        }, tx);

        const updated = await tx.order.update({
          where: { id: order.id },
          data: { status: 'refunded', refundedAt: new Date(), lastError: null },
        });

        return { alreadyRefunded: false as const, order: updated };
      }, { isolationLevel: 'Serializable' });

      res.json({
        success: true,
        orderId: order.id,
        status: 'refunded',
        refundedAmount: refundAmount.toString(),
        alreadyRefunded: result.alreadyRefunded === true,
      });
    } catch (error) {
      next(error);
    }
  };
}
