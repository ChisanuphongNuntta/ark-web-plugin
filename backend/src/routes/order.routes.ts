import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();
const orderController = new OrderController();

// All routes require authentication
router.use(authenticate as any);

// Create order (buy item)
router.post('/', orderController.createOrder as any);

// Get user's orders
router.get('/', orderController.getUserOrders as any);

// Get order detail
router.get('/:id', orderController.getOrderById as any);

export default router;
