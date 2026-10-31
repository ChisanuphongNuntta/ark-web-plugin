import { createHash } from "node:crypto";
import prisma from "../config/database.js";
import { AppError } from "../middlewares/errorHandler.js";
import { serializable, postTokens } from "./perkTokens.service.js";
import { emitPerksUpdated } from "../realtime/emit.js";
export function quotaWindow(
  type: string,
  now: Date,
  m?: { startsAt: Date; expiresAt: Date | null },
) {
  if (type === "per_period" && m)
    return { start: m.startsAt, end: m.expiresAt };
  const d = new Date(now.getTime() + 7 * 3600000);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 7 * 3600000,
  );
  if (type === "per_week")
    start.setUTCDate(start.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return {
    start,
    end: new Date(start.getTime() + (type === "per_week" ? 7 : 1) * 86400000),
  };
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const siteUrl = () =>
  (
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    "https://www.iris-th.cloud"
  ).replace(/\/$/, "");
export async function evaluate(
  db: any,
  steamId: string,
  f: any,
  now = new Date(),
  explicitUser?: any,
  context?: { user: any; account: any; memberships: any[]; promotions: any[] },
): Promise<any> {
  const user = context
    ? context.user
    : (explicitUser ??
      (await db.user.findUnique({
        where: { steamId },
        select: { id: true, isBanned: true },
      })));
  const account = context
    ? context.account
    : user
      ? await db.perkTokenAccount.findUnique({ where: { userId: user.id } })
      : null;
  const balance = account?.balance ?? 0;
  const base = {
    allowed: false,
    source: null,
    sourceRef: null,
    remaining: null,
    reason: null,
    tokenCost: f?.tokenCost ?? null,
    windowResetsAt: null,
    user,
    balance,
    refId: null,
  };
  const deny = (reason: string) => ({
    ...base,
    reason,
    message: `You need a subscription or Perk Tokens for ${f?.commands?.[0] || "this feature"}. Get it at ${siteUrl()}/perks`,
  });
  if (!f) return deny("unknown_feature");
  if (!f.isActive) return deny("feature_inactive");
  if (user?.isBanned) return deny("banned");
  if (f.freeForAll) return { ...base, allowed: true, source: "free" };
  const memberships = context
    ? context.memberships
    : user
      ? await db.vipMembership.findMany({
          where: {
            userId: user.id,
            status: "active",
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          include: { package: { include: { grants: true } } },
        })
      : [];
  const promotions = context
    ? context.promotions.filter((p) => p.featureKeys.includes(f.key))
    : await db.perkPromotion.findMany({
        where: {
          isActive: true,
          featureKeys: { has: f.key },
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        orderBy: [{ endsAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      });
  let exhausted = false;
  for (const p of promotions) {
    if (!(
      p.audience === "all" ||
      (user && p.audience === "linked") ||
      memberships.some((m: any) => p.audience === `plan:${m.package.key}`)
    ))
      continue;
    const w = quotaWindow(p.quotaType, now);
    const used = await db.entitlementUsage.count({
      where: {
        steamId,
        allowed: true,
        source: "promotion",
        sourceRef: p.id,
        createdAt: { gte: w.start, ...(w.end ? { lt: w.end } : {}) },
      },
    });
    if (used < p.quotaLimit)
      return {
        ...base,
        allowed: true,
        source: "promotion",
        sourceRef: p.key,
        remaining: p.quotaLimit - used,
        windowResetsAt: w.end?.toISOString() ?? null,
        refId: p.id,
      };
    exhausted = true;
  }
  const candidates = memberships
    .flatMap((m: any) =>
      m.package.grants
        .filter((g: any) => g.featureKey === f.key)
        .map((g: any) => ({ m, g })),
    )
    .sort(
      (a: any, b: any) =>
        Number(b.g.quotaType === "unlimited") -
        Number(a.g.quotaType === "unlimited"),
    );
  for (const { m, g } of candidates) {
    if (g.quotaType === "unlimited")
      return {
        ...base,
        allowed: true,
        source: "subscription",
        sourceRef: m.package.key,
        refId: m.packageId,
      };
    const w = quotaWindow(g.quotaType, now, m);
    const used = await db.entitlementUsage.count({
      where: {
        userId: user.id,
        featureKey: f.key,
        allowed: true,
        source: "subscription",
        sourceRef: m.packageId,
        createdAt: { gte: w.start, ...(w.end ? { lt: w.end } : {}) },
      },
    });
    if (used < g.quotaLimit)
      return {
        ...base,
        allowed: true,
        source: "subscription",
        sourceRef: m.package.key,
        remaining: g.quotaLimit - used,
        windowResetsAt: w.end?.toISOString() ?? null,
        refId: m.packageId,
      };
    exhausted = true;
  }
  if (user && f.tokenCost !== null && balance >= f.tokenCost)
    return {
      ...base,
      allowed: true,
      source: "tokens",
      remaining: f.tokenCost === 0 ? null : Math.floor(balance / f.tokenCost),
    };
  return deny(
    !user
      ? "not_linked"
      : exhausted
        ? "quota_exhausted"
        : f.tokenCost !== null
          ? "insufficient_tokens"
          : "no_entitlement",
  );
}
export function publicDecision(d: any) {
  const { user, balance, refId, ...result } = d;
  return result;
}
export async function catalog() {
  const features = await prisma.perkFeature.findMany({
    where: { isActive: true },
    include: { grants: { include: { package: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const plans = await prisma.vipPackage.findMany({
    include: { grants: { include: { feature: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const promotions = await prisma.perkPromotion.findMany({
    where: { isActive: true },
  });
  return {
    features,
    plans,
    promotions,
    catalogVersion: hash([features, plans, promotions]),
    siteUrl: siteUrl(),
    perksUrl: `${siteUrl()}/perks`,
  };
}
export async function snapshot(steamIds: string[]) {
  const data = await catalog();
  const now = new Date();
  const runningPromotions = data.promotions
    .filter((p) => p.startsAt <= now && (!p.endsAt || p.endsAt > now))
    .sort(
      (a, b) =>
        (a.endsAt?.getTime() ?? Infinity) - (b.endsAt?.getTime() ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  const players: Record<string, unknown> = {};
  for (const steamId of steamIds) {
    const user = await prisma.user.findUnique({ where: { steamId } });
    const a = user
      ? await prisma.perkTokenAccount.findUnique({ where: { userId: user.id } })
      : null;
    const memberships = user
      ? await prisma.vipMembership.findMany({
          where: {
            userId: user.id,
            status: "active",
            startsAt: { lte: new Date() },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            package: { include: { grants: { include: { feature: true } } } },
          },
        })
      : [];
    const features: Record<string, unknown> = {};
    for (const f of data.features)
      features[f.key] = publicDecision(
        await evaluate(prisma, steamId, f, now, undefined, {
          user,
          account: a,
          memberships,
          promotions: runningPromotions,
        }),
      );
    const e = {
      linked: Boolean(user),
      tokens: user ? (a?.balance ?? 0) : null,
      groups: [
        ...new Set(
          memberships
            .flatMap((m) => [
              m.permissionGroup,
              ...m.package.grants.map((g) => g.feature.permissionGroup),
            ])
            .filter(Boolean),
        ),
      ],
      features,
    };
    players[steamId] = { ...e, version: hash(e) };
  }
  return {
    generatedAt: new Date().toISOString(),
    catalogVersion: data.catalogVersion,
    ttlSeconds: 15,
    players,
  };
}
export async function consume(input: {
  steamId: string;
  featureKey: string;
  idempotencyKey: string;
  command?: string;
  serverId: number;
}) {
  const result = await serializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.steamId},0))`;
    const prior = await tx.entitlementUsage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (prior) {
      if (
        prior.steamId !== input.steamId ||
        prior.featureKey !== input.featureKey ||
        prior.command !== (input.command ?? null) ||
        prior.serverId !== input.serverId
      )
        throw new AppError("Idempotency key conflict", 409);
      return {
        ...(prior.responseJson as any),
        usageId: prior.id,
        replayed: true,
        userId: prior.userId,
      };
    }

    const f = await tx.perkFeature.findUnique({
      where: { key: input.featureKey },
    });
    const d = await evaluate(tx, input.steamId, f);
    const tokensSpent = d.allowed && d.source === "tokens" ? f!.tokenCost! : 0;
    if (tokensSpent > 0)
      await postTokens(tx, {
        userId: d.user.id,
        delta: -tokensSpent,
        type: "consume",
        idempotencyKey: `consume:${input.idempotencyKey}`,
        referenceId: input.featureKey,
      });
    const response = {
      ...publicDecision(d),
      remaining: d.remaining === null ? null : Math.max(0, d.remaining - 1),
      tokensSpent,
      tokensBalance: d.user ? d.balance - tokensSpent : null,
    };
    const usage = await tx.entitlementUsage.create({
      data: {
        ...input,
        userId: d.user?.id ?? null,
        source: d.source ?? "denied",
        sourceRef: d.refId,
        allowed: d.allowed,
        reason: d.reason,
        tokensSpent,
        responseJson: response,
      },
    });
    return {
      ...response,
      usageId: usage.id,
      replayed: false,
      userId: d.user?.id,
    };
  });
  if (result.userId)
    emitPerksUpdated(result.userId, {
      reason: "consume",
      tokens: result.tokensBalance,
    });
  const { userId, ...response } = result;
  return response;
}
