// Admin console endpoints added for the UI redesign (2026-10): clusters, delivery rescue,
// audit log, P2P market listings (read-only), categories and promotions (read-only).
// Route guards live in routes/admin.routes.ts.
import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import auditService from '../services/audit.service.js';
import deliveryAdminService, { isDeliveryJobStatus } from '../services/deliveryAdmin.service.js';
import {
  paginateQuery,
  parsePagination as sharedParsePagination,
  parseSearch,
  wantsPagination,
} from '../utils/pagination.js';

export { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../utils/pagination.js';

/**
 * Requested page/pageSize per the shared admin pagination contract: strict int parse
 * ('2abc' -> default), pageSize snapped to 10/25/50/100, page capped at MAX_REQUEST_PAGE so
 * skip never overflows. The page actually served is clamped after counting (paginateQuery).
 */
export function parsePagination(query: Record<string, unknown> | undefined) {
  const { page, pageSize } = sharedParsePagination(query);
  return { page, pageSize };
}

/**
 * Read one optional query-string filter. Express's extended parser turns
 * `?a[x]=1` into an object and `?a=1&a=2` into an array, so anything that is
 * not a plain string is a 400 (never a TypeError -> 500). Returns the trimmed
 * value, or undefined when absent/blank.
 */
export function queryString(query: Record<string, unknown> | undefined, key: string, maxLength = 200): string | undefined {
  const raw = query?.[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new AppError(`Invalid ${key}: expected a single string value`, 400);
  const value = raw.trim();
  if (value.length > maxLength) throw new AppError(`Invalid ${key}: must be at most ${maxLength} characters`, 400);
  return value || undefined;
}

function zodMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown, label: string): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new AppError(`Invalid ${label}: ${zodMessage(parsed.error)}`, 400);
  return parsed.data;
}

const optionalString = (max: number) => z.string().trim().max(max).nullable().optional();
const gameModeSchema = z.enum(['PVE', 'PVE_MOD', 'PVPVE']);

export const clusterCreateSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'lowercase letters, digits and dashes (2-64 chars)'),
    name: z.string().trim().min(1).max(120),
    gameMode: gameModeSchema.nullable().optional(),
    description: optionalString(1000),
    rates: optionalString(32),
    isModded: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(-100000).max(100000).optional(),
  })
  .strict();

export const clusterUpdateSchema = clusterCreateSchema.partial().strict();

const CLUSTER_SELECT = {
  id: true,
  key: true,
  name: true,
  isActive: true,
  gameMode: true,
  description: true,
  rates: true,
  isModded: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { servers: true } },
} as const;

function toCluster(row: any) {
  const { _count, ...rest } = row;
  return { ...rest, serverCount: _count?.servers ?? 0 };
}

const LISTING_STATUSES = ['listed', 'sold', 'cancelled', 'expired'] as const;

