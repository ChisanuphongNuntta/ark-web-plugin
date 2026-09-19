import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { claimLegacySteamBalance } from '../services/legacyBalance.service.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthRequest } from '../middlewares/auth.js';
import auditService, { AuditActions, AuditResources } from '../services/audit.service.js';
import securityService from '../services/security.service.js';

// Proof-of-control validation for account linking.
// IRIS ID rule: an account is linked ONLY when the caller proves control of the provider
// identity (OAuth/OpenID assertion verified server-side or via the provider callback).
// We NEVER merge or link accounts by matching email or display name.
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60 * 1000;
const STEAM_PROOF_COOKIE = 'pending_steam_proof';

function secureCookieOptions(maxAge = OAUTH_STATE_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge,
  };
}

function secretForProviderProof(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError('Server authentication secret is not configured securely', 500);
  }
  return secret;
}

function safeEqualString(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSteamProof(steamId: string): string {
  const payload = Buffer.from(JSON.stringify({
    steamId,
    expiresAt: Date.now() + OAUTH_STATE_COOKIE_MAX_AGE,
    nonce: crypto.randomBytes(16).toString('hex'),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secretForProviderProof()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySteamProof(token: unknown, requestedSteamId: unknown): string {
  if (typeof token !== 'string' || typeof requestedSteamId !== 'string') {
    throw new AppError('A verified Steam OpenID callback is required', 400);
  }
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) {
    throw new AppError('Invalid or expired Steam verification', 400);
  }
  const expected = crypto.createHmac('sha256', secretForProviderProof()).update(payload).digest('base64url');
  if (!safeEqualString(signature, expected)) {
    throw new AppError('Invalid or expired Steam verification', 400);
  }

  let decoded: { steamId?: unknown; expiresAt?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('Invalid or expired Steam verification', 400);
  }
  if (
    typeof decoded.steamId !== 'string' ||
    typeof decoded.expiresAt !== 'number' ||
    decoded.expiresAt < Date.now() ||
    !safeEqualString(decoded.steamId, requestedSteamId)
  ) {
    throw new AppError('Invalid or expired Steam verification', 400);
  }
  return decoded.steamId;
}

async function verifySteamOpenId(query: Request['query'], expectedReturnTo: string): Promise<string> {
  const get = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === 'string' ? value : undefined;
  };

  const claimedId = get('openid.claimed_id');
  const identity = get('openid.identity');
  const returnTo = get('openid.return_to');
  const opEndpoint = get('openid.op_endpoint');
  if (
    get('openid.mode') !== 'id_res' ||
    opEndpoint !== 'https://steamcommunity.com/openid/login' ||
    !claimedId || claimedId !== identity ||
    returnTo !== expectedReturnTo
  ) {
    throw new AppError('Invalid Steam OpenID response', 400);
  }

  // Steam documents the claimed identifier with an http:// URL even though the
  // OpenID provider and verification endpoint are HTTPS. Accept both schemes
  // so a valid provider assertion is not rejected after the user signs in.
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimedId);
  if (!match) throw new AppError('Invalid Steam ID', 400);

  const verification = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.') && typeof value === 'string') verification.set(key, value);
  }
  verification.set('openid.mode', 'check_authentication');

  const response = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verification,
  });
  const body = await response.text();
  if (!response.ok || !/^is_valid:true\s*$/m.test(body)) {
    throw new AppError('Steam could not verify this OpenID response', 400);
  }
  return match[1];
}

