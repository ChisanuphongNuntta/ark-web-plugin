import { Router } from 'express';
import { DinoMarketController } from '../controllers/dino-market.controller.js';
import { authenticate, authenticatePluginFlexible } from '../middlewares/auth.js';

const router = Router();
const dinoMarketController = new DinoMarketController();

// ==========================================
// Public Routes (ไม่ต้อง login)
// ==========================================

// ดูรายการ listings ทั้งหมด
router.get('/listings', dinoMarketController.getListings);

// ดูรายละเอียด listing
router.get('/listings/:id', dinoMarketController.getListingById);

// ดูรายการ species (สำหรับ filter)
router.get('/species', dinoMarketController.getSpeciesList);

// ดูสถิติการ trade
router.get('/stats', dinoMarketController.getTradeStats);

// ==========================================
// Authenticated Routes (ต้อง login)
// ==========================================

// ดู listings ของฉัน
router.get('/my/listings', authenticate as any, dinoMarketController.getMyListings as any);

// ดูของที่ฉันซื้อ
router.get('/my/purchases', authenticate as any, dinoMarketController.getMyPurchases as any);

// ยกเลิก listing
router.post('/listings/:id/cancel', authenticate as any, dinoMarketController.cancelListing as any);

// ซื้อไดโน
router.post('/listings/:id/buy', authenticate as any, dinoMarketController.buyDino as any);

// ==========================================
// Plugin Routes (CR-PLUGIN-006: hmacAuth + X-API-Key backward-compat during overlap)
// ==========================================

// สร้าง listing (จาก plugin เมื่อผู้เล่นใช้คำสั่ง /sell)
router.post('/plugin/listings', authenticatePluginFlexible, dinoMarketController.createListing);

// ดู pending deliveries (สำหรับ plugin poll)
router.get('/plugin/deliveries', authenticatePluginFlexible, dinoMarketController.getPendingDeliveries);

// Mark delivery complete
router.post('/plugin/deliveries/:id/delivered', authenticatePluginFlexible, dinoMarketController.markDelivered);

// ดู cancelled listings ที่ต้องคืน
router.get('/plugin/returns', authenticatePluginFlexible, dinoMarketController.getCancelledForReturn);

// Mark return complete
router.post('/plugin/returns/:id/returned', authenticatePluginFlexible, dinoMarketController.markReturned);

export default router;
