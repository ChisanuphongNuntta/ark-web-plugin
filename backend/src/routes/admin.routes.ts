import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import adminConsoleController from '../controllers/adminConsole.controller.js';
import siteController from '../controllers/site.controller.js';
import adminTransactionsController from '../controllers/adminTransactions.controller.js';
import rateLimit from 'express-rate-limit';
import {
  authenticate,
  requireAdmin,
  requireWebsiteAdmin,
  requireServerAdminOrRoot,
  requireRoot,
} from '../middlewares/auth.js';

const router = Router();
const adminController = new AdminController();

// CSV export reads up to 50k ledger rows; keep it to a handful per admin per 10 minutes.
const transactionExportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'unknown',
  message: { error: 'ส่งออกไฟล์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});

// All routes require authentication first
router.use(authenticate as any);

// ============================================
// DASHBOARD - Any admin role can access
// ============================================
router.get('/stats', requireAdmin as any, adminController.getDashboardStats as any);

// ============================================
// WEBSITE ADMIN ROUTES (admin, root)
// Products, Categories, Orders management
// ============================================

// Products management
router.get('/products', requireWebsiteAdmin as any, adminController.getProducts as any);
router.post('/products', requireWebsiteAdmin as any, adminController.createProduct as any);
router.put('/products/:id', requireWebsiteAdmin as any, adminController.updateProduct as any);
router.delete('/products/:id', requireWebsiteAdmin as any, adminController.deleteProduct as any);

// Categories management
router.post('/categories', requireWebsiteAdmin as any, adminController.createCategory as any);
router.put('/categories/:id', requireWebsiteAdmin as any, adminController.updateCategory as any);
router.delete('/categories/:id', requireWebsiteAdmin as any, adminController.deleteCategory as any);

// Orders management
router.get('/orders', requireWebsiteAdmin as any, adminController.getAllOrders as any);
router.post('/orders/:id/refund', requireWebsiteAdmin as any, adminController.refundOrder as any);

// Categories incl. inactive (console list; public /products/categories is active-only)
router.get('/categories', requireWebsiteAdmin as any, adminConsoleController.getCategories as any);

// Promotions / vouchers (read-only list; no admin mutation API exists yet)
router.get('/promotions', requireWebsiteAdmin as any, adminConsoleController.getPromotions as any);

// Site settings: seasonal theme + announcement banner (UI redesign 2026-10)
router.put('/site/settings', requireWebsiteAdmin as any, siteController.updateSettings as any);

// Delivery rescue console (UI redesign 2026-10)
router.get('/deliveries', requireWebsiteAdmin as any, adminConsoleController.getDeliveries as any);
router.post('/deliveries/:id/retry', requireWebsiteAdmin as any, adminConsoleController.retryDelivery as any);

// Audit log (UI redesign 2026-10)
router.get('/audit-logs', requireWebsiteAdmin as any, adminConsoleController.getAuditLogs as any);

// P2P dino market listings, read-only (UI redesign 2026-10)
router.get('/market/listings', requireWebsiteAdmin as any, adminConsoleController.getMarketListings as any);

// Transactions: every ledger posting (admin transactions 2026-10). Static paths before /:id.
router.get('/transactions', requireWebsiteAdmin as any, adminTransactionsController.list as any);
router.get('/transactions/summary', requireWebsiteAdmin as any, adminTransactionsController.summary as any);
router.get('/transactions/export.csv', requireWebsiteAdmin as any, transactionExportLimiter, adminTransactionsController.exportCsv as any);
router.get('/transactions/:id', requireWebsiteAdmin as any, adminTransactionsController.detail as any);

// Bank slip topups management
router.get('/payments/pending-slips', requireAdmin as any, adminController.getPendingSlips as any);
router.post('/payments/approve/:id', requireAdmin as any, adminController.approveSlip as any);
router.post('/payments/reject/:id', requireAdmin as any, adminController.rejectSlip as any);

// ============================================
// SERVER ADMIN ROUTES (server_admin, root)
// Users and API Keys management
// ============================================

// Users management - scoped by server for server_admin
router.get('/users', requireServerAdminOrRoot as any, adminController.getUsers as any);
router.get('/users/:id', requireServerAdminOrRoot as any, adminController.getUserById as any);
router.put('/users/:id', requireServerAdminOrRoot as any, adminController.updateUser as any);
router.post('/users/:id/points', requireServerAdminOrRoot as any, adminController.adjustPoints as any);

// API Keys management - scoped by server for server_admin
router.get('/api-keys', requireServerAdminOrRoot as any, adminController.getAllApiKeys as any);
router.get('/api-keys/:userId', requireServerAdminOrRoot as any, adminController.getApiKeyByUser as any);
router.post('/api-keys/:userId/reset-ip', requireServerAdminOrRoot as any, adminController.resetApiKeyIp as any);
router.delete('/api-keys/:userId', requireServerAdminOrRoot as any, adminController.revokeApiKey as any);

// ============================================
// ROOT ONLY ROUTES
// Plugin, Servers, ChatRanks, Role management
// ============================================

// Plugin management
router.get('/plugin/status', requireRoot as any, adminController.getPluginStatus as any);
router.post('/plugin/compile', requireRoot as any, adminController.compilePlugin as any);

// Server management
router.get('/servers', requireRoot as any, adminController.getServers as any);
router.post('/servers', requireRoot as any, adminController.createServer as any);
router.put('/servers/:id', requireRoot as any, adminController.updateServer as any);
router.delete('/servers/:id', requireRoot as any, adminController.deleteServer as any);
router.post('/servers/:id/regenerate-key', requireRoot as any, adminController.regenerateServerApiKey as any);

// Cluster management (Root only) — server directory groups (UI redesign 2026-10)
router.get('/clusters', requireRoot as any, adminConsoleController.getClusters as any);
router.post('/clusters', requireRoot as any, adminConsoleController.createCluster as any);
router.put('/clusters/:id', requireRoot as any, adminConsoleController.updateCluster as any);

// Plugin download (Root only)
router.get('/api-keys/:userId/download-plugin', requireRoot as any, adminController.downloadPluginForUser as any);

// ChatRank management
router.get('/chat-ranks', requireRoot as any, adminController.getChatRanks as any);
router.post('/chat-ranks', requireRoot as any, adminController.createChatRank as any);
router.put('/chat-ranks/:id', requireRoot as any, adminController.updateChatRank as any);
router.delete('/chat-ranks/:id', requireRoot as any, adminController.deleteChatRank as any);

// Ledger reconciliation (Root only)
router.get('/ledger/reconcile', requireRoot as any, adminTransactionsController.reconcile as any);

// Role management (Root only)
router.put('/users/:id/role', requireRoot as any, adminController.updateUserRole as any);

export default router;
