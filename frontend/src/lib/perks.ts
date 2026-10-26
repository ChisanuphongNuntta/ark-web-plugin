/**
 * Perks / entitlements (owner request 2026-10): in-game command rights sold as a monthly
 * subscription (real money), Perk Tokens (pay per use, real money or IC) and free
 * promotions ("/getbags 3x per day"). Contract: backend/contracts/entitlements-2026-10.md.
 *
 * Pure types + defensive parsers + presentation helpers. No React here so the helpers
 * can be unit-tested with plain Node (see perks.test.mts).
 *
 * Money rule: `priceThb` / `priceIc` are decimal STRINGS from the API. The frontend never
 * computes a price; it only formats what the backend sent.
 */
import type { VipBadge } from './vip';

// No runtime imports: this file is loaded directly by `node --test` (perks.test.mts).
const MONEY_STR_RE = /^-?\d+(\.\d+)?$/;
function toMoneyString(v: unknown): string {
  if (typeof v === 'string' && MONEY_STR_RE.test(v.trim())) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object' && typeof (v as { toString?: unknown }).toString === 'function') {
    const s = String(v);
    if (MONEY_STR_RE.test(s)) return s;
  }
  return '0';
}
function toBadge(raw: unknown): VipBadge | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const frame = typeof r.frameStyle === 'string' && r.frameStyle ? r.frameStyle : null;
  if (!frame) return null;
  const tier = typeof r.tierRank === 'number' && Number.isFinite(r.tierRank) ? r.tierRank : 1;
  const label = typeof r.label === 'string' && r.label ? r.label.slice(0, 16) : 'VIP';
  return { tierRank: tier, frameStyle: frame, label }; // VipAvatar resolves unknown frames to gold
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type QuotaType = 'unlimited' | 'per_day' | 'per_week' | 'per_period';
export const QUOTA_TYPES: readonly QuotaType[] = ['unlimited', 'per_day', 'per_week', 'per_period'];
/** Promotions only allow day / week windows. */
export const PROMO_QUOTA_TYPES: readonly QuotaType[] = ['per_day', 'per_week'];

export interface Quota {
  type: QuotaType;
  /** Uses per window; null for 'unlimited'. */
  limit: number | null;
}

export interface PerkFeature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** Chat commands gated by this feature, e.g. ['/pod']. */
  commands: string[];
  /** Permissions group a third-party plugin checks (optional). */
  permissionGroup: string | null;
  /** Perk Tokens spent per use when no promotion / subscription covers it; null = not usable with tokens. */
  tokenCost: number | null;
  /** Free for everyone (still logged). Backend field `freeForAll`. */
  isFree: boolean;
  /** Inactive = HeartShop does not gate its commands at all. */
  isActive: boolean;
  sortOrder: number;
  category: string | null;
  /** Admin extra: plans granting this feature. */
  planKeys: string[];
}

export interface PlanGrant {
  featureKey: string;
  featureName: string | null;
  commands: string[];
  quota: Quota;
}

export interface PerkPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** Decimal string THB. '0' = unpriced (cannot be sold). */
  priceThb: string;
  /** Length of one period (30 = monthly); null = permanent. A plan IS a VIP package (contract section 1). */
  periodDays: number | null;
  /** null = no Permissions sync. */
  permissionGroup: string | null;
  isActive: boolean;
  sortOrder: number;
  grants: PlanGrant[];
  tierRank: number;
  frameStyle: string;
  badgeLabel: string;
  /** false = no VIP avatar frame / chat badge for this plan. */
  showBadge: boolean;
  /** Avatar frame shown for this plan (null when showBadge is false). */
  badge: VipBadge | null;
  /** Admin extra: subscriptions active right now. */
  activeSubscriptions: number | null;
}

