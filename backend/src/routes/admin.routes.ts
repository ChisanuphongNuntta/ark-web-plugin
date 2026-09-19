import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import {
  authenticate,
  requireAdmin,
  requireWebsiteAdmin,
  requireServerAdminOrRoot,
  requireRoot,
} from '../middlewares/auth.js';

const router = Router();
const adminController = new AdminController();

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

// Plugin download (Root only)
router.get('/api-keys/:userId/download-plugin', requireRoot as any, adminController.downloadPluginForUser as any);

// ChatRank management
router.get('/chat-ranks', requireRoot as any, adminController.getChatRanks as any);
router.post('/chat-ranks', requireRoot as any, adminController.createChatRank as any);
router.put('/chat-ranks/:id', requireRoot as any, adminController.updateChatRank as any);
router.delete('/chat-ranks/:id', requireRoot as any, adminController.deleteChatRank as any);

// Role management (Root only)
router.put('/users/:id/role', requireRoot as any, adminController.updateUserRole as any);

export default router;