export class AdminConsoleController {
  // ---------------- Clusters (root) ----------------
  getClusters = async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const clusters = await prisma.cluster.findMany({
        select: CLUSTER_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      });
      res.json({ clusters: clusters.map(toCluster) });
    } catch (error) {
      next(error);
    }
  };

  createCluster = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = parseBody(clusterCreateSchema, req.body, 'cluster');
      const existing = await prisma.cluster.findUnique({ where: { key: data.key } });
      if (existing) throw new AppError(`Cluster key "${data.key}" already exists`, 409);
      const cluster = await prisma.cluster.create({ data, select: CLUSTER_SELECT });
      await auditService.log({
        userId: req.user!.id,
        action: 'cluster_create',
        resource: 'cluster',
        resourceId: cluster.id,
        newValue: data,
      }, req);
      res.status(201).json({ cluster: toCluster(cluster) });
    } catch (error) {
      next(error);
    }
  };

  updateCluster = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = parseBody(clusterUpdateSchema, req.body, 'cluster');
      const existing = await prisma.cluster.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new AppError('Cluster not found', 404);
      if (data.key && data.key !== existing.key) {
        const clash = await prisma.cluster.findUnique({ where: { key: data.key } });
        if (clash) throw new AppError(`Cluster key "${data.key}" already exists`, 409);
      }
      const cluster = await prisma.cluster.update({ where: { id: existing.id }, data, select: CLUSTER_SELECT });
      await auditService.log({
        userId: req.user!.id,
        action: 'cluster_update',
        resource: 'cluster',
        resourceId: existing.id,
        oldValue: existing,
        newValue: data,
      }, req);
      res.json({ cluster: toCluster(cluster) });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- Deliveries (admin|root) ----------------
  getDeliveries = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = parsePagination(req.query as any);
      const statusRaw = queryString(req.query, 'status');
      if (statusRaw && !isDeliveryJobStatus(statusRaw)) {
        throw new AppError('Invalid status. Valid: pending, leased, completed, failed, dead_letter', 400);
      }
      const serverIdRaw = queryString(req.query, 'serverId');
      let serverId: number | undefined;
      if (serverIdRaw !== undefined) {
        serverId = Number(serverIdRaw);
        if (!Number.isInteger(serverId) || serverId <= 0) throw new AppError('Invalid serverId', 400);
      }
      res.json(await deliveryAdminService.list({
        status: statusRaw && isDeliveryJobStatus(statusRaw) ? statusRaw : undefined,
        serverId,
        page,
        pageSize,
      }));
    } catch (error) {
      next(error);
    }
  };

  retryDelivery = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await deliveryAdminService.retry(req.params.id);
      if (result.retried) {
        await auditService.log({
          userId: req.user!.id,
          action: 'delivery_retry',
          resource: 'delivery_job',
          resourceId: result.item.id,
          oldValue: { status: result.previousStatus },
          newValue: { status: result.item.status, maxAttempts: result.item.maxAttempts },
          metadata: { orderId: result.item.orderId, serverId: result.item.serverId },
        }, req);
      }
      res.json({ success: true, retried: result.retried, alreadyQueued: result.alreadyQueued, item: result.item });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- Audit log (admin|root) ----------------
  getAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = parsePagination(req.query as any);
      const where: Record<string, unknown> = {};
      const action = queryString(req.query, 'action');
      const actorId = queryString(req.query, 'actorId');
      const resource = queryString(req.query, 'resource');
      if (action) where.action = action;
      if (actorId) where.userId = actorId;
      if (resource) where.resource = resource;

      const { result, pagination } = await paginateQuery({ page, pageSize, skip: 0, take: pageSize }, (skip, take) =>
        prisma.$transaction([
          prisma.auditLog.count({ where }),
          prisma.auditLog.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
          }),
        ]) as Promise<[number, any[]]>,
      );
      const [total, rows] = result;

      res.json({
        items: rows.map((row: any) => ({
          id: row.id,
          action: row.action,
          resource: row.resource,
          resourceId: row.resourceId ?? null,
          actorId: row.userId ?? null,
          actorEmail: row.userEmail ?? null,
          ipAddress: row.ipAddress ?? null,
          status: row.status,
          errorMessage: row.errorMessage ?? null,
          oldValue: row.oldValue ?? null,
          newValue: row.newValue ?? null,
          metadata: row.metadata ?? null,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        })),
        total,
        page: pagination.page,
        pageSize,
      });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- P2P market listings, read-only (admin|root) ----------------
  getMarketListings = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = parsePagination(req.query as any);
      const status = queryString(req.query, 'status');
      if (status && !(LISTING_STATUSES as readonly string[]).includes(status)) {
        throw new AppError(`Invalid status. Valid: ${LISTING_STATUSES.join(', ')}`, 400);
      }
      const where = status ? { status } : {};
      const { result, pagination } = await paginateQuery({ page, pageSize, skip: 0, take: pageSize }, (skip, take) =>
        prisma.$transaction([
          prisma.dinoListing.count({ where }),
          prisma.dinoListing.findMany({
          where,
          // Explicit select: never ship cryopodData (native snapshot bytes) to the console.
          select: {
            id: true,
            species: true,
            dinoName: true,
            level: true,
            gender: true,
            price: true,
            status: true,
            imageUrl: true,
            deliveryStatus: true,
            originServerId: true,
            deliveryServerId: true,
            createdAt: true,
            updatedAt: true,
            soldAt: true,
            expiresAt: true,
            deliveredAt: true,
            seller: { select: { id: true, discordUsername: true, steamId: true } },
            buyer: { select: { id: true, discordUsername: true, steamId: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        ]) as Promise<[number, any[]]>,
      );
      const [total, rows] = result;
      res.json({ items: rows, total, page: pagination.page, pageSize });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- Categories incl. inactive (admin|root) ----------------
  // Without `page`: every category (legacy). With `page`: Admin pagination contract
  // (page/pageSize snapped to 10/25/50/100, page clamped after count, optional search on name).
  getCategories = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const query = (req.query ?? {}) as Record<string, unknown>;
      const orderBy: any[] = [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }];
      const include = { _count: { select: { products: true } } };
      const search = parseSearch(query.search);
      const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

      if (!wantsPagination(query)) {
        const categories = await prisma.category.findMany({ where, orderBy, include });
        res.json({ categories });
        return;
      }

      const { result, pagination } = await paginateQuery(sharedParsePagination(query), (skip, take) =>
        prisma.$transaction([
          prisma.category.count({ where }),
          prisma.category.findMany({ where, orderBy, include, skip, take }),
        ]) as Promise<[number, any[]]>,
      );
      res.json({ categories: result[1], pagination });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- Promotions, read-only (admin|root) ----------------
  getPromotions = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = parsePagination(req.query as any);
      const status = queryString(req.query, 'status');
      const where = status ? { status } : {};
      const { result, pagination } = await paginateQuery({ page, pageSize, skip: 0, take: pageSize }, (skip, take) =>
        prisma.$transaction([
          prisma.promotionCampaign.count({ where }),
          prisma.promotionCampaign.findMany({
            where,
            include: { _count: { select: { vouchers: true, redemptions: true } } },
            orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]) as Promise<[number, any[]]>,
      );
      const [total, rows] = result;
      // BigInt money columns are serialized as decimal strings (contracts/README.md policy).
      const items = rows.map((row: any) => {
        const { _count, ...rest } = row;
        return {
          ...rest,
          discountValue: String(row.discountValue),
          maxDiscount: row.maxDiscount === null || row.maxDiscount === undefined ? null : String(row.maxDiscount),
          minSubtotal: String(row.minSubtotal),
          voucherCount: _count?.vouchers ?? 0,
          redemptionCount: _count?.redemptions ?? 0,
        };
      });
      res.json({ items, total, page: pagination.page, pageSize });
    } catch (error) {
      next(error);
    }
  };
}

export const adminConsoleController = new AdminConsoleController();
export default adminConsoleController;