export interface TokenPack {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tokens: number;
  /** Real-money price (decimal string) or null when not sold for money. */
  priceThb: string | null;
  /** IC price (decimal string) or null when not sold for IC. */
  priceIc: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** 'all' | 'linked' (Steam linked) | 'plan:<key>'. */
export type PromoAudience = string;

export interface PerkPromotion {
  id: string;
  key: string;
  name: string;
  description: string | null;
  featureKeys: string[];
  quota: Quota;
  audience: PromoAudience;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export interface PerksCatalog {
  plans: PerkPlan[];
  tokenPacks: TokenPack[];
  features: PerkFeature[];
  promotions: PerkPromotion[];
}

export type UseSource = 'promotion' | 'subscription' | 'tokens' | 'free' | 'denied' | (string & {});

export interface PerkSubscription {
  id: string;
  planKey: string;
  planName: string;
  /** active | scheduled | expired | revoked */
  state: string;
  source: string;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface FeatureStatus {
  key: string;
  name: string;
  commands: string[];
  allowed: boolean;
  /** Where the next use would come from. */
  source: UseSource | null;
  /** Promotion key / plan key the use comes from. */
  sourceRef: string | null;
  /** Uses left in the current window; tokens: floor(balance / tokenCost); null = unlimited. */
  remaining: number | null;
  tokenCost: number | null;
  /** When the current quota window resets (Asia/Bangkok), if any. */
  resetsAt: string | null;
  /** Denial reason: not_linked | quota_exhausted | insufficient_tokens | no_entitlement | feature_inactive. */
  reason: string | null;
  isFree: boolean;
}

export interface PerkUsage {
  id: string;
  userId: string | null;
  userName: string | null;
  steamId: string | null;
  featureKey: string;
  featureName: string | null;
  command: string | null;
  serverId: number | null;
  serverName: string | null;
  source: UseSource;
  allowed: boolean;
  reason: string | null;
  tokensSpent: number | null;
  createdAt: string | null;
}

export interface TokenLedgerEntry {
  id: string;
  /** Signed token delta. */
  delta: number;
  balanceAfter: number | null;
  reason: string | null;
  kind: string | null;
  createdAt: string | null;
}

export interface PerksMe {
  steamLinked: boolean | null;
  subscriptions: PerkSubscription[];
  tokenBalance: number;
  tokenLedger: TokenLedgerEntry[];
  features: FeatureStatus[];
  usage: PerkUsage[];
}

/* ------------------------------------------------------------------ */
/* Parsers (defensive: a slightly different payload never crashes)     */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const int = (v: unknown, fallback: number): number => {
  const n = num(v);
  return n === null ? fallback : Math.trunc(n);
};
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const idOf = (v: unknown): string | null => (typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v));
const dateOf = (v: unknown): string | null => {
  if (typeof v === 'string' && v) return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
};
const strList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return [];
};
const optMoney = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const m = toMoneyString(v);
  return m;
};

/** undefined -> 1 (backend default); null -> null (cannot be used with tokens). */
function tokenCostOf(v: unknown): number | null {
  if (v === null) return null;
  const n = num(v);
  return n === null ? 1 : Math.max(0, Math.trunc(n));
}

export function toQuota(raw: unknown): Quota {
  if (typeof raw === 'string' && (QUOTA_TYPES as readonly string[]).includes(raw)) {
    return raw === 'unlimited' ? { type: 'unlimited', limit: null } : { type: raw as QuotaType, limit: 1 };
  }
  if (!isObj(raw)) return { type: 'unlimited', limit: null };
  const t = str(raw.type) ?? str(raw.kind);
  if (!t || t === 'unlimited' || !(QUOTA_TYPES as readonly string[]).includes(t)) return { type: 'unlimited', limit: null };
  const limit = num(raw.limit) ?? num(raw.count) ?? num(raw.max);
  return { type: t as QuotaType, limit: limit === null ? 1 : Math.max(0, Math.trunc(limit)) };
}

/** Normalises a chat command: trims, lower-cases, adds the leading slash. */
export function normalizeCommand(c: string): string {
  const t = c.trim().split(/\s+/)[0] ?? '';
  if (!t) return '';
  return (t.startsWith('/') ? t : `/${t}`).toLowerCase();
}

