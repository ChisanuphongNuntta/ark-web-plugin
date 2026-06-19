import { Router } from 'express';
import checkoutController from '../controllers/checkout.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All checkout routes require user authentication
router.use(authenticate as any);

router.post('/session', checkoutController.createCheckoutSession as any);
router.post('/session/:id/commit', checkoutController.commitCheckoutSession as any);

export default router;
