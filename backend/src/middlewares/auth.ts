import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from './errorHandler.js';
import { encryptDeterministic } from '../utils/encryption.js';
import redis from '../config/redis.js';

// User Role Types
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SERVER_ADMIN = 'server_admin',
  ROOT = 'root',
}

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.ADMIN]: 1,
  [UserRole.SERVER_ADMIN]: 2,
  [UserRole.ROOT]: 3,
};

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    discordId: string;
    steamId?: string | null;
    epicId?: string | null;
    isAdmin: boolean;
    role: UserRole;
    apiKeyServerId?: number | null;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('Authentication required', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await prisma.userSession.findUnique({
      where: { token: tokenHash },
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      throw new AppError('Session expired or revoked', 401);
    }

    // Update session info
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(),
        ipAddress: req.ip || session.ipAddress,
        userAgent: req.headers['user-agent'] || session.userAgent,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        discordId: true,
        steamId: true,
        epicId: true,
        isAdmin: true,
        role: true,
        apiKeyServerId: true,
        isBanned: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (user.isBanned) {
      throw new AppError('Account is banned', 403);
    }

    req.user = {
      ...user,
      role: user.role as UserRole,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    next(error);
  }
};

// Backward compatible admin check
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  // Accept old isAdmin flag OR new role system
  const hasAccess = req.user.isAdmin ||
    req.user.role === UserRole.ADMIN ||
    req.user.role === UserRole.ROOT;

  if (!hasAccess) {
    return next(new AppError('Admin access required', 403));
  }
  next();
};

// Require specific roles
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Require minimum role level
export const requireMinRole = (minRole: UserRole) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!hasMinRole(req.user.role, minRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Server Admin or Root - for API Keys and user management
export const requireServerAdminOrRoot = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  const role = req.user.role;
  if (role !== UserRole.SERVER_ADMIN && role !== UserRole.ROOT) {
    return next(new AppError('Server Admin or Root access required', 403));
  }

  next();
};

// Website Admin (admin, root) - for products, categories, orders
export const requireWebsiteAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  const role = req.user.role;
  if (role !== UserRole.ADMIN && role !== UserRole.ROOT) {
    return next(new AppError('Admin access required', 403));
  }

  next();
};

// Root only
export const requireRoot = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== UserRole.ROOT) {
    return next(new AppError('Root access required', 403));
  }

  next();
};

// Optional authentication - doesn't fail if no token
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await prisma.userSession.findUnique({
      where: { token: tokenHash },
    });

    if (session && session.isActive && session.expiresAt >= new Date()) {
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          ipAddress: req.ip || session.ipAddress,
          userAgent: req.headers['user-agent'] || session.userAgent,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          discordId: true,
          steamId: true,
          epicId: true,
          isAdmin: true,
          role: true,
          apiKeyServerId: true,
          isBanned: true,
        },
      });

      if (user && !user.isBanned) {
        req.user = {
          ...user,
          role: user.role as UserRole,
        };
      }
    }

    next();
  } catch {
    next();
  }
};