export class AuthController {
  // Discord OAuth - Redirect to Discord
  discordAuth = (req: Request, res: Response) => {
    const state = crypto.randomBytes(32).toString('base64url');
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: process.env.DISCORD_CALLBACK_URL!,
      response_type: 'code',
      scope: 'identify',
      state,
    });

    res.cookie('discord_oauth_state', state, secureCookieOptions());
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  };

  // Discord OAuth Callback
  discordCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state } = req.query;

      if (!code) {
        throw new AppError('Authorization code required', 400);
      }
      if (!safeEqualString(state, req.cookies?.discord_oauth_state)) {
        throw new AppError('Invalid or expired Discord OAuth state', 400);
      }
      res.clearCookie('discord_oauth_state', { path: '/api/auth' });

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
    const state = crypto.randomBytes(32).toString('base64url');
    const returnUrl = new URL(process.env.STEAM_RETURN_URL!);
    returnUrl.searchParams.set('state', state);
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl.toString(),
      'openid.realm': process.env.STEAM_REALM!,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    res.cookie('steam_oauth_state', state, secureCookieOptions());
    res.redirect(`https://steamcommunity.com/openid/login?${params}`);
  };

  // Steam OAuth Callback
  steamCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user cancelled
      const mode = req.query['openid.mode'] as string;
      if (mode === 'cancel') {
        return res.redirect(`${process.env.FRONTEND_URL}/profile?error=steam_cancelled`);
      }

      const state = req.query.state;
      if (!safeEqualString(state, req.cookies?.steam_oauth_state)) {
        throw new AppError('Invalid or expired Steam OAuth state', 400);
      }
      const expectedReturnUrl = new URL(process.env.STEAM_RETURN_URL!);
      expectedReturnUrl.searchParams.set('state', state as string);
      const steamId = await verifySteamOpenId(req.query, expectedReturnUrl.toString());
      res.clearCookie('steam_oauth_state', { path: '/api/auth' });

      // The browser may display the Steam ID, but linking is authorized only by this
      // short-lived HMAC proof produced after Steam's server-to-server verification.
      res.cookie(STEAM_PROOF_COOKIE, createSteamProof(steamId), secureCookieOptions());

      res.redirect(`${process.env.FRONTEND_URL}/auth/link-steam?steamId=${steamId}`);
    } catch (error) {
      next(error);
    }
  };

  // Link Steam to existing account
  linkSteam = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { steamId } = req.body;

      if (!steamId) {
        throw new AppError('Steam ID required', 400);
      }

      const verifiedSteamId = verifySteamProof(req.cookies?.[STEAM_PROOF_COOKIE], steamId);

      // Check if Steam ID already linked
      const existingUser = await prisma.user.findUnique({
        where: { steamId: verifiedSteamId },
      });

      if (existingUser && existingUser.id !== req.user!.id) {
        throw new AppError('This Steam account is already linked to another user', 400);
      }

      // Link the verified Steam identity and atomically claim any deduplicated
      // legacy ArkShop balance. A failed wallet post rolls the identity update
      // back, so a balance can never be marked claimed without being credited.
      const { user, claimedLegacyBalance } = await prisma.$transaction(async (tx) => {
        const linkedUser = await tx.user.update({
          where: { id: req.user!.id },
          data: { steamId: verifiedSteamId },
        });
        const claimed = await claimLegacySteamBalance(tx, linkedUser.id, verifiedSteamId);
        return { user: linkedUser, claimedLegacyBalance: claimed };
      });

      res.clearCookie(STEAM_PROOF_COOKIE, { path: '/api/auth' });

      res.json({
        success: true,
        message: 'Steam account linked successfully',
        claimedLegacyBalance: claimedLegacyBalance.toString(),
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

  // GET /auth/identities — IRIS ID linked-providers view for the Account Center.
  // Shape matches contracts/fixtures/linked-identities.json (LinkedIdentitiesResponse). Every
  // configured provider (discord, steam, epic) is reported; unlinked providers appear with null
  // fields and canUnlink=false. `canUnlink` enforces the "at least one provider must remain
  // linked" rule (same invariant as the unlink endpoints).
  getLinkedIdentities = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          steamId: true,
          epicId: true,
          createdAt: true,
        },
      });
      if (!user) throw new AppError('User not found', 404);

      const discordLinked = !!user.discordId;
      const steamLinked = !!user.steamId;
      const epicLinked = !!user.epicId;
      const linkedCount = [discordLinked, steamLinked, epicLinked].filter(Boolean).length;

      // canUnlink: provider is linked AND removing it would still leave >= 1 linked provider.
      const canUnlink = (linked: boolean) => linked && linkedCount > 1;

      const identities = [
        {
          provider: 'discord',
          providerAccountId: discordLinked ? user.discordId : null,
          displayName: user.discordUsername ?? null,
          linkedAt: discordLinked ? user.createdAt.toISOString() : null,
          proofMethod: discordLinked ? 'discord_oauth' : null,
          isPrimary: discordLinked,
          canUnlink: canUnlink(discordLinked),
        },
        {
          provider: 'steam',
          providerAccountId: steamLinked ? user.steamId : null,
          displayName: null,
          linkedAt: steamLinked ? user.createdAt.toISOString() : null,
          proofMethod: steamLinked ? 'steam_openid' : null,
          isPrimary: false,
          canUnlink: canUnlink(steamLinked),
        },
        {
          provider: 'epic',
          providerAccountId: epicLinked ? user.epicId : null,
          displayName: null,
          linkedAt: epicLinked ? user.createdAt.toISOString() : null,
          proofMethod: epicLinked ? 'epic_oauth' : null,
          isPrimary: false,
          canUnlink: canUnlink(epicLinked),
        },
      ];

      res.json({
        userId: user.id,
        identities,
        rules: {
          autoMergeByEmailOrName: false,
          proofOfControlRequired: true,
          minimumLinkedProviders: 1,
          note: 'At least one provider must remain linked. Linking always requires proof-of-control; email/name are never used to merge accounts.',
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
      // Do not accept a provider identity or a proof method supplied by the browser.
      // Re-enable this endpoint only after an Epic OAuth callback has been verified
      // server-to-server and exchanged for a one-time proof, like the Steam flow.
      throw new AppError('Epic account linking is temporarily unavailable pending verified OAuth integration', 501);
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
