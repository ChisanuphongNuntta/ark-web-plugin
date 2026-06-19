import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from './errorHandler.js';
import { encryptDeterministic } from '../utils/encryption.js';
import redis from '../config/redis.js';
import pluginCredentialService from '../services/pluginCredential.service.js';

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
    // X-Plugin-Key-Id is the credential IDENTIFIER (keyId), NOT the secret. The HMAC secret
    // is resolved server-side from the keyId (see resolution below) and never travels the wire.
    const keyId = req.headers['x-plugin-key-id'] as string;
    const version = req.headers['x-plugin-version'] as string;
    const timestampStr = req.headers['x-request-timestamp'] as string;
    const nonce = req.headers['x-request-nonce'] as string;
    const contentSha = req.headers['x-content-sha256'] as string;
    const signature = req.headers['x-signature'] as string;

    if (!keyId || !timestampStr || !nonce || !contentSha || !signature) {
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

    // ── Resolve keyId -> signing secret ──────────────────────────────────────────────
    // PRIMARY (M2 hardening): a scoped ServerCredential whose keyId != secret. We verify the
    // HMAC against the resolved per-credential secret and bind the request to the credential's
    // server scope. FALLBACK (overlap window): a legacy User.apiKey where the same value acted
    // as both identifier and secret — kept working so plugins already in the field do not break
    // while operators migrate to issued {keyId, secret} pairs.
    let signingSecret: string | null = null;
    let credentialId: string | null = null;
    let scopedServerId: number | null = null;
    let pluginUser: any = null;

    const credential = await pluginCredentialService.resolve(keyId);
    if (credential) {
      signingSecret = credential.secret;
      credentialId = credential.id;
      scopedServerId = credential.serverId;
    } else {
      // Legacy overlap path: treat the keyId value as a User.apiKey (identifier == secret).
      const encryptedKey = encryptDeterministic(keyId);
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

      console.warn(
        `[Plugin Auth][DEPRECATION] Signed request using legacy User.apiKey as HMAC secret ` +
        `(keyId acted as secret) for user ${user.discordUsername ?? user.id}. ` +
        `Migrate this server to an issued {keyId, secret} ServerCredential.`
      );

      signingSecret = keyId; // legacy: the wire value doubled as the secret
      pluginUser = user;
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

    // Verify signature using the RESOLVED secret (never the keyId, except on the legacy path).
    const calculatedSignature = crypto.createHmac('sha256', signingSecret!)
      .update(canonicalString)
      .digest('hex');

    const bufferCalculated = Buffer.from(calculatedSignature);
    const bufferReceived = Buffer.from(signature);

    if (bufferCalculated.length !== bufferReceived.length || !crypto.timingSafeEqual(bufferCalculated, bufferReceived)) {
      throw new AppError('Invalid request signature', 401);
    }

    // Server verification. With a resolved ServerCredential the scope is FIXED to the
    // credential's server; any X-Server-Id/body serverId that disagrees is rejected so a
    // credential cannot act on a server it was not issued for.
    const requestedServerIdStr = (req.headers['x-server-id'] as string) || (req.query.serverId as string) || (req.body?.serverId?.toString());

    let serverId: number;
    if (scopedServerId != null) {
      serverId = scopedServerId;
      if (requestedServerIdStr) {
        const requested = parseInt(requestedServerIdStr, 10);
        if (!isNaN(requested) && requested !== scopedServerId) {
          throw new AppError('Server ID does not match credential scope', 403);
        }
      }
    } else {
      if (!requestedServerIdStr) {
        throw new AppError('Server ID required', 400);
      }
      serverId = parseInt(requestedServerIdStr, 10);
      if (isNaN(serverId) || serverId <= 0) {
        throw new AppError('Invalid Server ID', 400);
      }
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

    // IP validation only applies to the legacy user-bound path (User.apiKeyIp). Issued
    // ServerCredentials are scoped to a server and IP policy is enforced at the gateway layer.
    if (pluginUser) {
      const pluginIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        req.ip;

      const bypassIpCheck = process.env.BYPASS_PLUGIN_IP_CHECK === 'true' || process.env.NODE_ENV === 'development';

      if (!pluginUser.apiKeyIp && pluginIp) {
        await prisma.user.update({
          where: { id: pluginUser.id },
          data: { apiKeyIp: pluginIp },
        });
      } else if (pluginUser.apiKeyIp && pluginUser.apiKeyIp !== pluginIp && !bypassIpCheck) {
        throw new AppError('IP mismatch', 403);
      }
    }

    if (credentialId) {
      void pluginCredentialService.markUsed(credentialId);
    }

    (req as any).pluginUser = pluginUser;
    (req as any).pluginCredential = credentialId ? { id: credentialId, keyId, serverId } : null;
    (req as any).serverId = serverId;
    (req as any).server = server;
    next();
  } catch (error) {
    next(error);
  }
};

// Flexible plugin auth for legacy endpoints during the HMAC migration (CR-PLUGIN-006).
//
// The contract now declares `hmacAuth` for the legacy plugin endpoints (/verify, /stats,
// /player/:steamId, /protection/**, chat/plugin, market/plugin). To avoid breaking plugins
// already deployed in the field with `X-API-Key`, this middleware accepts BOTH during the
// overlap window:
//   - If signed-request headers (X-Signature + X-Plugin-Key-Id) are present, verify via the
//     HMAC path (authenticateSignedPlugin).
//   - Otherwise fall back to the legacy X-API-Key path (authenticatePlugin) and log a
//     deprecation warning so operators can track which servers still need to migrate.
// Once every plugin has migrated, the route can be switched to `authenticateSignedPlugin`
// directly and this shim removed.
export const authenticatePluginFlexible = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const hasSignedHeaders = Boolean(req.headers['x-signature']) && Boolean(req.headers['x-plugin-key-id']);
  if (hasSignedHeaders) {
    return authenticateSignedPlugin(req, res, next);
  }

  if (req.headers['x-api-key']) {
    console.warn(
      `[Plugin Auth][DEPRECATION] Legacy endpoint ${req.method} ${req.originalUrl} authenticated ` +
      `with X-API-Key. This endpoint now supports hmacAuth (X-Signature + X-Plugin-Key-Id); ` +
      `migrate to signed requests before the overlap window closes.`
    );
  }
  return authenticatePlugin(req, res, next);
};
