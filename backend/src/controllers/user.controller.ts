import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';

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
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: {
          playerStats: true,
        },
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
          await prisma.playerStats.update({
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
        return res.json({
          success: false,
          message: 'No points to claim',
          pointsEarned: 0,
        });
      }

      // Add points to user
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          pointsBalance: { increment: totalPointsEarned },
        },
      });

      // Record transaction
      await prisma.pointTransaction.create({
        data: {
          userId: req.user!.id,
          amount: totalPointsEarned,
          balanceAfter: updatedUser.pointsBalance,
          type: 'earn_playtime',
          description: 'Claimed gameplay points',
        },
      });

      res.json({
        success: true,
        pointsEarned: totalPointsEarned,
        newBalance: Number(updatedUser.pointsBalance),
        details: claimDetails,
      });
    } catch (error) {
      next(error);
    }
  };
}
