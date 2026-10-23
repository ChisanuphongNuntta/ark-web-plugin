import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import pluginCompanionService from '../services/pluginCompanion.service.js';
import {
  LEASE_DURATION_MS,
  DEFAULT_MAX_ATTEMPTS,
  classifyFailure,
  claimWhere,
} from '../services/delivery.service.js';
import { canTransition } from '../services/orderState.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';
import serverQueryService from '../services/serverQuery.service.js';
import { releaseBackoffMs, releaseStreaks } from '../services/deliveryRelease.service.js';
import vipService, {
  PERMISSIONS_CAPABILITY,
  PERMISSION_DELIVERY_TYPES,
  PERMISSION_DELIVERY_TYPE_LIST,
  permissionKeyAffinityMs,
} from '../services/vip.service.js';
import { afterCommit } from '../realtime/afterCommit.js';
import {
  ORDER_BACKED_DELIVERY_TYPES,
  emitAdminDeliveryFailed,
  emitDeliveryUpdated,
  emitOrderUpdated,
} from '../realtime/emit.js';

const dinoFeeSplit = (price: number) => {
  const platformFee = Math.floor(price * 0.05);
  return { platformFee, sellerReceives: price - platformFee };
};

// Move an order's state-machine status forward only when the transition is legal. Used by
// the delivery orchestrator so a duplicate / out-of-order plugin callback can never drag an
// order backwards (e.g. delivered -> delivering). Returns silently on illegal/no-op moves.
// `silent` skips the order:updated emit for moves the buyer must not see (a probe claim of a
// job whose player is still offline, and the release that follows it).
async function advanceOrder(
  client: any,
  orderId: string,
  to: string,
  extra: Record<string, unknown> = {},
  options: { silent?: boolean } = {},
) {
  const order = await client.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (order.status === to) return; // idempotent no-op
  if (!canTransition(order.status, to)) return;
  await client.order.update({ where: { id: orderId }, data: { status: to, ...extra } });
  // Realtime: after the caller's transaction commits (immediately when client is prisma).
  if (!options.silent) afterCommit(() => emitOrderUpdated(order.userId, orderId, to));
}

