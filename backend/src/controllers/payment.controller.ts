import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import paymentService from '../services/payment.service.js';
import { emitAdminSlipCreated } from '../realtime/emit.js';

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
      const userId = req.user!.id;
      const {
        packageId,
        packageName,
        amountThb,
        pointsToCredit,
        transferBank,
        transferRef,
        slipImageUrl,
        notes,
      } = req.body;

      let pkg = packageId ? await prisma.paymentPackage.findUnique({ where: { id: packageId } }) : null;
      if (!pkg && packageId) {
        pkg = await prisma.paymentPackage.findFirst({ where: { slug: packageId } });
      }
      if (!pkg) {
        pkg = await prisma.paymentPackage.findFirst({ where: { isActive: true } });
      }

      const finalPackageId = pkg ? pkg.id : (await prisma.paymentPackage.findFirst())?.id || 'pkg-4';
      const points = BigInt(pointsToCredit || (pkg ? Number(pkg.points + pkg.bonusPoints) : 100));
      const amount = new Prisma.Decimal(amountThb || (pkg ? Number(pkg.priceThb) : 35));
      const reference = transferRef || `SLIP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const intent = await prisma.paymentIntent.create({
        data: {
          userId,
          packageId: finalPackageId,
          provider: 'bank_slip',
          reference,
          idempotencyKey: `slip-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          amountThb: amount,
          pointsAmount: points,
          status: 'pending',
          paymentUrl: slipImageUrl || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          metadata: {
            packageName: packageName || pkg?.name || 'Coin Package',
            transferBank: transferBank || 'KBANK',
            transferRef: reference,
            slipImageUrl: slipImageUrl || '/images/mock/slips/sample-slip-01.svg',
            notes: notes || '',
            submittedAt: new Date().toISOString(),
          },
        },
        include: { user: true, package: true },
      });
      emitAdminSlipCreated(intent.id);

      res.status(201).json({
        success: true,
        submission: {
          id: intent.id,
          userId: intent.userId,
          userName: intent.user?.discordUsername || 'Survivor',
          userDiscordId: intent.user?.discordId,
          userAvatar: intent.user?.discordAvatar,
          packageId: intent.packageId,
          packageName: (intent.metadata as any)?.packageName || intent.package?.name || 'Coin Package',
          amountThb: Number(intent.amountThb),
          pointsToCredit: Number(intent.pointsAmount),
          slipImageUrl: (intent.metadata as any)?.slipImageUrl || intent.paymentUrl || '/images/mock/slips/sample-slip-01.svg',
          transferBank: (intent.metadata as any)?.transferBank || 'KBANK',
          transferRef: intent.reference,
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
