import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { SYSTEM_ACCOUNTS, userAccountKey } from '../services/wallet.service.js';

type PluginRequest = Request & { serverId?: number };

const compatible = (required: string[], available: string[]) =>
  required.every((capability) => available.includes(capability));

const isGameDeliverableProduct = (product: { productType: string; itemBlueprint: string | null }) =>
  (product.productType === 'item' || product.productType === 'dino') && Boolean(product.itemBlueprint);

const cleanBlueprint = (value: unknown) => String(value ?? '').replace(/^"+|"+$/g, '').trim();

const buildDeliveryPayload = (product: any, orderId: string, purchasedQuantity: number) => {
  if (product.productType === 'dino') {
    const configured = product.deliveryPayload?.spawn ?? product.deliveryPayload?.definition ?? {};
    const level = Number(configured.level ?? configured.Level ?? 1);
    if (!Number.isSafeInteger(level) || level < 1 || level > 10_000) {
      throw new AppError('Dino level is outside the supported range', 409);
    }
    const blueprint = cleanBlueprint(configured.blueprint ?? configured.Blueprint ?? product.itemBlueprint);
    if (!blueprint || blueprint !== product.itemBlueprint) {
      throw new AppError('Dino delivery blueprint is invalid', 409);
    }
    return {
      deliveryType: 'dino_catalog',
      payload: {
        schemaVersion: 1,
        orderId,
        productType: 'dino',
        productName: product.name,
        dino: {
          blueprint,
          level,
          forceTame: true,
          neutered: Boolean(configured.neutered ?? configured.Neutered),
        },
      },
    };
  }

  const configuredItems = Array.isArray(product.deliveryPayload?.definition?.Items)
    ? product.deliveryPayload.definition.Items
      .map((item: any) => ({
        blueprint: cleanBlueprint(item?.Blueprint),
        quantity: Math.max(1, Number(item?.Amount ?? 1)) * purchasedQuantity,
        quality: Math.max(0, Number(item?.Quality ?? 0)),
        isBlueprint: Boolean(item?.ForceBlueprint),
      }))
      .filter((item: any) => item.blueprint && Number.isSafeInteger(item.quantity))
    : [];
  const items = configuredItems.length > 0
    ? configuredItems
    : [{
        blueprint: product.itemBlueprint,
        quantity: product.quantity * purchasedQuantity,
        quality: product.quality,
        isBlueprint: product.isBlueprint,
      }];
  return {
    deliveryType: 'order',
    payload: {
      schemaVersion: 1,
      orderId,
      productType: 'item',
      productName: product.name,
      item: items[0],
      items,
    },
  };
};

export class GameShopController {
  listCatalog = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
      const steamId = typeof req.query.steamId === 'string' && /^\d{17}$/.test(req.query.steamId)
        ? req.query.steamId
        : null;
      const server = await prisma.server.findUniqueOrThrow({ where: { id: req.serverId! } });
      // Catalog browsing is read-only and remains available while an operator is draining
      // purchases/deliveries for rollout verification. createQuote and confirmQuote below
      // continue to enforce drainMode, so viewing products cannot mutate wallet or game state.
      if (!server.capabilities.includes('game-shop.quote-confirm.v1')) {
        throw new AppError('Server plugin does not support in-game quote/confirm purchases', 409);
      }

