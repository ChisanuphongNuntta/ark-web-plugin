import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import prisma from "../config/database.js";
import {
  authenticate,
  authenticateSignedPlugin,
  requireWebsiteAdmin,
} from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import * as rights from "../services/entitlements.service.js";
import {
  buyTokensIc,
  postTokens,
  serializable,
} from "../services/perkTokens.service.js";
import paymentService from "../services/payment.service.js";
import vipService, {
  groupHoldUntil,
  vipPackageCreateSchema,
  vipPackageUpdateSchema,
  permissionGroupSchema,
  adminGrantSchema,
  reasonSchema,
} from "../services/vip.service.js";
import { emitPerksUpdated, emitAdminPerks } from "../realtime/emit.js";

export const perksRoutes = Router(),
  adminPerksRoutes = Router(),
  pluginPerksRoutes = Router();
const run =
  (fn: (req: any) => Promise<any>) => async (req: any, res: any, next: any) => {
    try {
      const result = await fn(req);
      const creates =
        req.method === "POST" &&
        (/^\/(features|plans|token-packs|promotions)$/.test(req.path) ||
          req.path.endsWith("/subscriptions") ||
          ["/checkout", "/buy-tokens-ic"].includes(req.path));
      res.status(creates && !result.replayed ? 201 : 200).json(clean(result));
    } catch (e) {
      const code = (e as any)?.code;
      next(
        code === "P2002"
          ? new AppError("Key already exists", 409)
          : code === "P2003"
            ? new AppError("Referenced record not found", 400)
            : e,
      );
    }
  };
export const clean = (v: any): any =>
  typeof v === "bigint"
    ? v.toString()
    : v instanceof Date
      ? v.toISOString()
      : v?.constructor?.name === "Decimal"
        ? v.toFixed(2)
        : Array.isArray(v)
          ? v.map(clean)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, clean(x)]),
              )
            : v;
function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new AppError(
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  return r.data;
}
const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
  name = z.string().trim().min(1).max(120),
  quota = z.discriminatedUnion("type", [
    z.object({ type: z.literal("unlimited") }),
    z.object({
      type: z.enum(["per_day", "per_week", "per_period"]),
      limit: z.number().int().min(1).max(100000),
    }),
  ]);
