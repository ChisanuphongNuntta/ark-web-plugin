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
import walletService, {
  userAccountKey,
  SYSTEM_ACCOUNTS,
  walletRequestHashFor,
  type PostLedgerTransactionInput,
} from '../services/wallet.service.js';
import { isRefundable } from '../services/orderState.js';
import { afterCommit } from '../realtime/afterCommit.js';
import { emitCatalogUpdated, emitOrderUpdated } from '../realtime/emit.js';
import { disconnectUserSockets, revokeAdminRoom } from '../realtime/sessionControl.js';
import pluginCredentialService from '../services/pluginCredential.service.js';
import archiver from 'archiver';
import { normalizeBlueprintPath } from '../utils/blueprint.js';
import { z } from 'zod';
import auditService from '../services/audit.service.js';
import { HEARTBEAT_ONLINE_WINDOW_MS, isServerOnline } from '../utils/serverStatus.js';
import { bangkokStartOfDay } from '../services/season.service.js';
import { isServerDeliverable } from '../services/serverDirectory.service.js';
import {
  paginateQuery,
  parsePagination,
  parseSearch,
  wantsPagination,
} from '../utils/pagination.js';

const execAsync = promisify(exec);

// Demo slip fixtures (and crediting the approving admin for a fixture id) are a local-demo
// aid only. They are OFF unless explicitly enabled outside production; otherwise an unknown
// slip id is a 404 and can never mint points.
export function slipDemoFixturesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_ADMIN_DEMO_FIXTURES === 'true' && env.NODE_ENV !== 'production';
}

// Orders that count as revenue for the dashboard "today" figure.
const REVENUE_ORDER_STATUSES = ['paid', 'queued', 'delivering', 'delivered', 'failed'];

const optionalNullableString = (max: number) => z.string().trim().max(max).nullable().optional();

// Admin server write schema (UI redesign 2026-10 fields + legacy fields). drainMode and
// credentials are intentionally NOT writable here; apiKey only on create.
export const serverWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    map: z.string().trim().min(1).max(120).optional(),
    apiKey: z.string().trim().min(16).max(256).optional(),
    isActive: z.boolean().optional(),
    chatTag: optionalNullableString(32),
    chatColor: optionalNullableString(32),
    chatIcon: optionalNullableString(32),
    clusterId: z.string().trim().max(64).nullable().optional(),
    displayName: optionalNullableString(120),
    gameMode: z.enum(['PVE', 'PVE_MOD', 'PVPVE']).optional(),
    connectHost: z
      .string()
      .trim()
      .max(253)
      .regex(/^[A-Za-z0-9.-]*$/, 'hostname or IPv4 only')
      .nullable()
      .optional(),
    connectPort: z.number().int().min(1).max(65535).nullable().optional(),
    rates: optionalNullableString(32),
    isModded: z.boolean().optional(),
    isListed: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    sortOrder: z.number().int().min(-100000).max(100000).optional(),
    imageUrl: z
      .string()
      .trim()
      .max(1024)
      .refine((v) => v === '' || (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\//i.test(v), 'https:// URL or /path')
      .nullable()
      .optional(),
  })
  .strict();

export function parseServerWrite(body: unknown): Record<string, unknown> {
  const parsed = serverWriteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new AppError(`Invalid server: ${message}`, 400);
  }
  const data: Record<string, unknown> = { ...parsed.data };
  // Empty strings clear nullable text columns.
  for (const key of ['chatTag', 'chatColor', 'chatIcon', 'displayName', 'connectHost', 'rates', 'imageUrl', 'clusterId']) {
    if (data[key] === '') data[key] = null;
  }
  return data;
}

// Admin server projection: all stored columns (root-only endpoint, existing behaviour) plus
// derived online/deliverable, cluster ref and active-credential count. Credential secrets are
// never selected.
function toAdminServer(server: any, now: Date = new Date()) {
  const { credentials, ...rest } = server;
  const activeCredentialCount = Array.isArray(credentials) ? credentials.length : 0;
  return {
    ...rest,
    online: isServerOnline(server.lastHeartbeat ?? null, now),
    deliverable: isServerDeliverable({ isActive: server.isActive, drainMode: server.drainMode, credentials }),
    activeCredentialCount,
  };
}