// Plugin authentication (User API Key + IP Whitelist + Server ID)
export const authenticatePlugin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AppError('API key required', 401);
    }

    const serverIdStr = (req.headers['x-server-id'] as string) || (req.query.serverId as string);

    if (!serverIdStr) {
      throw new AppError('Server ID required (header X-Server-Id or query ?serverId=N)', 400);
    }

    const serverId = parseInt(serverIdStr, 10);

    if (isNaN(serverId) || serverId <= 0) {
      throw new AppError('Invalid Server ID', 400);
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, isActive: true },
    });

    if (!server) {
      throw new AppError(`Server ID ${serverId} not found`, 404);
    }

    if (!server.isActive) {
      throw new AppError(`Server ID ${serverId} is inactive`, 403);
    }

    const pluginIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      req.ip;

    if (!pluginIp) {
      throw new AppError('Cannot determine IP address', 400);
    }

    // 1. Try finding by Encrypted Key (New Standard)
    const encryptedKey = encryptDeterministic(apiKey);
    let user = await prisma.user.findUnique({
      where: { apiKey: encryptedKey },
      select: {
        id: true,
        discordId: true,
        discordUsername: true,
        steamId: true,
        apiKey: true,
        apiKeyIp: true,
        apiKeyCreatedAt: true,
        isBanned: true,
      },
    });

    // 2. If not found, try finding by Plain Text (Legacy/Migration)
    if (!user) {
      user = await prisma.user.findUnique({
        where: { apiKey: apiKey }, // Plain text lookup
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          steamId: true,
          apiKey: true,
          apiKeyIp: true,
          apiKeyCreatedAt: true,
          isBanned: true,
          role: true,
        },
      });

      // If found via plain text, MIGRATE IT to encrypted
      if (user) {
        console.log(`[Security] Migrating API Key to encrypted format for user: ${user.discordUsername}`);
        await prisma.user.update({
          where: { id: user.id },
          data: { apiKey: encryptedKey },
        });
        // Update local user object to match new state
        user.apiKey = encryptedKey;
      }
    }

    if (!user) {
      throw new AppError('Invalid API key', 401);
    }

    if (user.isBanned) {
      throw new AppError('User account is banned', 403);
    }

    const bypassIpCheck = process.env.BYPASS_PLUGIN_IP_CHECK === 'true' || process.env.NODE_ENV === 'development';

    if (!user.apiKeyIp) {
      await prisma.user.update({
        where: { id: user.id },
        data: { apiKeyIp: pluginIp },
      });
      console.log(`[Plugin Auth] IP registered for user ${user.discordUsername}: ${pluginIp}`);
    } else if (user.apiKeyIp !== pluginIp && !bypassIpCheck) {
      console.warn(`[Plugin Auth Warning] IP mismatch blocked. Registered: ${user.apiKeyIp}, Attempted: ${pluginIp}`);
      throw new AppError(
        `IP mismatch. Registered IP: ${user.apiKeyIp}, Current IP: ${pluginIp}. Please reset IP in your profile.`,
        403
      );
    } else if (user.apiKeyIp !== pluginIp && bypassIpCheck) {
      console.log(`[Plugin Auth] IP mismatch allowed (Bypass Mode). Registered: ${user.apiKeyIp}, Attempted: ${pluginIp}`);
    }

    (req as any).pluginUser = user;
    (req as any).serverId = serverId;
    (req as any).server = server;
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticateSignedPlugin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-plugin-key-id'] as string;
    const version = req.headers['x-plugin-version'] as string;
    const timestampStr = req.headers['x-request-timestamp'] as string;
    const nonce = req.headers['x-request-nonce'] as string;
    const contentSha = req.headers['x-content-sha256'] as string;
    const signature = req.headers['x-signature'] as string;

    if (!apiKey || !timestampStr || !nonce || !contentSha || !signature) {
      throw new AppError('Missing required signed plugin headers', 401);
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Math.abs(Date.now() - timestamp) > 300000) {
      throw new AppError('Clock drift limit exceeded', 401);
    }

    if (nonce.length < 16) {
      throw new AppError('Nonce too short', 401);
    }

    // Verify nonce in Redis to prevent replay
    const nonceKey = `nonce:${nonce}`;
    const isNew = await redis.set(nonceKey, '1', 'PX', 300000, 'NX');
    if (isNew !== 'OK') {
      throw new AppError('Duplicate request (nonce replayed)', 401);
    }

    // Lookup user by encrypted API Key
    const encryptedKey = encryptDeterministic(apiKey);
    const user = await prisma.user.findUnique({
      where: { apiKey: encryptedKey },
      select: {
        id: true,
        discordId: true,
        discordUsername: true,
        steamId: true,
        apiKey: true,
        apiKeyIp: true,
        isBanned: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid API key', 401);
    }

    if (user.isBanned) {
      throw new AppError('User account is banned', 403);
    }

    // Validate body SHA256
    const hasBody = req.body && Object.keys(req.body).length > 0;
    const rawBody = hasBody ? JSON.stringify(req.body) : '';
    const calculatedHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    if (calculatedHash !== contentSha) {
      throw new AppError('Content SHA256 mismatch', 401);
    }

    // Canonical string: METHOD\nPATH_AND_QUERY\nTIMESTAMP\nNONCE\nCONTENT_SHA256
    const pathAndQuery = req.originalUrl;
    const canonicalString = `${req.method}\n${pathAndQuery}\n${timestampStr}\n${nonce}\n${contentSha}`;

    // Verify signature using the plain text apiKey as secret
    const calculatedSignature = crypto.createHmac('sha256', apiKey)
      .update(canonicalString)
      .digest('hex');

    const bufferCalculated = Buffer.from(calculatedSignature);
    const bufferReceived = Buffer.from(signature);

    if (bufferCalculated.length !== bufferReceived.length || !crypto.timingSafeEqual(bufferCalculated, bufferReceived)) {
      throw new AppError('Invalid request signature', 401);
    }

    // Server verification
    const serverIdStr = (req.headers['x-server-id'] as string) || (req.query.serverId as string) || (req.body?.serverId?.toString());
    if (!serverIdStr) {
      throw new AppError('Server ID required', 400);
    }
    const serverId = parseInt(serverIdStr, 10);
    if (isNaN(serverId) || serverId <= 0) {
      throw new AppError('Invalid Server ID', 400);
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, isActive: true },
    });

    if (!server) {
      throw new AppError(`Server ID ${serverId} not found`, 404);
    }

    if (!server.isActive) {
      throw new AppError(`Server ID ${serverId} is inactive`, 403);
    }

    // IP validation (same as normal plugin auth)
    const pluginIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      req.ip;

    const bypassIpCheck = process.env.BYPASS_PLUGIN_IP_CHECK === 'true' || process.env.NODE_ENV === 'development';

    if (!user.apiKeyIp && pluginIp) {
      await prisma.user.update({
        where: { id: user.id },
        data: { apiKeyIp: pluginIp },
      });
    } else if (user.apiKeyIp && user.apiKeyIp !== pluginIp && !bypassIpCheck) {
      throw new AppError('IP mismatch', 403);
    }

    (req as any).pluginUser = user;
    (req as any).serverId = serverId;
    (req as any).server = server;
    next();
  } catch (error) {
    next(error);
  }
};
