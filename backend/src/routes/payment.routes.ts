import { Router } from 'express';
import paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/packages', paymentController.listPackages as any);
router.post('/webhooks/:provider', paymentController.webhook as any);
router.post('/intents', authenticate as any, paymentController.createIntent as any);
router.get('/intents/:id', authenticate as any, paymentController.getIntent as any);
router.post('/slips', authenticate as any, paymentController.submitSlip as any);
router.post('/verify-session', authenticate as any, paymentController.verifyStripeSession as any);

export default router;

