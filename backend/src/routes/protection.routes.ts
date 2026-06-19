import { Router } from 'express';
import { ProtectionController } from '../controllers/protection.controller.js';
import { authenticate, authenticatePluginFlexible, requireAdmin } from '../middlewares/auth.js';

const router = Router();
const protectionController = new ProtectionController();

// ==========================================
// Plugin API - เรียกจาก ARK Plugin (ใช้ API Key)
// ==========================================
// CR-PLUGIN-006: hmacAuth-capable with X-API-Key backward-compat during overlap.
const pluginRouter = Router();
pluginRouter.use(authenticatePluginFlexible);

// ตรวจสอบ protection ของผู้เล่น
pluginRouter.get('/player/:steamId', protectionController.checkPlayerProtection as any);

// ตรวจสอบ protection ของเผ่า
pluginRouter.get('/tribe/:tribeId', protectionController.checkTribeProtection as any);

// ผู้เล่นใหม่เข้าเกม
pluginRouter.post('/player/register', protectionController.registerNewPlayer as any);

// ผู้เล่นเข้าเผ่า
pluginRouter.post('/player/join-tribe', protectionController.playerJoinedTribe as any);

// ผู้เล่นออกจากเผ่า
pluginRouter.post('/player/leave-tribe', protectionController.playerLeftTribe as any);

// บันทึก damage blocked
pluginRouter.post('/log/damage-blocked', protectionController.logDamageBlocked as any);

// ==========================================
// User API - เรียกจาก Frontend (ใช้ JWT)
// ==========================================
const userRouter = Router();
userRouter.use(authenticate as any);

// ดูสถานะ protection ของตัวเอง
userRouter.get('/me', protectionController.getMyProtection as any);

// ==========================================
// Admin API - จัดการ Protection (ต้องเป็น Admin)
// ==========================================
const adminRouter = Router();
adminRouter.use(authenticate as any);
adminRouter.use(requireAdmin as any);

// ดูรายการ protection ทั้งหมด
adminRouter.get('/', protectionController.getAllProtections as any);

// ให้ protection
adminRouter.post('/grant', protectionController.grantProtection as any);

// ยกเลิก protection
adminRouter.delete('/:steamId', protectionController.revokeProtection as any);

// ดู logs
adminRouter.get('/logs', protectionController.getProtectionLogs as any);

// สถิติ
adminRouter.get('/stats', protectionController.getProtectionStats as any);

// Export routers
export { pluginRouter as protectionPluginRoutes };
export { userRouter as protectionUserRoutes };
export { adminRouter as protectionAdminRoutes };

export default router;