      const candidates = await prisma.product.findMany({
        where: {
          isActive: true,
          productType: { in: ['item', 'dino'] },
          itemBlueprint: { not: null },
          ...(search ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 200,
        select: {
          id: true, name: true, description: true, price: true, stock: true,
          categoryId: true, sortOrder: true, requiredCapabilities: true, productType: true,
          _count: { select: { orders: true } },
        },
      });

      const compatibleCandidates = candidates.filter(
        (product) => compatible(product.requiredCapabilities, server.capabilities),
      );
      const user = steamId ? await prisma.user.findUnique({ where: { steamId } }) : null;
      const purchaseQuantities = new Map<number, number>();
      const categoryAffinity = new Map<number, number>();
      if (user) {
        const purchases = await prisma.order.groupBy({
          by: ['productId'],
          where: { userId: user.id, status: { not: 'refunded' } },
          _sum: { quantity: true },
        });
        const purchasedProducts = purchases.length > 0
          ? await prisma.product.findMany({
            where: { id: { in: purchases.map((purchase) => purchase.productId) } },
            select: { id: true, categoryId: true },
          })
          : [];
        const categoryByProduct = new Map(purchasedProducts.map((product) => [product.id, product.categoryId]));
        for (const purchase of purchases) {
          const quantity = purchase._sum.quantity ?? 0;
          purchaseQuantities.set(purchase.productId, quantity);
          const categoryId = categoryByProduct.get(purchase.productId);
          if (categoryId != null) categoryAffinity.set(categoryId, (categoryAffinity.get(categoryId) ?? 0) + quantity);
        }
      }

      const products = compatibleCandidates
        .map((product) => {
          const popularity = Math.min(25, Math.log2((product._count?.orders ?? 0) + 1) * 5);
          const affinity = product.categoryId == null ? 0 : Math.min(35, (categoryAffinity.get(product.categoryId) ?? 0) * 4);
          const repeat = Math.min(10, (purchaseQuantities.get(product.id) ?? 0) * 2);
          const affordable = user && BigInt(user.pointsBalance) >= BigInt(product.price) ? 8 : 0;
          const searchBoost = search && product.name.toLowerCase().includes(search.toLowerCase()) ? 20 : 0;
          const score = popularity + affinity + repeat + affordable + searchBoost - Math.min(20, product.sortOrder / 100);
          const reason = affinity > 0
            ? 'Based on your shop history'
            : popularity > 0
              ? 'Popular in the cluster'
              : affordable > 0
                ? 'Within your balance'
                : 'Available on this server';
          const { requiredCapabilities: _requiredCapabilities, categoryId: _categoryId, sortOrder: _sortOrder, _count, ...safe } = product;
          return { ...safe, score, reason, recommended: Boolean(user) };
        })
        .sort((a, b) => b.score - a.score || a.id - b.id)
        .slice(0, 10)
        .map(({ score: _score, ...product }) => product);
      res.json({ products, serverId: server.id, currency: 'IC' });
    } catch (error) {
      next(error);
    }
  };

