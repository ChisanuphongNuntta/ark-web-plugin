// Public / user VIP API (contracts/vip-2026-10.md). Mounted at /api/vip (web process).
import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import paymentService from '../services/payment.service.js';
import vipService from '../services/vip.service.js';

export const MAX_BADGE_LOOKUP = 100;

/** `?userIds=a,b,c` (or repeated) -> unique ids, at most MAX_BADGE_LOOKUP, each <= 64 chars. */
export function parseUserIdList(raw: unknown): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (parts.some((value) => value.length > 64)) throw new AppError('Invalid userIds', 400);
  const unique = [...new Set(parts)];
  if (unique.length > MAX_BADGE_LOOKUP) throw new AppError(`At most ${MAX_BADGE_LOOKUP} userIds per request`, 400);
  return unique;
}

export class VipController {
  // GET /vip/packages (public): active AND priced packages only.
  listPackages = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ packages: await vipService.listActivePackages() });
    } catch (error) {
      next(error);
    }
  };

  // GET /vip/me (auth)
  me = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await vipService.getMyVip(req.user!.id));
    } catch (error) {
      next(error);
    }
  };

  // GET /vip/badges?userIds=a,b (public): { badges: { [userId]: VipBadge } } — non-VIP ids absent.
  badges = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids = parseUserIdList(req.query.userIds);
      const badges = await vipService.badgesForUserIds(ids);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ badges: Object.fromEntries(badges) });
    } catch (error) {
      next(error);
    }
  };

  // POST /vip/checkout { packageId, provider: 'stripe'|'bank_slip', slipImageUrl?, transferBank?, transferRef?, notes? }
  // Header Idempotency-Key (required). 201 new / 200 replay -> { intent, replayed }.
  checkout = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const provider = typeof body.provider === 'string' ? body.provider : '';
      if (!provider) throw new AppError('provider is required', 400);
      const idempotencyKey = req.header('Idempotency-Key') || (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '');
      const result = await paymentService.createVipIntent(req.user!.id, body.packageId, idempotencyKey, provider, {
        slipImageUrl: body.slipImageUrl,
        transferBank: body.transferBank,
        transferRef: body.transferRef,
        notes: body.notes,
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const vipController = new VipController();
export default vipController;