// Realtime delivery:updated for the job's owner, after the enclosing transaction commits.
function notifyDelivery(job: { id: string; deliveryType: string; referenceId: string }, status: string) {
  afterCommit(() => emitDeliveryUpdated({
    deliveryId: job.id,
    deliveryType: job.deliveryType,
    referenceId: job.referenceId,
    status,
  }));
}

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
      emitOrderUpdated(order.userId, orderId, 'delivered');

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
      emitOrderUpdated(order.userId, orderId, order.deliveryAttempts >= 2 ? 'failed' : 'pending');

      res.json({ success: true, message: 'Failure recorded' });
    } catch (error) {
      next(error);
    }
  };

  // Server heartbeat
  heartbeat = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const {
        playerCount,
        map,
        pluginVersion,
        buildSha256,
        arkApiVersion,
        protocolVersion = 1,
        capabilities = [],
      } = req.body;

      if (!Number.isSafeInteger(playerCount) || playerCount < 0 || playerCount > 10000) {
        throw new AppError('playerCount must be an integer between 0 and 10000', 400);
      }
      if (!Number.isSafeInteger(protocolVersion) || protocolVersion < 1) {
        throw new AppError('protocolVersion must be a positive integer', 400);
      }
      if (!Array.isArray(capabilities) || capabilities.length > 100 || capabilities.some(
        (capability) => typeof capability !== 'string' || !/^[a-z0-9._-]{1,80}$/.test(capability),
      )) {
        throw new AppError('Invalid plugin capability manifest', 400);
      }

      await prisma.server.update({
        where: { id: req.serverId! },
        data: {
          lastHeartbeat: new Date(),
          playerCount,
          pluginVersion: typeof pluginVersion === 'string' ? pluginVersion.slice(0, 64) : null,
          pluginBuildHash: typeof buildSha256 === 'string' ? buildSha256.slice(0, 128) : null,
          arkApiVersion: typeof arkApiVersion === 'string' ? arkApiVersion.slice(0, 64) : null,
          protocolVersion,
          capabilities: [...new Set(capabilities as string[])],
          ...(map && { map }),
        },
      });
      // Realtime: heartbeat-only servers update the live status snapshot immediately.
      void serverQueryService.applyHeartbeat(req.serverId!, playerCount);

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

  // Player came online on `serverId`: clear the release backoff (and streak) of their pending
  // jobs whose last claim ended in an offline release. Failure backoffs are left untouched
  // (complete/fail clear the streak, so only release-backed jobs have one). Never throws.
  async resetOfflineBackoff(serverId: number, steamId: string): Promise<number> {
    try {
      const waiting = await prisma.deliveryJob.findMany({
        where: { serverId, playerSteamId: steamId, status: 'pending', nextRetryAt: { gt: new Date() } },
        select: { id: true, error: true },
        take: 100,
      });
      if (waiting.length === 0) return 0;
      const streaks = await releaseStreaks.getMany(waiting.map((job) => job.id));
      // Redis unreadable: fall back to "no recorded failure" (a failure backoff is kept).
      const released = streaks.known === false
        ? waiting.filter((job) => !job.error).map((job) => job.id)
        : waiting.map((job) => job.id).filter((id) => (streaks.get(id) ?? 0) > 0);
      if (released.length === 0) return 0;
      await prisma.deliveryJob.updateMany({
        where: { id: { in: released }, status: 'pending' },
        data: { nextRetryAt: null },
      });
      await releaseStreaks.clear(released);
      return released.length;
    } catch (error) {
      console.error('[delivery] offline backoff reset failed:', error);
      return 0;
    }
  }

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

      // The plugin calls this on player login: deliveries released while they were offline
      // become claimable now instead of waiting out their release backoff.
      if (req.serverId) await this.resetOfflineBackoff(req.serverId, steamId);

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

      // Fetch claimable jobs: pending jobs past their backoff window, or leased jobs whose
      // lease has expired (worker went offline / crashed). dead_letter, completed and failed
      // jobs are never re-claimed. See delivery.service.claimWhere.
      // Permissions-group jobs (VIP) are excluded here: they are not bound to a server and are
      // handed only to servers that advertise PERMISSIONS_CAPABILITY (claimablePermissionJobs).
      const now = new Date();
      const ownJobs = await prisma.deliveryJob.findMany({
        where: { AND: [claimWhere(Number(serverId), now), { deliveryType: { notIn: [...PERMISSION_DELIVERY_TYPE_LIST] } }] },
      });
      const permissionJobs = await this.claimablePermissionJobs(Number(serverId), now);
      const jobs = [...(ownJobs ?? []), ...permissionJobs];

      const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
      const claimed = [];
      // A job whose previous claim ended in a release (player offline) is re-claimed as a silent
      // probe: the buyer already sees "pending"; flashing "leased" for a lease that is about to
      // be released again every cycle is noise. A probe that completes/fails emits as usual.
      const releaseStreakByJob = await releaseStreaks.getMany(jobs.map((job) => job.id));
      const streaksKnown = releaseStreakByJob.known !== false;

      for (const job of jobs) {
        // Attempt accounting: every claim counts as an attempt unless it ends in a release
        // (releaseDelivery undoes its increment). A lease that EXPIRED (plugin crashed, or a
        // poison payload kills it before complete/fail/release) keeps its attempt. Once the
        // attempts are used up, an expired lease is dead-lettered here instead of being
        // re-claimed forever: the same outcome as failDelivery at the limit.
        if (job.status === 'leased' && (job.attempts ?? 0) >= (job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)) {
          await this.deadLetterExpiredLease(job);
          continue;
        }

        // A job whose previous claim ended in a release (player offline) is re-claimed as a
        // silent probe. Source: the Redis release streak; when Redis is unreadable, the DB (a
        // pending job with a backoff stamp was released or failed before). A probe lease keeps
        // its nextRetryAt stamp as the DB marker releaseDelivery reads.
        const probe = job.status === 'pending' && (streaksKnown
          ? (releaseStreakByJob.get(job.id) ?? 0) > 0
          : job.nextRetryAt != null);

        const leaseToken = crypto.randomUUID();
        // A permission job moves to the claiming server (any capable server may run it).
        const permissionJob = PERMISSION_DELIVERY_TYPES.has(job.deliveryType);
        // Conditional update guards against two plugins racing for the same job: only the
        // claimant whose update matches the pre-claim status wins (count === 1).
        const updateRes = await prisma.deliveryJob.updateMany({
          where: {
            id: job.id,
            status: job.status,
            leaseToken: job.leaseToken,
            ...(permissionJob ? { serverId: job.serverId } : {}),
          },
          data: {
            status: 'leased',
            leaseToken,
            leaseExpiresAt,
            attempts: { increment: 1 },
            nextRetryAt: probe ? (job.nextRetryAt ?? now) : null,
            ...(permissionJob ? { serverId: Number(serverId) } : {}),
          },
        });
        if (updateRes.count !== 1) continue; // lost the race; skip

        const updated = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });

        // Bind order/fulfillment state: queued -> delivering (claimed). Illegal/no-op moves
        // are ignored by advanceOrder so a re-lease of an already-delivering job is safe.
        if (!probe) notifyDelivery(updated, 'leased');
        if (ORDER_BACKED_DELIVERY_TYPES.has(updated.deliveryType)) {
          await advanceOrder(prisma, updated.referenceId, 'delivering', {}, { silent: probe });
          await prisma.fulfillment.updateMany({
            where: { orderId: updated.referenceId },
            data: { status: 'claimed', claimedAt: now, attempts: updated.attempts },
          });
        }

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

  // VIP Permissions-group jobs claimable by `serverId` (contracts/vip-2026-10.md §Plugin):
  //   * only when this server is active, not draining and advertises PERMISSIONS_CAPABILITY;
  //   * from ANY server (the group store is cluster-shared MySQL; the player may be offline);
  //   * per (user+group, steamId) key only the NEWEST candidate is handed out, older expired
  //     leases for that key are superseded, and a key with a live lease elsewhere is skipped, so
  //     an add and a remove for one player can never be applied out of order.
  async claimablePermissionJobs(serverId: number, now: Date): Promise<any[]> {
    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { isActive: true, drainMode: true, capabilities: true },
      });
      if (!server || !server.isActive || server.drainMode || !server.capabilities?.includes(PERMISSIONS_CAPABILITY)) return [];

      const { serverId: _anyServer, ...claimable } = claimWhere(serverId, now);
      const candidates = (await prisma.deliveryJob.findMany({
        where: { AND: [claimable, { deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] } }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      })) ?? [];
      if (candidates.length === 0) return [];

      const keyOf = (job: { referenceId: string; playerSteamId: string }) => `${job.referenceId}|${job.playerSteamId}`;
      const live = (await prisma.deliveryJob.findMany({
        where: {
          deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] },
          status: 'leased',
          leaseExpiresAt: { gte: now },
          referenceId: { in: [...new Set(candidates.map((job: any) => job.referenceId))] },
        },
        select: { referenceId: true, playerSteamId: true },
      })) ?? [];
      const busy = new Set(live.map(keyOf));

      // Cache-staleness affinity (Permissions V2 caches groups per server for ClusterSyncTime):
      // the next job for a key whose previous job completed recently stays on the server that
      // completed it; any other server waits until the window has passed. Otherwise a revoke run
      // on a stale server reports "not in group" (AlreadyInState) while MySQL still holds the
      // timed VIP, and an add/remove rewrites the group columns from a stale cache.
      const affinitySince = new Date(now.getTime() - permissionKeyAffinityMs());
      const recentDone = (await prisma.deliveryJob.findMany({
        where: {
          deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] },
          status: 'completed',
          updatedAt: { gte: affinitySince },
          referenceId: { in: [...new Set(candidates.map((job: any) => job.referenceId))] },
        },
        select: { referenceId: true, playerSteamId: true, serverId: true, updatedAt: true, receiptId: true },
        orderBy: { updatedAt: 'desc' },
      })) ?? [];
      const pinnedTo = new Map<string, number>();
      for (const done of recentDone) {
        // A superseded lease was never applied by its server: it does not pin the key.
        if (typeof done.receiptId === 'string' && done.receiptId.startsWith('superseded:')) continue;
        const key = keyOf(done);
        if (!pinnedTo.has(key)) pinnedTo.set(key, done.serverId);
      }
      const pinnedElsewhere = (job: any) => {
        const pinned = pinnedTo.get(keyOf(job));
        return pinned !== undefined && pinned !== serverId;
      };

      const newest = new Map<string, any>();
      const superseded: Array<{ id: string; newer: string }> = [];
      for (const job of candidates) {
        const key = keyOf(job);
        const kept = newest.get(key);
        if (!kept) newest.set(key, job);
        else if (job.status === 'leased') superseded.push({ id: job.id, newer: kept.id });
      }
      for (const old of superseded) {
        await prisma.deliveryJob.updateMany({
          where: { id: old.id, status: 'leased', leaseExpiresAt: { lt: now } },
          data: { status: 'completed', receiptId: `superseded:${old.newer}`, error: `superseded by ${old.newer}`, leaseToken: null, leaseExpiresAt: null },
        });
      }
      return [...newest.values()].filter((job) => !busy.has(keyOf(job)) && !pinnedElsewhere(job)).slice(0, 20);
    } catch (error) {
      // Never break the item/dino claim cycle because of VIP sync.
      console.error('[delivery] permission job claim failed:', error);
      return [];
    }
  }

  // Complete a delivery (CR-PLUGIN-002 / CR-PLUGIN-003).
  //
  // IDEMPOTENT on deliveryKey (§18 rule 6): a duplicate complete callback for an
  // already-completed job returns the ORIGINAL receipt without delivering or settling the
  // order a second time. The first completion is the only one that flips Order ->
  // delivered; every subsequent identical callback is a no-op success.
  completeDelivery = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { deliveryKey } = req.params;
      const { leaseToken, playerSteamId, payloadHash, localJournalReceiptId, gameTimestamp } = req.body;

      const job = await prisma.deliveryJob.findUnique({
        where: { id: deliveryKey },
      });

      if (!job) {
        throw new AppError('Delivery job not found', 404);
      }

      // Idempotency short-circuit: if this delivery already succeeded, return the stored
      // receipt. We do NOT require a valid lease here — the lease may have rotated or expired
      // between the original success and a retried callback. This is the core "duplicate
      // complete returns the same result, no double-deliver" guarantee.
      if (job.status === 'completed') {
        return res.json({
          success: true,
          message: 'Delivery already completed',
          deliveryKey: job.id,
          receiptId: job.receiptId,
          duplicate: true,
        });
      }

      if (!leaseToken || !playerSteamId || !payloadHash || !localJournalReceiptId) {
        throw new AppError('Missing required receipt fields', 400);
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

      const now = new Date();
      const parsedGameTimestamp = gameTimestamp ? new Date(gameTimestamp) : now;
      if (Number.isNaN(parsedGameTimestamp.getTime())) throw new AppError('Invalid game timestamp', 400);

      const completion = await prisma.$transaction(async (tx) => {
        // Job completion, business state and escrow settlement share one transaction.
        const completeRes = await tx.deliveryJob.updateMany({
          where: { id: deliveryKey, status: 'leased', leaseToken },
          data: {
            status: 'completed',
            receiptId: localJournalReceiptId,
            gameTimestamp: parsedGameTimestamp,
            error: null,
            nextRetryAt: null,
          },
        });

        if (completeRes.count !== 1) {
          const current = await tx.deliveryJob.findUniqueOrThrow({ where: { id: deliveryKey } });
          if (current.status === 'completed') return { duplicate: true, receiptId: current.receiptId };
          throw new AppError('Invalid lease token', 400);
        }

        notifyDelivery(job, 'completed');
        if (ORDER_BACKED_DELIVERY_TYPES.has(job.deliveryType)) {
          await advanceOrder(tx, job.referenceId, 'delivered', { deliveredAt: now });
          await tx.fulfillment.updateMany({
            where: { orderId: job.referenceId },
            data: { status: 'delivered', deliveredAt: now, receiptId: localJournalReceiptId, lastError: null },
          });
        } else if (job.deliveryType === 'dino_marketplace') {
          const listing = await tx.dinoListing.findUniqueOrThrow({ where: { id: job.referenceId } });
          if (!listing.buyerId || listing.deliveryStatus !== 'pending' || listing.status !== 'sold') {
            throw new AppError('Dino listing is not awaiting delivery', 409);
          }
          const delivered = await tx.dinoListing.updateMany({
            where: { id: listing.id, status: 'sold', deliveryStatus: 'pending' },
            data: { deliveryStatus: 'delivered', deliveredAt: now, deliveryServerId: job.serverId },
          });
          if (delivered.count !== 1) throw new AppError('Dino delivery state changed concurrently', 409);

          const { platformFee, sellerReceives } = dinoFeeSplit(listing.price);
          await walletService.ensureUserAccounts(listing.sellerId, tx);
          await walletService.post({
            idempotencyKey: `dino:escrow:release:${listing.id}`,
            type: 'dino_escrow_release',
            referenceType: 'dino_listing',
            referenceId: listing.id,
            description: `Escrow release for ${listing.species} Lv.${listing.level}`,
            entries: [
              { accountKey: SYSTEM_ACCOUNTS.clearing, amount: -BigInt(listing.price) },
              { accountKey: userAccountKey(listing.sellerId, 'available'), amount: BigInt(sellerReceives) },
              { accountKey: SYSTEM_ACCOUNTS.revenue, amount: BigInt(platformFee) },
            ],
          }, tx);
        } else if (PERMISSION_DELIVERY_TYPES.has(job.deliveryType)) {
          // VIP group applied in the cluster Permissions DB: mark the memberships synced.
          await vipService.onPermissionJobFinished(tx, job, 'completed', now);
        }
        return { duplicate: false, receiptId: localJournalReceiptId };
      }, { isolationLevel: 'Serializable' });

      if (completion.duplicate) {
        return res.json({
          success: true,
          message: 'Delivery already completed',
          deliveryKey: job.id,
          receiptId: completion.receiptId,
          duplicate: true,
        });
      }

      // The player was online for this claim: end any offline-release streak.
      await releaseStreaks.clear([job.id]);

      res.json({
        success: true,
        message: 'Delivery completed successfully',
        deliveryKey: job.id,
        receiptId: localJournalReceiptId,
        duplicate: false,
      });
    } catch (error) {
      next(error);
    }
  };

  // Mark delivery failed (CR-PLUGIN-002 / §18 rules 7-8).
  //
  // A transient failure schedules a retry: the job returns to `pending` with an exponential
  // backoff (nextRetryAt) so it is not re-claimed immediately. Once the attempt count reaches
  // maxAttempts the job is routed to the dead-letter queue (`dead_letter`) for the Admin
  // Rescue Console and the underlying order moves to `failed` (refundable).
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

      // A completed job never re-fails; report idempotent success.
      if (job.status === 'completed') {
        return res.json({ success: true, message: 'Delivery already completed', duplicate: true });
      }

      if (job.leaseToken !== leaseToken) {
        throw new AppError('Invalid lease token', 400);
      }

      const decision = classifyFailure(job.attempts, job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

      const updatedJob = await prisma.$transaction(async (tx) => {
        const changed = await tx.deliveryJob.updateMany({
          where: { id: deliveryKey, status: 'leased', leaseToken },
          data: {
            status: decision.status,
            error: errorMessage,
            leaseToken: null,
            leaseExpiresAt: null,
            nextRetryAt: decision.nextRetryAt,
          },
        });
        if (changed.count !== 1) throw new AppError('Delivery lease changed concurrently', 409);
        const updated = await tx.deliveryJob.findUniqueOrThrow({ where: { id: deliveryKey } });
        notifyDelivery(job, decision.status);
        if (!decision.retry) afterCommit(() => emitAdminDeliveryFailed(job.id, job.deliveryType, job.serverId));

        if (ORDER_BACKED_DELIVERY_TYPES.has(job.deliveryType)) {
          if (decision.retry) {
            await advanceOrder(tx, job.referenceId, 'queued', {
              deliveryAttempts: updated.attempts,
              lastError: errorMessage,
            });
            await tx.fulfillment.updateMany({
              where: { orderId: job.referenceId },
              data: { status: 'queued', attempts: updated.attempts, lastError: errorMessage },
            });
          } else {
            await this.applyDeadLetterOutcome(tx, job, updated.attempts, errorMessage, 'throw');
          }
        } else if (!decision.retry) {
          await this.applyDeadLetterOutcome(tx, job, updated.attempts, errorMessage, 'throw');
        }
        return updated;
      }, { isolationLevel: 'Serializable' });

      // A real attempt was made: end any offline-release streak (failure backoff takes over).
      await releaseStreaks.clear([job.id]);

      res.json({
        success: true,
        message: decision.retry ? 'Failure recorded; delivery will retry' : 'Delivery moved to dead-letter queue',
        retry: decision.retry,
        deadLetter: !decision.retry,
        nextRetryAt: decision.nextRetryAt ? decision.nextRetryAt.toISOString() : null,
        attempts: updatedJob.attempts,
      });
    } catch (error) {
      next(error);
    }
  };

  // Side effects of a job reaching the dead-letter queue, shared by failDelivery (attempt limit)
  // and claimDeliveries (expired lease with no attempts left): order -> failed (refundable) for
  // order-backed jobs, escrow refund to the buyer for dino marketplace jobs.
  // `onUnrefundable`: failDelivery answers 409 (existing contract); the claim path dead-letters
  // anyway and logs, so one bad listing cannot wedge every claim cycle.
  private async applyDeadLetterOutcome(
    tx: any,
    job: { id: string; deliveryType: string; referenceId: string },
    attempts: number,
    errorMessage: string,
    onUnrefundable: 'throw' | 'skip',
  ) {
    if (ORDER_BACKED_DELIVERY_TYPES.has(job.deliveryType)) {
      await advanceOrder(tx, job.referenceId, 'failed', {
        deliveryAttempts: attempts,
        lastError: errorMessage,
      });
      await tx.fulfillment.updateMany({
        where: { orderId: job.referenceId },
        data: { status: 'failed', failedAt: new Date(), attempts, lastError: errorMessage },
      });
      return;
    }
    if (PERMISSION_DELIVERY_TYPES.has(job.deliveryType)) {
      // No money involved: flag the memberships so admins can resync (admin:vip status=failed).
      await vipService.onPermissionJobFinished(tx, job, 'dead_letter');
      return;
    }
    if (job.deliveryType !== 'dino_marketplace') return;
    const listing = await tx.dinoListing.findUniqueOrThrow({ where: { id: job.referenceId } });
    if (!listing.buyerId || listing.deliveryStatus !== 'pending') {
      if (onUnrefundable === 'throw') throw new AppError('Dino listing is not refundable from escrow', 409);
      console.error(`[delivery] dead-lettered dino job ${job.id}: listing ${listing.id} is not refundable from escrow (deliveryStatus=${listing.deliveryStatus})`);
      return;
    }
    await tx.dinoListing.update({
      where: { id: listing.id },
      data: { deliveryStatus: 'failed' },
    });
    await walletService.ensureUserAccounts(listing.buyerId, tx);
    await walletService.post({
      idempotencyKey: `dino:escrow:refund:${listing.id}`,
      type: 'dino_escrow_refund',
      referenceType: 'dino_listing',
      referenceId: listing.id,
      description: `Escrow refund after failed dino delivery: ${listing.species} Lv.${listing.level}`,
      entries: [
        { accountKey: SYSTEM_ACCOUNTS.clearing, amount: -BigInt(listing.price) },
        { accountKey: userAccountKey(listing.buyerId, 'available'), amount: BigInt(listing.price) },
      ],
    }, tx);
  }

  // An expired lease whose attempts are used up: dead-letter it (never re-claim). Conditional on
  // the expired lease we read, so a plugin that completes/fails/releases it concurrently wins.
  // Never throws into the claim loop.
  async deadLetterExpiredLease(job: {
    id: string; deliveryType: string; referenceId: string; serverId: number;
    leaseToken: string | null; attempts: number;
  }): Promise<boolean> {
    const errorMessage = `Lease expired with no complete/fail/release after ${job.attempts} attempt(s) (plugin crash or poison payload)`;
    try {
      const deadLettered = await prisma.$transaction(async (tx) => {
        const changed = await tx.deliveryJob.updateMany({
          where: { id: job.id, status: 'leased', leaseToken: job.leaseToken, leaseExpiresAt: { lt: new Date() } },
          data: { status: 'dead_letter', error: errorMessage, leaseToken: null, leaseExpiresAt: null, nextRetryAt: null },
        });
        if (changed.count !== 1) return false;
        notifyDelivery(job, 'dead_letter');
        afterCommit(() => emitAdminDeliveryFailed(job.id, job.deliveryType, job.serverId));
        await this.applyDeadLetterOutcome(tx, job, job.attempts, errorMessage, 'skip');
        return true;
      }, { isolationLevel: 'Serializable' });
      if (deadLettered) await releaseStreaks.clear([job.id]);
      return deadLettered;
    } catch (error) {
      console.error(`[delivery] dead-letter of expired lease ${job.id} failed:`, error);
      return false;
    }
  }

  // Release delivery lease back to the queue (CR-PLUGIN-002).
  //
  // The plugin releases when the buyer is offline or the delivery was deferred locally (nothing
  // was delivered). A release:
  //   - does NOT consume an attempt: the claim's attempts increment is undone, so a long
  //     offline streak can never dead-letter the job on its first real failure;
  //   - applies a small backoff that grows with consecutive releases (30s -> 5 min cap, see
  //     deliveryRelease.service) instead of re-claiming every cycle; the streak resets when a
  //     claim completes/fails or the player logs in;
  //   - emits delivery:updated / order:updated only when the buyer-visible status changes, i.e.
  //     when the lease it ends was a visible claim. A silent probe claim (re-claim after a
  //     release) leaves nextRetryAt stamped on the leased job; that DB marker, not Redis,
  //     decides, so a Redis outage cannot bring back the every-30s re-emit;
  //   - increments the release streak only after its conditional update wins.
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

      // A completed job has nothing to release; report idempotent success.
      if (job.status === 'completed') {
        return res.json({ success: true, message: 'Delivery already completed', duplicate: true });
      }

      if (job.leaseToken !== leaseToken) {
        throw new AppError('Invalid lease token', 400);
      }

      const prior = await releaseStreaks.getMany([job.id]);
      const streak = (prior.get(job.id) ?? 0) + 1;
      const retryInMs = releaseBackoffMs(streak);
      const nextRetryAt = new Date(Date.now() + retryInMs);
      const attempts = Math.max(0, (job.attempts ?? 0) - 1);

      // Conditional on the lease we are releasing: a concurrent re-claim (expired lease) or
      // complete/fail changes the token, so this can never clobber someone else's lease.
      const released = await prisma.deliveryJob.updateMany({
        where: { id: deliveryKey, status: 'leased', leaseToken },
        data: {
          status: 'pending',
          leaseToken: null,
          leaseExpiresAt: null,
          nextRetryAt,
          attempts,
        },
      });
      if (released.count !== 1) {
        throw new AppError('Delivery lease changed concurrently', 409);
      }
      await releaseStreaks.increment(job.id);

      const visibleChange = job.nextRetryAt == null;
      if (visibleChange) notifyDelivery(job, 'pending');

      // Bind order/fulfillment back: delivering -> queued (re-claimable after the backoff).
      if (ORDER_BACKED_DELIVERY_TYPES.has(job.deliveryType)) {
        await advanceOrder(prisma, job.referenceId, 'queued', {}, { silent: !visibleChange });
        await prisma.fulfillment.updateMany({
          where: { orderId: job.referenceId },
          data: { status: 'queued', attempts },
        });
      }

      res.json({
        success: true,
        message: 'Lease released successfully',
        attempts,
        nextRetryAt: nextRetryAt.toISOString(),
        retryInMs,
      });
    } catch (error) {
      next(error);
    }
  };

  // Prepare a Dino asset lock (CR-PLUGIN-004)
  prepareLock = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_DINO_TRADING !== 'true') {
        throw new AppError('Dino trading is disabled', 503);
      }
      const { species, level, sellerSteamId } = req.body;

      if (
        typeof species !== 'string' || species.length < 1 || species.length > 200 ||
        !Number.isSafeInteger(Number(level)) || Number(level) < 1 || Number(level) > 100000 ||
        typeof sellerSteamId !== 'string' || !/^\d{17}$/.test(sellerSteamId)
      ) {
        throw new AppError('Species, level, and seller Steam ID are required', 400);
      }
      const originServer = await prisma.server.findUnique({ where: { id: req.serverId! } });
      if (
        !originServer?.capabilities.includes('marketplace.asset-lock.v1') ||
        !originServer.capabilities.includes('marketplace.dino-native.v2')
      ) {
        throw new AppError('Server plugin does not advertise native dino marketplace capability', 409);
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes lock
      const lock = await prisma.dinoAssetLock.create({
        data: {
          species,
          level: Number(level),
          sellerSteamId,
          originServerId: req.serverId!,
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
      if (process.env.ENABLE_DINO_TRADING !== 'true') {
        throw new AppError('Dino trading is disabled', 503);
      }
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
        dinoDataVersion,
        dinoDataSha256,
        dinoDataSize,
      } = req.body;

      if (
        typeof assetLockId !== 'string' ||
        typeof assetFingerprint !== 'string' || !/^[a-f0-9]{16,128}$/i.test(assetFingerprint) ||
        !Number.isSafeInteger(Number(price)) || Number(price) < 1 || Number(price) > 2_000_000_000
      ) {
        throw new AppError('Asset lock ID, fingerprint, and price are required', 400);
      }

      if (
        dinoDataVersion !== 1 ||
        typeof cryopodData !== 'string' || cryopodData.length < 4 || cryopodData.length > 1_500_000 ||
        typeof dinoDataSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(dinoDataSha256) ||
        !Number.isSafeInteger(dinoDataSize) || dinoDataSize < 1 || dinoDataSize > 1024 * 1024
      ) {
        throw new AppError('A bounded native dino snapshot with SHA-256 is required', 400);
      }

      const cryopodBuffer = Buffer.from(cryopodData, 'base64');
      const canonicalBase64 = cryopodBuffer.toString('base64');
      const actualSha256 = crypto.createHash('sha256').update(cryopodBuffer).digest('hex');
      if (
        canonicalBase64 !== cryopodData ||
        cryopodBuffer.length !== dinoDataSize ||
        actualSha256 !== dinoDataSha256
      ) {
        throw new AppError('Native dino snapshot integrity validation failed', 400);
      }

      const lock = await prisma.dinoAssetLock.findUnique({
        where: { id: assetLockId },
      });

      if (!lock) {
        throw new AppError('Asset lock not found', 404);
      }

      if (lock.originServerId !== req.serverId) {
        throw new AppError('Asset lock belongs to another server', 403);
      }
      if (lock.status === 'confirmed' && lock.listingId) {
        if (lock.assetFingerprint !== assetFingerprint || lock.price !== Number(price)) {
          throw new AppError('Confirmed asset lock payload does not match', 409);
        }
        return res.json({ success: true, listingId: lock.listingId, duplicate: true });
      }
      if (lock.status !== 'prepared') {
        throw new AppError(`Asset lock already ${lock.status}`, 409);
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

      const listing = await prisma.$transaction(async (tx) => {
        const claimed = await tx.dinoAssetLock.updateMany({
          where: { id: assetLockId, status: 'prepared', originServerId: req.serverId! },
          data: { status: 'confirming', assetFingerprint, price: Number(price) },
        });
        if (claimed.count !== 1) throw new AppError('Asset lock is no longer confirmable', 409);

        const created = await tx.dinoListing.create({
          data: {
            sellerId: seller.id,
            originServerId: req.serverId!,
            assetLockId,
            assetFingerprint,
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
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        await tx.dinoAssetLock.update({
          where: { id: assetLockId },
          data: { status: 'confirmed', listingId: created.id },
        });
        return created;
      }, { isolationLevel: 'Serializable' });

      res.json({
        success: true,
        listingId: listing.id,
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Game companion (signed, server-scoped, read-only) — CR-PLUGIN-007 / 008 ───────────

  // GET /api/plugin/player/:steamId/wallet -> WalletBalance (decimal strings)
  getPlayerWallet = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.params;
      const balance = await pluginCompanionService.getPlayerWallet(steamId, req.serverId!);
      res.json(balance);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/plugin/player/:steamId/pending-deliveries -> { pending: <int> }
  getPlayerPendingDeliveries = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.params;
      const result = await pluginCompanionService.getPendingDeliveries(steamId, req.serverId!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/plugin/player/:steamId/vip -> compact VIP status for the in-game /vip command
  getPlayerVip = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const result = await vipService.getPluginVipStatus(String(req.params.steamId));
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/plugin/wallet/events?cursor=<opaque> -> { success, events, lastCursor }
  getWalletEvents = async (req: PluginRequest, res: Response, next: NextFunction) => {
    try {
      const cursor = (req.query.cursor ?? req.query.since) as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await pluginCompanionService.getWalletEvents(req.serverId!, cursor, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
