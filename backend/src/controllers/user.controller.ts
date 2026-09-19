import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';

export class UserController {
  // Get user profile
  getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: {
          playerStats: {
            include: { server: true },
          },
          _count: {
            select: { orders: true },
          },
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Convert BigInt values for JSON serialization
      res.json({
        user: {
          ...user,
          pointsBalance: user.pointsBalance.toString(),
          totalSpent: user.totalSpent.toString(),
          playerStats: user.playerStats.map((stat) => ({
            ...stat,
            resourcesHarvested: stat.resourcesHarvested.toString(),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get points balance
  getPointsBalance = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          pointsBalance: true,
          totalSpent: true,
        },
      });

      res.json({
        balance: Number(user?.pointsBalance || 0),
        totalSpent: Number(user?.totalSpent || 0),
      });
    } catch (error) {
      next(error);
    }
  };

  // Get points history
  getPointsHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.pointTransaction.findMany({
          where: { userId: req.user!.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.pointTransaction.count({
          where: { userId: req.user!.id },
        }),
      ]);

      // Convert BigInt values for JSON serialization
      res.json({
        transactions: transactions.map((tx) => ({
          ...tx,
          balanceAfter: tx.balanceAfter.toString(),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Claim points from gameplay
  claimPoints = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Read stats, reset them, and mint the reward atomically. The stats reset inside
      // this Serializable transaction is the idempotency guard: a duplicate/concurrent
      // claim sees zeroed stats and earns nothing, so points are never minted twice.
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: req.user!.id },
          include: { playerStats: true },
        });

        if (!user) {
          throw new AppError('User not found', 404);
        }

        let totalPointsEarned = 0;
        const claimDetails: any[] = [];

        // Calculate points from each server's stats
        for (const stats of user.playerStats) {
          // Points calculation
          const playtimePoints = Math.floor(stats.playtimeMinutes / 60) * 10; // 10 points per hour
          const killPoints = stats.dinosKilled; // 1 point per kill
          const harvestPoints = Math.floor(Number(stats.resourcesHarvested) / 1000); // 1 point per 1000 resources

          const serverPoints = playtimePoints + killPoints + harvestPoints;

          if (serverPoints > 0) {
            totalPointsEarned += serverPoints;
            claimDetails.push({
              serverId: stats.serverId,
              playtimePoints,
              killPoints,
              harvestPoints,
              total: serverPoints,
            });

            // Reset stats after claiming
            await tx.playerStats.update({
              where: { id: stats.id },
              data: {
                playtimeMinutes: 0,
                dinosKilled: 0,
                resourcesHarvested: 0,
                lastPointsClaim: new Date(),
              },
            });
          }
        }

        if (totalPointsEarned === 0) {
          return { totalPointsEarned: 0, claimDetails };
        }

        // Mint the reward through the IRIS Wallet double-entry ledger (single source of
        // truth): issued from the system issuance account into the user's available
        // balance. User.pointsBalance is kept in sync as a read-only projection inside
        // walletService.post — no legacy PointTransaction dual-write.
        await walletService.ensureUserAccounts(user.id, tx);
        await walletService.post({
          idempotencyKey: `earn:playtime:${user.id}:${crypto.randomUUID()}`,
          type: 'earn_playtime',
          referenceType: 'gameplay',
          referenceId: user.id,
          description: 'Claimed gameplay points',
          entries: [
            { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -BigInt(totalPointsEarned) },
            { accountKey: userAccountKey(user.id, 'available'), amount: BigInt(totalPointsEarned) },
          ],
        }, tx);

        return { totalPointsEarned, claimDetails };
      }, { isolationLevel: 'Serializable' });

      if (result.totalPointsEarned === 0) {
        return res.json({
          success: false,
          message: 'No points to claim',
          pointsEarned: 0,
        });
      }

      // pointsBalance is now the read-only projection maintained by the ledger.
      const updated = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { pointsBalance: true },
      });

      res.json({
        success: true,
        pointsEarned: result.totalPointsEarned,
        newBalance: Number(updated?.pointsBalance ?? 0n),
        details: result.claimDetails,
      });
    } catch (error) {
      next(error);
    }
  };
}
