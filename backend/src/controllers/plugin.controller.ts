import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';

interface PluginRequest extends Request {
  pluginUser?: {
    id: string;
    discordId: string;
    discordUsername: string | null;
    steamId: string | null;
    apiKey: string | null;
    apiKeyIp: string | null;
    apiKeyCreatedAt: Date | null;
    isBanned: boolean;
  };
  serverId?: number;
  server?: {
    id: number;
    name: string;
    isActive: boolean;
  };
}

export class PluginController {
  // Verify license and return server info
  verifyLicense = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      // If we reach here, authentication has already passed in middleware
      // The middleware also registers the IP on first connection

      const user = req.pluginUser;
      const server = req.server;

      // Get full server info from database
      const serverInfo = await prisma.server.findUnique({
        where: { id: req.serverId },
        select: { id: true, name: true, map: true },
      });

      // Update user's API key tracking info
      if (user?.id && serverInfo) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            apiKeyServerId: serverInfo.id,
            apiKeyServerName: serverInfo.name,
            apiKeyServerMap: serverInfo.map,
            apiKeyLastUsed: new Date(),
          },
        });
      }

      res.json({
        valid: true,
        serverName: serverInfo?.name || server?.name || 'Unknown Server',
        serverMap: serverInfo?.map || 'Unknown',
        serverId: req.serverId,
        registeredIp: user?.apiKeyIp || 'Just registered',
        licensedTo: user?.discordUsername || 'Unknown',
        expiresAt: 'Lifetime', // Adjust if you have subscription expiration
        message: 'License verified successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get pending orders for this server
  getPendingOrders = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          serverId: req.serverId!,
          status: 'pending',
        },
        include: {
          product: true,
          user: {
            select: {
              steamId: true,
              epicId: true,
              discordUsername: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Format for plugin
      const formattedOrders = orders.map(order => ({
        orderId: order.id,
        steamId: order.user.steamId,
        epicId: order.user.epicId,
        playerName: order.user.discordUsername,
        item: {
          blueprint: order.product.itemBlueprint,
          quantity: order.product.quantity * order.quantity,
          quality: order.product.quality,
          isBlueprint: order.product.isBlueprint,
        },
        productName: order.product.name,
        createdAt: order.createdAt,
      }));

      res.json({ orders: formattedOrders });
    } catch (error) {
      next(error);
    }
  };

  // Mark order as delivered
  markDelivered = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      if (order.serverId !== req.serverId!) {
        throw new AppError('Order does not belong to this server', 403);
      }

      if (order.status === 'delivered') {
        return res.json({ success: true, message: 'Order already delivered' });
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      res.json({ success: true, message: 'Order marked as delivered' });
    } catch (error) {
      next(error);
    }
  };

  // Mark order as failed
  markFailed = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const { error: errorMessage } = req.body;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      if (order.serverId !== req.serverId!) {
        throw new AppError('Order does not belong to this server', 403);
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryAttempts: { increment: 1 },
          lastError: errorMessage || 'Delivery failed',
          status: order.deliveryAttempts >= 2 ? 'failed' : 'pending',
        },
      });

      res.json({ success: true, message: 'Failure recorded' });
    } catch (error) {
      next(error);
    }
  };

  // Server heartbeat
  heartbeat = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { playerCount, map } = req.body;

      await prisma.server.update({
        where: { id: req.serverId! },
        data: {
          lastHeartbeat: new Date(),
          ...(map && { map }),
        },
      });

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  // Update player stats
  updatePlayerStats = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { players } = req.body;

      if (!Array.isArray(players)) {
        throw new AppError('Players array required', 400);
      }

      for (const player of players) {
        const { steamId, playtimeMinutes, dinosKilled, resourcesHarvested } = player;

        if (!steamId) continue;

        // Find user by Steam ID
        const user = await prisma.user.findUnique({
          where: { steamId },
        });

        if (!user) continue;

        // Upsert player stats
        await prisma.playerStats.upsert({
          where: {
            userId_serverId: {
              userId: user.id,
              serverId: req.serverId!,
            },
          },
          create: {
            userId: user.id,
            serverId: req.serverId!,
            playtimeMinutes: playtimeMinutes || 0,
            dinosKilled: dinosKilled || 0,
            resourcesHarvested: resourcesHarvested || 0,
          },
          update: {
            playtimeMinutes: { increment: playtimeMinutes || 0 },
            dinosKilled: { increment: dinosKilled || 0 },
            resourcesHarvested: { increment: BigInt(resourcesHarvested || 0) },
          },
        });
      }

      res.json({ success: true, processed: players.length });
    } catch (error) {
      next(error);
    }
  };

  // Get player by Steam ID
  getPlayerBySteamId = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.params;

      const user = await prisma.user.findUnique({
        where: { steamId },
        select: {
          id: true,
          discordUsername: true,
          pointsBalance: true,
          steamId: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'Player not found' });
      }

      // Get pending orders for this player on this server
      const pendingOrders = await prisma.order.count({
        where: {
          userId: user.id,
          serverId: req.serverId!,
          status: 'pending',
        },
      });

      res.json({
        player: {
          ...user,
          pointsBalance: Number(user.pointsBalance),
          pendingOrders,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Claim deliveries with short-term leases (CR-PLUGIN-002)
  claimDeliveries = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { serverId } = req.body;
      if (!serverId) {
        throw new AppError('Server ID is required', 400);
      }

      // Sync pending legacy orders to DeliveryJob table first
      const pendingOrders = await prisma.order.findMany({
        where: {
          serverId: Number(serverId),
          status: 'pending',
        },
        include: {
          product: true,
          user: { select: { steamId: true } },
        },
      });

      for (const order of pendingOrders) {
        if (!order.user.steamId) continue;
        const payload = {
          orderId: order.id,
          item: {
            blueprint: order.product.itemBlueprint,
            quantity: order.product.quantity * order.quantity,
            quality: order.product.quality,
            isBlueprint: order.product.isBlueprint,
          },
          productName: order.product.name,
        };
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

        await prisma.deliveryJob.upsert({
          where: { id: order.id },
          create: {
            id: order.id,
            serverId: order.serverId,
            playerSteamId: order.user.steamId,
            deliveryType: 'order',
            referenceId: order.id,
            payload,
            payloadHash,
            status: 'pending',
          },
          update: {},
        });
      }

      // Fetch pending or expired leased jobs
      const now = new Date();
      const jobs = await prisma.deliveryJob.findMany({
        where: {
          serverId: Number(serverId),
          OR: [
            { status: 'pending' },
            { status: 'leased', leaseExpiresAt: { lt: now } },
          ],
        },
      });

      const leaseExpiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds lease
      const claimed = [];

      for (const job of jobs) {
        const leaseToken = crypto.randomUUID();
        const updated = await prisma.deliveryJob.update({
          where: { id: job.id },
          data: {
            status: 'leased',
            leaseToken,
            leaseExpiresAt,
            attempts: { increment: 1 },
          },
        });
        claimed.push({
          deliveryKey: updated.id,
          leaseToken,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          playerSteamId: updated.playerSteamId,
          deliveryType: updated.deliveryType,
          payloadHash: updated.payloadHash,
          payload: updated.payload,
        });
      }

      res.json(claimed);
    } catch (error) {
      next(error);
    }
  };

  // Complete a delivery (CR-PLUGIN-002 / CR-PLUGIN-003)
  completeDelivery = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { deliveryKey } = req.params;
      const { leaseToken, playerSteamId, payloadHash, localJournalReceiptId, gameTimestamp } = req.body;

      if (!leaseToken || !playerSteamId || !payloadHash || !localJournalReceiptId) {
        throw new AppError('Missing required receipt fields', 400);
      }

      const job = await prisma.deliveryJob.findUnique({
        where: { id: deliveryKey },
      });

      if (!job) {
        throw new AppError('Delivery job not found', 404);
      }

      if (job.leaseToken !== leaseToken) {
        throw new AppError('Invalid lease token', 400);
      }

      if (job.playerSteamId !== playerSteamId) {
        throw new AppError('Steam ID mismatch', 400);
      }

      if (job.payloadHash !== payloadHash) {
        throw new AppError('Payload hash mismatch', 400);
      }

      // Update DeliveryJob to completed
      const updatedJob = await prisma.deliveryJob.update({
        where: { id: deliveryKey },
        data: {
          status: 'completed',
          receiptId: localJournalReceiptId,
          gameTimestamp: gameTimestamp ? new Date(gameTimestamp) : new Date(),
        },
      });

      // Update the underlying business entity
      if (job.deliveryType === 'order') {
        await prisma.order.update({
          where: { id: job.referenceId },
          data: {
            status: 'delivered',
            deliveredAt: new Date(),
          },
        });
      } else if (job.deliveryType === 'dino_marketplace') {
        // Milestone 7 marketplace listings
        await prisma.dinoListing.update({
          where: { id: job.referenceId },
          data: {
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
          },
        });
      }

      res.json({ success: true, message: 'Delivery completed successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Mark delivery failed (CR-PLUGIN-002)
  failDelivery = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { deliveryKey } = req.params;
      const { leaseToken, error: errorMessage } = req.body;

      if (!leaseToken || !errorMessage) {
        throw new AppError('Lease token and error message required', 400);
      }

      const job = await prisma.deliveryJob.findUnique({
        where: { id: deliveryKey },
      });

      if (!job) {
        throw new AppError('Delivery job not found', 404);
      }

      if (job.leaseToken !== leaseToken) {
        throw new AppError('Invalid lease token', 400);
      }

      const updatedJob = await prisma.deliveryJob.update({
        where: { id: deliveryKey },
        data: {
          status: job.attempts >= 3 ? 'failed' : 'pending', // retry back to pending if < 3
          error: errorMessage,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });

      // Sync failure to the underlying Order
      if (job.deliveryType === 'order') {
        await prisma.order.update({
          where: { id: job.referenceId },
          data: {
            status: updatedJob.status === 'failed' ? 'failed' : 'pending',
            deliveryAttempts: updatedJob.attempts,
            lastError: errorMessage,
          },
        });
      }

      res.json({ success: true, message: 'Failure recorded successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Release delivery lease back to the queue (CR-PLUGIN-002)
  releaseDelivery = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { deliveryKey } = req.params;
      const { leaseToken } = req.body;

      if (!leaseToken) {
        throw new AppError('Lease token required', 400);
      }

      const job = await prisma.deliveryJob.findUnique({
        where: { id: deliveryKey },
      });

      if (!job) {
        throw new AppError('Delivery job not found', 404);
      }

      if (job.leaseToken !== leaseToken) {
        throw new AppError('Invalid lease token', 400);
      }

      await prisma.deliveryJob.update({
        where: { id: deliveryKey },
        data: {
          status: 'pending',
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });

      res.json({ success: true, message: 'Lease released successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Prepare a Dino asset lock (CR-PLUGIN-004)
  prepareLock = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { species, level, sellerSteamId } = req.body;

      if (!species || !level || !sellerSteamId) {
        throw new AppError('Species, level, and seller Steam ID are required', 400);
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes lock
      const lock = await prisma.dinoAssetLock.create({
        data: {
          species,
          level: Number(level),
          sellerSteamId,
          expiresAt,
        },
      });

      res.json({
        assetLockId: lock.id,
        expiresAt: lock.expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  // Confirm Dino asset lock and list (CR-PLUGIN-004)
  confirmLock = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const {
        assetLockId,
        assetFingerprint,
        price,
        blueprintPath,
        dinoName,
        gender,
        baseHealth, baseStamina, baseOxygen, baseFood, baseWeight, baseDamage, baseSpeed,
        addedHealth, addedStamina, addedOxygen, addedFood, addedWeight, addedDamage, addedSpeed,
        imprintQuality,
        imprinterName,
        colorRegion0, colorRegion1, colorRegion2, colorRegion3, colorRegion4, colorRegion5,
        maternalMutations, paternalMutations,
        motherName, fatherName,
        cryopodData,
      } = req.body;

      if (!assetLockId || !assetFingerprint || !price) {
        throw new AppError('Asset lock ID, fingerprint, and price are required', 400);
      }

      const lock = await prisma.dinoAssetLock.findUnique({
        where: { id: assetLockId },
      });

      if (!lock) {
        throw new AppError('Asset lock not found', 404);
      }

      if (lock.status !== 'prepared') {
        throw new AppError(`Asset lock already ${lock.status}`, 400);
      }

      if (lock.expiresAt < new Date()) {
        await prisma.dinoAssetLock.update({
          where: { id: assetLockId },
          data: { status: 'expired' },
        });
        throw new AppError('Asset lock has expired', 400);
      }

      // Lookup user by Steam ID
      const seller = await prisma.user.findUnique({
        where: { steamId: lock.sellerSteamId },
      });

      if (!seller) {
        throw new AppError(`Seller with Steam ID ${lock.sellerSteamId} not found`, 404);
      }

      // Convert cryopodData if it's sent as a hex string or base64
      let cryopodBuffer = null;
      if (cryopodData) {
        cryopodBuffer = Buffer.from(cryopodData, 'base64');
      }

      // Create Listing
      const listing = await prisma.dinoListing.create({
        data: {
          sellerId: seller.id,
          species: lock.species,
          blueprintPath: blueprintPath || `Blueprint_${lock.species}`,
          dinoName: dinoName || `${lock.species} for Sale`,
          level: lock.level,
          gender: gender || 'Male',
          baseHealth: baseHealth || 0,
          baseStamina: baseStamina || 0,
          baseOxygen: baseOxygen || 0,
          baseFood: baseFood || 0,
          baseWeight: baseWeight || 0,
          baseDamage: baseDamage || 0,
          baseSpeed: baseSpeed || 0,
          addedHealth: addedHealth || 0,
          addedStamina: addedStamina || 0,
          addedOxygen: addedOxygen || 0,
          addedFood: addedFood || 0,
          addedWeight: addedWeight || 0,
          addedDamage: addedDamage || 0,
          addedSpeed: addedSpeed || 0,
          imprintQuality: imprintQuality || 0.0,
          imprinterName: imprinterName || null,
          colorRegion0: colorRegion0 !== undefined ? colorRegion0 : -1,
          colorRegion1: colorRegion1 !== undefined ? colorRegion1 : -1,
          colorRegion2: colorRegion2 !== undefined ? colorRegion2 : -1,
          colorRegion3: colorRegion3 !== undefined ? colorRegion3 : -1,
          colorRegion4: colorRegion4 !== undefined ? colorRegion4 : -1,
          colorRegion5: colorRegion5 !== undefined ? colorRegion5 : -1,
          maternalMutations: maternalMutations || 0,
          paternalMutations: paternalMutations || 0,
          motherName: motherName || null,
          fatherName: fatherName || null,
          cryopodData: cryopodBuffer,
          price: Number(price),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days listing
        },
      });

      // Confirm lock
      await prisma.dinoAssetLock.update({
        where: { id: assetLockId },
        data: {
          status: 'confirmed',
          assetFingerprint,
          price: Number(price),
          listingId: listing.id,
        },
      });

      res.json({
        success: true,
        listingId: listing.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
