import { Router } from 'express';
import { PluginController } from '../controllers/plugin.controller.js';
import { authenticatePlugin, authenticateSignedPlugin } from '../middlewares/auth.js';

const router = Router();
const pluginController = new PluginController();

// --- SIGNED SUITE (Milestone 2 / CR-PLUGIN-001) ---
// Heartbeat (Capability Heartbeat)
router.post('/heartbeat', authenticateSignedPlugin as any, pluginController.heartbeat as any);

// Delivery claim and lease (Atomic Orders)
router.post('/deliveries/claim', authenticateSignedPlugin as any, pluginController.claimDeliveries as any);
router.post('/deliveries/:deliveryKey/complete', authenticateSignedPlugin as any, pluginController.completeDelivery as any);
router.post('/deliveries/:deliveryKey/fail', authenticateSignedPlugin as any, pluginController.failDelivery as any);
router.post('/deliveries/:deliveryKey/release', authenticateSignedPlugin as any, pluginController.releaseDelivery as any);

// P2P Dino Asset Locking
router.post('/market/prepare-lock', authenticateSignedPlugin as any, pluginController.prepareLock as any);
router.post('/market/confirm-lock', authenticateSignedPlugin as any, pluginController.confirmLock as any);

// --- LEGACY SUITE ---
// All other routes require standard plugin authentication (API key)
router.use(authenticatePlugin);

// Verify license and register IP
router.get('/verify', pluginController.verifyLicense as any);

// Get pending orders for this server
router.get('/orders/pending', pluginController.getPendingOrders as any);

// Mark order as delivered
router.post('/orders/:orderId/deliver', pluginController.markDelivered as any);

// Mark order as failed
router.post('/orders/:orderId/fail', pluginController.markFailed as any);

// Update player stats
router.post('/stats', pluginController.updatePlayerStats as any);

// Get player info by Steam ID
router.get('/player/:steamId', pluginController.getPlayerBySteamId as any);

export default router;
