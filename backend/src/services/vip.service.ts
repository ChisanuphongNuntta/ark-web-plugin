// VIP (2026-10) — contract: backend/contracts/vip-2026-10.md.
//
// VIP is bought with REAL MONEY (Stripe / approved bank slip), never with IC. Each grant is one
// VipMembership row; repeat purchases of the same package chain after the current expiry. While
// a user holds an effective row, their Steam ID must be in the package's ArkApi Permissions group.
// The group store is cluster-shared MySQL, so ONE online server is enough to apply a change, for
// an online or offline player. Changes travel as DeliveryJob rows of type permission_grant /
// permission_revoke that ANY server advertising PERMISSIONS_CAPABILITY may claim.
//
// Money safety:
//   * grantFromPaymentIntent never touches the wallet; a VIP intent carries pointsAmount 0 and
//     the DB CHECK payment_intents_kind_check forbids anything else;
//   * VipMembership.paymentIntentId is UNIQUE, and the payment paths flip the intent
//     pending|processing -> completed in the same transaction, so one intent grants once.
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { afterCommit } from '../realtime/afterCommit.js';
import { emitAdminVip, emitVipUpdated } from '../realtime/emit.js';
import auditService from './audit.service.js';

export const PERMISSIONS_CAPABILITY = 'permissions.group.v1';
export const PERMISSION_GRANT_TYPE = 'permission_grant';
export const PERMISSION_REVOKE_TYPE = 'permission_revoke';
export const PERMISSION_DELIVERY_TYPE_LIST = [PERMISSION_GRANT_TYPE, PERMISSION_REVOKE_TYPE] as const;
export const PERMISSION_DELIVERY_TYPES: ReadonlySet<string> = new Set(PERMISSION_DELIVERY_TYPE_LIST);
export const PERMISSION_PAYLOAD_SCHEMA_VERSION = 1;
/**
 * Permissions V2 answers group reads from a per-server cache refreshed from MySQL every
 * ClusterSyncTime (default 60s, min 20s). Within that window another server's cache is stale, so
 * a follow-up add/remove for the SAME (referenceId, steamId) key is kept on the server that
 * completed the previous job (or held back until the window has passed). Set
 * PERMISSIONS_CLUSTER_SYNC_SECONDS to the plugin's ClusterSyncTime if it was changed.
 */
export function permissionKeyAffinityMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PERMISSIONS_CLUSTER_SYNC_SECONDS);
  const syncSeconds = Number.isFinite(parsed) && parsed >= 20 ? Math.min(parsed, 3600) : 60;
  return (syncSeconds + 30) * 1000;
}

export const VIP_MEMBERSHIP_STATUSES = ['active', 'expired', 'revoked'] as const;
export const VIP_MEMBERSHIP_SOURCES = ['purchase', 'admin', 'legacy'] as const;
export const VIP_MEMBERSHIP_STATES = ['scheduled', 'active', 'expired', 'revoked'] as const;
// unqueued = the change could not be queued (no server row available); the scheduler re-queues it.
export const VIP_SYNC_STATUSES = ['pending', 'synced', 'failed', 'no_steam', 'unqueued'] as const;
/** Frame keys the frontend ships CSS for (frontend/src/app/vip-frames.css). Others fall back to gold there. */
export const VIP_FRAME_STYLES = ['vip-gold', 'vip-silver', 'vip-diamond', 'vip-emerald', 'vip-ruby', 'vip-amethyst'] as const;

export type VipMembershipState = (typeof VIP_MEMBERSHIP_STATES)[number];
export type PermissionAction = 'add' | 'remove';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_GRANT_DAYS = 3650;

type Db = Prisma.TransactionClient | typeof prisma;

export interface VipBadge {
  tierRank: number;
  frameStyle: string;
  label: string;
}

export interface MembershipPeriodRow {
  status: string;
  startsAt: Date;
  expiresAt: Date | null;
}

