import { Router } from 'express';
import promotionController from '../controllers/promotion.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate as any);
router.post('/preview', promotionController.evaluateCart as any);
router.post('/evaluate', promotionController.evaluateCart as any);

export default router;