export function toPerkFeature(raw: unknown): PerkFeature | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key) ?? str(raw.featureKey);
  if (!key) return null;
  return {
    id: idOf(raw.id) ?? key,
    key,
    name: str(raw.name) ?? key,
    description: str(raw.description),
    commands: strList(raw.commands).map(normalizeCommand).filter(Boolean),
    permissionGroup: str(raw.permissionGroup),
    tokenCost: tokenCostOf(raw.tokenCost),
    isFree: bool(raw.freeForAll, bool(raw.free, bool(raw.isFree, false))),
    isActive: bool(raw.isActive, true),
    sortOrder: int(raw.sortOrder, 0),
    category: str(raw.category),
    planKeys: strList(raw.planKeys),
  };
}

export function toPlanGrant(raw: unknown): PlanGrant | null {
  if (!isObj(raw)) return null;
  const featureKey = str(raw.featureKey) ?? (isObj(raw.feature) ? str(raw.feature.key) : null);
  if (!featureKey) return null;
  // Accept both { quota: {type, limit} } and flat { quotaType, quotaLimit }.
  const quota = raw.quota !== undefined ? toQuota(raw.quota) : toQuota({ type: raw.quotaType, limit: raw.quotaLimit });
  return {
    featureKey,
    featureName: str(raw.featureName) ?? (isObj(raw.feature) ? str(raw.feature.name) : null),
    commands: strList(raw.commands).map(normalizeCommand).filter(Boolean),
    quota,
  };
}

export function toPerkPlan(raw: unknown): PerkPlan | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key);
  if (!key) return null;
  const grants = (Array.isArray(raw.grants) ? raw.grants : []).map(toPlanGrant).filter((g): g is PlanGrant => g !== null);
  const showBadge = bool(raw.showBadge, true);
  const frameStyle = str(raw.frameStyle) ?? 'vip-gold';
  const tierRank = int(raw.tierRank, 1);
  const badgeLabel = (str(raw.badgeLabel) ?? 'VIP').slice(0, 16);
  // periodDays (alias durationDays): null = permanent; absent = 30.
  const rawPeriod = raw.periodDays !== undefined ? raw.periodDays : raw.durationDays;
  const period = rawPeriod === null ? null : num(rawPeriod);
  return {
    id: idOf(raw.id) ?? key,
    key,
    name: str(raw.name) ?? key,
    description: str(raw.description),
    priceThb: toMoneyString(raw.priceThb ?? raw.price),
    periodDays: rawPeriod === null ? null : Math.max(1, Math.trunc(period ?? 30)),
    permissionGroup: str(raw.permissionGroup),
    isActive: bool(raw.isActive, true),
    sortOrder: int(raw.sortOrder, 0),
    grants,
    tierRank,
    frameStyle,
    badgeLabel,
    showBadge,
    badge: showBadge && (str(raw.frameStyle) || isObj(raw.badge)) ? toBadge(raw.badge ?? { frameStyle, tierRank, label: badgeLabel }) : null,
    activeSubscriptions: num(raw.activeSubscriptions ?? raw.activeCount),
  };
}

export function toTokenPack(raw: unknown): TokenPack | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key);
  if (!key) return null;
  return {
    id: idOf(raw.id) ?? key,
    key,
    name: str(raw.name) ?? key,
    description: str(raw.description),
    tokens: Math.max(0, int(raw.tokens ?? raw.tokenAmount, 0)),
    priceThb: optMoney(raw.priceThb),
    priceIc: optMoney(raw.priceIc),
    isActive: bool(raw.isActive, true),
    sortOrder: int(raw.sortOrder, 0),
  };
}

export function toPerkPromotion(raw: unknown): PerkPromotion | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key);
  if (!key) return null;
  const quota = raw.quota !== undefined ? toQuota(raw.quota) : toQuota({ type: raw.quotaType, limit: raw.quotaLimit });
  return {
    id: idOf(raw.id) ?? key,
    key,
    name: str(raw.name) ?? key,
    description: str(raw.description),
    featureKeys: strList(raw.featureKeys),
    quota,
    audience: str(raw.audience) ?? 'all',
    startsAt: dateOf(raw.startsAt),
    endsAt: dateOf(raw.endsAt),
    isActive: bool(raw.isActive, true),
  };
}

