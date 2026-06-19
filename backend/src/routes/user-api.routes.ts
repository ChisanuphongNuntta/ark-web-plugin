import { Router } from 'express';
import { UserApiController } from '../controllers/user-api.controller.js';
import { authenticate, requireRoot } from '../middlewares/auth.js';

const router = Router();
const userApiController = new UserApiController();

// ทุก route ต้อง login ด้วย Discord OAuth
router.use(authenticate as any);

// Profile & API Key Management
router.get('/profile', userApiController.getProfile as any);

// Restricted to Root only
router.post('/generate-key', requireRoot as any, userApiController.generateApiKey as any);
router.post('/reset-ip', requireRoot as any, userApiController.resetIp as any);
router.delete('/api-key', requireRoot as any, userApiController.deleteApiKey as any);

export default router;
