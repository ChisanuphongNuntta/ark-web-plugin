import { Response, NextFunction } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { AuthRequest, UserRole } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import { ServerAdminService } from '../services/serverAdmin.service.js';
import { decrypt } from '../utils/encryption.js';
import archiver from 'archiver';

const execAsync = promisify(exec);

export class AdminController {
  // Dashboard stats
  getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const [
        totalUsers,
        totalOrders,
        totalRevenue,
        pendingOrders,
        recentOrders,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.order.count(),
        prisma.order.aggregate({
          _sum: { totalPrice: true },
          where: { status: { not: 'refunded' } },
        }),
        prisma.order.count({ where: { status: 'pending' } }),
        prisma.order.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { discordUsername: true } },
            product: { select: { name: true } },
          },
        }),
      ]);

      res.json({
        stats: {
          totalUsers,
          totalOrders,
          totalRevenue: totalRevenue._sum.totalPrice || 0,
          pendingOrders,
        },
        recentOrders,
      });
    } catch (error) {
      next(error);
    }
  };

  // Users management - scoped by server for server_admin
  getUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const result = await ServerAdminService.getAccessibleUsers(
        req.user!.role,
        req.user!.apiKeyServerId || null,
        { page, limit, search }
      );

      res.json({
        users: result.users.map(u => ({
          ...u,
          pointsBalance: Number(u.pointsBalance),
          totalSpent: Number(u.totalSpent),
        })),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;

      // Check access for server admin
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        targetUserId
      );

      if (!canAccess) {
        throw new AppError('You do not have permission to view this user', 403);
      }

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { product: true } },
          pointTransactions: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      });

      if (!user) throw new AppError('User not found', 404);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { isBanned, isAdmin } = req.body;
      const targetUserId = req.params.id;

      // Check access for server admin
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        targetUserId
      );

      if (!canAccess) {
        throw new AppError('You do not have permission to manage this user', 403);
      }

      // Server admins cannot change isAdmin status
      if (req.user!.role === UserRole.SERVER_ADMIN && isAdmin !== undefined) {
        throw new AppError('Server Admins cannot modify admin status', 403);
      }

      const user = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          ...(typeof isBanned === 'boolean' && { isBanned }),
          // Only Root can change isAdmin
          ...(req.user!.role === UserRole.ROOT && typeof isAdmin === 'boolean' && { isAdmin }),
        },
      });

      res.json({ user });
    } catch (error) {
      next(error);
    }
  };

  adjustPoints = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { amount, reason } = req.body;
      const targetUserId = req.params.id;

      if (typeof amount !== 'number') {
        throw new AppError('Amount is required', 400);
      }

      // Check access for server admin
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        targetUserId
      );

      if (!canAccess) {
        throw new AppError('You do not have permission to adjust points for this user', 403);
      }

      const user = await prisma.user.update({
        where: { id: targetUserId },
        data: { pointsBalance: { increment: amount } },
      });

      await prisma.pointTransaction.create({
        data: {
          userId: user.id,
          amount,
          balanceAfter: user.pointsBalance,
          type: 'admin',
          description: reason || `Admin adjustment by ${req.user!.discordId}`,
        },
      });

      res.json({
        success: true,
        newBalance: Number(user.pointsBalance),
      });
    } catch (error) {
      next(error);
    }
  };

  // Products management
  createProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const product = await prisma.product.create({
        data: req.body,
      });
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const product = await prisma.product.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
      });
      res.json({ product });
    } catch (error) {
      next(error);
    }
  };

  deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await prisma.product.update({
        where: { id: parseInt(req.params.id) },
        data: { isActive: false },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // Categories management
  createCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const category = await prisma.category.create({
        data: req.body,
      });
      res.status(201).json({ category });
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const category = await prisma.category.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
      });
      res.json({ category });
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await prisma.category.update({
        where: { id: parseInt(req.params.id) },
        data: { isActive: false },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // Orders management
  getAllOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.status = status;

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            user: { select: { discordUsername: true, steamId: true } },
            product: { select: { name: true } },
            server: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      res.json({
        orders,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  };

  refundOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: { user: true },
      });

      if (!order) throw new AppError('Order not found', 404);
      if (order.status === 'refunded') throw new AppError('Order already refunded', 400);

      // Refund points
      const user = await prisma.user.update({
        where: { id: order.userId },
        data: { pointsBalance: { increment: order.totalPrice } },
      });

      // Update order status
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'refunded' },
      });

      // Record transaction
      await prisma.pointTransaction.create({
        data: {
          userId: order.userId,
          amount: order.totalPrice,
          balanceAfter: user.pointsBalance,
          type: 'refund',
          description: `Refund for order ${order.id}`,
          referenceId: order.id,
        },
      });

      res.json({ success: true, refundedAmount: order.totalPrice });
    } catch (error) {
      next(error);
    }
  };

  // Plugin compilation
  compilePlugin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Get the ark-plugin directory path (relative to backend)
      const pluginDir = path.resolve(process.cwd(), '..', 'ark-plugin');
      const buildDir = path.join(pluginDir, 'build');

      // Check if plugin directory exists
      if (!fs.existsSync(pluginDir)) {
        throw new AppError('Plugin directory not found', 404);
      }

      // Check if CMakeLists.txt exists
      if (!fs.existsSync(path.join(pluginDir, 'CMakeLists.txt'))) {
        throw new AppError('CMakeLists.txt not found', 404);
      }

      // Create build directory if not exists
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }

      const logs: string[] = [];
      const startTime = Date.now();

      // Step 1: Run CMake configure
      logs.push('=== CMake Configure ===');
      try {
        const { stdout: cmakeOut, stderr: cmakeErr } = await execAsync(
          'cmake ..',
          { cwd: buildDir, timeout: 60000 }
        );
        if (cmakeOut) logs.push(cmakeOut);
        if (cmakeErr) logs.push(cmakeErr);
      } catch (cmakeError: any) {
        logs.push(`CMake Error: ${cmakeError.message}`);
        if (cmakeError.stdout) logs.push(cmakeError.stdout);
        if (cmakeError.stderr) logs.push(cmakeError.stderr);
        throw new AppError('CMake configure failed', 500);
      }

      // Step 2: Run CMake build
      logs.push('\n=== CMake Build ===');
      try {
        const { stdout: buildOut, stderr: buildErr } = await execAsync(
          'cmake --build . --config Release',
          { cwd: buildDir, timeout: 300000 } // 5 minutes timeout
        );
        if (buildOut) logs.push(buildOut);
        if (buildErr) logs.push(buildErr);
      } catch (buildError: any) {
        logs.push(`Build Error: ${buildError.message}`);
        if (buildError.stdout) logs.push(buildError.stdout);
        if (buildError.stderr) logs.push(buildError.stderr);
        throw new AppError('Build failed', 500);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logs.push(`\n=== Build completed in ${duration}s ===`);

      // Check if DLL was created
      const dllPath = path.join(buildDir, 'bin', 'Release', 'HeartShop.dll');
      const altDllPath = path.join(buildDir, 'bin', 'HeartShop.dll');
      const dllExists = fs.existsSync(dllPath) || fs.existsSync(altDllPath);

      res.json({
        success: true,
        message: 'Plugin compiled successfully',
        duration: `${duration}s`,
        dllExists,
        dllPath: dllExists ? (fs.existsSync(dllPath) ? dllPath : altDllPath) : null,
        logs: logs.join('\n'),
      });
    } catch (error) {
      next(error);
    }
  };

  // Get plugin status
  getPluginStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pluginDir = path.resolve(process.cwd(), '..', 'ark-plugin');
      const buildDir = path.join(pluginDir, 'build');

      // Check various paths for the DLL
      const possiblePaths = [
        path.join(buildDir, 'bin', 'Release', 'HeartShop.dll'),
        path.join(buildDir, 'bin', 'HeartShop.dll'),
        path.join(buildDir, 'Release', 'HeartShop.dll'),
        path.join(buildDir, 'HeartShop.dll'),
      ];

      let dllPath: string | null = null;
      let dllStats: fs.Stats | null = null;

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dllPath = p;
          dllStats = fs.statSync(p);
          break;
        }
      }

      const pluginExists = fs.existsSync(pluginDir);
      const cmakeExists = fs.existsSync(path.join(pluginDir, 'CMakeLists.txt'));
      const buildDirExists = fs.existsSync(buildDir);

      res.json({
        pluginDir: pluginExists,
        cmakeExists,
        buildDirExists,
        dllExists: !!dllPath,
        dllPath,
        lastModified: dllStats ? dllStats.mtime : null,
        fileSize: dllStats ? `${(dllStats.size / 1024).toFixed(2)} KB` : null,
      });
    } catch (error) {
      next(error);
    }
  };

  // API Keys management - scoped by server for server_admin
  getAllApiKeys = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const result = await ServerAdminService.getAccessibleApiKeys(
        req.user!.role,
        req.user!.apiKeyServerId || null,
        { page, limit, search }
      );

      // Mask API keys for security (show only first/last 4 chars)
      const maskedUsers = result.users.map(u => ({
        ...u,
        apiKey: u.apiKey ? `${u.apiKey.slice(0, 4)}...${u.apiKey.slice(-4)}` : null,
      }));

      res.json({
        apiKeys: maskedUsers,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getApiKeyByUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
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
      });

      if (!user) throw new AppError('User not found', 404);
      if (!user.apiKey) throw new AppError('User has no API key', 404);

      res.json({
        apiKey: {
          ...user,
          apiKey: `${user.apiKey.slice(0, 4)}...${user.apiKey.slice(-4)}`,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  resetApiKeyIp = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
      });

      if (!user) throw new AppError('User not found', 404);
      if (!user.apiKey) throw new AppError('User has no API key', 404);

      await prisma.user.update({
        where: { id: req.params.userId },
        data: {
          apiKeyIp: null,
          apiKeyServerId: null,
          apiKeyServerName: null,
          apiKeyServerMap: null,
          apiKeyServerPort: null,
        },
      });

      res.json({
        success: true,
        message: 'API key IP has been reset. User can now connect from a new IP.',
      });
    } catch (error) {
      next(error);
    }
  };

  revokeApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
      });

      if (!user) throw new AppError('User not found', 404);
      if (!user.apiKey) throw new AppError('User has no API key', 404);

      await prisma.user.update({
        where: { id: req.params.userId },
        data: {
          apiKey: null,
          apiKeyIp: null,
          apiKeyCreatedAt: null,
          apiKeyServerId: null,
          apiKeyServerName: null,
          apiKeyServerMap: null,
          apiKeyServerPort: null,
          apiKeyLastUsed: null,
        },
      });

      res.json({
        success: true,
        message: 'API key has been revoked.',
      });
    } catch (error) {
      next(error);
    }
  };

  // Server Management
  getServers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const servers = await prisma.server.findMany({
        orderBy: { id: 'asc' },
      });

      res.json({ servers });
    } catch (error) {
      next(error);
    }
  };

  createServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, map, apiKey, chatTag, chatColor, chatIcon } = req.body;

      if (!name || !map) {
        throw new AppError('Name and map are required', 400);
      }

      // Generate API key if not provided
      const serverApiKey = apiKey || crypto.randomBytes(32).toString('base64url');

      const server = await prisma.server.create({
        data: {
          name,
          map,
          apiKey: serverApiKey,
          isActive: true,
          chatTag: chatTag || null,
          chatColor: chatColor || null,
          chatIcon: chatIcon || null,
        },
      });

      res.status(201).json({ server });
    } catch (error) {
      next(error);
    }
  };

  updateServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, map, isActive, chatTag, chatColor, chatIcon } = req.body;

      const server = await prisma.server.update({
        where: { id: parseInt(id) },
        data: {
          ...(name !== undefined && { name }),
          ...(map !== undefined && { map }),
          ...(isActive !== undefined && { isActive }),
          ...(chatTag !== undefined && { chatTag: chatTag || null }),
          ...(chatColor !== undefined && { chatColor: chatColor || null }),
          ...(chatIcon !== undefined && { chatIcon: chatIcon || null }),
        },
      });

      res.json({ server });
    } catch (error) {
      next(error);
    }
  };

  deleteServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await prisma.server.delete({
        where: { id: parseInt(id) },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  regenerateServerApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const newApiKey = crypto.randomBytes(32).toString('base64url');

      const server = await prisma.server.update({
        where: { id: parseInt(id) },
        data: { apiKey: newApiKey },
      });

      res.json({ server });
    } catch (error) {
      next(error);
    }
  };

  // ChatRank Management
  getChatRanks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const serverId = req.query.serverId ? parseInt(req.query.serverId as string) : undefined;

      const where: any = {};
      if (serverId !== undefined) {
        where.serverId = serverId === 0 ? null : serverId;
      }

      const ranks = await prisma.chatRank.findMany({
        where,
        include: {
          server: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      });

      res.json({ ranks });
    } catch (error) {
      next(error);
    }
  };

  createChatRank = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, groupKey, color, icon, priority, serverId, isActive } = req.body;

      if (!name || !groupKey || !color) {
        throw new AppError('Name, groupKey, and color are required', 400);
      }

      const rank = await prisma.chatRank.create({
        data: {
          name,
          groupKey,
          color,
          icon: icon || null,
          priority: priority || 0,
          serverId: serverId ? parseInt(serverId) : null,
          isActive: isActive !== false,
        },
        include: {
          server: { select: { id: true, name: true } },
        },
      });

      res.status(201).json({ rank });
    } catch (error) {
      next(error);
    }
  };

  updateChatRank = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, groupKey, color, icon, priority, serverId, isActive } = req.body;

      const rank = await prisma.chatRank.update({
        where: { id: parseInt(id) },
        data: {
          ...(name !== undefined && { name }),
          ...(groupKey !== undefined && { groupKey }),
          ...(color !== undefined && { color }),
          ...(icon !== undefined && { icon: icon || null }),
          ...(priority !== undefined && { priority }),
          ...(serverId !== undefined && { serverId: serverId ? parseInt(serverId) : null }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          server: { select: { id: true, name: true } },
        },
      });

      res.json({ rank });
    } catch (error) {
      next(error);
    }
  };

  deleteChatRank = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await prisma.chatRank.delete({
        where: { id: parseInt(id) },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // Role management (Root only)
  updateUserRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body;
      const targetUserId = req.params.id;

      // Validate role
      const validRoles = ['user', 'admin', 'server_admin', 'root'];
      if (!validRoles.includes(role)) {
        throw new AppError('Invalid role. Valid roles: user, admin, server_admin, root', 400);
      }

      // Prevent changing own role
      if (targetUserId === req.user!.id) {
        throw new AppError('Cannot change your own role', 400);
      }

      // Check target user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      const user = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role,
          // Keep isAdmin in sync for backward compatibility
          isAdmin: role !== 'user',
        },
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          discordUsername: user.discordUsername,
          role: user.role,
          isAdmin: user.isAdmin,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Download Plugin Package for a specific user
  downloadPluginForUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const serverId = parseInt(req.query.serverId as string) || 1;

      // Look up the user and their API key
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          discordUsername: true,
          apiKey: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (!user.apiKey) {
        throw new AppError('User does not have an API key. Generate one first.', 400);
      }

      // Decrypt the API key for embedding in config
      const plainApiKey = decrypt(user.apiKey);

      // Verify server exists
      const server = await prisma.server.findUnique({
        where: { id: serverId },
      });

      if (!server) {
        throw new AppError(`Server ID ${serverId} not found`, 404);
      }

      // Check DLL exists
      const pluginDir = path.resolve(process.cwd(), '..', 'ark-plugin');
      const possibleDllPaths = [
        path.join(pluginDir, 'build', 'bin', 'Release', 'HeartShop.dll'),
        path.join(pluginDir, 'build', 'bin', 'HeartShop.dll'),
      ];

      let dllPath: string | null = null;
      for (const p of possibleDllPaths) {
        if (fs.existsSync(p)) {
          dllPath = p;
          break;
        }
      }

      if (!dllPath) {
        throw new AppError('HeartShop.dll not found. Please compile the plugin first.', 404);
      }

      // Read PluginInfo.json
      const pluginInfoPath = path.join(pluginDir, 'PluginInfo.json');
      let pluginInfo = '{}';
      if (fs.existsSync(pluginInfoPath)) {
        pluginInfo = fs.readFileSync(pluginInfoPath, 'utf-8');
      }

      // Generate config.json with user's API key
      const configJson = {
        HeartShop: {
          ApiKey: plainApiKey,
          ServerId: serverId,
          PollInterval: 30,
          StatsInterval: 300,
          HeartbeatInterval: 60,
          Messages: {
            Prefix: '[HeartShop]',
            ClaimSuccess: 'You received: {item} x{quantity}',
            ClaimEmpty: 'You have no pending items to claim',
            ClaimError: 'Failed to claim items. Please try again later',
            PointsBalance: 'Your balance: {points} Points',
            NotLinked: 'Your account is not linked. Visit our website to link your Steam ID',
            ShopUrl: 'Visit {url} to purchase items',
            ProtectionGranted: 'Welcome! You have been granted {days} days of new player protection!',
            ProtectionActive: 'You still have new player protection active!',
            ProtectionStatus: 'Protection Status: {status} - Remaining: {time}',
            ProtectionExpired: 'Your protection has expired',
            ProtectionNone: 'You do not have active protection',
            DamageBlocked: 'Damage blocked by protection!',
            SellSuccess: 'Successfully listed {dino} for {price} points!',
            SellUsage: 'Usage: /sell <price> - Look at your tamed dino to list it for sale',
            SellError: 'Failed to create listing. Please try again.',
            SellNotOwned: 'You can only sell dinos that belong to your tribe.',
            SellNoDino: 'You must be looking at or riding a tamed dino to sell it.',
            ClaimDinoEmpty: 'You have no pending dino purchases to claim.',
            ClaimDinoSuccess: 'Received: {dino} (Level {level})',
            ClaimDinoError: 'Error claiming dinos. Please try again.',
            MarketUrl: 'Visit {url} to browse and buy dinos!',
          },
          Protection: {
            Enabled: true,
            ProtectionDays: 7,
            NotifyOnDamageBlocked: false,
          },
          PointsReward: {
            Enabled: true,
            PlaytimeMinutes: 60,
            PlaytimePoints: 10,
            DinoKillPoints: 1,
            HarvestPer1000Points: 1,
          },
        },
      };

      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });

      const sanitizedName = (user.discordUsername || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="HeartShop_${sanitizedName}_Server${serverId}.zip"`);

      archive.pipe(res);

      // Add files to ZIP
      archive.file(dllPath, { name: 'HeartShop/HeartShop.dll' });
      archive.append(JSON.stringify(configJson, null, 2), { name: 'HeartShop/config.json' });
      archive.append(pluginInfo, { name: 'HeartShop/PluginInfo.json' });

      await archive.finalize();
    } catch (error) {
      next(error);
    }
  };
}
