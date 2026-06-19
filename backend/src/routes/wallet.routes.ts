import { Router } from 'express';
import walletController from '../controllers/wallet.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate as any);
router.get('/', walletController.getBalance as any);
router.get('/transactions', walletController.getHistory as any);

export default router;