  createQuote = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.body ?? {};
      const productId = Number(req.body?.productId);
      const quantity = Number(req.body?.quantity ?? 1);
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        throw new AppError('A valid Steam ID is required', 400);
      }
      if (!Number.isSafeInteger(productId) || productId <= 0) throw new AppError('Invalid product ID', 400);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
        throw new AppError('Quantity must be between 1 and 100', 400);
      }

      const [user, product, server] = await Promise.all([
        prisma.user.findUnique({ where: { steamId } }),
        prisma.product.findUnique({ where: { id: productId } }),
        prisma.server.findUnique({ where: { id: req.serverId! } }),
      ]);
      if (!user) throw new AppError('Steam account is not linked to IRIS', 404);
      if (!product || !product.isActive || !isGameDeliverableProduct(product)) {
        throw new AppError('Product is unavailable for in-game delivery', 404);
      }
      if (product.productType === 'dino' && quantity !== 1) {
        throw new AppError('Dinos must be purchased one at a time', 400);
      }
      if (!server || !server.isActive || server.drainMode) throw new AppError('Server is unavailable', 409);
      if (!server.capabilities.includes('game-shop.quote-confirm.v1')) {
        throw new AppError('Server plugin does not support in-game quote/confirm purchases', 409);
      }
      if (!compatible(product.requiredCapabilities, server.capabilities)) {
        throw new AppError('Server cannot deliver this product', 409);
      }
      if (product.stock !== null && product.stock < quantity) throw new AppError('Insufficient stock', 409);
      const totalPrice = product.price * quantity;
      if (!Number.isSafeInteger(totalPrice) || totalPrice < 0 || totalPrice > 2_147_483_647) {
        throw new AppError('Quote total is outside the supported range', 400);
      }
      const balance = await walletService.getBalance(user.id);
      if (BigInt(balance.accounts.available) < BigInt(totalPrice)) throw new AppError('Insufficient wallet balance', 400);

      const quote = await prisma.gamePurchaseQuote.create({
        data: {
          userId: user.id,
          serverId: server.id,
          productId: product.id,
          quantity,
          unitPrice: product.price,
          totalPrice,
          productSnapshot: {
            name: product.name,
            productType: product.productType,
            itemBlueprint: product.itemBlueprint,
            quality: product.quality,
            isBlueprint: product.isBlueprint,
            deliveryPayload: product.deliveryPayload,
            requiredCapabilities: product.requiredCapabilities,
          },
          expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        },
      });
      res.json({
        quoteId: quote.id,
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.price,
        totalPrice,
        currency: 'IC',
        expiresAt: quote.expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  confirmQuote = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { quoteId, steamId } = req.body ?? {};
      if (typeof quoteId !== 'string' || typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        throw new AppError('Quote ID and valid Steam ID are required', 400);
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM game_purchase_quotes WHERE id = ${quoteId} FOR UPDATE`;
        const quote = await tx.gamePurchaseQuote.findUniqueOrThrow({ where: { id: quoteId } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: quote.userId } });
        if (user.steamId !== steamId || quote.serverId !== req.serverId) throw new AppError('Quote ownership mismatch', 403);
        if (quote.status === 'completed') return { orderId: quote.orderId!, duplicate: true, totalPrice: quote.totalPrice };
        if (quote.status !== 'pending' || quote.expiresAt < new Date()) throw new AppError('Quote expired or unavailable', 409);

        await tx.$queryRaw`SELECT id FROM products WHERE id = ${quote.productId} FOR UPDATE`;
        const [product, server] = await Promise.all([
          tx.product.findUniqueOrThrow({ where: { id: quote.productId } }),
          tx.server.findUniqueOrThrow({ where: { id: quote.serverId } }),
        ]);
        const snapshot = quote.productSnapshot as any;
        if (
          !product.isActive || !isGameDeliverableProduct(product) ||
          product.productType !== snapshot.productType ||
          product.price !== quote.unitPrice || product.itemBlueprint !== snapshot.itemBlueprint ||
          product.quality !== snapshot.quality || product.isBlueprint !== snapshot.isBlueprint ||
          JSON.stringify(product.deliveryPayload) !== JSON.stringify(snapshot.deliveryPayload)
        ) throw new AppError('Product changed; request a new quote', 409);
        if (
          !server.isActive || server.drainMode ||
          !server.capabilities.includes('game-shop.quote-confirm.v1') ||
          !compatible(product.requiredCapabilities, server.capabilities)
        ) {
          throw new AppError('Server can no longer deliver this product', 409);
        }
        if (product.stock !== null && product.stock < quote.quantity) throw new AppError('Insufficient stock', 409);
        if (product.maxPerUser !== null) {
          const prior = await tx.order.aggregate({
            where: { userId: user.id, productId: product.id, status: { not: 'refunded' } },
            _sum: { quantity: true },
          });
          if ((prior._sum.quantity ?? 0) + quote.quantity > product.maxPerUser) {
            throw new AppError('Purchase limit exceeded', 409);
          }
        }

        await walletService.ensureUserAccounts(user.id, tx);
        await walletService.post({
          idempotencyKey: `game-purchase:${quote.id}`,
          type: 'game_purchase',
          referenceType: 'game_purchase_quote',
          referenceId: quote.id,
          entries: [
            { accountKey: userAccountKey(user.id, 'available'), amount: -BigInt(quote.totalPrice) },
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: BigInt(quote.totalPrice) },
          ],
        }, tx);

        if (product.stock !== null) {
          await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: quote.quantity } } });
        }
        await tx.user.update({ where: { id: user.id }, data: { totalSpent: { increment: quote.totalPrice } } });

        const now = new Date();
        const group = await tx.orderGroup.create({
          data: {
            userId: user.id, status: 'fulfilling', currency: 'IC',
            subtotal: BigInt(quote.totalPrice), total: BigInt(quote.totalPrice), paidAt: now,
          },
        });
        const order = await tx.order.create({
          data: {
            userId: user.id, productId: product.id, serverId: server.id,
            quantity: quote.quantity, totalPrice: quote.totalPrice, status: 'queued',
            paidAt: now, queuedAt: now, orderGroupId: group.id,
          },
        });
        const orderItem = await tx.orderItem.create({
          data: {
            orderGroupId: group.id, legacyOrderId: order.id, lineNo: 1,
            productId: product.id, serverId: server.id, productName: product.name,
            productType: product.productType, deliveryPayload: product.deliveryPayload ?? undefined,
            itemBlueprint: product.itemBlueprint, quality: product.quality,
            isBlueprint: product.isBlueprint, quantity: quote.quantity,
            unitPrice: BigInt(product.price), subtotal: BigInt(quote.totalPrice),
            total: BigInt(quote.totalPrice), status: 'queued', paidAt: now, queuedAt: now,
          },
        });
        const { deliveryType, payload } = buildDeliveryPayload(product, order.id, quote.quantity);
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        await tx.deliveryJob.create({
          data: {
            id: order.id, serverId: server.id, playerSteamId: steamId,
            deliveryType, referenceId: order.id, payload, payloadHash, status: 'pending',
          },
        });
        await tx.fulfillment.create({
          data: {
            orderId: order.id, orderItemId: orderItem.id, deliveryJobId: order.id,
            serverId: server.id, playerSteamId: steamId, deliveryKey: order.id,
            status: 'queued', queuedAt: now,
          },
        });
        await tx.gamePurchaseQuote.update({
          where: { id: quote.id },
          data: { status: 'completed', orderId: order.id, completedAt: now },
        });
        return { orderId: order.id, duplicate: false, totalPrice: quote.totalPrice };
      }, { isolationLevel: 'Serializable' });

      res.json({ success: true, ...result, deliveryStatus: 'pending' });
    } catch (error) {
      next(error);
    }
  };
}

export default new GameShopController();
