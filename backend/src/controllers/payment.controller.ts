import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import paymentService from '../services/payment.service.js';

export class PaymentController {
  listPackages = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ packages: await paymentService.listPackages() }); } catch (error) { next(error); }
  };

  createIntent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.header('Idempotency-Key') || '';
      const result = await paymentService.createIntent(req.user!.id, req.body?.packageId, idempotencyKey, req.body?.provider || 'sandbox');
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { next(error); }
  };

  getIntent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { res.json(await paymentService.getIntent(req.user!.id, req.params.id)); } catch (error) { next(error); }
  };

  webhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.header(req.params.provider === 'stripe' ? 'Stripe-Signature' : 'X-Payment-Signature') || undefined;
      res.json(await paymentService.processWebhook(req.params.provider, req.body, signature));
    } catch (error) { next(error); }
  };
}

export default new PaymentController();