/** Strict :id param for server routes: '12' -> 12; 'abc' / '2abc' / '0' -> 400 (never NaN into Prisma -> 500). */
function parseServerIdParam(raw: unknown): number {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const id = /^\d{1,9}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid server id', 400);
  return id;
}

const ADMIN_SERVER_INCLUDE = {
  cluster: { select: { id: true, key: true, name: true } },
  credentials: { where: { status: 'active' }, select: { id: true } },
} as const;

// ---------------- Admin list filters (Admin pagination contract) ----------------

const SERVER_GAME_MODES = ['PVE', 'PVE_MOD', 'PVPVE'] as const;
export const ADMIN_SERVER_GAME_MODE_FILTERS = [...SERVER_GAME_MODES, 'NONE'] as const;
export const ADMIN_SERVER_STATUS_FILTERS = ['active', 'inactive', 'online', 'offline'] as const;
type ServerGameModeFilter = (typeof ADMIN_SERVER_GAME_MODE_FILTERS)[number];

// Server.gameMode is a non-null enum, so the NONE bucket can never match a row. It is kept so
// the frontend tab set is stable; Prisma treats `in: []` as "match nothing".
const NONE_MATCH = { id: { in: [] as number[] } };

// Cluster order first (unassigned servers sort last: Postgres puts NULLs last on ASC), then the
// server's own order, then id as the unique tiebreaker so pages never repeat/skip rows.
export const ADMIN_SERVER_ORDER = [
  { cluster: { sortOrder: 'asc' } },
  { cluster: { name: 'asc' } },
  { sortOrder: 'asc' },
  { id: 'asc' },
] as any[];

export const PRODUCT_TYPE_FILTERS = ['item', 'dino', 'engram', 'kit', 'bundle', 'command', 'entitlement'] as const;

export const ADMIN_PRODUCT_ORDER = [{ isActive: 'asc' }, { name: 'asc' }, { id: 'asc' }] as any[];

/** '' / 'all' (any case) mean "no filter"; anything else must be in `allowed` or it is a 400. */
function parseEnumFilter<T extends string>(value: unknown, allowed: readonly T[], name: string, upper = false): T | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') throw new AppError(`Invalid ${name}`, 400);
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'all') return undefined;
  const normalized = upper ? trimmed.toUpperCase() : trimmed.toLowerCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new AppError(`Invalid ${name}: expected one of ${allowed.join(', ')}`, 400);
  }
  return normalized as T;
}

function parseBooleanFilter(value: unknown, name: string): boolean | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim().toLowerCase();
  if (text === '' || text === 'all') return undefined;
  if (text === 'true') return true;
  if (text === 'false') return false;
  throw new AppError(`Invalid ${name}: expected true or false`, 400);
}

function parseIntFilter(value: unknown, name: string): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '' || text.toLowerCase() === 'all') return undefined;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new AppError(`Invalid ${name}`, 400);
  return Number(text);
}

/**
 * Builds the server WHERE for every filter except gameMode (the per-mode `counts` use this
 * same base so tab badges reflect the search/cluster/status the admin is looking at).
 */
