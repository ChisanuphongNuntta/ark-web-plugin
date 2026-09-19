import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';

// Platform fee percentage (e.g., 5% = 0.05)
const PLATFORM_FEE_PERCENT = 0.05;

// Deterministic fee split so the escrow hold (at purchase) and release (at delivery)
// always agree on what the seller nets and what the platform keeps.
const computeFeeSplit = (price: number) => {
  const platformFee = Math.floor(price * PLATFORM_FEE_PERCENT);
  return { platformFee, sellerReceives: price - platformFee };
};

// Native ARK snapshots are fulfillment secrets, not marketplace metadata.
// Never expose them through public or account listing responses.
const withoutNativeSnapshot = <T extends { cryopodData?: unknown }>(listing: T) => {
  const { cryopodData: _snapshot, ...safeListing } = listing;
  return safeListing;
};

export class DinoMarketController {
  // Get all listings (public)
  getListings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        species,
        search,
        minPrice,
        maxPrice,
        minLevel,
        maxLevel,
        gender,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = '1',
        limit = '20',
      } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {
        status: 'listed',
      };

      if (species) {
        where.species = { contains: species as string, mode: 'insensitive' };
      }

      if (search) {
        where.OR = [
          { species: { contains: search as string, mode: 'insensitive' } },
          { dinoName: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (minPrice || maxPrice) {
        where.price = {};
        if (minPrice) where.price.gte = parseInt(minPrice as string);
        if (maxPrice) where.price.lte = parseInt(maxPrice as string);
      }

      if (minLevel || maxLevel) {
        where.level = {};
        if (minLevel) where.level.gte = parseInt(minLevel as string);
        if (maxLevel) where.level.lte = parseInt(maxLevel as string);
      }

      if (gender) {
        where.gender = gender;
      }

      // Build orderBy
      const orderByField = ['createdAt', 'price', 'level'].includes(sortBy as string)
        ? sortBy
        : 'createdAt';
      const orderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';

      const [listings, total] = await Promise.all([
        prisma.dinoListing.findMany({
          where,
          include: {
            seller: {
              select: {
                id: true,
                discordUsername: true,
                discordAvatar: true,
              },
            },
          },
          orderBy: { [orderByField as string]: orderByDirection },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.dinoListing.count({ where }),
      ]);

      res.json({
        listings: listings.map(withoutNativeSnapshot),
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

  // Get listing by ID
  getListingById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const listing = await prisma.dinoListing.findUnique({
        where: { id },
        include: {
          seller: {
            select: {
              id: true,
              discordUsername: true,
              discordAvatar: true,
            },
          },
        },
      });

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      res.json({ listing: withoutNativeSnapshot(listing) });
    } catch (error) {
      next(error);
    }
  };

  // Get species list (for filter dropdown)
  getSpeciesList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const species = await prisma.dinoListing.groupBy({
        by: ['species'],
        where: { status: 'listed' },
        _count: { species: true },
        orderBy: { _count: { species: 'desc' } },
      });

      res.json({
        species: species.map((s) => ({
          name: s.species,
          count: s._count.species,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // Get my listings (authenticated user)
  getMyListings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const { status, page = '1', limit = '20' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = { sellerId: userId };
      if (status) {
        where.status = status;
      }

      const [listings, total] = await Promise.all([
        prisma.dinoListing.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.dinoListing.count({ where }),
      ]);

      res.json({
        listings: listings.map(withoutNativeSnapshot),
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

  // Get my purchases
  getMyPurchases = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const { page = '1', limit = '20' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [purchases, total] = await Promise.all([
        prisma.dinoListing.findMany({
          where: { buyerId: userId, status: 'sold' },
          include: {
            seller: {
              select: {
                id: true,
                discordUsername: true,
                discordAvatar: true,
              },
            },
          },
          orderBy: { soldAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.dinoListing.count({ where: { buyerId: userId, status: 'sold' } }),
      ]);

      res.json({
        purchases: purchases.map(withoutNativeSnapshot),
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

  // Create listing (called from plugin)
  createListing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      throw new AppError('Direct dino listing is retired; use the signed prepare-lock/confirm-lock protocol', 410);

      /* Legacy parser retained temporarily for migration reference. It is unreachable and
       * will be removed after all server plugins advertise marketplace.asset-lock.v1.
      const body = req.body;
      const {
        steamId,
        species,
        blueprintPath,
        dinoName,
        level,
        gender,
        // Nested format (legacy)
        baseStats,
        addedStats,
        colors,
        mutations,
        ancestry,
        // Flat format (from plugin)
        baseHealth,
        baseStamina,
        baseOxygen,
        baseFood,
        baseWeight,
        baseMelee,
        baseSpeed,
        addedHealth,
        addedStamina,
        addedOxygen,
        addedFood,
        addedWeight,
        addedMelee,
        addedSpeed,
        colorRegion0,
        colorRegion1,
        colorRegion2,
        colorRegion3,
        colorRegion4,
        colorRegion5,
        maternalMutations,
        paternalMutations,
        // Common fields
        imprintQuality,
        imprinterName,
        price,
        description,
        cryopodData,
      } = body;

      // Find user by steamId
      const user = await prisma.user.findUnique({
        where: { steamId },
      });

      if (!user) {
        throw new AppError('User not found. Please link your Steam account.', 404);
      }

      // Validate price
      if (!price || price < 1) {
        return res.status(400).json({ error: 'Price must be at least 1 point' });
      }

      // Create listing (support both flat and nested formats)
      const listing = await prisma.dinoListing.create({
        data: {
          sellerId: user.id,
          species,
          blueprintPath,
          dinoName,
          level,
          gender,
          // Base stats (support both formats)
          baseHealth: baseHealth ?? baseStats?.health ?? 0,
          baseStamina: baseStamina ?? baseStats?.stamina ?? 0,
          baseOxygen: baseOxygen ?? baseStats?.oxygen ?? 0,
          baseFood: baseFood ?? baseStats?.food ?? 0,
          baseWeight: baseWeight ?? baseStats?.weight ?? 0,
          baseDamage: baseMelee ?? baseStats?.damage ?? 0,
          baseSpeed: baseSpeed ?? baseStats?.speed ?? 0,
          // Added stats (support both formats)
          addedHealth: addedHealth ?? addedStats?.health ?? 0,
          addedStamina: addedStamina ?? addedStats?.stamina ?? 0,
          addedOxygen: addedOxygen ?? addedStats?.oxygen ?? 0,
          addedFood: addedFood ?? addedStats?.food ?? 0,
          addedWeight: addedWeight ?? addedStats?.weight ?? 0,
          addedDamage: addedMelee ?? addedStats?.damage ?? 0,
          addedSpeed: addedSpeed ?? addedStats?.speed ?? 0,
          // Imprint
          imprintQuality: imprintQuality || 0,
          imprinterName,
          // Colors (support both formats)
          colorRegion0: colorRegion0 ?? colors?.[0] ?? -1,
          colorRegion1: colorRegion1 ?? colors?.[1] ?? -1,
          colorRegion2: colorRegion2 ?? colors?.[2] ?? -1,
          colorRegion3: colorRegion3 ?? colors?.[3] ?? -1,
          colorRegion4: colorRegion4 ?? colors?.[4] ?? -1,
          colorRegion5: colorRegion5 ?? colors?.[5] ?? -1,
          // Mutations (support both formats)
          maternalMutations: maternalMutations ?? mutations?.maternal ?? 0,
          paternalMutations: paternalMutations ?? mutations?.paternal ?? 0,
          // Ancestry
          motherName: ancestry?.mother,
          fatherName: ancestry?.father,
          // Cryopod data (for respawning)
          cryopodData: cryopodData ? Buffer.from(cryopodData, 'base64') : null,
          // Listing info
          price,
          description,
          status: 'listed',
          // Set expiry (30 days)
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      res.status(201).json({
        success: true,
        listing: {
          id: listing.id,
          species: listing.species,
          level: listing.level,
          price: listing.price,
        },
        message: `Your ${species} has been listed for ${price} points!`,
      });
      */
    } catch (error) {
      next(error);
    }
  };

  // Cancel listing
  cancelListing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const listing = await prisma.dinoListing.findUnique({
        where: { id },
      });

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.sellerId !== userId) {
        return res.status(403).json({ error: 'You can only cancel your own listings' });
      }

      if (listing.status !== 'listed') {
        return res.status(400).json({ error: 'This listing cannot be cancelled' });
      }

      await prisma.dinoListing.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      res.json({
        success: true,
        message: 'Listing cancelled. Your dino will be returned when you log in.',
        returnCryopod: true,
      });
    } catch (error) {
      next(error);
    }
  };

  // Buy dino
  buyDino = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const targetServerId = Number(req.body?.serverId);
      if (!Number.isSafeInteger(targetServerId) || targetServerId <= 0) {
        throw new AppError('A valid delivery serverId is required', 400);
      }

      // Get listing
      const listing = await prisma.dinoListing.findUnique({
        where: { id },
        include: { seller: true },
      });

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.status !== 'listed') {
        return res.status(400).json({ error: 'This dino is no longer available' });
      }

      if (listing.sellerId === userId) {
        return res.status(400).json({ error: 'You cannot buy your own dino' });
      }

      // Get buyer
      const buyer = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!buyer) {
        return res.status(404).json({ error: 'Buyer not found' });
      }
      if (!buyer.steamId) {
        throw new AppError('Steam account must be linked before buying a dino', 400);
      }

      const targetServer = await prisma.server.findUnique({ where: { id: targetServerId } });
      if (!targetServer || !targetServer.isActive || targetServer.drainMode) {
        throw new AppError('Delivery server is unavailable', 409);
      }
      if (!targetServer.capabilities.includes('delivery.dino.v2')) {
        throw new AppError('Delivery server does not support exact native dino delivery', 409);
      }

      // Check buyer balance
      if (Number(buyer.pointsBalance) < listing.price) {
        return res.status(400).json({
          error: 'Insufficient points',
          required: listing.price,
          available: Number(buyer.pointsBalance),
        });
      }

      // Calculate fees (deterministic: hold-time and release-time must agree)
      const { platformFee, sellerReceives } = computeFeeSplit(listing.price);
      if (!listing.cryopodData || listing.cryopodData.length < 1 || listing.cryopodData.length > 1024 * 1024) {
        throw new AppError('Listing does not contain a valid native dino snapshot', 409);
      }
      const nativeDinoSha256 = crypto.createHash('sha256').update(listing.cryopodData).digest('hex');
      const deliveryPayload = {
        schemaVersion: 2,
        dinoDataVersion: 1,
        dinoDataSha256: nativeDinoSha256,
        dinoDataSize: listing.cryopodData.length,
        listingId: listing.id,
        species: listing.species,
        blueprintPath: listing.blueprintPath,
        dinoName: listing.dinoName,
        level: listing.level,
        gender: listing.gender,
        baseStats: {
          health: listing.baseHealth, stamina: listing.baseStamina, oxygen: listing.baseOxygen,
          food: listing.baseFood, weight: listing.baseWeight, damage: listing.baseDamage, speed: listing.baseSpeed,
        },
        addedStats: {
          health: listing.addedHealth, stamina: listing.addedStamina, oxygen: listing.addedOxygen,
          food: listing.addedFood, weight: listing.addedWeight, damage: listing.addedDamage, speed: listing.addedSpeed,
        },
        imprintQuality: listing.imprintQuality,
        imprinterName: listing.imprinterName,
        colors: [listing.colorRegion0, listing.colorRegion1, listing.colorRegion2, listing.colorRegion3, listing.colorRegion4, listing.colorRegion5],
        mutations: { maternal: listing.maternalMutations, paternal: listing.paternalMutations },
        cryopodData: listing.cryopodData.toString('base64'),
      };
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(deliveryPayload)).digest('hex');

      // P2P purchase = ESCROW HOLD, not a direct payout. Per ENTERPRISE_REDESIGN_PLAN_TH.md
      // §17, funds are held in the system clearing account and the seller is NOT paid until
      // delivery is confirmed (see markDelivered). All money movement flows through the IRIS
      // Wallet double-entry ledger — no legacy PointTransaction dual-write.
      await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(userId, tx);

        // Conditional state transition (listed -> sold) under Serializable isolation
        // prevents a double-buy race: only the first buyer flips the listing.
        const claimed = await tx.dinoListing.updateMany({
          where: { id, status: 'listed' },
          data: {
            status: 'sold',
            buyerId: userId,
            soldAt: new Date(),
            deliveryStatus: 'pending',
            deliveryServerId: targetServerId,
          },
        });
        if (claimed.count !== 1) {
          throw new AppError('This dino is no longer available', 400);
        }

        // Hold the full price from the buyer into escrow (system clearing account).
        // Idempotent per listing id, so a retried purchase never double-holds.
        await walletService.post({
          idempotencyKey: `dino:escrow:hold:${listing.id}`,
          type: 'dino_escrow_hold',
          referenceType: 'dino_listing',
          referenceId: listing.id,
          description: `Escrow hold for ${listing.species} Lv.${listing.level}`,
          entries: [
            { accountKey: userAccountKey(userId, 'available'), amount: -BigInt(listing.price) },
            { accountKey: SYSTEM_ACCOUNTS.clearing, amount: BigInt(listing.price) },
          ],
        }, tx);

        // totalSpent is a lifetime stat, not the money ledger; keep it current.
        await tx.user.update({
          where: { id: userId },
          data: { totalSpent: { increment: listing.price } },
        });

        // Record trade history (terms snapshot; the seller is settled on delivery)
        await tx.dinoTradeHistory.create({
          data: {
            listingId: listing.id,
            sellerId: listing.sellerId,
            buyerId: userId,
            species: listing.species,
            level: listing.level,
            dinoName: listing.dinoName,
            price: listing.price,
            sellerReceived: sellerReceives,
            platformFee,
          },
        });

        await tx.deliveryJob.create({
          data: {
            id: `dino-market:${listing.id}`,
            serverId: targetServerId,
            playerSteamId: buyer.steamId!,
            deliveryType: 'dino_marketplace',
            referenceId: listing.id,
            payload: deliveryPayload,
            payloadHash,
            status: 'pending',
          },
        });
      }, { isolationLevel: 'Serializable' });

      res.json({
        success: true,
        message: `You purchased ${listing.species} Lv.${listing.level} for ${listing.price} points!`,
        purchase: {
          listingId: listing.id,
          species: listing.species,
          level: listing.level,
          price: listing.price,
          deliveryStatus: 'pending',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get pending deliveries (for plugin polling)
  getPendingDeliveries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveries = await prisma.dinoListing.findMany({
        where: {
          status: 'sold',
          deliveryStatus: 'pending',
        },
        include: {
          buyer: {
            select: {
              steamId: true,
            },
          },
        },
      });

      res.json({
        deliveries: deliveries.map((d) => ({
          id: d.id,
          steamId: d.buyer?.steamId,
          buyerSteamId: d.buyer?.steamId, // Alias for plugin compatibility
          species: d.species,
          blueprintPath: d.blueprintPath,
          dinoName: d.dinoName,
          level: d.level,
          gender: d.gender,
          baseStats: {
            health: d.baseHealth,
            stamina: d.baseStamina,
            oxygen: d.baseOxygen,
            food: d.baseFood,
            weight: d.baseWeight,
            damage: d.baseDamage,
            speed: d.baseSpeed,
          },
          addedStats: {
            health: d.addedHealth,
            stamina: d.addedStamina,
            oxygen: d.addedOxygen,
            food: d.addedFood,
            weight: d.addedWeight,
            damage: d.addedDamage,
            speed: d.addedSpeed,
          },
          imprintQuality: d.imprintQuality,
          imprinterName: d.imprinterName,
          colors: [
            d.colorRegion0,
            d.colorRegion1,
            d.colorRegion2,
            d.colorRegion3,
            d.colorRegion4,
            d.colorRegion5,
          ],
          cryopodData: d.cryopodData ? d.cryopodData.toString('base64') : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // Mark delivery complete (called from plugin) — settles escrow.
  // Per ENTERPRISE_REDESIGN_PLAN_TH.md §17 (Delivered -> Settled), confirming delivery
  // releases the escrowed funds: the seller is paid their net and the platform keeps its
  // fee. Money moves entirely through the IRIS Wallet double-entry ledger.
  markDelivered = async (req: Request, res: Response, next: NextFunction) => {
    try {
      throw new AppError('Legacy marketplace delivery callback is retired; use /api/plugin/deliveries/:deliveryKey/complete', 410);

      /* Retained only as a historical reference during the signed-delivery cutover.
      const { id } = req.params;
      const { serverId } = req.body;

      const listing = await prisma.dinoListing.findUnique({ where: { id } });
      if (!listing) {
        throw new AppError('Listing not found', 404);
      }

      // Already settled: respond success without releasing escrow again (idempotent).
      if (listing.deliveryStatus === 'delivered') {
        return res.json({ success: true });
      }

      const { platformFee, sellerReceives } = computeFeeSplit(listing.price);

      await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(listing.sellerId, tx);

        // Conditional transition (sold + pending -> delivered) guards against a
        // duplicate plugin callback double-releasing the escrow.
        const settled = await tx.dinoListing.updateMany({
          where: { id, status: 'sold', deliveryStatus: 'pending' },
          data: {
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
            deliveryServerId: serverId,
          },
        });
        if (settled.count !== 1) {
          // Nothing in a releasable state (e.g. concurrent callback won the race).
          return;
        }

        // Release escrow: clearing -> seller net + platform revenue (fee).
        // Idempotent per listing id; sums to zero (double-entry invariant).
        await walletService.post({
          idempotencyKey: `dino:escrow:release:${listing.id}`,
          type: 'dino_escrow_release',
          referenceType: 'dino_listing',
          referenceId: listing.id,
          description: `Escrow release for ${listing.species} Lv.${listing.level} (fee: ${platformFee})`,
          entries: [
            { accountKey: SYSTEM_ACCOUNTS.clearing, amount: -BigInt(listing.price) },
            { accountKey: userAccountKey(listing.sellerId, 'available'), amount: BigInt(sellerReceives) },
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: BigInt(platformFee) },
          ],
        }, tx);
      }, { isolationLevel: 'Serializable' });

      res.json({ success: true });
      */
    } catch (error) {
      next(error);
    }
  };

  // Get cancelled listings for return (called from plugin)
  getCancelledForReturn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.query;

      if (!steamId) {
        return res.status(400).json({ error: 'steamId is required' });
      }

      const user = await prisma.user.findUnique({
        where: { steamId: steamId as string },
      });

      if (!user) {
        return res.json({ returns: [] });
      }

      const returns = await prisma.dinoListing.findMany({
        where: {
          sellerId: user.id,
          status: 'cancelled',
          deliveryStatus: null, // Not yet returned
        },
      });

      res.json({
        returns: returns.map((r) => ({
          id: r.id,
          species: r.species,
          blueprintPath: r.blueprintPath,
          cryopodData: r.cryopodData ? r.cryopodData.toString('base64') : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // Mark return complete
  markReturned = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await prisma.dinoListing.update({
        where: { id },
        data: {
          deliveryStatus: 'returned',
        },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // Get trade statistics
  getTradeStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [totalListings, totalSold, topSpecies, recentTrades] = await Promise.all([
        prisma.dinoListing.count({ where: { status: 'listed' } }),
        prisma.dinoListing.count({ where: { status: 'sold' } }),
        prisma.dinoTradeHistory.groupBy({
          by: ['species'],
          _count: { species: true },
          _sum: { price: true },
          orderBy: { _count: { species: 'desc' } },
          take: 10,
        }),
        prisma.dinoTradeHistory.findMany({
          orderBy: { tradedAt: 'desc' },
          take: 10,
          select: {
            species: true,
            level: true,
            price: true,
            tradedAt: true,
          },
        }),
      ]);

      res.json({
        stats: {
          activeListings: totalListings,
          totalSold,
          topSpecies: topSpecies.map((s) => ({
            species: s.species,
            count: s._count.species,
            totalValue: s._sum.price,
          })),
          recentTrades,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
