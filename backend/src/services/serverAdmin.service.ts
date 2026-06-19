import prisma from '../config/database.js';
import { UserRole } from '../middlewares/auth.js';

export class ServerAdminService {
  /**
   * Check if a server admin can access a specific user
   * Server admins can only access users with the same apiKeyServerId
   */
  static async canAccessUser(
    adminId: string,
    adminRole: UserRole,
    adminServerId: number | null,
    targetUserId: string
  ): Promise<boolean> {
    // Root can access everyone
    if (adminRole === UserRole.ROOT) {
      return true;
    }

    // Server admin must have a server ID
    if (adminRole === UserRole.SERVER_ADMIN && adminServerId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { apiKeyServerId: true },
      });

      return targetUser?.apiKeyServerId === adminServerId;
    }

    return false;
  }

  /**
   * Get users that server admin can manage
   */
  static async getAccessibleUsers(
    adminRole: UserRole,
    adminServerId: number | null,
    options: {
      page?: number;
      limit?: number;
      search?: string;
    } = {}
  ) {
    const { page = 1, limit = 20, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Server admin can only see users connected to their server
    if (adminRole === UserRole.SERVER_ADMIN && adminServerId) {
      where.apiKeyServerId = adminServerId;
    }
    // Root sees all

    if (search) {
      where.OR = [
        { discordUsername: { contains: search, mode: 'insensitive' } },
        { steamId: { contains: search } },
        { discordId: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordAvatar: true,
          steamId: true,
          epicId: true,
          pointsBalance: true,
          totalSpent: true,
          isBanned: true,
          isAdmin: true,
          role: true,
          apiKeyServerId: true,
          apiKeyServerName: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  /**
   * Get API keys that server admin can manage
   */
  static async getAccessibleApiKeys(
    adminRole: UserRole,
    adminServerId: number | null,
    options: {
      page?: number;
      limit?: number;
      search?: string;
    } = {}
  ) {
    const { page = 1, limit = 20, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      apiKey: { not: null },
    };

    // Server admin can only see API keys for their server
    if (adminRole === UserRole.SERVER_ADMIN && adminServerId) {
      where.apiKeyServerId = adminServerId;
    }
    // Root sees all

    if (search) {
      where.OR = [
        { discordUsername: { contains: search, mode: 'insensitive' } },
        { steamId: { contains: search } },
        { apiKeyServerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordAvatar: true,
          steamId: true,
          apiKey: true,
          apiKeyIp: true,
          apiKeyCreatedAt: true,
          apiKeyServerId: true,
          apiKeyServerName: true,
          apiKeyServerMap: true,
          apiKeyServerPort: true,
          apiKeyLastUsed: true,
          isBanned: true,
        },
        orderBy: { apiKeyLastUsed: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  /**
   * Get server info for a server admin
   */
  static async getServerInfo(serverId: number) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        map: true,
        isActive: true,
        lastHeartbeat: true,
        chatTag: true,
        chatColor: true,
        chatIcon: true,
      },
    });

    return server;
  }

  /**
   * Count users in a server
   */
  static async countServerUsers(serverId: number) {
    return prisma.user.count({
      where: { apiKeyServerId: serverId },
    });
  }

  /**
   * Count API keys in a server
   */
  static async countServerApiKeys(serverId: number) {
    return prisma.user.count({
      where: {
        apiKeyServerId: serverId,
        apiKey: { not: null },
      },
    });
  }
}
