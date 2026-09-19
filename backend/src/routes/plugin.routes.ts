import { Router } from 'express';
import gameShopController from '../controllers/game-shop.controller.js';
import { PluginController } from '../controllers/plugin.controller.js';
import { authenticatePluginFlexible, authenticateSignedPlugin } from '../middlewares/auth.js';

const router = Router();
const pluginController = new PluginController();

// --- SIGNED SUITE (Milestone 2 / CR-PLUGIN-001) ---
// Heartbeat (Capability Heartbeat)
router.post('/heartbeat', authenticateSignedPlugin as any, pluginController.heartbeat as any);
router.get('/catalog', authenticateSignedPlugin as any, gameShopController.listCatalog as any);
router.post('/purchase/quote', authenticateSignedPlugin as any, gameShopController.createQuote as any);
router.post('/purchase/confirm', authenticateSignedPlugin as any, gameShopController.confirmQuote as any);

// Delivery claim and lease (Atomic Orders)
router.post('/deliveries/claim', authenticateSignedPlugin as any, pluginController.claimDeliveries as any);
router.post('/deliveries/:deliveryKey/complete', authenticateSignedPlugin as any, pluginController.completeDelivery as any);
router.post('/deliveries/:deliveryKey/fail', authenticateSignedPlugin as any, pluginController.failDelivery as any);
router.post('/deliveries/:deliveryKey/release', authenticateSignedPlugin as any, pluginController.releaseDelivery as any);

// P2P Dino Asset Locking
router.post('/market/prepare-lock', authenticateSignedPlugin as any, pluginController.prepareLock as any);
router.post('/market/confirm-lock', authenticateSignedPlugin as any, pluginController.confirmLock as any);

// Game companion (read-only, server-scoped) — CR-PLUGIN-007 / 008
router.get('/player/:steamId/wallet', authenticateSignedPlugin as any, pluginController.getPlayerWallet as any);
router.get('/player/:steamId/pending-deliveries', authenticateSignedPlugin as any, pluginController.getPlayerPendingDeliveries as any);
router.get('/wallet/events', authenticateSignedPlugin as any, pluginController.getWalletEvents as any);

// --- LEGACY SUITE (CR-PLUGIN-006) ---
// These endpoints now accept hmacAuth (signed requests) AND, during the migration overlap
// window, the legacy X-API-Key (logged as a deprecation). Authentication is attached to each
// concrete route instead of using a catch-all router.use(). The catch-all used to authenticate
// nested /api/plugin/chat, /market, and /protection requests once here and then a second time in
// their own routers, causing the valid nonce to be rejected as a replay on the second check.

// Verify license and register IP
router.get('/verify', authenticatePluginFlexible as any, pluginController.verifyLicense as any);

// Get pending orders for this server
router.get('/orders/pending', authenticatePluginFlexible as any, pluginController.getPendingOrders as any);

// Mark order as delivered
router.post('/orders/:orderId/deliver', authenticatePluginFlexible as any, pluginController.markDelivered as any);

// Mark order as failed
router.post('/orders/:orderId/fail', authenticatePluginFlexible as any, pluginController.markFailed as any);

// Update player stats
router.post('/stats', authenticatePluginFlexible as any, pluginController.updatePlayerStats as any);

// Get player info by Steam ID
router.get('/player/:steamId', authenticatePluginFlexible as any, pluginController.getPlayerBySteamId as any);

export default router;