export interface PermissionPayload {
  schemaVersion: 1;
  steamId: string;
  group: string;
  action: PermissionAction;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------------------------
// Pure rules (unit-tested without a database)
// ---------------------------------------------------------------------------------------------

/** Row counts toward VIP right now. */
export function isEffective(row: MembershipPeriodRow, now: Date): boolean {
  return row.status === 'active' && row.startsAt <= now && (row.expiresAt === null || row.expiresAt > now);
}

/** Row is active and not yet ended (effective now OR scheduled to start later). */
export function isLive(row: MembershipPeriodRow, now: Date): boolean {
  return row.status === 'active' && (row.expiresAt === null || row.expiresAt > now);
}

export function membershipState(row: MembershipPeriodRow, now: Date): VipMembershipState {
  if (row.status === 'revoked') return 'revoked';
  if (row.status === 'expired') return 'expired';
  if (row.expiresAt !== null && row.expiresAt <= now) return 'expired';
  if (row.startsAt > now) return 'scheduled';
  return 'active';
}

/**
 * Period for a new grant of a package. Durations chain: the new row starts at the later of
 * `now` and the latest expiry among the user's live rows of the SAME package, so a renewal
 * bought before expiry adds its full duration. `durationDays === null` = permanent (starts now).
 * A permanent live row of the same package does not shift the start (the new row starts now).
 */
export function computeChainedPeriod(
  now: Date,
  durationDays: number | null,
  samePackageRows: MembershipPeriodRow[],
): { startsAt: Date; expiresAt: Date | null } {
  if (durationDays === null) return { startsAt: now, expiresAt: null };
  if (!Number.isSafeInteger(durationDays) || durationDays <= 0) throw new AppError('durationDays must be a positive integer', 400);
  let start = now;
  for (const row of samePackageRows) {
    if (!isLive(row, now) || row.expiresAt === null) continue;
    if (row.expiresAt > start) start = row.expiresAt;
  }
  return { startsAt: start, expiresAt: new Date(start.getTime() + durationDays * DAY_MS) };
}

/**
 * Rows a new grant chains after (chain per permission GROUP, not per package): live rows of the
 * same group whose package tier is the same or higher. Buying another duration of the same
 * group/tier (e.g. vip-90d while vip-30d runs) adds its full duration after the current end; an
 * upgrade to a higher tier starts now (better frame immediately); a lower tier bought while a
 * higher one runs starts after it.
 */
export function chainRowsFor<T extends MembershipPeriodRow & { permissionGroup: string; package?: { tierRank: number } | null }>(
  rows: T[],
  group: string,
  tierRank: number,
): T[] {
  return rows.filter((row) => row.permissionGroup === group && (row.package?.tierRank ?? 0) >= tierRank);
}

/**
 * When does the user's hold on `group` end? undefined = not held at all, null = permanent,
 * Date = latest expiry over live rows of that group.
 */
export function groupHoldUntil(rows: Array<MembershipPeriodRow & { permissionGroup: string }>, group: string, now: Date): Date | null | undefined {
  let until: Date | null | undefined;
  for (const row of rows) {
    if (row.permissionGroup !== group || !isLive(row, now)) continue;
    if (row.expiresAt === null) return null;
    if (until === undefined || (until !== null && row.expiresAt > until)) until = row.expiresAt;
  }
  return until;
}

/** Best badge among EFFECTIVE rows: highest tierRank; ties keep the longer (permanent first). */
export function pickBadge(
  rows: Array<MembershipPeriodRow & { package: { tierRank: number; frameStyle: string; badgeLabel?: string | null } | null }>,
  now: Date,
): VipBadge | null {
  let best: (typeof rows)[number] | null = null;
  for (const row of rows) {
    if (!row.package || !isEffective(row, now)) continue;
    if (!best || !best.package) { best = row; continue; }
    const rank = row.package.tierRank;
    const bestRank = best.package.tierRank;
    const longer = best.expiresAt !== null && (row.expiresAt === null || row.expiresAt > best.expiresAt);
    if (rank > bestRank || (rank === bestRank && longer)) best = row;
  }
  if (!best || !best.package) return null;
  return {
    tierRank: best.package.tierRank,
    frameStyle: best.package.frameStyle,
    label: (best.package.badgeLabel || 'VIP').slice(0, 16),
  };
}

/** Exact plugin payload (capability permissions.group.v1). No other keys are ever added. */
export function buildPermissionPayload(input: { steamId: string; group: string; action: PermissionAction; expiresAt?: Date | null }): PermissionPayload {
  return {
    schemaVersion: PERMISSION_PAYLOAD_SCHEMA_VERSION,
    steamId: input.steamId,
    group: input.group,
    action: input.action,
    ...(input.action === 'add' && input.expiresAt ? { expiresAt: input.expiresAt.toISOString() } : {}),
  };
}

export const permissionDeliveryType = (action: PermissionAction) =>
  (action === 'add' ? PERMISSION_GRANT_TYPE : PERMISSION_REVOKE_TYPE);

export const permissionReferenceId = (userId: string, group: string) => `vip:${userId}:${group}`;

export function parsePermissionReferenceId(referenceId: string): { userId: string; group: string } | null {
  const match = /^vip:([^:]+):([A-Za-z0-9_-]{1,64})$/.exec(referenceId);
  return match ? { userId: match[1], group: match[2] } : null;
}

export const payloadHashOf = (payload: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/** Price must be a positive decimal with at most 2 fraction digits. */
export function isSellablePrice(price: Prisma.Decimal | string | number): boolean {
  const text = String(price);
  return /^\d+(\.\d{1,2})?$/.test(text) && Number(text) > 0;
}

// ---------------------------------------------------------------------------------------------
// Validation (admin package writes / grants)
// ---------------------------------------------------------------------------------------------

/** Built-in ArkApi Permissions groups the plugin refuses to change (case-insensitive). */
export const RESERVED_PERMISSION_GROUPS: ReadonlySet<string> = new Set(['admins', 'default']);

const priceSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,8}(\.\d{1,2})?$/.test(value), 'priceThb must be a decimal with at most 2 fraction digits');

export const vipPackageCreateSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'lowercase letters, digits and dashes (2-64 chars)'),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    permissionGroup: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'letters, digits, _ and - (1-64 chars)')
      // HeartShop never touches the Permissions plugin's built-in groups (PermissionSync.cpp).
      .refine((value) => !RESERVED_PERMISSION_GROUPS.has(value.toLowerCase()), 'Admins / Default are reserved Permissions groups')
      .optional(),
    tierRank: z.number().int().min(1).max(1000).optional(),
    frameStyle: z.string().trim().regex(/^vip-[a-z0-9-]{1,40}$/, 'frame key like vip-gold').optional(),
    badgeLabel: z.string().trim().min(1).max(16).optional(),
    priceThb: priceSchema.optional(),
    durationDays: z.number().int().min(1).max(MAX_GRANT_DAYS).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(-100000).max(100000).optional(),
  })
  .strict();

export const vipPackageUpdateSchema = vipPackageCreateSchema.partial().strict();

export const reasonSchema = z.string().trim().min(3, 'reason is required (3-500 characters)').max(500);

export const adminGrantSchema = z
  .object({
    userId: z.string().trim().min(1).max(64),
    packageId: z.string().trim().min(1).max(64),
    // undefined = package duration, null = permanent, number = custom days
    durationDays: z.number().int().min(1).max(MAX_GRANT_DAYS).nullable().optional(),
    // 'legacy' records a VIP carried over from the old iris-th.cloud system.
    source: z.enum(['admin', 'legacy']).optional(),
    reason: reasonSchema,
  })
  .strict();

export const adminExtendSchema = z.object({ days: z.number().int().min(1).max(MAX_GRANT_DAYS), reason: reasonSchema }).strict();
export const adminRevokeSchema = z.object({ reason: reasonSchema }).strict();
export const adminResyncSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, body: unknown, label: string): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
    throw new AppError(`Invalid ${label}: ${message}`, 400);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------

const iso = (value: Date | string | null | undefined) =>
  (value ? (value instanceof Date ? value.toISOString() : String(value)) : null);

/** Decimal(10,2) -> "199.00" (Prisma's Decimal#toString drops trailing zeros). */
export function formatThb(value: Prisma.Decimal | string | number | null | undefined): string {
  try {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  } catch {
    return String(value ?? '0');
  }
}

