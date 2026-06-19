import { Request } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import auditService, { AuditActions, AuditResources } from './audit.service.js';

// Consent Types
export const ConsentTypes = {
  PRIVACY_POLICY: 'privacy_policy',
  TERMS_OF_SERVICE: 'terms_of_service',
  MARKETING: 'marketing',
  ANALYTICS: 'analytics',
  COOKIES: 'cookies',
} as const;

// Data Request Types
export const DataRequestTypes = {
  ACCESS: 'access',           // ขอเข้าถึงข้อมูล
  RECTIFICATION: 'rectification', // ขอแก้ไขข้อมูล
  DELETION: 'deletion',       // ขอลบข้อมูล
  PORTABILITY: 'portability', // ขอโอนย้ายข้อมูล
  OBJECTION: 'objection',     // ขอคัดค้าน
} as const;

// Data Request Status
export const DataRequestStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
} as const;

class PDPAService {
  /**
   * Grant consent
   */
  async grantConsent(
    userId: string,
    consentType: string,
    version: string,
    req: Request
  ): Promise<void> {
    const ipAddress = this.getClientIP(req);
    const userAgent = req.headers['user-agent'] || null;

    await prisma.userConsent.upsert({
      where: {
        userId_consentType: {
          userId,
          consentType,
        },
      },
      create: {
        userId,
        consentType,
        version,
        granted: true,
        grantedAt: new Date(),
        ipAddress,
        userAgent,
      },
      update: {
        version,
        granted: true,
        grantedAt: new Date(),
        revokedAt: null,
        ipAddress,
        userAgent,
      },
    });

    await auditService.logConsentGrant(userId, consentType, version, req);
  }

  /**
   * Revoke consent
   */
  async revokeConsent(
    userId: string,
    consentType: string,
    req: Request
  ): Promise<void> {
    await prisma.userConsent.update({
      where: {
        userId_consentType: {
          userId,
          consentType,
        },
      },
      data: {
        granted: false,
        revokedAt: new Date(),
      },
    });

    await auditService.logConsentRevoke(userId, consentType, req);
  }

  /**
   * Get user's consents
   */
  async getUserConsents(userId: string) {
    return prisma.userConsent.findMany({
      where: { userId },
    });
  }

  /**
   * Check if user has granted specific consent
   */
  async hasConsent(userId: string, consentType: string): Promise<boolean> {
    const consent = await prisma.userConsent.findUnique({
      where: {
        userId_consentType: {
          userId,
          consentType,
        },
      },
    });

    return consent?.granted === true;
  }

  /**
   * Create data subject request
   */
  async createDataRequest(
    userId: string,
    requestType: string,
    description?: string,
    req?: Request
  ) {
    const dataRequest = await prisma.dataRequest.create({
      data: {
        userId,
        requestType,
        description,
        status: DataRequestStatus.PENDING,
      },
    });

    if (req) {
      await auditService.logDataRequest(userId, requestType, dataRequest.id, req);
    }

    return dataRequest;
  }

