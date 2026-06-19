import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.js';
import auditService from '../services/audit.service.js';
import securityService from '../services/security.service.js';

const router = Router();

// All audit routes require admin
router.use(authenticate as any);

// Check admin middleware
router.use(((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}) as any);

// Get audit logs
router.get('/logs', (async (req: AuthRequest, res: Response) => {
  try {
    const { userId, action, resource, startDate, endDate, page, limit } = req.query;

    const result = await auditService.getLogs({
      userId: userId as string,
      action: action as string,
      resource: resource as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json(result);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
}) as any);

// Get security events
router.get('/security', (async (req: AuthRequest, res: Response) => {
  try {
    const { eventType, severity, userId, startDate, endDate, page, limit } = req.query;

    const result = await securityService.getEvents({
      eventType: eventType as string,
      severity: severity as string,
      userId: userId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json(result);
  } catch (error) {
    console.error('Get security events error:', error);
    res.status(500).json({ error: 'Failed to get security events' });
  }
}) as any);

// Get security dashboard stats
router.get('/security/stats', (async (req: AuthRequest, res: Response) => {
  try {
    const stats = await securityService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Get security stats error:', error);
    res.status(500).json({ error: 'Failed to get security stats' });
  }
}) as any);

export default router;