export function serializeVipPackage(pkg: any, extra: Record<string, unknown> = {}) {
  return {
    id: pkg.id,
    key: pkg.key,
    name: pkg.name,
    description: pkg.description ?? null,
    permissionGroup: pkg.permissionGroup,
    tierRank: pkg.tierRank,
    frameStyle: pkg.frameStyle,
    badgeLabel: pkg.badgeLabel ?? 'VIP',
    priceThb: formatThb(pkg.priceThb),
    durationDays: pkg.durationDays ?? null,
    isActive: Boolean(pkg.isActive),
    sortOrder: pkg.sortOrder ?? 0,
    createdAt: iso(pkg.createdAt),
    updatedAt: iso(pkg.updatedAt),
    ...extra,
  };
}

export interface PermissionJobSummary {
  id: string;
  deliveryType: string;
  status: string;
  attempts: number;
  error: string | null;
  updatedAt: Date | string | null;
  createdAt?: Date | string | null;
  serverId?: number | null;
  payload?: unknown;
}

export function serializeSync(syncStatus: string | null | undefined, syncedAt: Date | null | undefined, job: PermissionJobSummary | null | undefined) {
  return {
    status: syncStatus ?? null,
    syncedAt: iso(syncedAt),
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    action: job ? (job.deliveryType === PERMISSION_GRANT_TYPE ? 'add' : 'remove') : null,
    attempts: job?.attempts ?? null,
    lastError: job?.error ?? null,
    updatedAt: iso(job?.updatedAt ?? null),
  };
}

export function serializeMembership(row: any, now: Date, job?: PermissionJobSummary | null) {
  return {
    id: row.id,
    userId: row.userId,
    user: row.user
      ? { id: row.user.id, name: row.user.discordUsername ?? null, steamId: row.user.steamId ?? null, avatar: row.user.discordAvatar ?? null }
      : null,
    packageId: row.packageId,
    package: row.package
      ? {
          id: row.package.id,
          key: row.package.key,
          name: row.package.name,
          tierRank: row.package.tierRank,
          frameStyle: row.package.frameStyle,
          badgeLabel: row.package.badgeLabel ?? 'VIP',
          permissionGroup: row.package.permissionGroup,
        }
      : null,
    permissionGroup: row.permissionGroup,
    startsAt: iso(row.startsAt),
    expiresAt: iso(row.expiresAt),
    status: row.status,
    state: membershipState(row, now),
    source: row.source,
    paymentIntentId: row.paymentIntentId ?? null,
    grantedBy: row.grantedBy ?? null,
    revokedAt: iso(row.revokedAt),
    revokedBy: row.revokedBy ?? null,
    reason: row.reason ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    sync: serializeSync(row.syncStatus, row.syncedAt, job),
  };
}

const MEMBERSHIP_INCLUDE = {
  package: true,
  user: { select: { id: true, discordUsername: true, steamId: true, discordAvatar: true } },
} as const;

// ---------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------

export interface GrantInput {
  userId: string;
  packageId: string;
  source: 'purchase' | 'admin' | 'legacy';
  paymentIntentId?: string | null;
  grantedBy?: string | null;
  reason?: string | null;
  /** undefined = package/snapshot duration; null = permanent. */
  durationDays?: number | null;
  /** Purchase snapshot overrides (what the buyer paid for). */
  snapshot?: { durationDays?: number | null; permissionGroup?: string } | null;
  now?: Date;
}

export interface EnqueueResult {
  queued: boolean;
  jobId: string | null;
  reason?: 'no_steam' | 'no_server';
}

export class VipService {
  // ---------------- Permission sync jobs ----------------

  /**
   * FK host for a permission job. Any capable server may claim it (plugin.controller), so this
   * only picks a sensible row: a capable, non-drained, recently seen server, else any active one.
   */
  async pickHostServerId(db: Db): Promise<number | null> {
    const capable = await db.server.findFirst({
      where: { isActive: true, drainMode: false, capabilities: { has: PERMISSIONS_CAPABILITY } },
      orderBy: [{ lastHeartbeat: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      select: { id: true },
    });
    if (capable) return capable.id;
    const any = await db.server.findFirst({
      where: { isActive: true },
      orderBy: [{ lastHeartbeat: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      select: { id: true },
    });
    return any?.id ?? null;
  }

  /**
   * Queue one add/remove for (user, steamId, group). Older PENDING jobs for the same
   * (user, group, steamId) are superseded (marked completed with receipt `superseded:<new>`), so
   * only the newest desired state is ever applied; a leased job is left to finish and the claim
   * path never hands out a newer job for the same key while an older lease is live.
   */
  async enqueuePermissionJob(
    db: Db,
    input: { userId: string; steamId: string | null | undefined; group: string; action: PermissionAction; expiresAt?: Date | null },
  ): Promise<EnqueueResult> {
    if (!input.steamId) return { queued: false, jobId: null, reason: 'no_steam' };
    const serverId = await this.pickHostServerId(db);
    if (serverId === null) {
      // Nothing to host the job: never leave rows "pending" with no job. 'unqueued' rows are
      // re-queued by the expiry scheduler (requeueUnqueued) once a server row exists again.
      await db.vipMembership.updateMany({
        where: {
          userId: input.userId,
          permissionGroup: input.group,
          syncStatus: 'pending',
          ...(input.action === 'add' ? { status: 'active' } : { status: { in: ['expired', 'revoked'] } }),
        },
        data: { syncStatus: 'unqueued' },
      });
      afterCommit(() => emitAdminVip({ action: 'sync', userId: input.userId, membershipId: null, status: 'unqueued' }));
      return { queued: false, jobId: null, reason: 'no_server' };
    }

    const jobId = crypto.randomUUID();
    const referenceId = permissionReferenceId(input.userId, input.group);
    await db.deliveryJob.updateMany({
      where: {
        deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] },
        referenceId,
        playerSteamId: input.steamId,
        status: 'pending',
      },
      data: { status: 'completed', receiptId: `superseded:${jobId}`, error: `superseded by ${jobId}`, nextRetryAt: null },
    });

    const payload = buildPermissionPayload({ steamId: input.steamId, group: input.group, action: input.action, expiresAt: input.expiresAt });
    await db.deliveryJob.create({
      data: {
        id: jobId,
        serverId,
        playerSteamId: input.steamId,
        deliveryType: permissionDeliveryType(input.action),
        referenceId,
        payload: payload as unknown as Prisma.InputJsonValue,
        payloadHash: payloadHashOf(payload),
        status: 'pending',
      },
    });
    return { queued: true, jobId };
  }

  /** Called by plugin.controller inside the completion / dead-letter transaction. */
  async onPermissionJobFinished(
    db: Db,
    job: { id: string; deliveryType: string; referenceId: string; playerSteamId?: string | null },
    outcome: 'completed' | 'dead_letter',
    now: Date = new Date(),
  ): Promise<number> {
    if (!PERMISSION_DELIVERY_TYPES.has(job.deliveryType)) return 0;
    const ref = parsePermissionReferenceId(job.referenceId);
    if (!ref) return 0;
    // Only the NEWEST job for (referenceId, steamId) decides the rows' sync status. An older job
    // finishing after an extend/grant/revoke queued a newer one says nothing about the state the
    // rows now want (pending older jobs are superseded on enqueue, so any other open job is newer).
    const newer = await db.deliveryJob.findFirst({
      where: {
        id: { not: job.id },
        referenceId: job.referenceId,
        ...(job.playerSteamId ? { playerSteamId: job.playerSteamId } : {}),
        deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] },
        status: { in: ['pending', 'leased'] },
      },
      select: { id: true },
    });
    if (newer) return 0;
    const add = job.deliveryType === PERMISSION_GRANT_TYPE;
    const updated = await db.vipMembership.updateMany({
      where: {
        userId: ref.userId,
        permissionGroup: ref.group,
        ...(add ? { status: 'active' } : { status: { in: ['expired', 'revoked'] } }),
        // A dead-lettered newest job marks the rows failed whatever they showed before.
        ...(outcome === 'completed' ? { syncStatus: { not: 'synced' } } : {}),
      },
      data: outcome === 'completed' ? { syncStatus: 'synced', syncedAt: now } : { syncStatus: 'failed' },
    });
    afterCommit(() => emitAdminVip({
      action: 'sync',
      userId: ref.userId,
      membershipId: null,
      status: outcome === 'completed' ? 'synced' : 'failed',
    }));
    return updated.count;
  }

