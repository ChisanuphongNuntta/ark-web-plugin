import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';
import promotionService from '../services/promotion.service.js';

function serializeCheckoutSession(session: any) {
  return {
    ...session,
    subtotalAmount: session.subtotalAmount?.toString?.() ?? session.subtotalAmount,
    discountAmount: session.discountAmount?.toString?.() ?? session.discountAmount,
    totalAmount: session.totalAmount.toString(),
  };
}

function getCheckoutLines(cartSnapshot: any): any[] {
  if (Array.isArray(cartSnapshot)) return cartSnapshot;
  if (Array.isArray(cartSnapshot?.lines)) return cartSnapshot.lines;
  return [];
}

function getPromotionSnapshot(cartSnapshot: any) {
  if (Array.isArray(cartSnapshot)) return null;
  return cartSnapshot?.promotion ?? null;
}

function lineDiscountMap(promotion: any) {
  const discounts = new Map<number, bigint>();
  for (const app of promotion?.applications ?? []) {
    for (const allocation of app.allocation ?? []) {
      const lineNo = Number(allocation.lineNo);
      const amount = BigInt(allocation.amount ?? 0);
      discounts.set(lineNo, (discounts.get(lineNo) ?? 0n) + amount);
    }
  }
  return discounts;
}

function isCheckoutDeliverable(product: { productType?: string | null; itemBlueprint?: string | null }) {
  const type = product.productType ?? 'item';
  return (type === 'item' || type === 'dino') && Boolean(product.itemBlueprint);
}

const cleanBlueprint = (value: unknown) => String(value ?? '').replace(/^"+|"+$/g, '').trim();

function buildCheckoutDelivery(item: any, orderId: string) {
  if (item.productType === 'dino') {
    const configured = item.deliveryPayload?.spawn ?? item.deliveryPayload?.definition ?? {};
    const blueprint = cleanBlueprint(configured.blueprint ?? configured.Blueprint ?? item.itemBlueprint);
    const level = Number(configured.level ?? configured.Level ?? 1);
    if (!blueprint || blueprint !== item.itemBlueprint || !Number.isSafeInteger(level) || level < 1 || level > 10_000) {
      throw new AppError(`Dino delivery definition is invalid for "${item.name}"`, 409);
    }
    return {
      deliveryType: 'dino_catalog',
      payload: {
        schemaVersion: 1,
        orderId,
        productType: 'dino',
        productName: item.name,
        dino: {
          blueprint,
          level,
          forceTame: true,
          neutered: Boolean(configured.neutered ?? configured.Neutered),
        },
      },
    };
  }

  const configuredItems = Array.isArray(item.deliveryPayload?.definition?.Items)
    ? item.deliveryPayload.definition.Items
      .map((definition: any) => ({
        blueprint: cleanBlueprint(definition?.Blueprint),
        quantity: Math.max(1, Number(definition?.Amount ?? 1)) * item.quantity,
        quality: Math.max(0, Number(definition?.Quality ?? 0)),
        isBlueprint: Boolean(definition?.ForceBlueprint),
      }))
      .filter((definition: any) => definition.blueprint && Number.isSafeInteger(definition.quantity))
    : [];
  const items = configuredItems.length > 0
    ? configuredItems
    : [{
        blueprint: item.itemBlueprint,
        quantity: item.deliveryQuantity * item.quantity,
        quality: item.quality,
        isBlueprint: item.isBlueprint,
      }];
  return {
    deliveryType: 'order',
    payload: {
      schemaVersion: 1,
      orderId,
      productType: 'item',
      item: items[0],
      items,
      productName: item.name,
    },
  };
}

export class CheckoutController {
  createCheckoutSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { idempotencyKey, voucherCode, voucherCodes = [] } = req.body;

      if (!idempotencyKey?.trim()) {
        throw new AppError('Idempotency key is required', 400);
      }
      if (idempotencyKey.length > 255) throw new AppError('Idempotency key must not exceed 255 characters', 400);

