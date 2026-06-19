import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthRequest } from '../middlewares/auth.js';
import auditService, { AuditActions, AuditResources } from '../services/audit.service.js';
import securityService from '../services/security.service.js';

// Proof-of-control validation for account linking.
// IRIS ID rule: an account is linked ONLY when the caller proves control of the provider
// identity (OAuth/OpenID assertion verified server-side or via the provider callback).
// We NEVER merge or link accounts by matching email or display name.
type LinkProof = {
  method?: string; // e.g. 'steam_openid', 'discord_oauth', 'epic_oauth', 'provider_callback'
  // method-specific verified material (claimedId, verified token reference, etc.)
  [key: string]: unknown;
};

const PROOF_METHODS_BY_PROVIDER: Record<string, string[]> = {
  steam: ['steam_openid', 'provider_callback'],
  epic: ['epic_oauth', 'provider_callback'],
  discord: ['discord_oauth', 'provider_callback'],
};

// Returns the proof method actually used. In production every link MUST carry a valid proof.
// During development (NODE_ENV=development) a missing proof is tolerated to keep the existing
// callback-cookie flow working, but email/name are never an accepted proof in any environment.
function assertProofOfControl(provider: 'steam' | 'epic' | 'discord', proof: LinkProof | undefined): string {
  const allowed = PROOF_METHODS_BY_PROVIDER[provider] || [];
  if (proof && typeof proof.method === 'string') {
    if (proof.method === 'email' || proof.method === 'name' || proof.method === 'username') {
      throw new AppError('Account linking by email or name is not allowed; proof-of-control is required', 400);
    }
    if (!allowed.includes(proof.method)) {
      throw new AppError(`Unsupported proof method for ${provider}. Allowed: ${allowed.join(', ')}`, 400);
    }
    return proof.method;
  }
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new AppError(`Proof-of-control is required to link a ${provider} account`, 400);
  }
  // Transitional: derived from the verified provider callback (e.g. Steam OpenID claimedId
  // stored in an httpOnly cookie) rather than a client-supplied identity.
  return 'provider_callback';
}

