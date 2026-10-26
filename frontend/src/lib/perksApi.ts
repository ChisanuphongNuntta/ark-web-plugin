/**
 * Perks / entitlements API client. Contract: backend/contracts/entitlements-2026-10.md.
 *
 * Player:
 *   GET  /perks/catalog           plans, token packs, features, live promotions
 *   GET  /perks/me                subscriptions, token balance, per-feature remaining today, recent usage
 *   POST /perks/checkout          { planKey | packKey, provider, transferBank?, transferRef?, notes? }  (REAL money)
 *   POST /perks/buy-tokens-ic     { packKey }  (IC, posted through the wallet ledger)
 * Admin (admin | root):
 *   /admin/perks/{features,plans,token-packs,promotions}   list / create / update (PUT /:id; features PUT /:key)
 *                                                           DELETE /promotions/:id = deactivate
 *   /admin/perks/users/:userId                              entitlement view
 *   /admin/perks/users/:userId/subscriptions                grant (reason, audited)
 *   /admin/perks/subscriptions/:id/revoke                   revoke (reason, audited)
 *   /admin/perks/users/:userId/tokens                       adjust tokens { delta, reason } (audited)
 *   /admin/perks/usage                                      paginated usage log
 *   /admin/perks/revenue                                    revenue summary by product
 *
 * Every path lives in PERKS_PATHS so a contract rename is a one-line change.
 */
import { api, type AdminListRequest } from '@/lib/api';
import type { PaymentIntent } from '@/lib/contracts/types';
import { fetchEnvelopePage, verifyFields } from '@/lib/adminConsoleApi';
import {
  toFeatureStatuses,
  toPerkFeature,
  toPerkPlan,
  toPerkPromotion,
  toPerkSubscription,
  toPerkUsage,
  toPerksCatalog,
  toPerksMe,
  toTokenLedgerEntry,
  toTokenPack,
  type FeatureStatus,
  type PerkFeature,
  type PerkPlan,
  type PerkPromotion,
  type PerkSubscription,
  type PerkUsage,
  type PerksCatalog,
  type PerksMe,
  type Quota,
  type TokenLedgerEntry,
  type TokenPack,
} from '@/lib/perks';

export const PERKS_PATHS = {
  catalog: '/perks/catalog',
  me: '/perks/me',
  checkout: '/perks/checkout',
  buyTokensIc: '/perks/buy-tokens-ic',
  intent: (id: string) => `/payments/intents/${encodeURIComponent(id)}`,
  admin: {
    features: '/admin/perks/features',
    plans: '/admin/perks/plans',
    tokenPacks: '/admin/perks/token-packs',
    promotions: '/admin/perks/promotions',
    user: (userId: string) => `/admin/perks/users/${encodeURIComponent(userId)}`,
    userSubscriptions: (userId: string) => `/admin/perks/users/${encodeURIComponent(userId)}/subscriptions`,
    userTokens: (userId: string) => `/admin/perks/users/${encodeURIComponent(userId)}/tokens`,
    revokeSubscription: (id: string) => `/admin/perks/subscriptions/${encodeURIComponent(id)}/revoke`,
    usage: '/admin/perks/usage',
    revenue: '/admin/perks/revenue',
  },
} as const;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function newIdempotencyKey(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function listFrom<T>(data: unknown, keys: string[], map: (raw: unknown) => T | null): T[] {
  const body = isObj(data) ? data : {};
  for (const k of [...keys, 'items']) {
    if (Array.isArray(body[k])) return (body[k] as unknown[]).map(map).filter((x): x is T => x !== null);
  }
  return Array.isArray(data) ? data.map(map).filter((x): x is T => x !== null) : [];
}

function oneFrom<T>(data: unknown, keys: string[], map: (raw: unknown) => T | null): T | null {
  const body = isObj(data) ? data : {};
  for (const k of [...keys, 'item']) if (isObj(body[k])) return map(body[k]);
  return map(data);
}

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export type PerksProvider = 'stripe' | 'bank_slip';

export type PerksCheckoutTarget = { planKey: string } | { packKey: string };

export interface PerksCheckoutSlip {
  transferBank: string;
  transferRef?: string;
  notes?: string;
}

export interface BuyTokensIcResult {
  tokenBalance: number | null;
  /** IC available balance after the purchase (decimal string) when the backend returns it. */
  walletBalance: string | null;
  replayed: boolean;
}

export const perksApi = {
  getCatalog: async (signal?: AbortSignal): Promise<PerksCatalog> => {
    const { data } = await api.get(PERKS_PATHS.catalog, { signal });
    return toPerksCatalog(data);
  },

  getMe: async (signal?: AbortSignal): Promise<PerksMe> => {
    const { data } = await api.get(PERKS_PATHS.me, { signal });
    return toPerksMe(data);
  },

  /** Real-money checkout (plan subscription or token pack). Reuse the Idempotency-Key for retries. */
  checkout: async (
    payload: PerksCheckoutTarget & { provider: PerksProvider } & Partial<PerksCheckoutSlip>,
    idempotencyKey: string,
  ): Promise<{ intent: PaymentIntent; replayed: boolean }> => {
    const { data } = await api.post(PERKS_PATHS.checkout, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: 60_000,
    });
    const body = isObj(data) ? data : {};
    const intent = (isObj(body.intent) ? body.intent : body) as unknown as PaymentIntent;
    if (!intent || typeof intent.id !== 'string') throw new Error('missing intent');
    return { intent, replayed: body.replayed === true };
  },

  /** Buy a token pack with IC (wallet ledger). */
  buyTokensWithIc: async (packKey: string, idempotencyKey: string): Promise<BuyTokensIcResult> => {
    const { data } = await api.post(PERKS_PATHS.buyTokensIc, { packKey }, { headers: { 'Idempotency-Key': idempotencyKey } });
    const body = isObj(data) ? data : {};
    const tokens = isObj(body.tokens) ? body.tokens : {};
    const wallet = isObj(body.wallet) ? body.wallet : {};
    const walletBalance = body.walletBalance ?? body.balance ?? wallet.available ?? wallet.balance;
    return {
      tokenBalance: num(body.tokenBalance ?? tokens.balance),
      walletBalance: typeof walletBalance === 'string' || typeof walletBalance === 'number' ? String(walletBalance) : null,
      replayed: body.replayed === true,
    };
  },

  getIntent: async (id: string, signal?: AbortSignal): Promise<PaymentIntent> => {
    const { data } = await api.get(PERKS_PATHS.intent(id), { signal });
    return (isObj(data) && isObj(data.intent) ? data.intent : data) as PaymentIntent;
  },
};

