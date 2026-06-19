import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthRequest } from '../middlewares/auth.js';

export class ProtectionController {
  // ==========================================
  // Plugin API - เรียกจาก ARK Plugin
  // ==========================================

  // ตรวจสอบว่าผู้เล่นได้รับ protection หรือไม่
  checkPlayerProtection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.params;
      const serverId = (req as any).serverId;

      const now = new Date();

      // ค้นหา player protection
      const playerProtection = await prisma.playerProtection.findUnique({
        where: { steamId },
      });

      if (!playerProtection || !playerProtection.isActive || playerProtection.protectionEndAt < now) {
        return res.json({
          isProtected: false,
          player: null,
          tribe: null,
        });
      }

      // ค้นหา tribe protection ของ player นี้
      const tribeProtection = await prisma.tribeProtection.findFirst({
        where: {
          ownerSteamId: steamId,
          serverId,
          isActive: true,
          protectionEndAt: { gte: now },
        },
      });

      res.json({
        isProtected: true,
        player: {
          steamId: playerProtection.steamId,
          protectionEndAt: playerProtection.protectionEndAt,
          protectionType: playerProtection.protectionType,
          remainingSeconds: Math.max(0, Math.floor((playerProtection.protectionEndAt.getTime() - now.getTime()) / 1000)),
        },
        tribe: tribeProtection ? {
          tribeId: tribeProtection.tribeId.toString(),
          protectionEndAt: tribeProtection.protectionEndAt,
          protectionType: tribeProtection.protectionType,
        } : null,
      });
    } catch (error) {
      next(error);
    }
  };

  // ตรวจสอบว่าเผ่าได้รับ protection หรือไม่
  checkTribeProtection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tribeId } = req.params;
      const serverId = (req as any).serverId;

      const now = new Date();

      const tribeProtection = await prisma.tribeProtection.findUnique({
        where: {
          tribeId_serverId: {
            tribeId: BigInt(tribeId),
            serverId,
          },
        },
      });

      if (!tribeProtection || !tribeProtection.isActive || tribeProtection.protectionEndAt < now) {
        return res.json({
          isProtected: false,
          tribe: null,
        });
      }

      res.json({
        isProtected: true,
        tribe: {
          tribeId: tribeProtection.tribeId.toString(),
          tribeName: tribeProtection.tribeName,
          ownerSteamId: tribeProtection.ownerSteamId,
          protectionEndAt: tribeProtection.protectionEndAt,
          protectionType: tribeProtection.protectionType,
          remainingSeconds: Math.max(0, Math.floor((tribeProtection.protectionEndAt.getTime() - now.getTime()) / 1000)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ผู้เล่นใหม่เข้าเกม - สร้าง protection
  registerNewPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { steamId, playerName } = req.body;
      const serverId = (req as any).serverId;

      // ตรวจสอบว่ามี protection แล้วหรือยัง
      const existingProtection = await prisma.playerProtection.findUnique({
        where: { steamId },
      });

      if (existingProtection) {
        // มีแล้ว - return ข้อมูลเดิม
        return res.json({
          isNew: false,
          protection: {
            steamId: existingProtection.steamId,
            protectionEndAt: existingProtection.protectionEndAt,
            isActive: existingProtection.isActive,
          },
        });
      }

      // สร้าง protection ใหม่ - default 7 วัน (ปรับได้ใน config)
      const protectionDays = 7;
      const now = new Date();
      const protectionEndAt = new Date(now.getTime() + protectionDays * 24 * 60 * 60 * 1000);

      const newProtection = await prisma.playerProtection.create({
        data: {
          steamId,
          protectionDays,
          protectionStartAt: now,
          protectionEndAt,
          protectionType: 'new_player',
          isActive: true,
        },
      });

      // Log event
      await prisma.protectionLog.create({
        data: {
          serverId,
          eventType: 'protection_started',
          steamId,
          details: JSON.stringify({ playerName, protectionDays }),
        },
      });

      res.status(201).json({
        isNew: true,
        protection: {
          steamId: newProtection.steamId,
          protectionEndAt: newProtection.protectionEndAt,
          protectionDays: newProtection.protectionDays,
          isActive: newProtection.isActive,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ผู้เล่นเข้าเผ่า - ตรวจสอบและให้ tribe protection
  playerJoinedTribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { steamId, tribeId, tribeName } = req.body;
      const serverId = (req as any).serverId;

      const now = new Date();

      // ตรวจสอบว่าผู้เล่นมี protection หรือไม่
      const playerProtection = await prisma.playerProtection.findUnique({
        where: { steamId },
      });

      if (!playerProtection || !playerProtection.isActive || playerProtection.protectionEndAt < now) {
        return res.json({
          success: false,
          reason: 'player_not_protected',
        });
      }

      // ตรวจสอบว่าเผ่านี้มี protection แล้วหรือยัง
      const existingTribeProtection = await prisma.tribeProtection.findUnique({
        where: {
          tribeId_serverId: {
            tribeId: BigInt(tribeId),
            serverId,
          },
        },
      });

      if (existingTribeProtection) {
        // เผ่ามี protection แล้ว - ผู้เล่นได้แค่ personal protection
        return res.json({
          success: true,
          tribeProtected: false,
          reason: 'tribe_already_protected',
          existingOwner: existingTribeProtection.ownerSteamId,
        });
      }

      // ตรวจสอบว่าผู้เล่นนี้ให้ tribe protection กับเผ่าอื่นไปแล้วหรือยัง
      const existingOwnerProtection = await prisma.tribeProtection.findFirst({
        where: {
          ownerSteamId: steamId,
          isActive: true,
        },
      });

      if (existingOwnerProtection) {
        // ผู้เล่นให้ protection กับเผ่าอื่นไปแล้ว - ได้แค่ personal
        return res.json({
          success: true,
          tribeProtected: false,
          reason: 'already_protecting_another_tribe',
          existingTribeId: existingOwnerProtection.tribeId.toString(),
        });
      }

      // สร้าง tribe protection ใหม่
      const tribeProtection = await prisma.tribeProtection.create({
        data: {
          tribeId: BigInt(tribeId),
          serverId,
          tribeName,
          ownerSteamId: steamId,
          ownerProtectionId: playerProtection.id,
          protectionEndAt: playerProtection.protectionEndAt,
          protectionType: playerProtection.protectionType,
          isActive: true,
        },
      });

      // Log event
      await prisma.protectionLog.create({
        data: {
          serverId,
          eventType: 'tribe_protected',
          steamId,
          tribeId: BigInt(tribeId),
          details: JSON.stringify({ tribeName }),
        },
      });

      res.json({
        success: true,
        tribeProtected: true,
        tribe: {
          tribeId: tribeProtection.tribeId.toString(),
          tribeName: tribeProtection.tribeName,
          protectionEndAt: tribeProtection.protectionEndAt,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ผู้เล่นออกจากเผ่า - ถ้าเป็น admin protection จะหมด protection
  playerLeftTribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { steamId, tribeId } = req.body;
      const serverId = (req as any).serverId;

      // ตรวจสอบว่าผู้เล่นเป็นเจ้าของ tribe protection หรือไม่
      const tribeProtection = await prisma.tribeProtection.findFirst({
        where: {
          ownerSteamId: steamId,
          tribeId: BigInt(tribeId),
          serverId,
          isActive: true,
        },
      });

      if (tribeProtection) {
        // ถ้าเป็น admin_granted - ปิด tribe protection
        if (tribeProtection.protectionType === 'admin_granted') {
          await prisma.tribeProtection.update({
            where: { id: tribeProtection.id },
            data: { isActive: false },
          });

          // Log event
          await prisma.protectionLog.create({
            data: {
              serverId,
              eventType: 'protection_ended',
              steamId,
              tribeId: BigInt(tribeId),
              details: JSON.stringify({ reason: 'owner_left_tribe' }),
            },
          });

          return res.json({
            protectionEnded: true,
            reason: 'admin_protection_owner_left',
          });
        }
      }

      res.json({
        protectionEnded: false,
      });
    } catch (error) {
      next(error);
    }
  };

  // บันทึก damage blocked
  logDamageBlocked = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { targetSteamId, targetTribeId, attackerSteamId, attackerTribeId, details } = req.body;
      const serverId = (req as any).serverId;

      await prisma.protectionLog.create({
        data: {
          serverId,
          eventType: 'damage_blocked',
          steamId: targetSteamId,
          tribeId: targetTribeId ? BigInt(targetTribeId) : null,
          attackerSteamId,
          attackerTribeId: attackerTribeId ? BigInt(attackerTribeId) : null,
          details: details ? JSON.stringify(details) : null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // User API - เรียกจาก Frontend
  // ==========================================

  // ดูสถานะ protection ของตัวเอง
  getMyProtection = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const steamId = req.user?.steamId;

      if (!steamId) {
        throw new AppError('Steam ID not linked', 400);
      }

      const now = new Date();

      const playerProtection = await prisma.playerProtection.findUnique({
        where: { steamId },
        include: {
          tribeProtection: true,
        },
      });

      if (!playerProtection) {
        return res.json({
          hasProtection: false,
          player: null,
          tribe: null,
        });
      }

      const isActive = playerProtection.isActive && playerProtection.protectionEndAt > now;

      res.json({
        hasProtection: isActive,
        player: {
          protectionStartAt: playerProtection.protectionStartAt,
          protectionEndAt: playerProtection.protectionEndAt,
          protectionDays: playerProtection.protectionDays,
          protectionType: playerProtection.protectionType,
          isActive: isActive,
          remainingDays: isActive
            ? Math.ceil((playerProtection.protectionEndAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : 0,
          remainingHours: isActive
            ? Math.ceil((playerProtection.protectionEndAt.getTime() - now.getTime()) / (60 * 60 * 1000))
            : 0,
        },
        tribe: playerProtection.tribeProtection ? {
          tribeId: playerProtection.tribeProtection.tribeId.toString(),
          tribeName: playerProtection.tribeProtection.tribeName,
          serverId: playerProtection.tribeProtection.serverId,
          protectionEndAt: playerProtection.tribeProtection.protectionEndAt,
          isActive: playerProtection.tribeProtection.isActive && playerProtection.tribeProtection.protectionEndAt > now,
        } : null,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // Admin API
  // ==========================================

  // ดูรายการ protection ทั้งหมด
  getAllProtections = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { type, isActive, page = '1', limit = '20' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const now = new Date();

      const where: any = {};

      if (type) {
        where.protectionType = type;
      }

      if (isActive === 'true') {
        where.isActive = true;
        where.protectionEndAt = { gte: now };
      } else if (isActive === 'false') {
        where.OR = [
          { isActive: false },
          { protectionEndAt: { lt: now } },
        ];
      }

      const [protections, total] = await Promise.all([
        prisma.playerProtection.findMany({
          where,
          include: {
            tribeProtection: {
              include: {
                server: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.playerProtection.count({ where }),
      ]);

      res.json({
        protections: protections.map(p => ({
          ...p,
          tribeProtection: p.tribeProtection ? {
            ...p.tribeProtection,
            tribeId: p.tribeProtection.tribeId.toString(),
          } : null,
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin ให้ protection
  grantProtection = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId, protectionDays, reason, protectTribe, tribeId, tribeName, serverId } = req.body;

      const now = new Date();
      const protectionEndAt = new Date(now.getTime() + protectionDays * 24 * 60 * 60 * 1000);

      // สร้างหรืออัพเดท player protection
      const playerProtection = await prisma.playerProtection.upsert({
        where: { steamId },
        create: {
          steamId,
          protectionDays,
          protectionStartAt: now,
          protectionEndAt,
          protectionType: 'admin_granted',
          isActive: true,
          grantedBy: req.user?.id,
          grantedReason: reason,
        },
        update: {
          protectionDays,
          protectionStartAt: now,
          protectionEndAt,
          protectionType: 'admin_granted',
          isActive: true,
          grantedBy: req.user?.id,
          grantedReason: reason,
        },
      });

      // ถ้าต้องการ protect tribe ด้วย
      let tribeProtection = null;
      if (protectTribe && tribeId && serverId) {
        tribeProtection = await prisma.tribeProtection.upsert({
          where: {
            tribeId_serverId: {
              tribeId: BigInt(tribeId),
              serverId: parseInt(serverId),
            },
          },
          create: {
            tribeId: BigInt(tribeId),
            serverId: parseInt(serverId),
            tribeName,
            ownerSteamId: steamId,
            ownerProtectionId: playerProtection.id,
            protectionEndAt,
            protectionType: 'admin_granted',
            isActive: true,
          },
          update: {
            tribeName,
            ownerSteamId: steamId,
            ownerProtectionId: playerProtection.id,
            protectionEndAt,
            protectionType: 'admin_granted',
            isActive: true,
          },
        });
      }

      // Log event
      await prisma.protectionLog.create({
        data: {
          serverId: serverId ? parseInt(serverId) : 0,
          eventType: 'admin_grant',
          steamId,
          tribeId: tribeId ? BigInt(tribeId) : null,
          details: JSON.stringify({ grantedBy: req.user?.id, reason, protectionDays }),
        },
      });

      res.json({
        success: true,
        player: playerProtection,
        tribe: tribeProtection ? {
          ...tribeProtection,
          tribeId: tribeProtection.tribeId.toString(),
        } : null,
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin ยกเลิก protection
  revokeProtection = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.params;
      const { reason, revokeTribe } = req.body;

      // ยกเลิก player protection
      const playerProtection = await prisma.playerProtection.update({
        where: { steamId },
        data: { isActive: false },
      });

      // ยกเลิก tribe protection ด้วยถ้าต้องการ
      if (revokeTribe) {
        await prisma.tribeProtection.updateMany({
          where: { ownerSteamId: steamId },
          data: { isActive: false },
        });
      }

      // Log event
      await prisma.protectionLog.create({
        data: {
          serverId: 0,
          eventType: 'admin_revoke',
          steamId,
          details: JSON.stringify({ revokedBy: req.user?.id, reason }),
        },
      });

      res.json({
        success: true,
        message: 'Protection revoked',
      });
    } catch (error) {
      next(error);
    }
  };

  // ดู protection logs
  getProtectionLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { eventType, steamId, serverId, page = '1', limit = '50' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      if (eventType) where.eventType = eventType;
      if (steamId) where.steamId = steamId;
      if (serverId) where.serverId = parseInt(serverId as string);

      const [logs, total] = await Promise.all([
        prisma.protectionLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.protectionLog.count({ where }),
      ]);

      res.json({
        logs: logs.map(log => ({
          ...log,
          tribeId: log.tribeId?.toString(),
          attackerTribeId: log.attackerTribeId?.toString(),
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // สถิติ protection
  getProtectionStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();

      const [
        totalPlayers,
        activePlayers,
        totalTribes,
        activeTribes,
        damageBlockedToday,
      ] = await Promise.all([
        prisma.playerProtection.count(),
        prisma.playerProtection.count({
          where: { isActive: true, protectionEndAt: { gte: now } },
        }),
        prisma.tribeProtection.count(),
        prisma.tribeProtection.count({
          where: { isActive: true, protectionEndAt: { gte: now } },
        }),
        prisma.protectionLog.count({
          where: {
            eventType: 'damage_blocked',
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      res.json({
        stats: {
          totalPlayers,
          activePlayers,
          totalTribes,
          activeTribes,
          damageBlockedToday,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
