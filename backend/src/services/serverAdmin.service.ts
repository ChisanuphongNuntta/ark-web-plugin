import prisma from '../config/database.js';
import { UserRole } from '../middlewares/auth.js';
import { paginateQuery, parsePagination, parseSearch, type PaginationParams } from '../utils/pagination.js';

/**
 * List options: either already-parsed pagination params (preferred, from parsePagination) or
 * the raw query values (page / pageSize / limit) which are parsed + snapped here.
 */
export interface ListOptions {
  params?: PaginationParams;
  page?: unknown;
  pageSize?: unknown;
  limit?: unknown;
  search?: unknown;
}

function resolveParams(options: ListOptions): PaginationParams {
  if (options.params) return options.params;
  return parsePagination({ page: options.page, pageSize: options.pageSize, limit: options.limit });
}

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
    options: ListOptions = {}
  ) {
    const params = resolveParams(options);
    const search = parseSearch(options.search);

    const where: any = {};

    // Server admin can only see users connected to their server; one without an assigned server sees nothing.
    if (adminRole === UserRole.SERVER_ADMIN) {
      where.apiKeyServerId = adminServerId ?? -1;
    }
    // Root sees all

    if (search) {
      where.OR = [
        { discordUsername: { contains: search, mode: 'insensitive' } },
        { steamId: { contains: search } },
        { discordId: { contains: search } },
      ];
    }

    const { result, pagination } = await paginateQuery(params, (skip, take) =>
      prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          // id is the unique tiebreaker so equal createdAt values never repeat/skip across pages
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
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
      ]) as Promise<[number, any[]]>,
    );

    return { users: result[1], total: pagination.total, page: pagination.page, limit: pagination.pageSize, pagination };
  }

  /**
   * Get API keys that server admin can manage
   */
  static async getAccessibleApiKeys(
    adminRole: UserRole,
    adminServerId: number | null,
    options: ListOptions = {}
  ) {
    const params = resolveParams(options);
    const search = parseSearch(options.search);

    const where: any = {
      apiKey: { not: null },
    };

    // Server admin can only see API keys for their server; one without an assigned server sees nothing.
    if (adminRole === UserRole.SERVER_ADMIN) {
      where.apiKeyServerId = adminServerId ?? -1;
    }
    // Root sees all

    if (search) {
      where.OR = [
        { discordUsername: { contains: search, mode: 'insensitive' } },
        { steamId: { contains: search } },
        { apiKeyServerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const { result, pagination } = await paginateQuery(params, (skip, take) =>
      prisma.$transaction([
        prisma.user.count({ where }),
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
          // never-used keys last, id as unique tiebreaker
          orderBy: [{ apiKeyLastUsed: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
          skip,
          take,
        }),
      ]) as Promise<[number, any[]]>,
    );

    return { users: result[1], total: pagination.total, page: pagination.page, limit: pagination.pageSize, pagination };
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