const bySort = <T extends { sortOrder: number; name: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

function listOf<T>(body: Raw, keys: string[], map: (raw: unknown) => T | null): T[] {
  for (const k of keys) {
    if (Array.isArray(body[k])) return (body[k] as unknown[]).map(map).filter((x): x is T => x !== null);
  }
  return [];
}

export function toPerksCatalog(raw: unknown): PerksCatalog {
  const body = isObj(raw) ? raw : {};
  return {
    plans: listOf(body, ['plans'], toPerkPlan).sort(bySort),
    tokenPacks: listOf(body, ['tokenPacks', 'packs', 'token_packs'], toTokenPack).sort(bySort),
    features: listOf(body, ['features'], toPerkFeature).sort(bySort),
    promotions: listOf(body, ['promotions', 'promos'], toPerkPromotion),
  };
}

export function toPerkSubscription(raw: unknown): PerkSubscription | null {
  if (!isObj(raw)) return null;
  const id = idOf(raw.id);
  if (!id) return null;
  const plan = isObj(raw.plan) ? raw.plan : isObj(raw.package) ? raw.package : {};
  const planKey = str(raw.planKey) ?? str(plan.key) ?? '';
  return {
    id,
    planKey,
    planName: str(raw.planName) ?? str(plan.name) ?? str(raw.permissionGroup) ?? (planKey || 'แพ็กเกจ'),
    state: str(raw.state) ?? str(raw.status) ?? 'active',
    source: str(raw.source) ?? 'purchase',
    startsAt: dateOf(raw.startsAt),
    expiresAt: dateOf(raw.expiresAt),
  };
}

/** Accepts a bare Decision, or `Feature & { decision: Decision }` (/perks/me, admin user view). */
export function toFeatureStatus(raw: unknown, keyHint?: string): FeatureStatus | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key) ?? str(raw.featureKey) ?? keyHint ?? null;
  if (!key) return null;
  const d = isObj(raw.decision) ? raw.decision : raw;
  const remaining = d.remaining === null || d.remaining === undefined ? null : num(d.remaining);
  const cost = d.tokenCost !== undefined ? d.tokenCost : raw.tokenCost;
  return {
    key,
    name: str(raw.name) ?? key,
    commands: strList(raw.commands).map(normalizeCommand).filter(Boolean),
    allowed: bool(d.allowed, false),
    source: str(d.source),
    sourceRef: str(d.sourceRef),
    remaining: remaining === null ? null : Math.max(0, Math.trunc(remaining)),
    tokenCost: tokenCostOf(cost),
    resetsAt: dateOf(d.windowResetsAt) ?? dateOf(d.resetsAt),
    reason: str(d.reason),
    isFree: bool(raw.freeForAll, bool(raw.free, false)) || d.source === 'free',
  };
}

/** `features` may be an array or a map keyed by feature key (plugin snapshot shape). */
export function toFeatureStatuses(raw: unknown): FeatureStatus[] {
  if (Array.isArray(raw)) return raw.map((r) => toFeatureStatus(r)).filter((x): x is FeatureStatus => x !== null);
  if (isObj(raw)) {
    return Object.entries(raw)
      .map(([k, v]) => toFeatureStatus(v, k))
      .filter((x): x is FeatureStatus => x !== null);
  }
  return [];
}

export function toPerkUsage(raw: unknown): PerkUsage | null {
  if (!isObj(raw)) return null;
  const id = idOf(raw.id) ?? str(raw.idempotencyKey);
  const featureKey = str(raw.featureKey) ?? (isObj(raw.feature) ? str(raw.feature.key) : null);
  if (!id || !featureKey) return null;
  const user = isObj(raw.user) ? raw.user : {};
  const server = isObj(raw.server) ? raw.server : {};
  return {
    id,
    userId: idOf(raw.userId) ?? idOf(user.id),
    userName: str(raw.userName) ?? str(user.name) ?? str(user.discordUsername),
    steamId: str(raw.steamId) ?? str(user.steamId),
    featureKey,
    featureName: str(raw.featureName) ?? (isObj(raw.feature) ? str(raw.feature.name) : null),
    command: str(raw.command),
    serverId: num(raw.serverId) ?? num(server.id),
    serverName: str(raw.serverName) ?? str(server.name),
    source: str(raw.source) ?? 'unknown',
    allowed: bool(raw.allowed, str(raw.source) !== 'denied'),
    reason: str(raw.reason),
    tokensSpent: num(raw.tokensSpent ?? raw.tokens),
    createdAt: dateOf(raw.createdAt),
  };
}

