import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthRequest } from '../middlewares/auth.js';
import auditService, { AuditActions, AuditResources } from '../services/audit.service.js';
import securityService from '../services/security.service.js';

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
      const { steamId } = req.body;

      if (!steamId) {
        throw new AppError('Steam ID required', 400);
      }

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
      const { epicId } = req.body;
      if (!epicId) throw new AppError('Epic ID required', 400);

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
      res.json(sessions);
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
