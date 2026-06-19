import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.js';
import * as pdpaController from '../controllers/pdpa.controller.js';

const router = Router();

// Middleware to require authenticated user
const requireAuth = ((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}) as any;

// Public routes
router.get('/policy/:type', pdpaController.getPolicy as any);

// Authenticated user routes
router.use(authenticate as any);
router.use(requireAuth);

// Consent management
router.get('/consents', pdpaController.getConsents as any);
router.post('/consents/grant', pdpaController.grantConsent as any);
router.post('/consents/revoke', pdpaController.revokeConsent as any);

// Data subject requests
router.get('/requests', pdpaController.getMyDataRequests as any);
router.post('/requests', pdpaController.createDataRequest as any);

// Data export/deletion
router.get('/export', pdpaController.exportMyData as any);
router.post('/delete', pdpaController.deleteMyData as any);

// Admin routes
router.get('/admin/requests', pdpaController.getAllDataRequests as any);
router.patch('/admin/requests/:id', pdpaController.processDataRequest as any);
router.post('/admin/policy', pdpaController.createPolicy as any);

export default router;