export function toTokenLedgerEntry(raw: unknown): TokenLedgerEntry | null {
  if (!isObj(raw)) return null;
  const id = idOf(raw.id);
  const delta = num(raw.delta ?? raw.amount);
  if (!id || delta === null) return null;
  return {
    id,
    delta: Math.trunc(delta),
    balanceAfter: num(raw.balanceAfter),
    reason: str(raw.reason) ?? str(raw.note),
    kind: str(raw.type) ?? str(raw.kind),
    createdAt: dateOf(raw.createdAt),
  };
}

export function toPerksMe(raw: unknown): PerksMe {
  const body = isObj(raw) ? raw : {};
  const tokens = isObj(body.tokens) ? body.tokens : {};
  return {
    steamLinked: typeof body.steamLinked === 'boolean' ? body.steamLinked : null,
    subscriptions: listOf(body, ['subscriptions'], toPerkSubscription),
    tokenBalance: Math.max(0, int(body.tokenBalance ?? tokens.balance, 0)),
    tokenLedger: listOf(tokens, ['ledger'], toTokenLedgerEntry),
    features: toFeatureStatuses(body.features),
    usage: listOf(body, ['recentUsage', 'usage'], toPerkUsage),
  };
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** Thai label for a quota, e.g. 'ไม่จำกัด', 'วันละ 3 ครั้ง'. */
export function quotaLabel(q: Quota): string {
  if (q.type === 'unlimited' || q.limit === null) return 'ไม่จำกัด';
  const n = q.limit.toLocaleString('th-TH');
  switch (q.type) {
    case 'per_day':
      return `วันละ ${n} ครั้ง`;
    case 'per_week':
      return `สัปดาห์ละ ${n} ครั้ง`;
    case 'per_period':
      return `${n} ครั้งต่อรอบบิล`;
    default:
      return `${n} ครั้ง`;
  }
}

export const QUOTA_TYPE_TH: Record<QuotaType, string> = {
  unlimited: 'ไม่จำกัด',
  per_day: 'ต่อวัน',
  per_week: 'ต่อสัปดาห์',
  per_period: 'ต่อรอบบิล',
};

export const USE_SOURCE_TH: Record<string, string> = {
  promotion: 'โปรโมชั่น',
  subscription: 'แพ็กเกจรายเดือน',
  tokens: 'Perk Token',
  free: 'ฟรี',
  denied: 'ถูกปฏิเสธ',
};
export const USE_SOURCES = ['free', 'promotion', 'subscription', 'tokens', 'denied'] as const;

/** Thai text for a Decision.reason. */
export const DENY_REASON_TH: Record<string, string> = {
  unknown_feature: 'ไม่รู้จักคำสั่งนี้',
  feature_inactive: 'ยังไม่เปิดใช้งาน',
  not_linked: 'ยังไม่เชื่อม Steam กับเว็บ',
  quota_exhausted: 'ใช้ครบโควตาแล้ว',
  insufficient_tokens: 'Token ไม่พอ',
  no_entitlement: 'ไม่มีสิทธิ์',
};

export const TOKEN_LEDGER_TYPE_TH: Record<string, string> = {
  purchase_thb: 'ซื้อด้วยเงินจริง',
  purchase_ic: 'ซื้อด้วย IC',
  consume: 'ใช้คำสั่ง',
  admin_adjust: 'ทีมงานปรับยอด',
};

export const SUBSCRIPTION_STATE_TH: Record<string, string> = {
  active: 'ใช้งานอยู่',
  scheduled: 'รอเริ่ม (ต่ออายุล่วงหน้า)',
  expired: 'หมดอายุ',
  revoked: 'ถูกเพิกถอน',
};

export const SUBSCRIPTION_SOURCE_TH: Record<string, string> = {
  purchase: 'ซื้อด้วยเงินจริง',
  admin: 'แอดมินมอบให้',
  legacy: 'ระบบเดิม',
  vip: 'VIP',
};

/** 'all' -> 'ทุกคน', 'linked' -> 'เชื่อม Steam แล้ว', 'plan:vip' -> 'สมาชิก <name>'. */
export function audienceLabel(audience: string, plans: readonly Pick<PerkPlan, 'key' | 'name'>[] = []): string {
  if (audience === 'all') return 'ทุกคน';
  if (audience === 'linked') return 'ผู้เล่นที่เชื่อม Steam แล้ว';
  if (audience.startsWith('plan:')) {
    const key = audience.slice(5);
    const plan = plans.find((p) => p.key === key);
    return `สมาชิก ${plan?.name ?? key}`;
  }
  return audience;
}

/** Remaining uses as Thai text: null = ไม่จำกัด. */
export function remainingLabel(f: Pick<FeatureStatus, 'allowed' | 'remaining' | 'source'> & { reason?: string | null }): string {
  if (!f.allowed) return (f.reason && DENY_REASON_TH[f.reason]) || 'ใช้ไม่ได้';
  if (f.source === 'tokens') return f.remaining === null ? 'ใช้ Token' : `ใช้ Token ได้อีก ${f.remaining.toLocaleString('th-TH')} ครั้ง`;
  if (f.remaining === null) return 'ไม่จำกัด';
  return `เหลือ ${f.remaining.toLocaleString('th-TH')} ครั้ง`;
}

/** True when `now` is inside [startsAt, endsAt) (open ends allowed). */
export function isPromotionLive(p: Pick<PerkPromotion, 'isActive' | 'startsAt' | 'endsAt'>, now: number = Date.now()): boolean {
  if (!p.isActive) return false;
  const s = p.startsAt ? new Date(p.startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const e = p.endsAt ? new Date(p.endsAt).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return now >= s && now < e;
}

/** Feature key format shared with the backend ('cmd.pod', 'cmd.getbags'). */
export const FEATURE_KEY_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
/** Product key format for plans / packs / promotions ('vip', 'tokens-10'). */
export const PRODUCT_KEY_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
/** Decimal THB / IC with up to 2 decimals. */
export const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;
/** Permissions group name (same rule as VIP packages). */
export const PERMISSION_GROUP_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const RESERVED_GROUPS = ['admins', 'default'];

export function isReservedGroup(group: string): boolean {
  return RESERVED_GROUPS.includes(group.trim().toLowerCase());
}

/** Parses a comma/space separated command list typed by an admin. */
export function parseCommandList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,]+/)) {
    const c = normalizeCommand(part);
    if (c && c.length > 1 && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Commands claimed by more than one feature (gate ambiguity). */
export function duplicateCommands(features: readonly Pick<PerkFeature, 'key' | 'commands'>[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const f of features) for (const c of f.commands) owners.set(c, [...(owners.get(c) ?? []), f.key]);
  for (const [c, keys] of [...owners]) if (keys.length < 2) owners.delete(c);
  return owners;
}

/* ------------------------------------------------------------------ */
/* Promotion windows (admin inputs are Asia/Bangkok wall-clock time)    */
/* ------------------------------------------------------------------ */

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ISO instant -> 'YYYY-MM-DDTHH:mm' in Asia/Bangkok (for <input type="datetime-local">). '' when absent/invalid. */
export function bangkokInputFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + BKK_OFFSET_MS).toISOString().slice(0, 16);
}

/** 'YYYY-MM-DDTHH:mm' typed as Asia/Bangkok time -> ISO instant (UTC). null when blank/invalid. */
export function isoFromBangkokInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - BKK_OFFSET_MS;
  const d = new Date(t);
  // Reject rolled-over dates such as 2026-02-31.
  if (bangkokInputFromIso(d.toISOString()) !== value.trim()) return null;
  return d.toISOString();
}
