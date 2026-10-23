// Admin VIP console (contracts/vip-2026-10.md §Admin). Guards: routes/admin.routes.ts
// (admin|root). Every mutation is audited by vipService / here.
import { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import auditService from '../services/audit.service.js';
import { toDeliveryItem } from '../services/deliveryAdmin.service.js';
import vipService, {
  PERMISSION_DELIVERY_TYPE_LIST,
  VIP_MEMBERSHIP_SOURCES,
  VIP_MEMBERSHIP_STATES,
  VIP_MEMBERSHIP_STATUSES,
  VIP_SYNC_STATUSES,
  adminExtendSchema,
  adminGrantSchema,
  adminResyncSchema,
  adminRevokeSchema,
  parseOrThrow,
  permissionReferenceId,
  serializeMembership,
  serializeVipPackage,
  vipPackageCreateSchema,
  vipPackageUpdateSchema,
} from '../services/vip.service.js';
import { emitAdminVip } from '../realtime/emit.js';
import { paginateQuery, parsePagination, parseSearch } from '../utils/pagination.js';

function enumFilter<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') throw new AppError(`Invalid ${name}`, 400);
  const text = raw.trim().toLowerCase();
  if (text === '' || text === 'all') return undefined;
  if (!(allowed as readonly string[]).includes(text)) throw new AppError(`Invalid ${name}: expected one of ${allowed.join(', ')}`, 400);
  return text as T;
}

