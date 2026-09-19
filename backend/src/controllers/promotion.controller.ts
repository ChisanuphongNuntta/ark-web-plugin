import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import promotionService, { normalizeVoucherCode } from '../services/promotion.service.js';

function collectVoucherCodes(body: any): string[] {
  const raw = [
    ...(body?.voucherCode ? [body.voucherCode] : []),
    ...(Array.isArray(body?.voucherCodes) ? body.voucherCodes : []),
  ];
  return [...new Set(raw.map((code) => normalizeVoucherCode(String(code))).filter(Boolean))];
}

export class PromotionController {
  evaluateCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.id },
        include: {
          items: {
            include: {
              product: true,
              server: { select: { id: true, name: true, map: true, isActive: true } },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new AppError('Cart is empty', 400);
      }

      const evaluation = await promotionService.evaluateCheckout({
        userId: req.user!.id,
        voucherCodes: collectVoucherCodes(req.body),
        lines: cart.items.map((item: any, index: number) => ({
          lineNo: index + 1,
          productId: item.productId,
          serverId: item.serverId,
          categoryId: item.product.categoryId ?? null,
          quantity: item.quantity,
          price: item.product.price,
          name: item.product.name,
          itemBlueprint: item.product.itemBlueprint,
          quality: item.product.quality,
          isBlueprint: item.product.isBlueprint,
        })),
      });

      res.json(evaluation.snapshot);
    } catch (error) {
      next(error);
    }
  };
}

export default new PromotionController();
