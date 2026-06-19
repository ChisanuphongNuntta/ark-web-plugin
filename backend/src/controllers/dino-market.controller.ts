import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';

// Platform fee percentage (e.g., 5% = 0.05)
const PLATFORM_FEE_PERCENT = 0.05;

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
        listings,
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

      res.json({ listing });
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
        listings,
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
        purchases,
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
        return res.status(404).json({ error: 'User not found. Please link your Steam account.' });
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

      // Check buyer balance
      if (Number(buyer.pointsBalance) < listing.price) {
        return res.status(400).json({
          error: 'Insufficient points',
          required: listing.price,
          available: Number(buyer.pointsBalance),
        });
      }

      // Calculate fees
      const platformFee = Math.floor(listing.price * PLATFORM_FEE_PERCENT);
      const sellerReceives = listing.price - platformFee;

      // Execute transaction
      await prisma.$transaction(async (tx) => {
        // Deduct from buyer
        await tx.user.update({
          where: { id: userId },
          data: {
            pointsBalance: { decrement: listing.price },
            totalSpent: { increment: listing.price },
          },
        });

        // Add to seller (minus fee)
        await tx.user.update({
          where: { id: listing.sellerId },
          data: {
            pointsBalance: { increment: sellerReceives },
          },
        });

        // Record buyer transaction
        await tx.pointTransaction.create({
          data: {
            userId,
            amount: -listing.price,
            balanceAfter: Number(buyer.pointsBalance) - listing.price,
            type: 'dino_purchase',
            description: `Purchased ${listing.species} Lv.${listing.level}`,
            referenceId: listing.id,
          },
        });

        // Record seller transaction
        await tx.pointTransaction.create({
          data: {
            userId: listing.sellerId,
            amount: sellerReceives,
            balanceAfter: Number(listing.seller.pointsBalance) + sellerReceives,
            type: 'dino_sale',
            description: `Sold ${listing.species} Lv.${listing.level} (fee: ${platformFee})`,
            referenceId: listing.id,
          },
        });

        // Update listing
        await tx.dinoListing.update({
          where: { id },
          data: {
            status: 'sold',
            buyerId: userId,
            soldAt: new Date(),
            deliveryStatus: 'pending',
          },
        });

        // Record trade history
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
      });

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

  // Mark delivery complete (called from plugin)
  markDelivered = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { serverId } = req.body;

      await prisma.dinoListing.update({
        where: { id },
        data: {
          deliveryStatus: 'delivered',
          deliveredAt: new Date(),
          deliveryServerId: serverId,
        },
      });

      res.json({ success: true });
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