  /**
   * Get data requests for user
   */
  async getUserDataRequests(userId: string) {
    return prisma.dataRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all data requests (admin)
   */
  async getAllDataRequests(options: {
    status?: string;
    requestType?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, requestType, page = 1, limit = 20 } = options;

    const where: any = {};
    if (status) where.status = status;
    if (requestType) where.requestType = requestType;

    const [requests, total] = await Promise.all([
      prisma.dataRequest.findMany({
        where,
        include: {
          user: {
            select: {
              discordUsername: true,
              discordId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dataRequest.count({ where }),
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Process data request (admin)
   */
  async processDataRequest(
    requestId: number,
    adminId: string,
    status: string,
    response?: string
  ) {
    return prisma.dataRequest.update({
      where: { id: requestId },
      data: {
        status,
        response,
        processedBy: adminId,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Export user data (PDPA Data Portability)
   */
  async exportUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        orders: {
          include: {
            product: { select: { name: true } },
            server: { select: { name: true } },
          },
        },
        pointTransactions: true,
        donations: true,
        playerStats: {
          include: {
            server: { select: { name: true } },
          },
        },
        consents: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Convert BigInt to string for JSON serialization
    const serializeData = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return obj.toString();
      if (Array.isArray(obj)) return obj.map(serializeData);
      if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
          result[key] = serializeData(obj[key]);
        }
        return result;
      }
      return obj;
    };

    // Format data for export
    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        steamId: user.steamId,
        epicId: user.epicId,
        pointsBalance: user.pointsBalance.toString(),
        totalSpent: user.totalSpent.toString(),
        createdAt: user.createdAt,
      },
      orders: user.orders.map(o => ({
        id: o.id,
        product: o.product.name,
        server: o.server.name,
        quantity: o.quantity,
        totalPrice: o.totalPrice,
        status: o.status,
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt,
      })),
      pointTransactions: user.pointTransactions.map(pt => ({
        id: pt.id,
        amount: pt.amount,
        balanceAfter: pt.balanceAfter.toString(),
        type: pt.type,
        description: pt.description,
        createdAt: pt.createdAt,
      })),
      donations: user.donations.map(d => ({
        id: d.id,
        amountThb: d.amountThb.toString(),
        pointsGranted: d.pointsGranted,
        paymentMethod: d.paymentMethod,
        status: d.status,
        createdAt: d.createdAt,
      })),
      gameStats: user.playerStats.map(ps => ({
        server: ps.server.name,
        playtimeMinutes: ps.playtimeMinutes,
        dinosKilled: ps.dinosKilled,
        resourcesHarvested: ps.resourcesHarvested.toString(),
        updatedAt: ps.updatedAt,
      })),
      consents: user.consents.map(c => ({
        type: c.consentType,
        version: c.version,
        granted: c.granted,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
      })),
    };

    return serializeData(exportData);
  }

  /**
   * Delete user data (PDPA Right to Erasure)
   * Note: This is a soft delete - keeps minimal data for legal requirements
   */
  async deleteUserData(userId: string, req?: Request) {
    // Anonymize user data
    await prisma.user.update({
      where: { id: userId },
      data: {
        discordUsername: '[DELETED]',
        discordAvatar: null,
        steamId: null,
        epicId: null,
        isBanned: true, // Prevent re-login
      },
    });

    // Delete player stats
    await prisma.playerStats.deleteMany({
      where: { userId },
    });

    // Delete point transactions (keep for accounting, but anonymize)
    await prisma.pointTransaction.updateMany({
      where: { userId },
      data: {
        description: '[DELETED USER]',
      },
    });

    // Log the deletion
    if (req) {
      await auditService.log({
        userId,
        action: AuditActions.DATA_DELETE,
        resource: AuditResources.USER,
        resourceId: userId,
      }, req);
    }

    return { success: true };
  }

  /**
   * Get active policy version
   */
  async getActivePolicy(type: string) {
    return prisma.policyVersion.findFirst({
      where: {
        type,
        isActive: true,
        effectiveAt: { lte: new Date() },
      },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  /**
   * Get all policy versions
   */
  async getPolicyVersions(type: string) {
    return prisma.policyVersion.findMany({
      where: { type },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  /**
   * Create new policy version (admin)
   */
  async createPolicyVersion(data: {
    type: string;
    version: string;
    content: string;
    contentTh?: string;
    effectiveAt: Date;
    isActive?: boolean;
  }) {
    // Deactivate old versions if new one is active
    if (data.isActive) {
      await prisma.policyVersion.updateMany({
        where: { type: data.type },
        data: { isActive: false },
      });
    }

    return prisma.policyVersion.create({
      data: {
        type: data.type,
        version: data.version,
        content: data.content,
        contentTh: data.contentTh,
        effectiveAt: data.effectiveAt,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Get client IP from request
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}

export const pdpaService = new PDPAService();
export default pdpaService;
