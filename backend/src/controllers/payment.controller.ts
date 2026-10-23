import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import paymentService from '../services/payment.service.js';

export function sandboxPaymentsAllowedFor(user: AuthRequest['user'] | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PAYMENT_SANDBOX_ENABLED !== 'true') return false;
  const role = String(user?.role ?? '').toLowerCase();
  return role === 'admin' || role === 'root';
}

export class PaymentController {
  listPackages = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ packages: await paymentService.listPackages() }); } catch (error) { next(error); }
  };

  createIntent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.header('Idempotency-Key') || '';
      const provider = typeof req.body?.provider === 'string' ? req.body.provider : '';
      if (!provider) throw new AppError('provider is required', 400);
      // The sandbox provider mints IC without a real payment. It must never be reachable by
      // players in production: it needs an explicit env switch AND an admin/root caller.
      if (provider === 'sandbox' && !sandboxPaymentsAllowedFor(req.user)) {
        throw new AppError('Sandbox payments are disabled', 403);
      }
      const autoCredit = provider === 'sandbox';
      const result = await paymentService.createIntent(req.user!.id, req.body?.packageId, idempotencyKey, provider, autoCredit);
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { next(error); }
  };

  getIntent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { res.json(await paymentService.getIntent(req.user!.id, req.params.id)); } catch (error) { next(error); }
  };

  submitSlip = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Only packageId + slip evidence are read from the body. amountThb / pointsToCredit /
      // packageName are deliberately ignored: they come from the server-side package.
      const { packageId, transferBank, transferRef, slipImageUrl, notes } = req.body ?? {};
      const intent = await paymentService.submitTopupSlip(req.user!.id, packageId, {
        transferBank,
        transferRef,
        slipImageUrl,
        notes,
      });
      const meta = (intent.metadata as any) || {};

      res.status(201).json({
        success: true,
        submission: {
          id: intent.id,
          userId: intent.userId,
          userName: intent.user?.discordUsername || 'Survivor',
          userDiscordId: intent.user?.discordId,
          userAvatar: intent.user?.discordAvatar,
          packageId: intent.packageId,
          packageName: intent.package?.name || meta.packageName,
          amountThb: Number(intent.amountThb),
          pointsToCredit: Number(intent.pointsAmount),
          slipImageUrl: meta.slipImageUrl ?? null,
          transferBank: meta.transferBank ?? null,
          transferRef: meta.transferRef || intent.reference,
          transferredAt: intent.createdAt.toISOString(),
          status: 'pending_approval',
          createdAt: intent.createdAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  verifyStripeSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.body?.sessionId;
      const result = await paymentService.verifyStripeSession(req.user!.id, sessionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  webhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.header(req.params.provider === 'stripe' ? 'Stripe-Signature' : 'X-Payment-Signature') || undefined;
      res.json(await paymentService.processWebhook(req.params.provider, req.body, signature));
    } catch (error) { next(error); }
  };
}

export default new PaymentController();
