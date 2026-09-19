import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import crypto from 'crypto';
import { encryptDeterministic } from '../utils/encryption.js';

export class UserApiController {
  /**
   * ดูข้อมูล Profile พร้อม API Key
   */
  getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          steamId: true,
          epicId: true,
          discordId: true,
          discordUsername: true,
          discordAvatar: true,
          pointsBalance: true,
          totalSpent: true,
          isAdmin: true,
          isBanned: true,
          apiKey: true,
          apiKeyIp: true,
          apiKeyCreatedAt: true,
          apiKeyServerId: true,
          apiKeyServerName: true,
          apiKeyServerMap: true,
          apiKeyServerPort: true,
          apiKeyLastUsed: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({
        user: {
          ...user,
          // API keys are credentials, not profile data. Return them only once from
          // generateApiKey; subsequent reads expose status without recoverable secret.
          apiKey: null,
          hasApiKey: Boolean(user.apiKey),
          pointsBalance: Number(user.pointsBalance),
          totalSpent: Number(user.totalSpent),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * สร้าง API Key ใหม่
   */
  generateApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // สร้าง API Key แบบปลอดภัย (256-bit)
      const newApiKey = crypto.randomBytes(32).toString('base64url');
      const encryptedKey = encryptDeterministic(newApiKey);

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          apiKey: encryptedKey,
          apiKeyIp: null, // รีเซ็ต IP
          apiKeyCreatedAt: new Date(),
        },
        select: {
          apiKey: true,
          apiKeyIp: true,
          apiKeyCreatedAt: true,
        },
      });

      res.json({
        success: true,
        apiKey: newApiKey,
        message: 'API Key สร้างสำเร็จ! คัดลอกไปใส่ใน ark-plugin/config.json',
        note: 'IP จะถูกบันทึกอัตโนมัติเมื่อ Plugin เชื่อมต่อครั้งแรก',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * รีเซ็ต IP Whitelist
   */
  resetIp = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          apiKeyIp: null,
        },
        select: {
          apiKey: true,
          apiKeyIp: true,
        },
      });

      res.json({
        success: true,
        message: 'IP Whitelist ถูกรีเซ็ตแล้ว',
        note: 'IP ใหม่จะถูกบันทึกเมื่อ Plugin เชื่อมต่อครั้งถัดไป',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * ลบ API Key
   */
  deleteApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      await prisma.user.update({
        where: { id: userId },
        data: {
          apiKey: null,
          apiKeyIp: null,
          apiKeyCreatedAt: null,
        },
      });

      res.json({
        success: true,
        message: 'API Key ถูกลบแล้ว',
      });
    } catch (error) {
      next(error);
    }
  };
}
