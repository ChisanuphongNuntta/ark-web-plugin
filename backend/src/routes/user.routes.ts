import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();
const userController = new UserController();

// All routes require authentication
router.use(authenticate as any);

// Get user profile
router.get('/profile', userController.getProfile as any);

// Get points balance
router.get('/points', userController.getPointsBalance as any);

// Get points history
router.get('/points/history', userController.getPointsHistory as any);

// Claim points from gameplay
router.post('/points/claim', userController.claimPoints as any);

export default router;