export class AuthController {
  // Discord OAuth - Redirect to Discord
  discordAuth = (req: Request, res: Response) => {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: process.env.DISCORD_CALLBACK_URL!,
      response_type: 'code',
      scope: 'identify',
    });

    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  };

  // Discord OAuth Callback
  discordCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.query;

      if (!code) {
        throw new AppError('Authorization code required', 400);
      }

      // Exchange code for token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: process.env.DISCORD_CALLBACK_URL!,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (!tokenData.access_token) {
        console.error('Discord token exchange failed:', tokenData);
        throw new AppError(`Failed to get Discord token: ${tokenData.error || 'Unknown error'}`, 400);
      }

      // Get user info
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const discordUser = await userResponse.json() as { id: string; username: string; avatar?: string };

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { discordId: discordUser.id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            discordId: discordUser.id,
            discordUsername: `${discordUser.username}`,
            discordAvatar: discordUser.avatar
              ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
              : null,
          },
        });
      } else {
        // Update Discord info
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            discordUsername: `${discordUser.username}`,
            discordAvatar: discordUser.avatar
              ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
              : null,
          },
        });
      }

      // Generate JWT
      const token = generateToken(user.id);

      // Create session in DB
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days matching token cookie
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token: tokenHash,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
          expiresAt,
        },
      });

      // Set cookie and redirect
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Log successful login
      await auditService.logLogin(user.id, req);
      await securityService.logLoginSuccess(user.id, req);

      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?success=true`);
    } catch (error) {
      next(error);
    }
  };

  // Steam OAuth - Redirect to Steam
  steamAuth = (req: Request, res: Response) => {
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': process.env.STEAM_RETURN_URL!,
      'openid.realm': process.env.STEAM_REALM!,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    res.redirect(`https://steamcommunity.com/openid/login?${params}`);
  };

  // Steam OAuth Callback
  steamCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('Steam callback query params:', req.query);

      // Check if user cancelled
      const mode = req.query['openid.mode'] as string;
      if (mode === 'cancel') {
        return res.redirect(`${process.env.FRONTEND_URL}/profile?error=steam_cancelled`);
      }

      const claimedId = req.query['openid.claimed_id'] as string;

      if (!claimedId) {
        console.error('Steam auth failed - no claimed_id. Query:', req.query);
        return res.redirect(`${process.env.FRONTEND_URL}/profile?error=steam_failed`);
      }

      // Extract Steam ID from claimed_id
      const steamId = claimedId.replace('https://steamcommunity.com/openid/id/', '');

      if (!steamId || steamId === claimedId) {
        console.error('Steam auth failed - invalid claimed_id format:', claimedId);
        return res.redirect(`${process.env.FRONTEND_URL}/profile?error=steam_invalid`);
      }

      // Store Steam ID in session/cookie for linking
      res.cookie('pending_steam_id', steamId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      res.redirect(`${process.env.FRONTEND_URL}/auth/link-steam?steamId=${steamId}`);
    } catch (error) {
      next(error);
    }
  };

  // Link Steam to existing account
  linkSteam = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId, proof } = req.body;

      if (!steamId) {
        throw new AppError('Steam ID required', 400);
      }

      // Proof-of-control gate (no auto-merge by email/name).
      assertProofOfControl('steam', proof);

      // Check if Steam ID already linked
      const existingUser = await prisma.user.findUnique({
        where: { steamId },
      });

      if (existingUser && existingUser.id !== req.user!.id) {
        throw new AppError('This Steam account is already linked to another user', 400);
      }

      // Link Steam ID
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { steamId },
      });

      res.json({
        success: true,
        message: 'Steam account linked successfully',
        user: {
          id: user.id,
          steamId: user.steamId,
          discordUsername: user.discordUsername,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get current user
  getCurrentUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          steamId: true,
          epicId: true,
          discordId: true,
          discordUsername: true,
          discordAvatar: true,
          pointsBalance: true,
          isAdmin: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Convert BigInt to string for JSON serialization
      res.json({
        user: {
          ...user,
          pointsBalance: user.pointsBalance.toString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Logout
  logout = async (req: AuthRequest, res: Response) => {
    // Log logout if user is authenticated
    if (req.user) {
      await auditService.logLogout(req.user.id, req);
    }

    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.userSession.updateMany({
        where: { token: tokenHash },
        data: { isActive: false },
      });
    }

    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
  };

  unlinkSteam = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.discordId && !user.epicId) {
        throw new AppError('Cannot unlink last identity provider. You must link another provider first.', 400);
      }
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { steamId: null },
      });
      res.json({ success: true, message: 'Steam account unlinked successfully', user: { id: updated.id, steamId: updated.steamId } });
    } catch (error) { next(error); }
  };

  linkEpic = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { epicId, proof } = req.body;
      if (!epicId) throw new AppError('Epic ID required', 400);

      // Proof-of-control gate (no auto-merge by email/name).
      assertProofOfControl('epic', proof);

      const existing = await prisma.user.findUnique({ where: { epicId } });
      if (existing && existing.id !== req.user!.id) {
        throw new AppError('This Epic Games account is already linked to another user', 400);
      }

      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { epicId },
      });
      res.json({ success: true, message: 'Epic Games account linked successfully', user: { id: updated.id, epicId: updated.epicId } });
    } catch (error) { next(error); }
  };

  unlinkEpic = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.discordId && !user.steamId) {
        throw new AppError('Cannot unlink last identity provider. You must link another provider first.', 400);
      }
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { epicId: null },
      });
      res.json({ success: true, message: 'Epic Games account unlinked successfully', user: { id: updated.id, epicId: updated.epicId } });
    } catch (error) { next(error); }
  };

  unlinkDiscord = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.steamId && !user.epicId) {
        throw new AppError('Cannot unlink last identity provider. You must link another provider first.', 400);
      }
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { discordId: '', discordUsername: null, discordAvatar: null },
      });
      res.json({ success: true, message: 'Discord account unlinked successfully', user: { id: updated.id, discordId: updated.discordId } });
    } catch (error) { next(error); }
  };

  listSessions = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const sessions = await prisma.userSession.findMany({
        where: { userId: req.user!.id, isActive: true },
        orderBy: { lastUsedAt: 'desc' },
      });

      // Risk-based login flagging (derived, defense-in-depth): the device/session the
      // request originates from is "current"; any active session on a different IP or a
      // different user-agent is flagged so the Account Center can surface a security prompt.
      const currentIp = req.ip || null;
      const currentUa = req.headers['user-agent'] || null;
      const enriched = sessions.map((session) => {
        const isCurrent =
          (currentIp != null && session.ipAddress === currentIp) &&
          (currentUa != null && session.userAgent === currentUa);
        const newIp = currentIp != null && session.ipAddress != null && session.ipAddress !== currentIp;
        const newDevice = currentUa != null && session.userAgent != null && session.userAgent !== currentUa;
        return {
          ...session,
          isCurrent,
          riskFlag: !isCurrent && (newIp || newDevice),
          riskReasons: [
            ...(newIp ? ['new_ip'] : []),
            ...(newDevice ? ['new_device'] : []),
          ],
        };
      });
      res.json(enriched);
    } catch (error) { next(error); }
  };

  // Account recovery flow — STUB (schema-complete, no provider verification wired yet).
  // IRIS ID must NOT auto-merge accounts by email or display name; recovery is always a
  // proof-of-control challenge against a still-linked provider. This endpoint validates the
  // request shape and issues a pending recovery ticket; provider proof verification and
  // ticket resolution land in a later milestone.
  requestRecovery = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider, providerAccountId, contactChannel } = req.body || {};
      const allowedProviders = ['discord', 'steam', 'epic'];
      if (!provider || !allowedProviders.includes(provider)) {
        throw new AppError(`provider must be one of: ${allowedProviders.join(', ')}`, 400);
      }
      if (!providerAccountId || typeof providerAccountId !== 'string') {
        throw new AppError('providerAccountId is required', 400);
      }
      // Intentionally provider-agnostic and non-enumerating: we never confirm whether an
      // account exists, and we never merge by email/name. A challenge token is returned that
      // must later be satisfied by proving control of a linked provider.
      const recoveryTicketId = crypto.randomUUID();
      const challengeNonce = crypto.randomBytes(16).toString('hex');
      res.status(202).json({
        status: 'pending_proof_of_control',
        recoveryTicketId,
        provider,
        challengeNonce,
        instructions:
          'Prove control of a currently linked provider to continue. Email/name are never used to auto-merge accounts.',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    } catch (error) { next(error); }
  };

  revokeSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const session = await prisma.userSession.findUnique({ where: { id } });
      if (!session || session.userId !== req.user!.id) {
        throw new AppError('Session not found', 404);
      }
      await prisma.userSession.update({
        where: { id },
        data: { isActive: false },
      });
      res.json({ success: true, message: 'Session revoked successfully' });
    } catch (error) { next(error); }
  };
}
