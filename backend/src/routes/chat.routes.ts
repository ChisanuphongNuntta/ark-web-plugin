import { Router } from 'express';
import {
  getMessagesForPlugin,
  createMessageFromPlugin,
  getChatHistory,
  getServersForChat,
  getChatConfig,
} from '../controllers/chat.controller.js';
import { authenticate, authenticatePluginFlexible, requireWebsiteAdmin } from '../middlewares/auth.js';

import { listChannels, createChannel, deleteChannel } from '../controllers/adminChat.controller.js';
const router = Router();

// Plugin endpoints (CR-PLUGIN-006: hmacAuth + X-API-Key backward-compat during overlap)
router.get('/plugin/config', authenticatePluginFlexible as any, getChatConfig as any);
router.get('/plugin/messages', authenticatePluginFlexible as any, getMessagesForPlugin as any);
router.post('/plugin/messages', authenticatePluginFlexible as any, createMessageFromPlugin as any);

// Public endpoints
router.get('/servers', getServersForChat as any);
router.get('/history', getChatHistory as any);

// Admin endpoints (JWT + Admin auth)
router.get('/channels', authenticate as any, requireWebsiteAdmin as any, listChannels as any);
router.post('/channels', authenticate as any, requireWebsiteAdmin as any, createChannel as any);
router.delete('/channels/:id', authenticate as any, requireWebsiteAdmin as any, deleteChannel as any);

export default router;
