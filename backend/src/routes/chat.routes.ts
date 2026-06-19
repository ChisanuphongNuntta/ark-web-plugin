import { Router } from 'express';
import {
  getMessagesForPlugin,
  createMessageFromPlugin,
  getChatHistory,
  getChatChannels,
  upsertChatChannel,
  deleteChatChannel,
  getServersForChat,
  getChatConfig,
} from '../controllers/chat.controller.js';
import { authenticate, authenticatePluginFlexible, requireAdmin } from '../middlewares/auth.js';

const router = Router();

// Plugin endpoints (CR-PLUGIN-006: hmacAuth + X-API-Key backward-compat during overlap)
router.get('/plugin/config', authenticatePluginFlexible as any, getChatConfig as any);
router.get('/plugin/messages', authenticatePluginFlexible as any, getMessagesForPlugin as any);
router.post('/plugin/messages', authenticatePluginFlexible as any, createMessageFromPlugin as any);

// Public endpoints
router.get('/servers', getServersForChat as any);
router.get('/history', getChatHistory as any);

// Admin endpoints (JWT + Admin auth)
router.get('/channels', authenticate as any, requireAdmin as any, getChatChannels as any);
router.post('/channels', authenticate as any, requireAdmin as any, upsertChatChannel as any);
router.delete('/channels/:id', authenticate as any, requireAdmin as any, deleteChatChannel as any);

export default router;
