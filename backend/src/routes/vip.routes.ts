import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import vipController from '../controllers/vip.controller.js';
import { authenticate } from '../middlewares/auth.js';

// VIP (contracts/vip-2026-10.md). Mounted at /api/vip in the web process.
const router = Router();

// Checkout creates a Stripe session / pending slip; keep it to a few per user per 10 minutes.
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'unknown',
  message: { error: 'สั่งซื้อ VIP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});

router.get('/packages', vipController.listPackages);
router.get('/badges', vipController.badges);
router.get('/me', authenticate as any, vipController.me as any);
router.post('/checkout', authenticate as any, checkoutLimiter, vipController.checkout as any);

export default router;