const featureSchema = z
  .object({
    key,
    name,
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(120).nullable().optional(),
    commands: z
      .array(z.string().regex(/^\/[a-z0-9_-]{1,31}$/))
      .max(50)
      .optional(),
    permissionGroup: permissionGroupSchema.nullable().optional(),
    tokenCost: z.number().int().min(1).max(100000).nullable().optional(),
    freeForAll: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
const packSchema = z
  .object({
    key,
    name,
    description: z.string().max(2000).nullable().optional(),
    tokens: z.number().int().min(1).max(100000),
    priceThb: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    priceIc: z
      .string()
      .regex(/^\d{1,18}$/)
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
const promotionSchema = z
  .object({
    key,
    name,
    description: z.string().max(2000).nullable().optional(),
    featureKeys: z.array(key).min(1).max(100),
    quota: z.object({
      type: z.enum(["per_day", "per_week"]),
      limit: z.number().int().min(1).max(100000),
    }),
    audience: z.string().regex(/^(all|linked|plan:[a-z0-9._-]+)$/),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
const presentPlan = (p: any) => ({
  ...p,
  periodDays: p.durationDays,
  grants: p.grants?.map((g: any) => ({
    featureKey: g.featureKey,
    featureName: g.feature?.name,
    commands: g.feature?.commands,
    quota: {
      type: g.quotaType,
      ...(g.quotaLimit ? { limit: g.quotaLimit } : {}),
    },
  })),
});
const presentPromotion = (p: any) => ({
  ...p,
  quota: { type: p.quotaType, limit: p.quotaLimit },
});
async function me(userId: string, admin = false) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, steamId: true, discordUsername: true },
  });
  if (!user) throw new AppError("User not found", 404);
  const [features, subscriptions, a, ledger, usage] = await Promise.all([
    prisma.perkFeature.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.vipMembership.findMany({
      where: {
        userId,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { package: true },
    }),
    prisma.perkTokenAccount.findUnique({ where: { userId } }),
    prisma.perkTokenLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: admin ? 50 : 20,
    }),
    prisma.entitlementUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: admin ? 50 : 20,
    }),
  ]);
  const statuses = [];
  for (const f of features)
    statuses.push({
      ...f,
      decision: rights.publicDecision(
        await rights.evaluate(
          prisma,
          user.steamId || `web:${userId}`,
          f,
          new Date(),
          user,
        ),
      ),
    });
  const sum = await prisma.perkTokenLedgerEntry.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return {
    user,
    steamLinked: Boolean(user.steamId),
    subscriptions: subscriptions.map((m) => ({
      ...m,
      plan: m.package,
      state: m.startsAt > new Date() ? "scheduled" : "active",
    })),
    tokens: {
      balance: a?.balance ?? 0,
      ledgerSum: sum._sum.delta ?? 0,
      consistent: (a?.balance ?? 0) === (sum._sum.delta ?? 0),
      ledger,
    },
    features: statuses,
    recentUsage: usage.map((row) => ({
      ...row,
      featureName:
        features.find((f) => f.key === row.featureKey)?.name ?? row.featureKey,
    })),
    usage: usage.map((row) => ({
      ...row,
      featureName:
        features.find((f) => f.key === row.featureKey)?.name ?? row.featureKey,
    })),
  };
}
perksRoutes.get(
  "/catalog",
  run(async () => {
    const c = await rights.catalog();
    const now = new Date();
    return {
      features: c.features.map(({ grants, ...f }) => f),
      plans: c.plans
        .filter((p) => p.isActive && Number(p.priceThb) > 0)
        .map(presentPlan),
      tokenPacks: await prisma.perkTokenPack.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      promotions: c.promotions
        .filter((p) => p.startsAt <= now && (!p.endsAt || p.endsAt > now))
        .map(presentPromotion),
      perksUrl: c.perksUrl,
    };
  }),
);
perksRoutes.get(
  "/me",
  authenticate as any,
  run((req) => me(req.user.id)),
);
perksRoutes.post(
  "/checkout",
  authenticate as any,
  rateLimit({
    windowMs: 600000,
    max: 10,
    keyGenerator: (req: any) => req.user.id,
  }),
  run(async (req) => {
    const b = parse(
      z
        .object({
          planKey: key.optional(),
          packKey: key.optional(),
          provider: z.enum(["stripe", "bank_slip"]),
          slipImageUrl: z.string().optional(),
          transferBank: z.string().optional(),
          transferRef: z.string().optional(),
          notes: z.string().optional(),
        })
        .refine(
          (x) => Boolean(x.planKey) !== Boolean(x.packKey),
          "Exactly one planKey or packKey required",
        ),
      req.body,
    );
    const id = req.header("Idempotency-Key") || "";
    if (b.planKey) {
      const p = await prisma.vipPackage.findUnique({
        where: { key: b.planKey },
      });
      if (!p) throw new AppError("Plan not found", 404);
      return paymentService.createVipIntent(
        req.user.id,
        p.id,
        id,
        b.provider,
        b,
        "/perks",
      );
    }
    const p = await prisma.perkTokenPack.findUnique({
      where: { key: b.packKey! },
    });
    if (!p) throw new AppError("Pack not found", 404);
    return paymentService.createTokenIntent(
      req.user.id,
      p.id,
      id,
      b.provider,
      b,
    );
  }),
);
perksRoutes.post(
  "/buy-tokens-ic",
  authenticate as any,
  run(async (req) => {
    const b = parse(z.object({ packKey: key }), req.body);
    const r = await buyTokensIc(
      req.user.id,
      b.packKey,
      req.header("Idempotency-Key") || "",
    );
    emitPerksUpdated(req.user.id, {
      reason: "purchase",
      tokens: r.tokens.balance,
    });
    return r;
  }),
);
pluginPerksRoutes.use(authenticateSignedPlugin as any);
pluginPerksRoutes.get(
  "/catalog",
  run(async () => {
    const c = await rights.catalog();
    return {
      catalogVersion: c.catalogVersion,
      siteUrl: c.siteUrl,
      perksUrl: c.perksUrl,
      features: c.features.map((f) => ({
        key: f.key,
        name: f.name,
        commands: f.commands,
        freeForAll: f.freeForAll,
        free: f.freeForAll,
        tokenCost: f.tokenCost,
        isActive: true,
        planNames: f.grants
          .filter((g) => g.package.isActive)
          .map((g) => g.package.name),
      })),
    };
  }),
);
pluginPerksRoutes.get(
  "/snapshot",
  run(async (req) => {
    const ids = parse(z.string(), req.query.steamIds).split(",");
    parse(
      z
        .array(z.string().regex(/^7656119\d{10}$/))
        .min(1)
        .max(100),
      ids,
    );
    return rights.snapshot([...new Set(ids)]);
  }),
);
pluginPerksRoutes.post(
  "/consume",
  run(async (req) => {
    const b = parse(
      z
        .object({
          steamId: z.string().regex(/^7656119\d{10}$/),
          featureKey: key,
          idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,128}$/),
          command: z.string().max(64).optional(),
        })
        .strict(),
      req.body,
    );
    return rights.consume({ ...b, serverId: req.serverId });
  }),
);
adminPerksRoutes.use(authenticate as any, requireWebsiteAdmin as any);
const audit = async (
  tx: any,
  req: any,
  action: string,
  id: string,
  data: any,
) => {
  await tx.auditLog.create({
    data: {
      userId: req.user.id,
      action,
      resource: "perks",
      resourceId: id,
      newValue: JSON.stringify(clean(data)),
    },
  });
};
async function mutate(
  req: any,
  kind: "feature" | "plan" | "token_pack" | "promotion",
  updating: boolean,
) {
  return serializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(61611113)`;
    const model: any =
      kind === "feature"
        ? tx.perkFeature
        : kind === "plan"
          ? tx.vipPackage
          : kind === "token_pack"
            ? tx.perkTokenPack
            : tx.perkPromotion;
    const where =
      kind === "feature" ? { key: req.params.id } : { id: req.params.id };
    const before = updating ? await model.findUnique({ where }) : null;
    if (updating && !before) throw new AppError("Not found", 404);
    // Keep the old group set before replacing grants so removed groups are revoked too.
    const affectedGrants =
      before && (kind === "feature" || kind === "plan")
        ? await tx.planGrant.findMany({
            where:
              kind === "feature"
                ? { featureKey: before.key }
                : { packageId: before.id },
            include: { feature: true },
          })
        : [];
    const oldGroups = [
      ...new Set(
        affectedGrants
          .map((g) => g.feature.permissionGroup)
          .filter((g): g is string => Boolean(g)),
      ),
    ];
    const affectedPackageIds =
      kind === "plan" && before
        ? [before.id]
        : [...new Set(affectedGrants.map((g) => g.packageId))];
    let data: any;
    if (kind === "feature") {
      data = parse(
        updating ? featureSchema.partial() : featureSchema,
        req.body,
      );
      const effective = { ...before, ...data };
      if (effective.isActive) {
        const clash = await tx.perkFeature.findFirst({
          where: {
            isActive: true,
            commands: { hasSome: effective.commands || [] },
            ...(before ? { id: { not: before.id } } : {}),
          },
        });
        if (clash)
          throw new AppError("Command already gated by another feature", 409);
      }
      if (
        effective.permissionGroup &&
        (await tx.vipPackage.findFirst({
          where: { permissionGroup: effective.permissionGroup },
        }))
      )
        throw new AppError("Feature group conflicts with plan group", 400);
    } else if (kind === "token_pack") {
      data = parse(updating ? packSchema.partial() : packSchema, req.body);
      const e = { ...before, ...data };
      if (
        e.isActive &&
        !(Number(e.priceThb) > 0 || BigInt(e.priceIc || 0) > 0n)
      )
        throw new AppError("Set a price before activation", 409);
      if (data.priceIc !== undefined && data.priceIc !== null)
        data.priceIc = BigInt(data.priceIc);
    } else if (kind === "promotion") {
      const raw: any = parse(
        updating ? promotionSchema.partial() : promotionSchema,
        req.body,
      );
      data = { ...raw };
      delete data.quota;
      if (raw.quota) {
        data.quotaType = raw.quota.type;
        data.quotaLimit = raw.quota.limit;
      }
      if (raw.startsAt) data.startsAt = new Date(raw.startsAt);
      if (raw.endsAt) data.endsAt = new Date(raw.endsAt);
      const e = { startsAt: new Date(), ...before, ...data };
      if (e.endsAt && e.endsAt <= e.startsAt)
        throw new AppError("endsAt must follow startsAt", 400);
      if (
        e.audience?.startsWith("plan:") &&
        !(await tx.vipPackage.findUnique({
          where: { key: e.audience.slice(5) },
        }))
      )
        throw new AppError("Audience plan not found", 400);
      const count = await tx.perkFeature.count({
        where: { key: { in: e.featureKeys } },
      });
      if (count !== new Set(e.featureKeys).size)
        throw new AppError("Unknown promotion feature", 400);
    } else {
      const raw = { ...req.body };
      const grants = raw.grants;
      delete raw.grants;
      if ("periodDays" in raw) {
        raw.durationDays = raw.periodDays;
        delete raw.periodDays;
      }
      data = parse(
        updating ? vipPackageUpdateSchema : vipPackageCreateSchema,
        raw,
      );
      const e = { priceThb: "0", ...before, ...data };
      if (e.isActive && !(Number(e.priceThb) > 0))
        throw new AppError("Set a price before activation", 409);
      if (
        e.permissionGroup &&
        (await tx.perkFeature.findFirst({
          where: { permissionGroup: e.permissionGroup },
        }))
      )
        throw new AppError("Plan group conflicts with feature group", 400);
      if (grants !== undefined) {
        const list = parse(
          z.array(z.object({ featureKey: key, quota })).max(200),
          grants,
        );
        if (new Set(list.map((g) => g.featureKey)).size !== list.length)
          throw new AppError("Duplicate feature grants", 400);
        const count = await tx.perkFeature.count({
          where: { key: { in: list.map((g) => g.featureKey) } },
        });
        if (count !== list.length)
          throw new AppError("Unknown plan feature", 400);
        data.grants = {
          ...(updating ? { deleteMany: {} } : {}),
          create: list.map((g) => ({
            featureKey: g.featureKey,
            quotaType: g.quota.type,
            quotaLimit: "limit" in g.quota ? g.quota.limit : null,
          })),
        };
      }
    }
    const row = updating
      ? await model.update({ where, data })
      : await model.create({ data });
    if (before && data.key && data.key !== before.key) {
      if (kind === "feature") {
        const promotions = await tx.perkPromotion.findMany({
          where: { featureKeys: { has: before.key } },
        });
        for (const promotion of promotions)
          await tx.perkPromotion.update({
            where: { id: promotion.id },
            data: {
              featureKeys: promotion.featureKeys.map((key) =>
                key === before.key ? row.key : key,
              ),
            },
          });
      } else if (kind === "plan") {
        await tx.perkPromotion.updateMany({
          where: { audience: `plan:${before.key}` },
          data: { audience: `plan:${row.key}` },
        });
      }
    }
    if (kind === "feature" || kind === "plan") {
      const affectedUsers = affectedPackageIds.length
        ? await tx.vipMembership.findMany({
            where: { packageId: { in: affectedPackageIds } },
            select: { userId: true },
            distinct: ["userId"],
          })
        : [];
      for (const { userId } of affectedUsers) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { steamId: true },
        });
        if (!user?.steamId) continue;
        const memberships = await tx.vipMembership.findMany({
          where: { userId },
          include: {
            package: { include: { grants: { include: { feature: true } } } },
          },
        });
        const groups = new Set(oldGroups);
        for (const m of memberships)
          for (const g of m.package.grants)
            if (g.feature.permissionGroup)
              groups.add(g.feature.permissionGroup);
        for (const group of groups) {
          const holding = memberships
            .filter(
              (m) =>
                m.permissionGroup === group ||
                m.package.grants.some(
                  (g) => g.feature.permissionGroup === group,
                ),
            )
            .map((m) => ({ ...m, permissionGroup: group }));
          const until = groupHoldUntil(holding, group, new Date());
          await vipService.enqueuePermissionJob(tx, {
            userId,
            steamId: user.steamId,
            group,
            action: until === undefined ? "remove" : "add",
            expiresAt: until ?? null,
          });
        }
      }
    }
    await audit(
      tx,
      req,
      `perk_${kind}_${updating ? "update" : "create"}`,
      row.id,
      row,
    );
    return row;
  });
}
for (const [path, kind, plural, singular] of [
  ["features", "feature", "features", "feature"],
  ["plans", "plan", "plans", "plan"],
  ["token-packs", "token_pack", "tokenPacks", "tokenPack"],
  ["promotions", "promotion", "promotions", "promotion"],
] as const) {
  adminPerksRoutes.get(
    `/${path}`,
    run(async () => {
      const rows =
        kind === "feature"
          ? await prisma.perkFeature.findMany({
              include: { grants: { include: { package: true } } },
            })
          : kind === "plan"
            ? await prisma.vipPackage.findMany({
                include: {
                  grants: { include: { feature: true } },
                  _count: {
                    select: {
                      memberships: {
                        where: {
                          status: "active",
                          startsAt: { lte: new Date() },
                          OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } },
                          ],
                        },
                      },
                    },
                  },
                },
              })
            : kind === "token_pack"
              ? await prisma.perkTokenPack.findMany()
              : await prisma.perkPromotion.findMany();
      return {
        [plural]: rows.map((r: any) =>
          kind === "plan"
            ? {
                ...presentPlan(r),
                activeSubscriptions: r._count?.memberships ?? 0,
              }
            : kind === "promotion"
              ? presentPromotion(r)
              : kind === "feature"
                ? { ...r, planKeys: r.grants.map((g: any) => g.package.key) }
                : r,
        ),
      };
    }),
  );
  for (const updating of [false, true]) {
    const handler = run(async (req) => {
      const row = await mutate(req, kind, updating);
      emitAdminPerks({ action: kind, userId: null, id: row.id });
      return {
        [singular]:
          kind === "plan"
            ? presentPlan(
                await prisma.vipPackage.findUnique({
                  where: { id: row.id },
                  include: { grants: { include: { feature: true } } },
                }),
              )
            : kind === "promotion"
              ? presentPromotion(row)
              : row,
      };
    });
    if (updating) adminPerksRoutes.put(`/${path}/:id`, handler);
    else adminPerksRoutes.post(`/${path}`, handler);
  }
}
adminPerksRoutes.delete(
  "/promotions/:id",
  run(async (req) => {
    req.body = { isActive: false };
    return {
      promotion: presentPromotion(await mutate(req, "promotion", true)),
    };
  }),
);
adminPerksRoutes.get(
  "/users/:id",
  run((req) => me(req.params.id, true)),
);
adminPerksRoutes.post(
  "/users/:id/subscriptions",
  run(async (req) => {
    const b = req.body;
    const plan = b.planId
      ? await prisma.vipPackage.findUnique({ where: { id: b.planId } })
      : b.planKey
        ? await prisma.vipPackage.findUnique({ where: { key: b.planKey } })
        : null;
    if (!plan) throw new AppError("Plan not found", 404);
    const data = parse(adminGrantSchema, {
      userId: req.params.id,
      packageId: plan.id,
      reason: b.reason,
      ...("durationDays" in b ? { durationDays: b.durationDays } : {}),
    });
    return vipService.adminGrant(data, req.user.id);
  }),
);
adminPerksRoutes.post(
  "/subscriptions/:id/revoke",
  run((req) =>
    vipService.adminRevoke(
      req.params.id,
      parse(reasonSchema, req.body.reason),
      req.user.id,
    ),
  ),
);
adminPerksRoutes.post(
  "/users/:id/tokens",
  run(async (req) => {
    const b = parse(
      z.object({
        delta: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((x) => x !== 0),
        reason: reasonSchema,
        idempotencyKey: z.string().min(8).max(128).optional(),
      }),
      req.body,
    );
    const k = req.header("Idempotency-Key") || b.idempotencyKey;
    if (!k || !/^[A-Za-z0-9:._-]{8,128}$/.test(k))
      throw new AppError(
        "Idempotency key required (8-128 safe characters)",
        400,
      );
    const result = await serializable(async (tx) => {
      const r = await postTokens(tx, {
        userId: req.params.id,
        delta: b.delta,
        type: "admin_adjust",
        idempotencyKey: `admin:tokens:${req.user.id}:${k}`,
        reason: b.reason,
        createdBy: req.user.id,
      });
      if (!r.replayed)
        await audit(tx, req, "perk_tokens_adjust", r.entry.id, b);
      return r;
    });
    emitPerksUpdated(req.params.id, {
      reason: "admin_tokens",
      tokens: result.balance,
    });
    return result;
  }),
);
adminPerksRoutes.get(
  "/usage",
  run(async (req) => {
    const page =
      parse(
        z.coerce.number().int().min(1).max(1000000).default(1),
        req.query.page,
      ) ?? 1;
    const pageSize =
      parse(
        z.coerce.number().int().min(1).max(100).default(25),
        req.query.pageSize,
      ) ?? 25;
    const where: any = {};
    for (const k of ["userId", "steamId", "featureKey", "source"])
      if (req.query[k]) where[k] = String(req.query[k]);
    if (req.query.allowed !== undefined)
      where.allowed =
        parse(z.enum(["true", "false"]), req.query.allowed) === "true";
    if (req.query.serverId)
      where.serverId = parse(
        z.coerce.number().int().min(1),
        req.query.serverId,
      );
    const from = req.query.from
      ? parse(z.coerce.date(), req.query.from)
      : undefined;
    const to = req.query.to ? parse(z.coerce.date(), req.query.to) : undefined;
    if (from && to && to < from) throw new AppError("Invalid usage dates", 400);
    if (from || to)
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: to } : {}),
      };
    if (req.query.search) {
      const search = parse(z.string().trim().max(200), req.query.search);
      where.OR = [
        { steamId: { contains: search } },
        { featureKey: { contains: search, mode: "insensitive" } },
        { command: { contains: search, mode: "insensitive" } },
        {
          user: { discordUsername: { contains: search, mode: "insensitive" } },
        },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.entitlementUsage.findMany({
        where,
        include: { user: { select: { id: true, discordUsername: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.entitlementUsage.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }),
);
adminPerksRoutes.get(
  "/revenue",
  run(async (req) => {
    const from = req.query.from
      ? new Date(
          String(req.query.from).length === 10
            ? `${req.query.from}T00:00:00+07:00`
            : req.query.from,
        )
      : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to
      ? new Date(
          String(req.query.to).length === 10
            ? `${req.query.to}T23:59:59.999+07:00`
            : req.query.to,
        )
      : new Date();
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to < from)
      throw new AppError("Invalid revenue dates", 400);
    const payments = await prisma.paymentIntent.findMany({
      where: {
        status: "completed",
        completedAt: { gte: from, lte: to },
        OR: [
          { vipPackageId: { not: null } },
          { perkTokenPackId: { not: null } },
        ],
      },
      include: { vipPackage: true, perkTokenPack: true },
    });
    const entries = await prisma.perkTokenLedgerEntry.findMany({
      where: { createdAt: { gte: from, lte: to } },
    });
    const thb = new Map<string, any>(),
      ic = new Map<string, any>();
    let cents = 0n,
      totalIc = 0n;
    for (const p of payments) {
      const product = p.vipPackage || p.perkTokenPack!;
      const kind = p.vipPackage ? "plan" : "token_pack";
      const key = `${kind}:${product.id}`;
      const n = BigInt(p.amountThb.toFixed(2).replace(".", ""));
      cents += n;
      const r = thb.get(key) || {
        kind,
        id: product.id,
        key: product.key,
        name: product.name,
        count: 0,
        cents: 0n,
      };
      r.count++;
      r.cents += n;
      thb.set(key, r);
    }
    for (const e of entries.filter((e) => e.type === "purchase_ic")) {
      totalIc += e.amountIc ?? 0n;
      const id = e.packId!;
      const pack = await prisma.perkTokenPack.findUnique({ where: { id } });
      const r = ic.get(id) || {
        key: pack?.key ?? id,
        name: pack?.name ?? id,
        kind: "token_pack",
        id,
        count: 0,
        amountIc: 0n,
        tokens: 0,
      };
      r.count++;
      r.amountIc += e.amountIc ?? 0n;
      r.tokens += e.delta;
      ic.set(id, r);
    }
    const money = (n: bigint) =>
      `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
    return {
      from,
      to,
      thb: {
        total: money(cents),
        byProduct: [...thb.values()].map(({ cents, ...r }) => ({
          ...r,
          amountThb: money(cents),
        })),
      },
      ic: { total: totalIc, byProduct: [...ic.values()] },
      tokens: {
        issued: entries
          .filter((e) => e.type.startsWith("purchase"))
          .reduce((s, e) => s + e.delta, 0),
        consumed: -entries
          .filter((e) => e.type === "consume")
          .reduce((s, e) => s + e.delta, 0),
        adjusted: entries
          .filter((e) => e.type === "admin_adjust")
          .reduce((s, e) => s + e.delta, 0),
      },
    };
  }),
);
