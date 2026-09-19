import { Router } from 'express';
import cartController from '../controllers/cart.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All cart routes require user authentication
router.use(authenticate as any);

router.get('/', cartController.getCart as any);
router.post('/sync', cartController.syncCart as any);
router.post('/items', cartController.addToCart as any);
router.put('/items', cartController.updateCartItem as any);
router.delete('/items', cartController.removeFromCart as any);

export default router;