export function buildAdminServerWhere(query: Record<string, unknown>, now: Date = new Date()) {
  const and: any[] = [];

  const search = parseSearch(query.search);
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { map: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { connectHost: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const rawCluster = Array.isArray(query.clusterId) ? query.clusterId[0] : query.clusterId;
  if (typeof rawCluster === 'string' && rawCluster.trim() !== '' && rawCluster.trim().toLowerCase() !== 'all') {
    const clusterId = rawCluster.trim();
    if (clusterId.length > 64) throw new AppError('Invalid clusterId', 400);
    and.push({ clusterId: clusterId.toLowerCase() === 'none' ? null : clusterId });
  }

  const status = parseEnumFilter(query.status, ADMIN_SERVER_STATUS_FILTERS, 'status');
  const onlineCutoff = new Date(now.getTime() - HEARTBEAT_ONLINE_WINDOW_MS);
  if (status === 'active') and.push({ isActive: true });
  if (status === 'inactive') and.push({ isActive: false });
  // Same rule as isServerOnline(): online <=> lastHeartbeat within the window.
  if (status === 'online') and.push({ lastHeartbeat: { gte: onlineCutoff } });
  if (status === 'offline') and.push({ OR: [{ lastHeartbeat: null }, { lastHeartbeat: { lt: onlineCutoff } }] });

  const gameMode = parseEnumFilter<ServerGameModeFilter>(query.gameMode, ADMIN_SERVER_GAME_MODE_FILTERS, 'gameMode', true);

  return { where: and.length > 0 ? { AND: and } : {}, gameMode };
}

export function buildAdminProductWhere(query: Record<string, unknown>) {
  const and: any[] = [];
  const search = parseSearch(query.search);
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { externalKey: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  const rawCategory = Array.isArray(query.categoryId) ? query.categoryId[0] : query.categoryId;
  if (typeof rawCategory === 'string' && rawCategory.trim().toLowerCase() === 'none') {
    and.push({ categoryId: null });
  } else {
    const categoryId = parseIntFilter(query.categoryId, 'categoryId');
    if (categoryId !== undefined) and.push({ categoryId });
  }
  const productType = parseEnumFilter(query.productType, PRODUCT_TYPE_FILTERS, 'productType');
  if (productType) and.push({ productType });
  const isActive = parseBooleanFilter(query.isActive, 'isActive');
  if (isActive !== undefined) and.push({ isActive });
  return and.length > 0 ? { AND: and } : {};
}

export function toGameModeCounts(grouped: Array<{ gameMode: string | null; _count?: { _all?: number } | number }> | undefined) {
  const counts = { all: 0, PVE: 0, PVE_MOD: 0, PVPVE: 0, NONE: 0 };
  for (const row of grouped ?? []) {
    const n = typeof row._count === 'number' ? row._count : Number(row._count?._all ?? 0);
    counts.all += n;
    if (row.gameMode === 'PVE' || row.gameMode === 'PVE_MOD' || row.gameMode === 'PVPVE') counts[row.gameMode] += n;
    else counts.NONE += n;
  }
  return counts;
}

/** List-row projection: everything toAdminServer returns except the full legacy apiKey. */
export function toAdminServerListRow(server: any, now: Date = new Date()) {
  const { apiKey, ...row } = toAdminServer(server, now);
  return {
    ...row,
    apiKeyLast4: typeof apiKey === 'string' && apiKey.length > 0 ? apiKey.slice(-4) : null,
  };
}

export class AdminController {
  // Dashboard stats
  getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const startOfToday = bangkokStartOfDay(now);
      const [
        totalUsers,
        totalOrders,
        totalRevenue,
        pendingOrders,
        recentOrders,
        pendingSlips,
        failedDeliveries,
        onlineServers,
        todayRevenue,
        todayTopups,
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
        prisma.paymentIntent.count({ where: { provider: 'bank_slip', status: 'pending' } }),
        prisma.deliveryJob.count({ where: { status: { in: ['failed', 'dead_letter'] } } }),
        prisma.server.count({
          where: { isActive: true, lastHeartbeat: { gte: new Date(now.getTime() - HEARTBEAT_ONLINE_WINDOW_MS) } },
        }),
        prisma.order.aggregate({
          _sum: { totalPrice: true },
          where: { status: { in: REVENUE_ORDER_STATUSES }, createdAt: { gte: startOfToday } },
        }),
        prisma.paymentIntent.aggregate({
          _sum: { amountThb: true },
          where: { status: 'completed', completedAt: { gte: startOfToday } },
        }),
      ]);

      res.json({
        stats: {
          totalUsers,
          totalOrders,
          totalRevenue: totalRevenue._sum.totalPrice || 0,
          pendingOrders,
          // UI redesign 2026-10 additions ("today" = Asia/Bangkok calendar day)
          pendingSlips,
          failedDeliveries,
          onlineServers,
          todayRevenue: todayRevenue?._sum?.totalPrice || 0,
          todayTopupThb: Number(todayTopups?._sum?.amountThb ?? 0),
          todayStartsAt: startOfToday.toISOString(),
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
      // page/pageSize (limit = legacy alias) snapped to 10/25/50/100, page clamped after count.
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await ServerAdminService.getAccessibleUsers(
        req.user!.role,
        req.user!.apiKeyServerId || null,
        { params, search: req.query.search }
      );

      res.json({
        users: result.users.map(u => ({
          ...u,
          pointsBalance: Number(u.pointsBalance),
          totalSpent: Number(u.totalSpent),
        })),
        pagination: {
          ...result.pagination,
          limit: result.pagination.pageSize, // legacy alias kept for existing clients
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
      // A banned user's open sockets (user room, admin room) are closed right away.
      if (isBanned === true) disconnectUserSockets(targetUserId);

      res.json({ user });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/users/:id/points { amount, reason, idempotencyKey? } — manual credit/debit.
  //
  // Flows through the IRIS Wallet double-entry ledger only (walletService.post is the single
  // writer; User.pointsBalance is its read-only projection). A positive amount mints from system
  // issuance into the user's available balance; a negative amount burns back to issuance and is
  // refused (409) when the available balance is insufficient. A reason is mandatory, the acting
  // admin is recorded as the ledger transaction's createdBy, and every attempt (success or
  // failure) is written to the audit log as `points_adjust`.
  adjustPoints = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { amount, idempotencyKey } = req.body ?? {};
      const targetUserId = req.params.id;

      if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
        throw new AppError('Amount is required', 400);
      }
      if (amount === 0) {
        throw new AppError('Amount must be non-zero', 400);
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 3 || reason.length > 500) {
        throw new AppError('Reason is required (3-500 characters)', 400);
      }
      if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length > 200)) {
        throw new AppError('idempotencyKey must be a string of at most 200 characters', 400);
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

      const before = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { pointsBalance: true },
      });
      if (!before) throw new AppError('User not found', 404);

      const amountBig = BigInt(amount);
      // Idempotency keys are global across the ledger, so a client-supplied key is always
      // namespaced to this endpoint and the acting admin. It can never collide with a system
      // flow's key (payment:<id>:credit, order:refund:<id>, dino:escrow:...).
      const clientKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
      const ledgerKey = clientKey
        ? `admin:adjust:${req.user!.id}:${clientKey}`
        : `admin:adjust:${crypto.randomUUID()}`;
      const postingInput: PostLedgerTransactionInput = {
        idempotencyKey: ledgerKey,
        type: 'admin_adjustment',
        referenceType: 'admin_adjustment',
        referenceId: targetUserId,
        description: reason,
        metadata: { direction: amount > 0 ? 'credit' : 'debit', actorRole: req.user!.role },
        createdBy: req.user!.id,
        entries: [
          { accountKey: userAccountKey(targetUserId, 'available'), amount: amountBig },
          { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -amountBig },
        ],
      };

      // Replay of a client key (sequential retry, or the loser of a concurrent double-click):
      // return the original posting, write no second success audit row.
      const replayOf = async () => {
        if (!clientKey) return null;
        const existing = await prisma.ledgerTransaction.findUnique({
          where: { idempotencyKey: ledgerKey },
          select: { id: true, requestHash: true },
        });
        if (!existing) return null;
        const sortedEntries = [...postingInput.entries].sort((a, b) => a.accountKey.localeCompare(b.accountKey));
        if (existing.requestHash !== walletRequestHashFor(postingInput, sortedEntries)) {
          throw new AppError('Idempotency key was already used for a different adjustment', 409);
        }
        const current = await prisma.user.findUnique({ where: { id: targetUserId }, select: { pointsBalance: true } });
        return { transactionId: existing.id, newBalance: Number(current?.pointsBalance ?? 0n) };
      };
      const replayed = await replayOf();
      if (replayed) {
        res.json({ success: true, replayed: true, ...replayed });
        return;
      }

      let posted: { id: string };
      try {
        posted = await prisma.$transaction(async (tx) => {
          await walletService.ensureUserAccounts(targetUserId, tx);
          return walletService.post(postingInput, tx);
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        // A concurrent request with the same client key committed first (unique violation or
        // serialization abort): answer with that posting instead of a 500 + failure audit.
        const code = (error as { code?: string }).code;
        if (clientKey && (code === 'P2002' || code === 'P2034')) {
          const raced = await replayOf();
          if (raced) {
            res.json({ success: true, replayed: true, ...raced });
            return;
          }
        }
        await auditService.log({
          userId: req.user!.id,
          action: 'points_adjust',
          resource: 'points',
          resourceId: targetUserId,
          oldValue: { pointsBalance: before.pointsBalance.toString() },
          newValue: { amount: String(amount), reason },
          metadata: { idempotencyKey: ledgerKey },
          status: 'failure',
          errorMessage: error instanceof Error ? error.message : String(error),
        }, req);
        throw error;
      }

      const updated = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { pointsBalance: true },
      });

      await auditService.log({
        userId: req.user!.id,
        action: 'points_adjust',
        resource: 'points',
        resourceId: targetUserId,
        oldValue: { pointsBalance: before.pointsBalance.toString() },
        newValue: {
          pointsBalance: (updated?.pointsBalance ?? 0n).toString(),
          amount: String(amount),
          reason,
          ledgerTransactionId: posted?.id ?? null,
        },
        metadata: { idempotencyKey: ledgerKey },
      }, req);

      res.json({
        success: true,
        newBalance: Number(updated?.pointsBalance ?? 0n),
        transactionId: posted?.id ?? null,
      });
    } catch (error) {
      next(error);
    }
  };

  // Authenticated catalog includes drafts; the public endpoint remains active-only.
  // GET /admin/products?page&pageSize&search&categoryId&productType&isActive (Admin pagination
  // contract). Without `page` it returns every matching product (legacy behaviour).
  getProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const where = buildAdminProductWhere(query);

      if (!wantsPagination(query)) {
        const products = await prisma.product.findMany({ where, include: { category: true }, orderBy: ADMIN_PRODUCT_ORDER });
        res.json({ products });
        return;
      }

      const params = parsePagination(query);
      const { result, pagination } = await paginateQuery(params, (skip, take) =>
        prisma.$transaction([
          prisma.product.count({ where }),
          prisma.product.findMany({ where, include: { category: true }, orderBy: ADMIN_PRODUCT_ORDER, skip, take }),
        ]) as Promise<[number, any[]]>,
      );
      res.json({ products: result[1], pagination });
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
      emitCatalogUpdated('products');
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
      emitCatalogUpdated('products');
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
      emitCatalogUpdated('products');
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
      emitCatalogUpdated('categories');
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
      emitCatalogUpdated('categories');
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
      emitCatalogUpdated('categories');
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
      // revenue refunds the buyer's AVAILABLE balance (refund policy 2026-10: the money is
      // spendable again and visible in the customer balance, the same as dino escrow refunds;
      // nothing in the system spends `refundable`). The ledger is the single source
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
        afterCommit(() => emitOrderUpdated(order.userId, order.id, 'refunded'));

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
            { accountKey: userAccountKey(order.userId, 'available'), amount: BigInt(order.totalPrice) },
          ],
        }, tx);
      }, { isolationLevel: 'Serializable' });

      // Admin-initiated money movement: audited alongside the ledger row (createdBy above).
      await auditService.log({
        userId: req.user!.id,
        action: 'order_refund',
        resource: 'order',
        resourceId: order.id,
        oldValue: { status: order.status },
        newValue: {
          status: 'refunded',
          amount: String(order.totalPrice),
          customerUserId: order.userId,
          reason: reason ? String(reason).slice(0, 240) : null,
        },
        metadata: { idempotencyKey: `order:refund:${order.id}` },
      }, req);

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
      // page/pageSize (limit = legacy alias) snapped to 10/25/50/100, page clamped after count.
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await ServerAdminService.getAccessibleApiKeys(
        req.user!.role,
        req.user!.apiKeyServerId || null,
        { params, search: req.query.search }
      );

      // Mask API keys for security (show only first/last 4 chars)
      const maskedUsers = result.users.map(u => ({
        ...u,
        apiKey: u.apiKey ? `${u.apiKey.slice(0, 4)}...${u.apiKey.slice(-4)}` : null,
      }));

      res.json({
        apiKeys: maskedUsers,
        pagination: {
          ...result.pagination,
          limit: result.pagination.pageSize, // legacy alias kept for existing clients
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

  // Server Management (root)
  // GET /admin/servers?page&pageSize&search&gameMode&clusterId&status (Admin pagination contract).
  // Without `page` it returns every matching server (legacy dropdown consumers). List rows
  // never carry the full legacy apiKey, only apiKeyLast4.
  getServers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const query = req.query as Record<string, unknown>;
      const { where, gameMode } = buildAdminServerWhere(query, now);
      const rowWhere = gameMode ? { AND: [where, gameMode === 'NONE' ? NONE_MATCH : { gameMode }] } : where;
      const countsQuery = () =>
        prisma.server.groupBy({ by: ['gameMode'], where, _count: { _all: true } } as any) as any;

      if (!wantsPagination(query)) {
        const [servers, grouped] = await prisma.$transaction([
          prisma.server.findMany({ where: rowWhere, include: ADMIN_SERVER_INCLUDE, orderBy: ADMIN_SERVER_ORDER }),
          countsQuery(),
        ] as any[]) as [any[], any[]];
        res.json({
          servers: servers.map((server) => toAdminServerListRow(server, now)),
          counts: toGameModeCounts(grouped),
        });
        return;
      }

      const params = parsePagination(query);
      const { result, pagination } = await paginateQuery(params, (skip, take) =>
        prisma.$transaction([
          prisma.server.count({ where: rowWhere }),
          prisma.server.findMany({ where: rowWhere, include: ADMIN_SERVER_INCLUDE, orderBy: ADMIN_SERVER_ORDER, skip, take }),
          countsQuery(),
        ] as any[]) as Promise<[number, any[], any[]]>,
      );
      const [, servers, grouped] = result;
      res.json({
        servers: servers.map((server) => toAdminServerListRow(server, now)),
        pagination,
        counts: toGameModeCounts(grouped),
      });
    } catch (error) {
      next(error);
    }
  };

  createServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = parseServerWrite(req.body);

      if (!data.name || !data.map) {
        throw new AppError('Name and map are required', 400);
      }
      if (data.clusterId) {
        const cluster = await prisma.cluster.findUnique({ where: { id: data.clusterId as string } });
        if (!cluster) throw new AppError('Cluster not found', 404);
      }

      // Generate API key if not provided
      const serverApiKey = (data.apiKey as string | undefined) || crypto.randomBytes(32).toString('base64url');

      const server = await prisma.server.create({
        data: {
          ...(data as any),
          apiKey: serverApiKey,
          isActive: data.isActive ?? true,
          // A new server has no plugin credential yet, so it starts drained (same
          // as the seed + provision scripts). An operator lifts drain after the
          // credential is issued and an in-game smoke test passes.
          drainMode: true,
        },
        include: ADMIN_SERVER_INCLUDE,
      });

      const { apiKey: _omitApiKey, ...auditData } = data;
      await auditService.log({
        userId: req.user!.id,
        action: 'server_create',
        resource: 'server',
        resourceId: String(server.id),
        newValue: auditData,
      }, req);

      res.status(201).json({ server: toAdminServer(server) });
    } catch (error) {
      next(error);
    }
  };

  updateServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseServerIdParam(req.params.id);
      const data = parseServerWrite(req.body);
      // apiKey is rotated only through POST /admin/servers/:id/regenerate-key.
      delete data.apiKey;

      const existing = await prisma.server.findUnique({ where: { id } });
      if (!existing) throw new AppError('Server not found', 404);
      if (data.clusterId) {
        const cluster = await prisma.cluster.findUnique({ where: { id: data.clusterId as string } });
        if (!cluster) throw new AppError('Cluster not found', 404);
      }

      const server = await prisma.server.update({
        where: { id },
        data: data as any,
        include: ADMIN_SERVER_INCLUDE,
      });

      const changedKeys = Object.keys(data);
      await auditService.log({
        userId: req.user!.id,
        action: 'server_update',
        resource: 'server',
        resourceId: String(id),
        oldValue: Object.fromEntries(changedKeys.map((key) => [key, (existing as any)[key]])),
        newValue: data,
      }, req);

      res.json({ server: toAdminServer(server) });
    } catch (error) {
      next(error);
    }
  };

  deleteServer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseServerIdParam(req.params.id);
      const existing = await prisma.server.findUnique({ where: { id } });
      if (!existing) throw new AppError('Server not found', 404);

      await prisma.server.delete({ where: { id } });

      // Identity fields only: never the plugin apiKey or webhook URL.
      await auditService.log({
        userId: req.user!.id,
        action: 'server_delete',
        resource: 'server',
        resourceId: String(id),
        oldValue: { name: existing.name, map: existing.map, clusterId: (existing as any).clusterId ?? null },
      }, req);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  regenerateServerApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseServerIdParam(req.params.id);
      const existing = await prisma.server.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new AppError('Server not found', 404);

      const newApiKey = crypto.randomBytes(32).toString('base64url');

      const server = await prisma.server.update({
        where: { id },
        data: { apiKey: newApiKey },
        include: ADMIN_SERVER_INCLUDE,
      });

      // The key itself is never written to the audit log.
      await auditService.log({
        userId: req.user!.id,
        action: 'server_regenerate_key',
        resource: 'server',
        resourceId: String(id),
        metadata: { apiKeyLast4: newApiKey.slice(-4) },
      }, req);

      // Admin projection (same as create/update); the new full key is returned only here.
      res.json({ server: toAdminServer(server) });
    } catch (error) {
      next(error);
    }
  };

  // ChatRank Management
  getChatRanks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const serverId = parseIntFilter(query.serverId, 'serverId');

      const and: any[] = [];
      if (serverId !== undefined) {
        and.push({ serverId: serverId === 0 ? null : serverId });
      }
      const search = parseSearch(query.search);
      if (search) {
        and.push({
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { groupKey: { contains: search, mode: 'insensitive' } },
          ],
        });
      }
      const where = and.length > 0 ? { AND: and } : {};
      const include = { server: { select: { id: true, name: true } } };
      const orderBy: any[] = [{ priority: 'desc' }, { name: 'asc' }, { id: 'asc' }];

      if (!wantsPagination(query)) {
        const ranks = await prisma.chatRank.findMany({ where, include, orderBy });
        res.json({ ranks });
        return;
      }

      const { result, pagination } = await paginateQuery(parsePagination(query), (skip, take) =>
        prisma.$transaction([
          prisma.chatRank.count({ where }),
          prisma.chatRank.findMany({ where, include, orderBy, skip, take }),
        ]) as Promise<[number, any[]]>,
      );
      res.json({ ranks: result[1], pagination });
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
      // Demoted below ADMIN|ROOT: leave the admin realtime room now, not at next reconnect.
      if (role !== 'admin' && role !== 'root') revokeAdminRoom(targetUserId);

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

      const allSlips = mapped.length > 0 || !slipDemoFixturesEnabled() ? mapped : fixtureSlips;
      res.json({ topups: allSlips, count: allSlips.length });
    } catch (error) {
      next(error);
    }
  };

  // Approve a pending bank-slip top-up. Hardened (UI redesign 2026-10 audit):
  //   * only provider=bank_slip intents in pending/processing can be approved (a Stripe or
  //     expired/failed/refunded intent can never be credited from here);
  //   * the status flip is a conditional update inside the credit transaction, and the ledger
  //     credit is keyed `slip:<id>:credit`, so concurrent double-approval credits once;
  //   * unknown ids are 404 unless demo fixtures are explicitly enabled outside production.
  approveSlip = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const notes = typeof req.body?.notes === 'string' && req.body.notes.trim()
        ? req.body.notes.trim().slice(0, 500)
        : 'Approved by admin';
      const intent = await prisma.paymentIntent.findUnique({
        where: { id },
        include: { user: true },
      });

      if (intent) {
        if (intent.provider !== 'bank_slip') {
          throw new AppError('Only bank-slip top-ups can be approved manually', 409);
        }
        if (intent.status === 'completed') {
          return res.json({
            success: true,
            creditedPoints: Number(intent.pointsAmount),
            transactionId: `TX-APPROVED-${intent.id}`,
            alreadyApproved: true,
          });
        }
        if (intent.status !== 'pending' && intent.status !== 'processing') {
          throw new AppError(`Top-up in status "${intent.status}" cannot be approved`, 409);
        }

        await prisma.$transaction(async (tx) => {
          const flipped = await tx.paymentIntent.updateMany({
            where: { id: intent.id, status: intent.status },
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
          if (flipped.count !== 1) {
            throw new AppError('Top-up was processed concurrently; refresh and try again', 409);
          }
          await walletService.creditUser(
            intent.userId,
            intent.pointsAmount,
            `slip:${intent.id}:credit`,
            'bank_slip_approval',
            intent.id,
            tx,
            // Replay-safe: guarded by the conditional status flip above.
            {
              referenceType: 'slip',
              description: `Bank slip top-up approved: ${notes}`.slice(0, 300),
              createdBy: req.user!.id,
            },
          );
        }, { isolationLevel: 'Serializable' });

        await auditService.log({
          userId: req.user!.id,
          action: 'payment_slip_approve',
          resource: 'payment_intent',
          resourceId: intent.id,
          oldValue: { status: intent.status },
          newValue: { status: 'completed', pointsAmount: String(intent.pointsAmount), notes },
          metadata: { targetUserId: intent.userId },
        }, req);

        return res.json({
          success: true,
          creditedPoints: Number(intent.pointsAmount),
          transactionId: `TX-APPROVED-${intent.id}`,
        });
      }

      if (!slipDemoFixturesEnabled() || !/^topup-slip-\d{3}$/.test(id)) {
        throw new AppError('Top-up not found', 404);
      }

      // Local demo only (ENABLE_ADMIN_DEMO_FIXTURES=true, NODE_ENV!=production): credit the
      // approving admin so the demo counter visibly increases.
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
          { referenceType: 'slip', createdBy: req.user!.id },
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

  // Reject a pending bank-slip top-up (no money moves). Only pending/processing bank-slip
  // intents can be rejected; a completed (credited) intent can never be flipped to failed.
  rejectSlip = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 500)
        : 'สลิปไม่ถูกต้องหรือไม่พบยอดเงิน';
      const intent = await prisma.paymentIntent.findUnique({ where: { id } });

      if (!intent) {
        if (slipDemoFixturesEnabled() && /^topup-slip-\d{3}$/.test(id)) {
          return res.json({ success: true, message: 'Top-up rejected', id, demo: true });
        }
        throw new AppError('Top-up not found', 404);
      }
      if (intent.provider !== 'bank_slip') {
        throw new AppError('Only bank-slip top-ups can be rejected manually', 409);
      }
      if (intent.status === 'failed') {
        return res.json({ success: true, message: 'Top-up already rejected', id, alreadyRejected: true });
      }
      if (intent.status !== 'pending' && intent.status !== 'processing') {
        throw new AppError(`Top-up in status "${intent.status}" cannot be rejected`, 409);
      }

      const flipped = await prisma.paymentIntent.updateMany({
        where: { id, status: intent.status },
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
      if (flipped.count !== 1) {
        throw new AppError('Top-up was processed concurrently; refresh and try again', 409);
      }

      await auditService.log({
        userId: req.user!.id,
        action: 'payment_slip_reject',
        resource: 'payment_intent',
        resourceId: id,
        oldValue: { status: intent.status },
        newValue: { status: 'failed', reason },
        metadata: { targetUserId: intent.userId },
      }, req);

      res.json({ success: true, message: 'Top-up rejected', id });
    } catch (error) {
      next(error);
    }
  };
}
