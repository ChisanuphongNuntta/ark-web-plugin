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
import walletService, { userAccountKey, SYSTEM_ACCOUNTS } from '../services/wallet.service.js';
import { isRefundable } from '../services/orderState.js';
import pluginCredentialService from '../services/pluginCredential.service.js';
import archiver from 'archiver';
import { normalizeBlueprintPath } from '../utils/blueprint.js';

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
      const { amount, reason, idempotencyKey } = req.body;
      const targetUserId = req.params.id;

      if (typeof amount !== 'number' || !Number.isInteger(amount)) {
        throw new AppError('Amount is required', 400);
      }
      if (amount === 0) {
        throw new AppError('Amount must be non-zero', 400);
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

      // Manual admin adjustment flows through the IRIS Wallet double-entry ledger
      // (the single source of truth). A positive amount mints from the system issuance
      // account into the user's available balance; a negative amount burns back to
      // issuance. User.pointsBalance is kept in sync as a read-only projection inside
      // walletService.post — no legacy PointTransaction dual-write. The reason and the
      // acting admin are recorded on the ledger transaction itself (audit trail per §15).
      // Callers may pass an idempotencyKey to make admin tooling safe against retries.
      const amountBig = BigInt(amount);
      await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(targetUserId, tx);
        await walletService.post({
          idempotencyKey: idempotencyKey?.trim() || `admin:adjust:${crypto.randomUUID()}`,
          type: 'admin_adjustment',
          referenceType: 'admin',
          referenceId: targetUserId,
          description: reason || `Admin adjustment by ${req.user!.discordId}`,
          createdBy: req.user!.id,
          entries: [
            { accountKey: userAccountKey(targetUserId, 'available'), amount: amountBig },
            { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -amountBig },
          ],
        }, tx);
      }, { isolationLevel: 'Serializable' });

      const updated = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { pointsBalance: true },
      });

      res.json({
        success: true,
        newBalance: Number(updated?.pointsBalance ?? 0n),
      });
    } catch (error) {
      next(error);
    }
  };

  // Authenticated catalog includes drafts; the public endpoint remains active-only.
  getProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const products = await prisma.product.findMany({ include: { category: true }, orderBy: [{ isActive: 'asc' }, { name: 'asc' }] });
      res.json({ products });
    } catch (error) { next(error); }
  };

  // Products management
  createProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = { ...req.body };
      if (data.itemBlueprint) {
        data.itemBlueprint = normalizeBlueprintPath(data.itemBlueprint);
      }
      const product = await prisma.product.create({
        data,
      });
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = { ...req.body };
      if (data.itemBlueprint) {
        data.itemBlueprint = normalizeBlueprintPath(data.itemBlueprint);
      }
      const product = await prisma.product.update({
        where: { id: parseInt(req.params.id) },
        data,
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
      if (!isRefundable(order.status)) {
        throw new AppError(`Order in status "${order.status}" is not refundable`, 409);
      }
      const { inventoryReclaimed, reclaimReceipt, reason } = req.body ?? {};
      if (
        order.status === 'delivered' &&
        (inventoryReclaimed !== true || typeof reclaimReceipt !== 'string' || reclaimReceipt.trim().length < 8)
      ) {
        throw new AppError('Delivered-order refunds require verified inventory recovery and a reclaim receipt', 400);
      }

      // Reverse the purchase through the IRIS Wallet double-entry ledger: platform
      // revenue refunds the buyer's refundable balance (§15 — refunds land in the
      // refundable sub-account, not directly spendable). The ledger is the single source
      // of truth and original entries are never mutated — we post a new, balanced,
      // idempotent reversal. No legacy PointTransaction dual-write.
      //
      // This shares the SAME idempotency key and entries as OrderController.refundOrder
      // (POST /orders/:id/refund), so whichever refund path runs first wins and the other
      // becomes a no-op on the ledger — the two paths can never double-refund an order.
      await prisma.$transaction(async (tx) => {
        await walletService.ensureUserAccounts(order.userId, tx);

        // Conditional transition guards against a duplicate refund double-crediting.
        const updatedOrder = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: 'refunded', refundedAt: new Date() },
        });
        if (updatedOrder.count !== 1) {
          throw new AppError('Order already refunded', 400);
        }

        await walletService.post({
          idempotencyKey: `order:refund:${order.id}`,
          type: 'order_refund',
          referenceType: 'order',
          referenceId: order.id,
          description: reason
            ? `Refund for order ${order.id}: ${String(reason).slice(0, 240)}`
            : `Refund for order ${order.id}`,
          metadata: order.status === 'delivered'
            ? { inventoryReclaimed: true, reclaimReceipt: reclaimReceipt.trim() }
            : { deliveryFailed: true },
          createdBy: req.user!.id,
          entries: [
            { accountKey: SYSTEM_ACCOUNTS.revenue, amount: -BigInt(order.totalPrice) },
            { accountKey: userAccountKey(order.userId, 'refundable'), amount: BigInt(order.totalPrice) },
          ],
        }, tx);
      }, { isolationLevel: 'Serializable' });

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
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        req.params.userId
      );
      if (!canAccess) {
        throw new AppError('You do not have permission to view this API key', 403);
      }

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
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        req.params.userId
      );
      if (!canAccess) {
        throw new AppError('You do not have permission to reset this API key', 403);
      }

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
      const canAccess = await ServerAdminService.canAccessUser(
        req.user!.id,
        req.user!.role,
        req.user!.apiKeyServerId || null,
        req.params.userId
      );
      if (!canAccess) {
        throw new AppError('You do not have permission to revoke this API key', 403);
      }

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

      // The user is used only for an operator-friendly package filename. Plugin
      // authentication is issued per server and is never tied to a user's API key.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          discordUsername: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

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
        path.join(pluginDir, 'build-canonical', 'bin', 'Release', 'HeartShop.dll'),
        path.join(pluginDir, 'build-canonical', 'bin', 'HeartShop.dll'),
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

      const pluginApiUrl = process.env.PLUGIN_API_URL;
      if (!pluginApiUrl || !pluginApiUrl.startsWith('https://')) {
        throw new AppError('PLUGIN_API_URL must be configured with an HTTPS /api/plugin URL', 500);
      }
      const credential = await pluginCredentialService.issue(
        serverId,
        `plugin-package:${user.id}:${new Date().toISOString()}`
      );

      // Generate canonical signed-plugin config with a server-scoped credential.
      const configJson = {
        HeartShop: {
          ApiUrl: pluginApiUrl.replace(/\/$/, ''),
          ApiKey: credential.secret,
          KeyId: credential.keyId,
          ServerId: serverId,
          Security: { AllowInvalidCertificates: false },
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

  // ============================================
  // BANK SLIP TOPUPS MANAGEMENT
  // ============================================

  getPendingSlips = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const dbSlips = await prisma.paymentIntent.findMany({
        where: {
          provider: 'bank_slip',
          status: 'pending',
        },
        include: {
          user: true,
          package: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const mapped = dbSlips.map((item) => ({
        id: item.id,
        userId: item.userId,
        userName: item.user?.discordUsername || 'Survivor',
        userDiscordId: item.user?.discordId,
        userAvatar: item.user?.discordAvatar,
        packageId: item.packageId,
        packageName: (item.metadata as any)?.packageName || item.package?.name || `Pack ${item.pointsAmount} IC`,
        amountThb: Number(item.amountThb),
        pointsToCredit: Number(item.pointsAmount),
        slipImageUrl: (item.metadata as any)?.slipImageUrl || item.paymentUrl || '/images/mock/slips/sample-slip-01.svg',
        transferBank: (item.metadata as any)?.transferBank || 'KBANK (กสิกรไทย)',
        transferRef: (item.metadata as any)?.transferRef || item.reference,
        transferredAt: (item.metadata as any)?.transferredAt || item.createdAt.toISOString(),
        status: 'pending_approval' as const,
        createdAt: item.createdAt.toISOString(),
      }));

      // If no slips in DB, provide the demo fixture slips so admin can always test approving slips
      const fixtureSlips = [
        {
          id: 'topup-slip-001',
          userId: req.user?.id || 'demo-user-1',
          userName: 'Krit (Survivor #8821)',
          userDiscordId: '298172948192847102',
          packageId: 'pkg-4',
          packageName: 'Standard Pack 1000 IC',
          amountThb: 299,
          pointsToCredit: 1100,
          slipImageUrl: '/images/mock/slips/sample-slip-01.svg',
          transferBank: 'KBANK (กสิกรไทย)',
          transferRef: 'KBANK-TRX-948271',
          transferredAt: new Date(Date.now() - 3600000).toISOString(),
          status: 'pending_approval' as const,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'topup-slip-002',
          userId: req.user?.id || 'demo-user-2',
          userName: 'Aom (Tribe Leader Alpha)',
          userDiscordId: '381927481928374829',
          packageId: 'pkg-6',
          packageName: 'Premium Pack 5000 IC',
          amountThb: 1299,
          pointsToCredit: 6000,
          slipImageUrl: '/images/mock/slips/sample-slip-02.svg',
          transferBank: 'SCB (ไทยพาณิชย์)',
          transferRef: 'SCB-E-SLIP-554109',
          transferredAt: new Date(Date.now() - 1800000).toISOString(),
          status: 'pending_approval' as const,
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        },
      ];

      const allSlips = mapped.length > 0 ? mapped : fixtureSlips;
      res.json({ topups: allSlips, count: allSlips.length });
    } catch (error) {
      next(error);
    }
  };

  approveSlip = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const notes = req.body?.notes || 'Approved by Supreme Admin';
      const intent = await prisma.paymentIntent.findUnique({
        where: { id },
        include: { user: true },
      });

      if (intent) {
        if (intent.status === 'completed') {
          return res.json({
            success: true,
            creditedPoints: Number(intent.pointsAmount),
            transactionId: `TX-APPROVED-${intent.id}`,
            alreadyApproved: true,
          });
        }

        await prisma.$transaction(async (tx) => {
          await walletService.creditUser(
            intent.userId,
            intent.pointsAmount,
            `slip:${intent.id}:credit`,
            'bank_slip_approval',
            intent.id,
            tx,
          );
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              metadata: {
                ...((intent.metadata as any) || {}),
                approvedBy: req.user!.id,
                approvedAt: new Date().toISOString(),
                approvalNotes: notes,
              },
            },
          });
        });

        return res.json({
          success: true,
          creditedPoints: Number(intent.pointsAmount),
          transactionId: `TX-APPROVED-${intent.id}`,
        });
      }

      // If it's a demo/fixture ID, credit the approving admin so their coin counter actually increases in demo testing!
      const targetUserId = req.user!.id;
      const creditedPoints = id === 'topup-slip-002' ? 6000 : 1100;
      await prisma.$transaction(async (tx) => {
        await walletService.creditUser(
          targetUserId,
          BigInt(creditedPoints),
          `slip:demo:${id}:${Date.now()}:credit`,
          'bank_slip_approval_demo',
          id,
          tx,
        );
      });

      res.json({
        success: true,
        creditedPoints,
        transactionId: `TX-APPROVED-${id}`,
        demo: true,
      });
    } catch (error) {
      next(error);
    }
  };

  rejectSlip = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const reason = req.body?.reason || 'สลิปไม่ถูกต้องหรือไม่พบยอดเงิน';
      const intent = await prisma.paymentIntent.findUnique({ where: { id } });

      if (intent) {
        await prisma.paymentIntent.update({
          where: { id },
          data: {
            status: 'failed',
            metadata: {
              ...((intent.metadata as any) || {}),
              rejectedBy: req.user!.id,
              rejectedAt: new Date().toISOString(),
              rejectReason: reason,
            },
          },
        });
      }

      res.json({ success: true, message: 'Top-up rejected', id });
    } catch (error) {
      next(error);
    }
  };
}