      // Check if session already exists
      const existingSession = await prisma.checkoutSession.findUnique({
        where: { userId_idempotencyKey: { userId: req.user!.id, idempotencyKey } },
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
      const snapshot = [];

      for (const [lineIndex, item] of cart.items.entries()) {
        if (!item.product.isActive) {
          throw new AppError(`Product "${item.product.name}" is no longer active`, 400);
        }

        if (!item.server.isActive) {
          throw new AppError(`Server "${item.server.name}" is inactive`, 400);
        }
        if (item.server.drainMode) {
          throw new AppError(`Server "${item.server.name}" is temporarily draining deliveries`, 409);
        }

        const requiredCapabilities: string[] = item.product.requiredCapabilities ?? [];
        const serverCapabilities: string[] = item.server.capabilities ?? [];
        const missingCapabilities = requiredCapabilities.filter(
          (capability) => !serverCapabilities.includes(capability),
        );
        if (missingCapabilities.length > 0) {
          throw new AppError(
            `Server "${item.server.name}" cannot deliver this product yet (${missingCapabilities.join(', ')})`,
            409,
          );
        }
        if (!isCheckoutDeliverable(item.product)) {
          throw new AppError(`Product "${item.product.name}" delivery type is not enabled yet`, 409);
        }
        if (item.product.productType === 'dino' && item.quantity !== 1) {
          throw new AppError(`Dino "${item.product.name}" must be purchased one at a time`, 400);
        }

        if (item.product.stock !== null && item.product.stock < item.quantity) {
          throw new AppError(`Product "${item.product.name}" is out of stock or insufficient`, 400);
        }

        // Check user limits
        if (item.product.maxPerUser !== null) {
          const userOrders = await prisma.order.aggregate({
            where: {
              userId: req.user!.id,
              productId: item.productId,
              status: { not: 'refunded' },
            }, _sum: { quantity: true },
          });
          if ((userOrders._sum.quantity ?? 0) + item.quantity > item.product.maxPerUser) {
            throw new AppError(`Purchase limit exceeded for "${item.product.name}". Max allowed: ${item.product.maxPerUser}`, 400);
          }
        }

        snapshot.push({
          lineNo: lineIndex + 1,
          productId: item.productId,
          serverId: item.serverId,
          categoryId: item.product.categoryId ?? null,
          quantity: item.quantity,
          price: item.product.price,
          name: item.product.name,
          productType: item.product.productType ?? 'item',
          deliveryPayload: item.product.deliveryPayload,
          requiredCapabilities,
          itemBlueprint: item.product.itemBlueprint,
          deliveryQuantity: item.product.quantity,
          quality: item.product.quality,
          isBlueprint: item.product.isBlueprint,
        });
      }

      const requestedVoucherCodes = [
        ...(voucherCode ? [voucherCode] : []),
        ...(Array.isArray(voucherCodes) ? voucherCodes : []),
      ];
      const promotion = await promotionService.evaluateCheckout({
        userId: req.user!.id,
        lines: snapshot,
        voucherCodes: requestedVoucherCodes,
      });

      // Verify wallet balance
      const walletBalance = await walletService.getBalance(req.user!.id);
      const availableBalance = BigInt(walletBalance.accounts.available || '0');

      if (availableBalance < promotion.total) {
        throw new AppError('Insufficient wallet balance', 400);
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

      const session = await prisma.checkoutSession.create({
        data: {
          userId: req.user!.id,
          cartSnapshot: {
            lines: snapshot,
            promotion: promotion.snapshot,
          },
          subtotalAmount: promotion.subtotal,
          discountAmount: promotion.discountTotal,
          totalAmount: promotion.total,
          promotionSnapshot: promotion.snapshot,
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

      // Commit the checkout session in a serializable transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM checkout_sessions WHERE id = ${session.id} FOR UPDATE`;
        const lockedSession = await tx.checkoutSession.findUniqueOrThrow({ where: { id: session.id } });
        if (lockedSession.userId !== req.user!.id) throw new AppError('Access denied', 403);
        if (lockedSession.status !== 'pending') {
          throw new AppError(`Checkout session status is already ${lockedSession.status}`, 409);
        }
        if (lockedSession.expiresAt < new Date()) throw new AppError('Checkout session has expired', 400);
        const lockedSnapshot = getCheckoutLines(lockedSession.cartSnapshot);
        const lockedPromotionSnapshot = getPromotionSnapshot(lockedSession.cartSnapshot);

        // 1. Fetch and verify user's Steam ID
        const user = await tx.user.findUniqueOrThrow({
          where: { id: session.userId },
        });

        if (!user.steamId) {
          throw new AppError('Steam account must be linked to receive in-game items', 400);
        }

        // 2. Lock products and verify stock and limits under transaction
        for (const item of lockedSnapshot) {
          // Row-level lock on Postgres products
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`;

          const product = await tx.product.findUniqueOrThrow({
            where: { id: item.productId },
          });
          const server = await tx.server.findUniqueOrThrow({ where: { id: item.serverId } });

          if (!product.isActive) {
            throw new AppError(`Product "${product.name}" is no longer active`, 400);
          }
          if (!server.isActive || server.drainMode) {
            throw new AppError(`Server "${server.name}" is unavailable for delivery`, 409);
          }
          const missingCapabilities = (product.requiredCapabilities ?? []).filter(
            (capability) => !(server.capabilities ?? []).includes(capability),
          );
          if (missingCapabilities.length > 0) {
            throw new AppError(`Server capability manifest changed; create a new checkout session`, 409);
          }
          if ((product.productType ?? 'item') !== item.productType || !isCheckoutDeliverable(product)) {
            throw new AppError(`Product delivery definition changed; create a new checkout session`, 409);
          }
          if (
            product.itemBlueprint !== item.itemBlueprint ||
            product.quantity !== item.deliveryQuantity ||
            product.quality !== item.quality ||
            product.isBlueprint !== item.isBlueprint
          ) {
            throw new AppError(`Product delivery definition changed; create a new checkout session`, 409);
          }
          if (JSON.stringify(product.deliveryPayload) !== JSON.stringify(item.deliveryPayload)) {
            throw new AppError(`Product delivery definition changed; create a new checkout session`, 409);
          }

          if (product.price !== item.price) {
            throw new AppError(`Product "${product.name}" price has changed. Please create a new checkout session.`, 409);
          }

          if ((product.categoryId ?? null) !== (item.categoryId ?? null)) {
            throw new AppError(`Product "${product.name}" category has changed. Please create a new checkout session.`, 409);
          }

          if (product.stock !== null && product.stock < item.quantity) {
            throw new AppError(`Product "${product.name}" does not have enough stock`, 409);
          }

          // Check user limits
          if (product.maxPerUser !== null) {
            const userOrders = await tx.order.aggregate({
              where: {
                userId: session.userId,
                productId: product.id,
                status: { not: 'refunded' },
              }, _sum: { quantity: true },
            });
            if ((userOrders._sum.quantity ?? 0) + item.quantity > product.maxPerUser) {
              throw new AppError(`Purchase limit exceeded for "${product.name}". Max allowed: ${product.maxPerUser}`, 400);
            }
          }
        }

        const promotion = lockedPromotionSnapshot
          ? await promotionService.evaluateCheckout({
            userId: lockedSession.userId,
            lines: lockedSnapshot,
            voucherCodes: lockedPromotionSnapshot.voucherCodes ?? [],
            client: tx,
          })
          : {
            subtotal: lockedSession.totalAmount as bigint,
            discountTotal: 0n,
            total: lockedSession.totalAmount as bigint,
            applications: [],
            snapshot: null,
          };

        if (promotion.total !== (lockedSession.totalAmount as bigint)) {
          throw new AppError('Promotion terms changed. Please create a new checkout session.', 409);
        }

        // 3. Deduct stock
        for (const item of lockedSnapshot) {
          const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
          if (product.stock !== null) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
          }
        }

        // 4. Deduct user's wallet balance using Ledger double-entry.
        // Fully discounted checkouts do not write zero-value ledger entries.
        if ((lockedSession.totalAmount as bigint) > 0n) {
          await walletService.post({
            idempotencyKey: `checkout:commit:${session.id}`,
            type: 'checkout_purchase',
            referenceType: 'checkout',
            referenceId: session.id,
            entries: [
              { accountKey: userAccountKey(session.userId, 'available'), amount: -1n * (lockedSession.totalAmount as bigint) },
              { accountKey: SYSTEM_ACCOUNTS.revenue, amount: lockedSession.totalAmount as bigint },
            ],
          }, tx);
        }

        const now = new Date();
        const orderGroup = await tx.orderGroup.create({
          data: {
            userId: session.userId,
            checkoutSessionId: session.id,
            status: 'fulfilling',
            currency: 'IC',
            subtotal: promotion.subtotal,
            discount: promotion.discountTotal,
            total: promotion.total,
            promotionSnapshot: promotion.snapshot ?? undefined,
            paidAt: now,
          },
        });

        if (promotion.applications.length > 0) {
          await promotionService.redeemForCheckout({
            userId: session.userId,
            checkoutSessionId: session.id,
            orderGroupId: orderGroup.id,
            evaluation: promotion as any,
            client: tx,
            now,
          });
        }

        // 5. Create Orders and queue DeliveryJobs.
        // Payment was just committed atomically above, so each order is created at the
        // state-machine `paid` state and immediately transitioned to `queued` (§8). The
        // DeliveryJob (operational lease/idempotency) and Fulfillment (durable per-order
        // delivery timeline, §16/§18) are created in the same transaction.
        const orderIds = [];
        const discountsByLineNo = lineDiscountMap(promotion.snapshot);
        for (const [lineIndex, item] of lockedSnapshot.entries()) {
          const lineNo = item.lineNo ?? lineIndex + 1;
          const lineSubtotal = BigInt(item.price) * BigInt(item.quantity);
          const lineDiscount = discountsByLineNo.get(lineNo) ?? 0n;
          const lineTotal = lineSubtotal - lineDiscount;
          const order = await tx.order.create({
            data: {
              userId: session.userId,
              productId: item.productId,
              serverId: item.serverId,
              quantity: item.quantity,
              totalPrice: Number(lineTotal),
              status: 'queued',
              paidAt: now,
              queuedAt: now,
              checkoutSessionId: session.id,
              orderGroupId: orderGroup.id,
            } as any,
          });
          orderIds.push(order.id);

          const orderItem = await tx.orderItem.create({
            data: {
              orderGroupId: orderGroup.id,
              legacyOrderId: order.id,
              lineNo,
              productId: item.productId,
              serverId: item.serverId,
              productName: item.name,
              productType: item.productType,
              deliveryPayload: item.deliveryPayload ?? undefined,
              itemBlueprint: item.itemBlueprint,
              quality: item.quality,
              isBlueprint: item.isBlueprint,
              quantity: item.quantity,
              unitPrice: BigInt(item.price),
              subtotal: lineSubtotal,
              discount: lineDiscount,
              total: lineTotal,
              status: 'queued',
              paidAt: now,
              queuedAt: now,
            },
          });

          // NOTE: No legacy PointTransaction is written here. The IRIS Wallet double-entry
          // ledger (the walletService.post above) is the SINGLE source of truth for money
          // movement. User.pointsBalance is a read-only projection of the available ledger
          // account, kept in sync inside walletService.post. Writing a second PointTransaction
          // ledger would re-introduce the dual-write/divergence problem M2 removes.

          // Queue DeliveryJob
          const { deliveryType, payload } = buildCheckoutDelivery(item, order.id);
          const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

          await tx.deliveryJob.create({
            data: {
              id: order.id,
              serverId: item.serverId,
              playerSteamId: user.steamId,
              deliveryType,
              referenceId: order.id,
              payload,
              payloadHash,
              status: 'pending',
            },
          });

          // Fulfillment bridges the order to its delivery job and records the timeline.
          // deliveryKey == DeliveryJob.id (== order.id) so a duplicate plugin callback keyed
          // on deliveryKey maps deterministically back to one fulfillment.
          await tx.fulfillment.create({
            data: {
              orderId: order.id,
              orderItemId: orderItem.id,
              deliveryJobId: order.id,
              serverId: item.serverId,
              playerSteamId: user.steamId,
              deliveryKey: order.id,
              status: 'queued',
              queuedAt: now,
            },
          });
        }

        // 6. Clear Cart items corresponding to snapshot
        await tx.cartItem.deleteMany({
          where: {
            cart: { userId: session.userId },
            OR: lockedSnapshot.map(item => ({
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

        return { orderIds, orderGroupId: orderGroup.id };
      }, { isolationLevel: 'Serializable' });

      res.json({
        success: true,
        orderIds: result.orderIds,
        orderGroupId: result.orderGroupId,
        totalSpent: session.totalAmount.toString(),
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new CheckoutController();
