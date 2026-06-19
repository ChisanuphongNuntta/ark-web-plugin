import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.js';

const router = Router();
const authController = new AuthController();

// Discord OAuth
router.get('/discord', authController.discordAuth);
router.get('/discord/callback', authController.discordCallback);

// Steam OAuth
router.get('/steam', authController.steamAuth);
router.get('/steam/callback', authController.steamCallback);

// Link Steam to existing account
router.post('/link-steam', authenticate as any, authController.linkSteam as any);
router.post('/unlink-steam', authenticate as any, authController.unlinkSteam as any);

// Epic OAuth / Linking
router.post('/link-epic', authenticate as any, authController.linkEpic as any);
router.post('/unlink-epic', authenticate as any, authController.unlinkEpic as any);

// Unlink Discord
router.post('/unlink-discord', authenticate as any, authController.unlinkDiscord as any);

// Device Sessions
router.get('/sessions', authenticate as any, authController.listSessions as any);
router.delete('/sessions/:id', authenticate as any, authController.revokeSession as any);

// Get current user
router.get('/me', authenticate as any, authController.getCurrentUser as any);

// Logout (optional auth for audit logging)
router.post('/logout', optionalAuthenticate as any, authController.logout as any);

export default router;