/* ------------------------------------------------------------------ */
/* Admin: catalog CRUD                                                 */
/* ------------------------------------------------------------------ */

export interface FeatureInput {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  commands: string[];
  permissionGroup: string | null;
  /** null = cannot be used with tokens. */
  tokenCost: number | null;
  freeForAll: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** A plan is a VIP package (contract section 1): VIP package fields + showBadge + grants. */
export interface PlanInput {
  key: string;
  name: string;
  description: string | null;
  priceThb: string;
  /** null = permanent. Sent as both periodDays and durationDays (alias). */
  periodDays: number | null;
  durationDays: number | null;
  permissionGroup: string | null;
  tierRank: number;
  frameStyle: string;
  badgeLabel: string;
  showBadge: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Replaces the whole grant list. */
  grants: { featureKey: string; quota: Quota }[];
}

export interface TokenPackInput {
  key: string;
  name: string;
  description: string | null;
  tokens: number;
  priceThb: string | null;
  priceIc: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PromotionInput {
  key: string;
  name: string;
  description: string | null;
  featureKeys: string[];
  quota: Quota;
  audience: string;
  startsAt?: string;
  endsAt: string | null;
  isActive: boolean;
}

function crud<T, I>(path: string, listKeys: string[], oneKeys: string[], map: (raw: unknown) => T | null) {
  return {
    list: async (signal?: AbortSignal): Promise<T[]> => {
      const { data } = await api.get(path, { signal });
      return listFrom(data, listKeys, map);
    },
    create: async (input: I): Promise<T | null> => {
      const { data } = await api.post(path, input);
      return oneFrom(data, oneKeys, map);
    },
    update: async (id: string, input: Partial<I>): Promise<T | null> => {
      const { data } = await api.put(`${path}/${encodeURIComponent(id)}`, input);
      return oneFrom(data, oneKeys, map);
    },
    remove: async (id: string): Promise<void> => {
      await api.delete(`${path}/${encodeURIComponent(id)}`);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Admin: users, usage, revenue                                        */
/* ------------------------------------------------------------------ */

export interface AdminPerksUser {
  user: { id: string; name: string | null; steamId: string | null; avatar: string | null } | null;
  steamLinked: boolean | null;
  subscriptions: PerkSubscription[];
  tokenBalance: number;
  features: FeatureStatus[];
  usage: PerkUsage[];
  tokenLedger: TokenLedgerEntry[];
}

export type PerksUsageFilter = 'featureKey' | 'source' | 'allowed' | 'serverId' | 'userId' | 'steamId' | 'from' | 'to';

export interface RevenueRow {
  /** 'plan' | 'token_pack' */
  kind: string;
  id: string | null;
  key: string;
  name: string;
  count: number;
  /** Decimal string (THB rows: amountThb; IC rows: amountIc). */
  amount: string | null;
  /** IC rows: tokens issued. */
  tokens: number | null;
}

export interface RevenueSummary {
  from: string | null;
  to: string | null;
  thbTotal: string | null;
  thbRows: RevenueRow[];
  icTotal: string | null;
  icRows: RevenueRow[];
  tokensIssued: number | null;
  tokensConsumed: number | null;
  tokensAdjusted: number | null;
}

const money = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  return null;
};

function toRevenueRow(raw: unknown): RevenueRow | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key) ?? str(raw.productKey);
  if (!key) return null;
  return {
    kind: str(raw.kind) ?? 'plan',
    id: typeof raw.id === 'number' ? String(raw.id) : str(raw.id),
    key,
    name: str(raw.name) ?? key,
    count: num(raw.count) ?? 0,
    amount: money(raw.amountThb ?? raw.amountIc ?? raw.amount),
    tokens: num(raw.tokens),
  };
}

function toUserRef(raw: unknown): AdminPerksUser['user'] {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'number' ? String(raw.id) : str(raw.id);
  if (!id) return null;
  return {
    id,
    name: str(raw.name) ?? str(raw.discordUsername),
    steamId: str(raw.steamId),
    avatar: str(raw.avatar) ?? str(raw.discordAvatar),
  };
}

const PLAN_LIST = crud<PerkPlan, PlanInput>(PERKS_PATHS.admin.plans, ['plans'], ['plan'], toPerkPlan);

export const perksAdminApi = {
  features: crud<PerkFeature, FeatureInput>(PERKS_PATHS.admin.features, ['features'], ['feature'], toPerkFeature),
  plans: PLAN_LIST,
  tokenPacks: crud<TokenPack, TokenPackInput>(PERKS_PATHS.admin.tokenPacks, ['tokenPacks', 'packs'], ['tokenPack', 'pack'], toTokenPack),
  promotions: crud<PerkPromotion, PromotionInput>(PERKS_PATHS.admin.promotions, ['promotions'], ['promotion'], toPerkPromotion),

  getUser: async (userId: string, signal?: AbortSignal): Promise<AdminPerksUser> => {
    const { data } = await api.get(PERKS_PATHS.admin.user(userId), { signal });
    const body = isObj(data) ? data : {};
    const tokens = isObj(body.tokens) ? body.tokens : {};
    return {
      user: toUserRef(body.user),
      steamLinked: typeof body.steamLinked === 'boolean' ? body.steamLinked : null,
      subscriptions: listFrom(body, ['subscriptions'], toPerkSubscription),
      tokenBalance: Math.max(0, Math.trunc(num(body.tokenBalance ?? tokens.balance) ?? 0)),
      features: toFeatureStatuses(body.features),
      usage: listFrom({ items: body.usage ?? body.recentUsage }, ['items'], toPerkUsage),
      tokenLedger: listFrom({ items: body.tokenLedger ?? tokens.ledger }, ['items'], toTokenLedgerEntry),
    };
  },

  /** Grant a plan subscription (vipService.adminGrant). durationDays omitted = plan period, null = permanent. */
  grantSubscription: async (
    userId: string,
    input: { planKey: string; durationDays?: number | null; reason: string },
  ): Promise<PerkSubscription | null> => {
    const { data } = await api.post(PERKS_PATHS.admin.userSubscriptions(userId), input, {
      headers: { 'Idempotency-Key': newIdempotencyKey('perks-grant') },
    });
    return oneFrom(data, ['membership', 'subscription'], toPerkSubscription);
  },

  revokeSubscription: async (id: string, reason: string): Promise<void> => {
    await api.post(PERKS_PATHS.admin.revokeSubscription(id), { reason });
  },

  /** Signed token adjustment. The same key must be reused for a retry of the same attempt. */
  adjustTokens: async (userId: string, delta: number, reason: string, idempotencyKey: string): Promise<{ tokenBalance: number | null }> => {
    const { data } = await api.post(
      PERKS_PATHS.admin.userTokens(userId),
      { delta, reason, idempotencyKey },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    const body = isObj(data) ? data : {};
    const tokens = isObj(body.tokens) ? body.tokens : {};
    return { tokenBalance: num(body.tokenBalance ?? body.balance ?? tokens.balance) };
  },

  getUsagePage: (req: AdminListRequest<PerksUsageFilter>, signal?: AbortSignal) =>
    fetchEnvelopePage<PerkUsage>(PERKS_PATHS.admin.usage, req, {
      signal,
      itemsKeys: ['items', 'usage'],
      mapItem: toPerkUsage,
      verify: verifyFields<PerkUsage>({
        featureKey: (u) => u.featureKey,
        source: (u) => u.source,
        allowed: (u) => String(u.allowed),
        serverId: (u) => (u.serverId === null ? null : String(u.serverId)),
        userId: (u) => u.userId,
      }),
    }),

  getRevenue: async (params: { from?: string; to?: string }, signal?: AbortSignal): Promise<RevenueSummary> => {
    const { data } = await api.get(PERKS_PATHS.admin.revenue, { params, signal });
    const body = isObj(data) ? data : {};
    const thb = isObj(body.thb) ? body.thb : {};
    const ic = isObj(body.ic) ? body.ic : {};
    const tokens = isObj(body.tokens) ? body.tokens : {};
    return {
      from: str(body.from),
      to: str(body.to),
      thbTotal: money(thb.total),
      thbRows: listFrom(thb, ['byProduct'], toRevenueRow),
      icTotal: money(ic.total),
      icRows: listFrom(ic, ['byProduct'], toRevenueRow),
      tokensIssued: num(tokens.issued),
      tokensConsumed: num(tokens.consumed),
      tokensAdjusted: num(tokens.adjusted),
    };
  },
};