/** WHERE for the membership list. `state` is derived from status + dates at `now`. */
export function buildMembershipWhere(query: Record<string, unknown>, now: Date) {
  const and: any[] = [];
  const status = enumFilter(query.status, VIP_MEMBERSHIP_STATUSES, 'status');
  if (status) and.push({ status });
  const state = enumFilter(query.state, VIP_MEMBERSHIP_STATES, 'state');
  if (state === 'active') and.push({ status: 'active', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
  if (state === 'scheduled') and.push({ status: 'active', startsAt: { gt: now } });
  if (state === 'expired') and.push({ OR: [{ status: 'expired' }, { status: 'active', expiresAt: { lte: now } }] });
  if (state === 'revoked') and.push({ status: 'revoked' });
  const source = enumFilter(query.source, VIP_MEMBERSHIP_SOURCES, 'source');
  if (source) and.push({ source });
  const syncStatus = enumFilter(query.syncStatus, VIP_SYNC_STATUSES, 'syncStatus');
  if (syncStatus) and.push({ syncStatus });
  const packageId = parseSearch(query.packageId, 64);
  if (packageId) and.push({ packageId });
  const userId = parseSearch(query.userId, 64);
  if (userId) and.push({ userId });
  const search = parseSearch(query.search);
  if (search) {
    and.push({
      OR: [
        { id: { startsWith: search } },
        { user: { discordUsername: { contains: search, mode: 'insensitive' } } },
        { user: { steamId: { startsWith: search } } },
        { userId: search },
        { paymentIntentId: search },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

const MEMBERSHIP_LIST_INCLUDE = {
  package: true,
  user: { select: { id: true, discordUsername: true, steamId: true, discordAvatar: true } },
} as const;

async function serializeRows(rows: any[], now: Date) {
  const jobs = await vipService.latestPermissionJobs(rows.map((row) => permissionReferenceId(row.userId, row.permissionGroup)));
  return rows.map((row) => serializeMembership(row, now, jobs.get(permissionReferenceId(row.userId, row.permissionGroup))));
}

export class AdminVipController {
  // ---------------- Packages ----------------

  // GET /admin/vip/packages -> { packages } (all, incl. inactive/unpriced, with activeMemberships)
  listPackages = async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const [packages, counts] = await Promise.all([
        prisma.vipPackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { tierRank: 'asc' }, { id: 'asc' }] }),
        prisma.vipMembership.groupBy({
          by: ['packageId'],
          where: { status: 'active', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          _count: { _all: true },
        }),
      ]);
      const byPackage = new Map((counts as any[]).map((row) => [row.packageId, Number(row._count?._all ?? 0)]));
      res.json({ packages: packages.map((pkg) => serializeVipPackage(pkg, { activeMemberships: byPackage.get(pkg.id) ?? 0 })) });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/vip/packages -> 201 { package }
  createPackage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(vipPackageCreateSchema, req.body, 'VIP package');
      if (data.isActive && !(Number(data.priceThb ?? '0') > 0)) throw new AppError('Set a price above 0 before activating a VIP package', 409);
      const clash = await prisma.vipPackage.findUnique({ where: { key: data.key } });
      if (clash) throw new AppError(`VIP package key "${data.key}" already exists`, 409);
      const created = await prisma.$transaction(async (tx) => {
        const pkg = await tx.vipPackage.create({
          data: { ...data, priceThb: data.priceThb !== undefined ? new Prisma.Decimal(data.priceThb) : undefined },
        });
        await vipService.ensureChatRankForGroup(tx, pkg.permissionGroup, pkg.badgeLabel);
        return pkg;
      });
      await auditService.log({
        userId: req.user!.id,
        action: 'vip_package_create',
        resource: 'vip_package',
        resourceId: created.id,
        newValue: serializeVipPackage(created),
      }, req);
      emitAdminVip({ action: 'package', userId: null, membershipId: null });
      res.status(201).json({ package: serializeVipPackage(created) });
    } catch (error) {
      next(error);
    }
  };

  // PUT /admin/vip/packages/:id -> { package }. Price/duration changes affect future checkouts only:
  // open intents keep the snapshot they were created with.
  updatePackage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(vipPackageUpdateSchema, req.body, 'VIP package');
      const existing = await prisma.vipPackage.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new AppError('VIP package not found', 404);
      if (data.key && data.key !== existing.key) {
        const clash = await prisma.vipPackage.findUnique({ where: { key: data.key } });
        if (clash) throw new AppError(`VIP package key "${data.key}" already exists`, 409);
      }
      const nextPrice = data.priceThb !== undefined ? Number(data.priceThb) : Number(existing.priceThb);
      const nextActive = data.isActive ?? existing.isActive;
      if (nextActive && !(nextPrice > 0)) throw new AppError('Set a price above 0 before activating a VIP package', 409);
      const updated = await prisma.$transaction(async (tx) => {
        const pkg = await tx.vipPackage.update({
          where: { id: existing.id },
          data: { ...data, priceThb: data.priceThb !== undefined ? new Prisma.Decimal(data.priceThb) : undefined },
        });
        if (data.permissionGroup && data.permissionGroup !== existing.permissionGroup) {
          await vipService.ensureChatRankForGroup(tx, pkg.permissionGroup, pkg.badgeLabel);
        }
        return pkg;
      });
      await auditService.log({
        userId: req.user!.id,
        action: 'vip_package_update',
        resource: 'vip_package',
        resourceId: existing.id,
        oldValue: serializeVipPackage(existing),
        newValue: data,
      }, req);
      emitAdminVip({ action: 'package', userId: null, membershipId: null });
      res.json({ package: serializeVipPackage(updated) });
    } catch (error) {
      next(error);
    }
  };

  // ---------------- Memberships ----------------

  // GET /admin/vip/memberships?page&pageSize&search&status&state&source&syncStatus&packageId&userId
  listMemberships = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const query = (req.query ?? {}) as Record<string, unknown>;
      const where = buildMembershipWhere(query, now);
      const { result, pagination } = await paginateQuery(parsePagination(query), (skip, take) =>
        prisma.$transaction([
          prisma.vipMembership.count({ where }),
          prisma.vipMembership.findMany({
            where,
            include: MEMBERSHIP_LIST_INCLUDE,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
          }),
        ]) as Promise<[number, any[]]>,
      );
      res.json({ items: await serializeRows(result[1], now), pagination });
    } catch (error) {
      next(error);
    }
  };

  // GET /admin/vip/summary -> counts for the dashboard / tab badges
  summary = async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const effective = { status: 'active', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
      const [activeUsers, activeMemberships, expiringSoon, syncPending, syncFailed, noSteam, pendingSlips, permissionJobsFailed] = await Promise.all([
        prisma.vipMembership.groupBy({ by: ['userId'], where: effective, _count: { _all: true } }),
        prisma.vipMembership.count({ where: effective }),
        prisma.vipMembership.count({ where: { status: 'active', expiresAt: { gt: now, lte: soon } } }),
        prisma.vipMembership.count({ where: { syncStatus: { in: ['pending', 'unqueued'] } } }),
        prisma.vipMembership.count({ where: { syncStatus: 'failed' } }),
        prisma.vipMembership.count({ where: { syncStatus: 'no_steam', status: 'active' } }),
        prisma.paymentIntent.count({ where: { provider: 'bank_slip', status: 'pending', vipPackageId: { not: null } } }),
        prisma.deliveryJob.count({ where: { deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] }, status: { in: ['failed', 'dead_letter'] } } }),
      ]);
      res.json({
        activeUsers: (activeUsers as any[]).length,
        activeMemberships,
        expiringIn7Days: expiringSoon,
        sync: { pending: syncPending, failed: syncFailed, noSteam },
        pendingVipSlips: pendingSlips,
        permissionJobsFailed,
        at: now.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  // GET /admin/vip/users/:userId -> { user, vip, memberships, permissionJobs, payments }
  userDetail = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const userId = String(req.params.userId ?? '').trim();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, discordUsername: true, discordAvatar: true, steamId: true, isBanned: true, createdAt: true },
      });
      if (!user) throw new AppError('User not found', 404);
      const [rows, jobs, payments] = await Promise.all([
        prisma.vipMembership.findMany({ where: { userId }, include: MEMBERSHIP_LIST_INCLUDE, orderBy: [{ startsAt: 'desc' }, { id: 'desc' }], take: 100 }),
        prisma.deliveryJob.findMany({
          where: { deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] }, referenceId: { startsWith: `vip:${userId}:` } },
          include: { server: { select: { name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        }),
        prisma.paymentIntent.findMany({
          where: { userId, vipPackageId: { not: null } },
          select: { id: true, provider: true, status: true, amountThb: true, reference: true, createdAt: true, completedAt: true, vipPackageId: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        }),
      ]);
      const vip = await vipService.badgeForUser(userId, now);
      res.json({
        user,
        vip,
        memberships: await serializeRows(rows, now),
        permissionJobs: jobs.map((job: any) => ({ ...toDeliveryItem(job), payload: job.payload })),
        payments: payments.map((row: any) => ({ ...row, amountThb: String(row.amountThb) })),
      });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/vip/grant { userId, packageId, durationDays?, reason } -> 201 { membership, permissionJob }
  grant = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(adminGrantSchema, req.body, 'VIP grant');
      const result = await vipService.adminGrant(body, req.user!.id);
      const membership = await prisma.vipMembership.findUnique({ where: { id: result.membership.id }, include: MEMBERSHIP_LIST_INCLUDE });
      res.status(201).json({ membership: (await serializeRows([membership ?? result.membership], new Date()))[0], permissionJob: result.job });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/vip/memberships/:id/extend { days, reason } -> { membership, shiftedLaterRows, permissionJob }
  extend = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(adminExtendSchema, req.body, 'VIP extension');
      const result = await vipService.adminExtend(req.params.id, body.days, body.reason, req.user!.id);
      const membership = await prisma.vipMembership.findUnique({ where: { id: req.params.id }, include: MEMBERSHIP_LIST_INCLUDE });
      res.json({
        membership: (await serializeRows([membership ?? result.membership], new Date()))[0],
        shiftedLaterRows: result.shifted,
        permissionJob: result.job,
      });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/vip/memberships/:id/revoke { reason } -> { membership, permissionJob }
  revoke = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(adminRevokeSchema, req.body, 'VIP revocation');
      const result = await vipService.adminRevoke(req.params.id, body.reason, req.user!.id);
      const membership = await prisma.vipMembership.findUnique({ where: { id: req.params.id }, include: MEMBERSHIP_LIST_INCLUDE });
      res.json({
        membership: membership ? (await serializeRows([membership], new Date()))[0] : null,
        permissionJob: result.job,
      });
    } catch (error) {
      next(error);
    }
  };

  // POST /admin/vip/users/:userId/resync { reason? } -> { steamLinked, jobs }
  resync = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(adminResyncSchema, req.body, 'VIP resync');
      const result = await vipService.resyncUser(String(req.params.userId), { actorId: req.user!.id, reason: body.reason ?? null });
      res.json({ steamLinked: Boolean(result.steamId), jobs: result.jobs });
    } catch (error) {
      next(error);
    }
  };
}

export const adminVipController = new AdminVipController();
export default adminVipController;