  // ---------------- Grants ----------------

  private async liveRowsForUser(db: Db, userId: string) {
    return db.vipMembership.findMany({
      where: { userId, status: 'active' },
      select: {
        id: true, packageId: true, permissionGroup: true, status: true, startsAt: true, expiresAt: true,
        package: { select: { tierRank: true } },
      },
    });
  }

  /**
   * Create one membership row and queue the Permissions add. Must run inside the caller's
   * (Serializable) transaction so the chain read and the insert are consistent.
   */
  async grantMembership(db: Db, input: GrantInput) {
    const now = input.now ?? new Date();
    const pkg = await db.vipPackage.findUnique({ where: { id: input.packageId } });
    if (!pkg) throw new AppError('VIP package not found', 404);
    const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, steamId: true } });
    if (!user) throw new AppError('User not found', 404);

    const group = input.snapshot?.permissionGroup || pkg.permissionGroup;
    const durationDays = input.durationDays !== undefined
      ? input.durationDays
      : (input.snapshot && input.snapshot.durationDays !== undefined ? input.snapshot.durationDays : pkg.durationDays);

    const live = await this.liveRowsForUser(db, input.userId);
    const period = computeChainedPeriod(now, durationDays ?? null, chainRowsFor(live, group, pkg.tierRank));

    const membership = await db.vipMembership.create({
      data: {
        userId: input.userId,
        packageId: pkg.id,
        permissionGroup: group,
        startsAt: period.startsAt,
        expiresAt: period.expiresAt,
        status: 'active',
        source: input.source,
        paymentIntentId: input.paymentIntentId ?? null,
        grantedBy: input.grantedBy ?? null,
        reason: input.reason ?? null,
        syncStatus: user.steamId ? 'pending' : 'no_steam',
      },
    });

    const holdUntil = groupHoldUntil([...live, { ...membership }], group, now);
    const job = await this.enqueuePermissionJob(db, {
      userId: input.userId,
      steamId: user.steamId,
      group,
      action: 'add',
      expiresAt: holdUntil ?? null,
    });
    return { membership, package: pkg, job };
  }

  /**
   * Payment completion for a VIP intent (Stripe webhook / verify-session / slip approval).
   * Idempotent per intent: an existing row for the intent is returned unchanged. NEVER credits IC.
   */
  async grantFromPaymentIntent(
    db: Db,
    intent: { id: string; userId: string; vipPackageId: string | null; metadata?: unknown; provider?: string; amountThb?: unknown },
    actor: { approvedBy?: string | null } = {},
  ) {
    if (!intent.vipPackageId) throw new AppError('Payment intent is not a VIP purchase', 409);
    const existing = await db.vipMembership.findUnique({ where: { paymentIntentId: intent.id } });
    if (existing) return { membership: existing, duplicate: true as const, job: null };

    const snapshot = (intent.metadata as any)?.vipSnapshot ?? null;
    const result = await this.grantMembership(db, {
      userId: intent.userId,
      packageId: intent.vipPackageId,
      source: 'purchase',
      paymentIntentId: intent.id,
      grantedBy: actor.approvedBy ?? null,
      reason: `payment:${intent.provider ?? 'unknown'}`,
      snapshot: snapshot
        ? {
            durationDays: snapshot.durationDays === null ? null : (Number.isSafeInteger(snapshot.durationDays) ? snapshot.durationDays : undefined),
            permissionGroup: typeof snapshot.permissionGroup === 'string' ? snapshot.permissionGroup : undefined,
          }
        : null,
    });

    const membership = result.membership;
    afterCommit(async () => {
      await this.emitUserVip(intent.userId, 'purchase');
      emitAdminVip({ action: 'granted', userId: intent.userId, membershipId: membership.id });
      await auditService.log({
        userId: actor.approvedBy ?? intent.userId,
        action: 'vip_purchase_grant',
        resource: 'vip_membership',
        resourceId: membership.id,
        newValue: {
          paymentIntentId: intent.id,
          packageId: membership.packageId,
          permissionGroup: membership.permissionGroup,
          startsAt: membership.startsAt,
          expiresAt: membership.expiresAt,
          amountThb: intent.amountThb === undefined ? null : String(intent.amountThb),
        },
        metadata: { targetUserId: intent.userId, provider: intent.provider ?? null, permissionJob: result.job },
      });
    });
    return { membership, duplicate: false as const, job: result.job };
  }

  async adminGrant(
    input: { userId: string; packageId: string; durationDays?: number | null; reason: string; source?: 'admin' | 'legacy' },
    actorId: string,
  ) {
    const result = await prisma.$transaction(
      (tx) => this.grantMembership(tx, {
        userId: input.userId,
        packageId: input.packageId,
        source: input.source ?? 'admin',
        grantedBy: actorId,
        reason: input.reason,
        durationDays: input.durationDays,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await auditService.log({
      userId: actorId,
      action: 'vip_admin_grant',
      resource: 'vip_membership',
      resourceId: result.membership.id,
      newValue: {
        targetUserId: input.userId,
        packageId: input.packageId,
        startsAt: result.membership.startsAt,
        expiresAt: result.membership.expiresAt,
        source: input.source ?? 'admin',
        reason: input.reason,
      },
      metadata: { permissionJob: result.job },
    });
    await this.emitUserVip(input.userId, 'admin_grant');
    emitAdminVip({ action: 'granted', userId: input.userId, membershipId: result.membership.id });
    return result;
  }

  /**
   * Extend one live row by `days`. Later rows of the same permission group chain (startsAt >= this
   * row's old expiry) shift by the same amount so the chain never overlaps. Permanent rows cannot be
   * extended.
   */
  async adminExtend(membershipId: string, days: number, reason: string, actorId: string, now: Date = new Date()) {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.vipMembership.findUnique({ where: { id: membershipId } });
      if (!row) throw new AppError('VIP membership not found', 404);
      if (!isLive(row, now)) throw new AppError(`Membership is ${membershipState(row, now)}; only active or scheduled memberships can be extended`, 409);
      if (row.expiresAt === null) throw new AppError('Membership is permanent', 409);
      const shiftMs = days * DAY_MS;
      const oldExpiry = row.expiresAt;
      const later = await tx.vipMembership.findMany({
        where: { userId: row.userId, permissionGroup: row.permissionGroup, status: 'active', id: { not: row.id }, startsAt: { gte: oldExpiry } },
        select: { id: true, startsAt: true, expiresAt: true },
      });
      const updated = await tx.vipMembership.update({
        where: { id: row.id },
        data: { expiresAt: new Date(oldExpiry.getTime() + shiftMs), syncStatus: 'pending' },
      });
      for (const next of later) {
        await tx.vipMembership.update({
          where: { id: next.id },
          data: {
            startsAt: new Date(next.startsAt.getTime() + shiftMs),
            expiresAt: next.expiresAt ? new Date(next.expiresAt.getTime() + shiftMs) : null,
            syncStatus: 'pending',
          },
        });
      }
      const user = await tx.user.findUnique({ where: { id: row.userId }, select: { steamId: true } });
      const live = await this.liveRowsForUser(tx, row.userId);
      const job = await this.enqueuePermissionJob(tx, {
        userId: row.userId,
        steamId: user?.steamId,
        group: row.permissionGroup,
        action: 'add',
        expiresAt: groupHoldUntil(live, row.permissionGroup, now) ?? null,
      });
      if (!user?.steamId) await tx.vipMembership.update({ where: { id: row.id }, data: { syncStatus: 'no_steam' } });
      return { before: row, membership: updated, shifted: later.length, job };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await auditService.log({
      userId: actorId,
      action: 'vip_admin_extend',
      resource: 'vip_membership',
      resourceId: membershipId,
      oldValue: { expiresAt: result.before.expiresAt },
      newValue: { expiresAt: result.membership.expiresAt, days, reason, shiftedLaterRows: result.shifted },
      metadata: { targetUserId: result.membership.userId, permissionJob: result.job },
    });
    await this.emitUserVip(result.membership.userId, 'admin_extend');
    emitAdminVip({ action: 'extended', userId: result.membership.userId, membershipId });
    return result;
  }

  /**
   * Revoke one row. The Permissions group is removed only when no other live row keeps it.
   * Revoking a row of a renewal chain closes the gap: later chained rows of the same group
   * (startsAt >= the revoked row's end) move earlier by the revoked row's remaining span, so the
   * website (effective = startsAt <= now) and the in-game timed group never disagree.
   */
  async adminRevoke(membershipId: string, reason: string, actorId: string, now: Date = new Date()) {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.vipMembership.findUnique({ where: { id: membershipId } });
      if (!row) throw new AppError('VIP membership not found', 404);
      if (row.status !== 'active') throw new AppError(`Membership is already ${row.status}`, 409);
      const before = groupHoldUntil((await this.liveRowsForUser(tx, row.userId)) ?? [row], row.permissionGroup, now);
      const changed = await tx.vipMembership.updateMany({
        where: { id: row.id, status: 'active' },
        data: { status: 'revoked', revokedAt: now, revokedBy: actorId, reason, syncStatus: 'pending' },
      });
      if (changed.count !== 1) throw new AppError('Membership changed concurrently; refresh and try again', 409);

      let shifted = 0;
      if (row.expiresAt !== null) {
        const from = row.startsAt > now ? row.startsAt : now;
        const spanMs = row.expiresAt.getTime() - from.getTime();
        if (spanMs > 0) {
          const later = await tx.vipMembership.findMany({
            where: { userId: row.userId, permissionGroup: row.permissionGroup, status: 'active', id: { not: row.id }, startsAt: { gte: row.expiresAt } },
            select: { id: true, startsAt: true, expiresAt: true },
          });
          for (const next of later ?? []) {
            await tx.vipMembership.update({
              where: { id: next.id },
              data: {
                startsAt: new Date(next.startsAt.getTime() - spanMs),
                expiresAt: next.expiresAt ? new Date(next.expiresAt.getTime() - spanMs) : null,
                syncStatus: 'pending',
              },
            });
            shifted += 1;
          }
        }
      }

      const removal = await this.removeGroupIfUnheld(tx, row.userId, row.permissionGroup, [row.id], now);
      let job: EnqueueResult = removal;
      if (removal.stillHeld) {
        // HeartShop applies `add` as a TIMED Permissions group ending at payload.expiresAt, so
        // when revoking this row shortens the hold (a chained row was revoked / the chain moved
        // earlier) the in-game group must be re-asserted with the new end.
        const live = await this.liveRowsForUser(tx, row.userId);
        const after = groupHoldUntil(live, row.permissionGroup, now);
        const changed = after !== undefined && (before === undefined || before === null
          ? after !== before
          : after === null || after.getTime() !== before.getTime());
        if (changed) {
          const user = await tx.user.findUnique({ where: { id: row.userId }, select: { steamId: true } });
          job = await this.enqueuePermissionJob(tx, {
            userId: row.userId,
            steamId: user?.steamId,
            group: row.permissionGroup,
            action: 'add',
            expiresAt: after ?? null,
          });
        }
      }
      return { before: row, job, shifted };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await auditService.log({
      userId: actorId,
      action: 'vip_admin_revoke',
      resource: 'vip_membership',
      resourceId: membershipId,
      oldValue: { status: result.before.status, expiresAt: result.before.expiresAt },
      newValue: { status: 'revoked', reason, shiftedLaterRows: result.shifted },
      metadata: { targetUserId: result.before.userId, permissionJob: result.job },
    });
    await this.emitUserVip(result.before.userId, 'admin_revoke');
    emitAdminVip({ action: 'revoked', userId: result.before.userId, membershipId });
    return result;
  }

  /**
   * After rows ended (expired/revoked): queue a remove when no live row keeps `group`.
   * `endedIds` rows get syncStatus pending (remove queued), no_steam, or synced (still held:
   * nothing changes in game).
   */
  async removeGroupIfUnheld(db: Db, userId: string, group: string, endedIds: string[], now: Date): Promise<EnqueueResult & { stillHeld: boolean }> {
    const remaining = await db.vipMembership.count({
      where: { userId, permissionGroup: group, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
    if (remaining > 0) {
      await db.vipMembership.updateMany({ where: { id: { in: endedIds } }, data: { syncStatus: 'synced', syncedAt: now } });
      return { queued: false, jobId: null, stillHeld: true };
    }
    const user = await db.user.findUnique({ where: { id: userId }, select: { steamId: true } });
    const job = await this.enqueuePermissionJob(db, { userId, steamId: user?.steamId, group, action: 'remove' });
    if (!job.queued && job.reason === 'no_steam') {
      await db.vipMembership.updateMany({ where: { id: { in: endedIds } }, data: { syncStatus: 'no_steam' } });
    }
    return { ...job, stillHeld: false };
  }

  /**
   * Expiry sweep (vipScheduler, web process, Redis lock). Flips due rows to `expired` and queues
   * the Permissions remove when nothing else keeps the group. Each row is its own transaction.
   */
  async expireDue(now: Date = new Date(), limit = 200) {
    const due = await prisma.vipMembership.findMany({
      where: { status: 'active', expiresAt: { lte: now } },
      select: { id: true, userId: true, permissionGroup: true, expiresAt: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    let expired = 0;
    let removalsQueued = 0;
    const users = new Set<string>();
    for (const row of due) {
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          const changed = await tx.vipMembership.updateMany({
            where: { id: row.id, status: 'active', expiresAt: { lte: now } },
            data: { status: 'expired' },
          });
          if (changed.count !== 1) return null;
          return this.removeGroupIfUnheld(tx, row.userId, row.permissionGroup, [row.id], now);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        if (!outcome) continue;
        expired += 1;
        if (outcome.queued) removalsQueued += 1;
        users.add(row.userId);
        await auditService.log({
          action: 'vip_expire',
          resource: 'vip_membership',
          resourceId: row.id,
          oldValue: { status: 'active', expiresAt: row.expiresAt },
          newValue: { status: 'expired', stillHeld: outcome.stillHeld, permissionJob: outcome.jobId },
          metadata: { targetUserId: row.userId, system: 'vip_scheduler' },
        });
        emitAdminVip({ action: 'expired', userId: row.userId, membershipId: row.id });
      } catch (error) {
        console.error(`[vip] expiry of membership ${row.id} failed:`, error);
      }
    }
    for (const userId of users) await this.emitUserVip(userId, 'expired');
    return { checked: due.length, expired, removalsQueued };
  }

  /**
   * Re-assert the desired Permissions state for every group the user ever had: add while a live
   * row exists, otherwise remove. Used by admins and after a Steam link change.
   */
  async resyncUser(userId: string, actor: { actorId?: string | null; reason?: string | null } = {}, now: Date = new Date()) {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, steamId: true } });
      if (!user) throw new AppError('User not found', 404);
      const rows = await tx.vipMembership.findMany({
        where: { userId },
        select: { id: true, permissionGroup: true, status: true, startsAt: true, expiresAt: true },
      });
      const groups = [...new Set(rows.map((row) => row.permissionGroup))].sort();
      const jobs: Array<{ group: string; action: PermissionAction } & EnqueueResult> = [];
      for (const group of groups) {
        const until = groupHoldUntil(rows, group, now);
        const action: PermissionAction = until === undefined ? 'remove' : 'add';
        const job = await this.enqueuePermissionJob(tx, { userId, steamId: user.steamId, group, action, expiresAt: until ?? null });
        const ids = rows
          .filter((row) => row.permissionGroup === group && (action === 'add' ? isLive(row, now) : !isLive(row, now)))
          .map((row) => row.id);
        if (ids.length > 0) {
          await tx.vipMembership.updateMany({
            where: { id: { in: ids } },
            data: { syncStatus: job.queued ? 'pending' : job.reason === 'no_steam' ? 'no_steam' : 'unqueued' },
          });
        }
        jobs.push({ group, action, ...job });
      }
      return { steamId: user.steamId, jobs };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (actor.actorId) {
      await auditService.log({
        userId: actor.actorId,
        action: 'vip_resync',
        resource: 'vip_membership',
        resourceId: userId,
        newValue: { jobs: result.jobs, reason: actor.reason ?? null },
        metadata: { targetUserId: userId },
      });
    }
    emitAdminVip({ action: 'resync', userId, membershipId: null });
    return result;
  }

  /**
   * Scheduler step: re-queue memberships whose Permissions change could not be queued
   * (syncStatus 'unqueued', no server row at the time) once a host server exists again.
   */
  async requeueUnqueued(now: Date = new Date(), limit = 20): Promise<number> {
    const stuck = await prisma.vipMembership.findMany({
      where: { syncStatus: 'unqueued' },
      select: { userId: true },
      distinct: ['userId'],
      take: limit,
    });
    if (!stuck || stuck.length === 0) return 0;
    if ((await this.pickHostServerId(prisma)) === null) return 0;
    let requeued = 0;
    for (const { userId } of stuck) {
      try {
        await this.resyncUser(userId, { reason: 'auto_requeue' }, now);
        requeued += 1;
      } catch (error) {
        console.error(`[vip] re-queue for user ${userId} failed:`, error);
      }
    }
    return requeued;
  }

  /**
   * Steam link changed (link / unlink). Best effort: the old Steam ID loses every group the user
   * holds, the new one gets them. Never throws into the auth flow.
   */
  async onSteamLinkChanged(userId: string, oldSteamId: string | null | undefined, newSteamId: string | null | undefined) {
    try {
      if (oldSteamId === newSteamId) return;
      const now = new Date();
      const rows = await prisma.vipMembership.findMany({
        where: { userId },
        select: { id: true, permissionGroup: true, status: true, startsAt: true, expiresAt: true },
      });
      if (rows.length === 0) return;
      if (oldSteamId) {
        const groups = [...new Set(rows.map((row) => row.permissionGroup))];
        await prisma.$transaction(async (tx) => {
          for (const group of groups) {
            await this.enqueuePermissionJob(tx, { userId, steamId: oldSteamId, group, action: 'remove' });
          }
        });
      }
      if (newSteamId) await this.resyncUser(userId, { reason: 'steam_link_changed' }, now);
      await auditService.log({
        action: 'vip_steam_link_changed',
        resource: 'vip_membership',
        resourceId: userId,
        metadata: { targetUserId: userId, hadOldSteam: Boolean(oldSteamId), hasNewSteam: Boolean(newSteamId) },
      });
    } catch (error) {
      console.error('[vip] steam link resync failed:', error);
    }
  }

  // ---------------- Reads ----------------

  async listActivePackages() {
    const rows = await prisma.vipPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { tierRank: 'asc' }, { id: 'asc' }],
    });
    // A package is sold only while active AND priced (> 0). The seed starts at 0 / inactive.
    return rows.filter((row) => isSellablePrice(row.priceThb)).map((row) => serializeVipPackage(row));
  }

  /** Badges for many users (lists, chat, market). Users without VIP are absent from the map. */
  async badgesForUserIds(userIds: Iterable<string>, now: Date = new Date()): Promise<Map<string, VipBadge>> {
    const ids = [...new Set([...userIds].filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 500);
    const out = new Map<string, VipBadge>();
    if (ids.length === 0) return out;
    // A badge is decoration: a lookup failure must never break the list/chat/market it decorates.
    let rows: Array<{
      userId: string; status: string; startsAt: Date; expiresAt: Date | null;
      package: { tierRank: number; frameStyle: string; badgeLabel: string } | null;
    }>;
    try {
      rows = (await prisma.vipMembership.findMany({
      where: {
        userId: { in: ids },
        status: 'active',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        userId: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        package: { select: { tierRank: true, frameStyle: true, badgeLabel: true } },
      },
      })) ?? [];
    } catch (error) {
      console.error('[vip] badge lookup failed:', error);
      return out;
    }
    const byUser = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }
    for (const [userId, list] of byUser) {
      const badge = pickBadge(list, now);
      if (badge) out.set(userId, badge);
    }
    return out;
  }

  async badgeForUser(userId: string, now: Date = new Date()): Promise<VipBadge | null> {
    return (await this.badgesForUserIds([userId], now)).get(userId) ?? null;
  }

  /** steamId -> badge (in-game chat). */
  async badgesForSteamIds(steamIds: Iterable<string>, now: Date = new Date()): Promise<Map<string, VipBadge>> {
    const ids = [...new Set([...steamIds].filter((id) => typeof id === 'string' && /^\d{5,20}$/.test(id)))].slice(0, 500);
    const out = new Map<string, VipBadge>();
    if (ids.length === 0) return out;
    const users = await prisma.user.findMany({ where: { steamId: { in: ids } }, select: { id: true, steamId: true } });
    const badges = await this.badgesForUserIds(users.map((user) => user.id), now);
    for (const user of users) {
      const badge = badges.get(user.id);
      if (badge && user.steamId) out.set(user.steamId, badge);
    }
    return out;
  }

  /**
   * Badge resolver for chat messages: game players are keyed by Steam ID (senderType "player"),
   * web users by IRIS user id (senderType "web_user"). Discord senders never carry a badge.
   */
  async chatBadgeResolver(messages: Array<{ senderType: string; senderId: string }>, now: Date = new Date()) {
    try {
      const steamIds = messages.filter((m) => m.senderType === 'player').map((m) => m.senderId);
      const userIds = messages.filter((m) => m.senderType === 'web_user').map((m) => m.senderId);
      const [bySteam, byUser] = await Promise.all([this.badgesForSteamIds(steamIds, now), this.badgesForUserIds(userIds, now)]);
      return (message: { senderType: string; senderId: string }): VipBadge | null => {
        if (message.senderType === 'player') return bySteam.get(message.senderId) ?? null;
        if (message.senderType === 'web_user') return byUser.get(message.senderId) ?? null;
        return null;
      };
    } catch (error) {
      console.error('[vip] chat badge lookup failed:', error);
      return () => null;
    }
  }

  /** Permission groups held right now by the user linked to `steamId` (chat rank fallback). */
  async heldGroupsForSteamId(steamId: string, now: Date = new Date()): Promise<string[]> {
    if (!/^\d{5,20}$/.test(steamId)) return [];
    const user = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
    if (!user) return [];
    const rows = await prisma.vipMembership.findMany({
      where: { userId: user.id, status: 'active', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { permissionGroup: true },
    });
    return [...new Set(rows.map((row) => row.permissionGroup))];
  }

  /** Latest permission job per (user, group) reference id. */
  async latestPermissionJobs(referenceIds: string[]): Promise<Map<string, PermissionJobSummary>> {
    const out = new Map<string, PermissionJobSummary>();
    const refs = [...new Set(referenceIds)];
    if (refs.length === 0) return out;
    const jobs = await prisma.deliveryJob.findMany({
      where: { referenceId: { in: refs }, deliveryType: { in: [...PERMISSION_DELIVERY_TYPE_LIST] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['referenceId'],
      select: { id: true, referenceId: true, deliveryType: true, status: true, attempts: true, error: true, updatedAt: true, createdAt: true, serverId: true },
    });
    for (const job of jobs ?? []) out.set(job.referenceId, job);
    return out;
  }

  async getMyVip(userId: string, now: Date = new Date()) {
    const [rows, user] = await Promise.all([
      prisma.vipMembership.findMany({
        where: { userId },
        include: MEMBERSHIP_INCLUDE,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { steamId: true } }),
    ]);
    const jobs = await this.latestPermissionJobs(rows.map((row) => permissionReferenceId(row.userId, row.permissionGroup)));
    const badge = pickBadge(rows, now);
    const effective = rows.filter((row) => isEffective(row, now));
    // "active" = the effective row that ends last (permanent first), as the frontend expects.
    const active = effective.sort((a, b) => {
      if (a.expiresAt === null) return -1;
      if (b.expiresAt === null) return 1;
      return b.expiresAt.getTime() - a.expiresAt.getTime();
    })[0] ?? null;
    const groups = [...new Set(rows.map((row) => row.permissionGroup))]
      .map((group) => {
        const until = groupHoldUntil(rows, group, now);
        return until === undefined ? null : { group, expiresAt: until === null ? null : until.toISOString() };
      })
      .filter((value): value is { group: string; expiresAt: string | null } => value !== null);
    const serialize = (row: any) => serializeMembership(row, now, jobs.get(permissionReferenceId(row.userId, row.permissionGroup)));
    return {
      vip: badge,
      isVip: badge !== null,
      active: active ? serialize(active) : null,
      groups,
      steamLinked: Boolean(user?.steamId),
      memberships: rows.map(serialize),
    };
  }

  /**
   * In-game `/vip` (plugin gateway GET /plugin/player/:steamId/vip). VIP is cluster-wide, so this
   * is not scoped to the calling server. Unknown / unlinked Steam IDs answer `linked: false`.
   * Shape is a compact subset of GET /vip/me that HeartShop's PermissionSync::ParseVipStatus reads.
   */
  async getPluginVipStatus(steamId: string, now: Date = new Date()) {
    if (!/^\d{17}$/.test(steamId)) throw new AppError('Invalid steamId', 400);
    const user = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
    if (!user) return { linked: false, steamLinked: false, isVip: false, vip: null, active: null, groups: [] };
    const rows = await prisma.vipMembership.findMany({
      where: { userId: user.id, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { package: { select: { name: true, tierRank: true, frameStyle: true, badgeLabel: true } } },
    });
    const badge = pickBadge(rows, now);
    const effective = rows.filter((row) => isEffective(row, now)).sort((a, b) => {
      if (a.expiresAt === null) return -1;
      if (b.expiresAt === null) return 1;
      return b.expiresAt.getTime() - a.expiresAt.getTime();
    });
    const top = effective[0] ?? null;
    const groups = [...new Set(rows.map((row) => row.permissionGroup))]
      .map((group) => {
        const until = groupHoldUntil(rows, group, now);
        return until === undefined ? null : { group, expiresAt: until === null ? null : until.toISOString() };
      })
      .filter((value): value is { group: string; expiresAt: string | null } => value !== null);
    return {
      linked: true,
      steamLinked: true,
      isVip: badge !== null,
      vip: badge,
      active: top
        ? {
          state: 'active',
          packageName: top.package?.name ?? null,
          label: top.package?.badgeLabel ?? 'VIP',
          tierRank: top.package?.tierRank ?? 0,
          permissionGroup: top.permissionGroup,
          expiresAt: iso(top.expiresAt),
        }
        : null,
      groups,
    };
  }

  /** vip:updated payload for one user, emitted after commit by the callers. */
  async emitUserVip(userId: string, reason: string) {
    try {
      const now = new Date();
      const rows = await prisma.vipMembership.findMany({
        where: { userId, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: {
          status: true,
          startsAt: true,
          expiresAt: true,
          permissionGroup: true,
          package: { select: { tierRank: true, frameStyle: true, badgeLabel: true } },
        },
      });
      const badge = pickBadge(rows, now);
      let latest: Date | null = null;
      let permanent = false;
      for (const row of rows) {
        if (row.expiresAt === null) permanent = true;
        else if (!latest || row.expiresAt > latest) latest = row.expiresAt;
      }
      emitVipUpdated(userId, {
        vip: badge,
        expiresAt: badge && !permanent && latest ? latest.toISOString() : null,
        reason,
      });
    } catch (error) {
      console.error('[vip] vip:updated failed:', error);
    }
  }

  // ---------------- Packages (admin) ----------------

  /** Reuse the Chat Ranks system: make sure the group has a global rank (never overwrites one). */
  async ensureChatRankForGroup(db: Db, group: string, label: string) {
    const existing = await db.chatRank.findFirst({ where: { groupKey: group, serverId: null } });
    if (existing) return false;
    await db.chatRank.create({
      data: { name: label.slice(0, 32) || group, groupKey: group, color: '#D4AF37', icon: null, priority: 50, serverId: null, isActive: true },
    });
    return true;
  }
}

export const vipService = new VipService();
export default vipService;
