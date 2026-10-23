/**
 * VIP (owner request 2026-10): real-money VIP ranks that map to an ArkApi
 * Permissions group. Contract: backend/contracts/vip-2026-10.md.
 *
 * Pure types + defensive parsers + presentation helpers. No React here so the
 * helpers can be unit-tested with plain Node (see vip.test.mts).
 *
 * Money rule: `priceThb` is a decimal STRING from the API. The frontend never
 * computes a price; it only formats what the backend sent.
 */

/** Public VIP badge attached to a user wherever an avatar is shown. */
export interface VipBadge {
  /** Higher = better. Used to pick the strongest frame when a user holds several. */
  tierRank: number;
  /** Frame key, e.g. 'vip-gold' | 'vip-diamond' | 'vip-emerald'. Unknown keys fall back to gold. */
  frameStyle: string;
  /** Short label printed under the avatar, e.g. 'VIP'. */
  label: string;
}

export interface VipPackage {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissionGroup: string;
  tierRank: number;
  frameStyle: string;
  /** Short label under the avatar / in chat (≤ 16 chars), default 'VIP'. */
  badgeLabel: string;
  /** Decimal string, e.g. '199.00'. */
  priceThb: string;
  /** null = permanent. */
  durationDays: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Admin list extra: active memberships on this package. */
  activeMemberships?: number | null;
}

export type VipMembershipStatus = 'active' | 'expired' | 'revoked';
/** Derived by the backend from status + dates: a purchase that extends VIP starts later ('scheduled'). */
export type VipMembershipState = 'scheduled' | 'active' | 'expired' | 'revoked';
export const VIP_MEMBERSHIP_STATES: readonly VipMembershipState[] = ['active', 'scheduled', 'expired', 'revoked'];
export type VipSyncStatus = 'pending' | 'synced' | 'failed' | 'no_steam' | 'unqueued';
export const VIP_SYNC_STATUSES: readonly VipSyncStatus[] = ['pending', 'synced', 'failed', 'no_steam', 'unqueued'];
export type VipMembershipSource = 'purchase' | 'admin' | 'legacy';
export const VIP_MEMBERSHIP_STATUSES: readonly VipMembershipStatus[] = ['active', 'expired', 'revoked'];
export const VIP_MEMBERSHIP_SOURCES: readonly VipMembershipSource[] = ['purchase', 'admin', 'legacy'];

export interface VipUserRef {
  id: string;
  name: string | null;
  steamId: string | null;
  avatar: string | null;
}

/** Permissions-plugin sync state of a membership (DeliveryJob permission_grant / permission_revoke). */
export interface VipSyncState {
  /** pending | synced | failed | no_steam | unqueued (no server to queue on yet; re-queued automatically) */
  status: string | null;
  syncedAt: string | null;
  jobId: string | null;
  jobStatus: string | null;
  action: 'add' | 'remove' | null;
  attempts: number | null;
  lastError: string | null;
  updatedAt: string | null;
}

export interface VipMembership {
  id: string;
  userId: string;
  user: VipUserRef | null;
  packageId: string | null;
  package: Pick<VipPackage, 'id' | 'key' | 'name' | 'tierRank' | 'frameStyle' | 'badgeLabel'> | null;
  permissionGroup: string;
  startsAt: string | null;
  /** null = permanent. */
  expiresAt: string | null;
  status: VipMembershipStatus | (string & {});
  state: VipMembershipState | (string & {});
  source: VipMembershipSource | (string & {});
  paymentIntentId: string | null;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  reason: string | null;
  createdAt: string | null;
  sync: VipSyncState | null;
}

export interface VipMe {
  vip: VipBadge | null;
  /** The membership that currently grants VIP (latest expiry), if any. */
  active: VipMembership | null;
  memberships: VipMembership[];
  /** Permission groups held and until when (null = permanent). */
  groups: { group: string; expiresAt: string | null }[];
  /** false = no Steam ID linked: the in-game group cannot be applied yet. */
  steamLinked: boolean;
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

export interface VipFrameStyle {
  key: string;
  /** Thai name for admin pickers. */
  labelTh: string;
}

/** Frame keys that have CSS in src/app/vip-frames.css. Order = admin picker order. */
export const VIP_FRAME_STYLES: readonly VipFrameStyle[] = [
  { key: 'vip-gold', labelTh: 'ทอง' },
  { key: 'vip-silver', labelTh: 'เงิน' },
  { key: 'vip-diamond', labelTh: 'เพชร' },
  { key: 'vip-emerald', labelTh: 'มรกต' },
  { key: 'vip-ruby', labelTh: 'ทับทิม' },
  { key: 'vip-amethyst', labelTh: 'อเมทิสต์' },
];

const FRAME_KEYS = new Set(VIP_FRAME_STYLES.map((f) => f.key));
export const DEFAULT_VIP_FRAME = 'vip-gold';

/** A frame key that has CSS; unknown/blank keys fall back to gold so a VIP never loses the frame. */
export function resolveFrameStyle(frameStyle: unknown): string {
  return typeof frameStyle === 'string' && FRAME_KEYS.has(frameStyle) ? frameStyle : DEFAULT_VIP_FRAME;
}

export function frameLabelTh(frameStyle: unknown): string {
  const key = resolveFrameStyle(frameStyle);
  return VIP_FRAME_STYLES.find((f) => f.key === key)?.labelTh ?? 'ทอง';
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

/** Decimal string for money; numbers are converted without arithmetic. */
export function toMoneyString(v: unknown): string {
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (isObj(v) && typeof v.toString === 'function') {
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  }
  return '0';
}

/**
 * Badge from any of: `{ tierRank, frameStyle, label }`, `{ vip: {...} }`,
 * `isVip: true` (legacy boolean → default gold frame). Returns null for non-VIP.
 */
export function toVipBadge(raw: unknown): VipBadge | null {
  if (raw === true) return { tierRank: 1, frameStyle: DEFAULT_VIP_FRAME, label: 'VIP' };
  if (!isObj(raw)) return null;
  if ('vip' in raw && raw.vip !== undefined && !('frameStyle' in raw)) return toVipBadge(raw.vip);
  if (raw.active === false || raw.isVip === false) return null;
  const frame = str(raw.frameStyle) ?? str(raw.frame);
  if (!frame && raw.isVip !== true) return null;
  return {
    tierRank: num(raw.tierRank) ?? 1,
    frameStyle: resolveFrameStyle(frame),
    label: (str(raw.label) ?? 'VIP').slice(0, 16),
  };
}

export function toVipPackage(raw: unknown): VipPackage | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const duration = raw.durationDays === null ? null : num(raw.durationDays);
  return {
    id,
    key: str(raw.key) ?? id,
    name: str(raw.name) ?? str(raw.key) ?? 'VIP',
    description: str(raw.description),
    permissionGroup: str(raw.permissionGroup) ?? 'VIP',
    tierRank: num(raw.tierRank) ?? 1,
    frameStyle: str(raw.frameStyle) ?? DEFAULT_VIP_FRAME,
    badgeLabel: (str(raw.badgeLabel) ?? 'VIP').slice(0, 16),
    priceThb: toMoneyString(raw.priceThb),
    durationDays: duration === null ? null : Math.trunc(duration),
    isActive: raw.isActive === true,
    sortOrder: num(raw.sortOrder) ?? 0,
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    activeMemberships: num(raw.activeMemberships ?? raw.activeMembershipCount ?? (isObj(raw._count) ? raw._count.memberships : null)),
  };
}

function toUserRef(raw: unknown, fallbackId: string | null): VipUserRef | null {
  if (!isObj(raw)) return fallbackId ? { id: fallbackId, name: null, steamId: null, avatar: null } : null;
  const id = str(raw.id) ?? fallbackId;
  if (!id) return null;
  return {
    id,
    name: str(raw.name) ?? str(raw.discordUsername) ?? str(raw.username),
    steamId: str(raw.steamId),
    avatar: str(raw.avatar) ?? str(raw.discordAvatar),
  };
}

function toSync(raw: unknown): VipSyncState | null {
  if (!isObj(raw)) return null;
  const action = raw.action === 'add' || raw.action === 'remove' ? raw.action : null;
  return {
    status: str(raw.status),
    syncedAt: str(raw.syncedAt),
    jobId: str(raw.jobId),
    jobStatus: str(raw.jobStatus),
    action,
    attempts: num(raw.attempts),
    lastError: str(raw.lastError),
    updatedAt: str(raw.updatedAt) ?? str(raw.at),
  };
}

export function toVipMembership(raw: unknown): VipMembership | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const userId = str(raw.userId) ?? (isObj(raw.user) ? str(raw.user.id) : null) ?? '';
  const pkg = toVipPackage(raw.package);
  return {
    id,
    userId,
    user: toUserRef(raw.user, userId || null),
    packageId: str(raw.packageId) ?? pkg?.id ?? null,
    package: pkg
      ? { id: pkg.id, key: pkg.key, name: pkg.name, tierRank: pkg.tierRank, frameStyle: pkg.frameStyle, badgeLabel: pkg.badgeLabel }
      : null,
    permissionGroup: str(raw.permissionGroup) ?? pkg?.permissionGroup ?? 'VIP',
    startsAt: str(raw.startsAt),
    expiresAt: str(raw.expiresAt),
    status: (str(raw.status) ?? 'active') as VipMembership['status'],
    state: (str(raw.state) ?? str(raw.status) ?? 'active') as VipMembership['state'],
    source: (str(raw.source) ?? 'purchase') as VipMembership['source'],
    paymentIntentId: str(raw.paymentIntentId),
    grantedBy: str(raw.grantedBy) ?? (isObj(raw.grantedByUser) ? str(raw.grantedByUser.discordUsername) : null),
    revokedAt: str(raw.revokedAt),
    revokedBy: str(raw.revokedBy),
    reason: str(raw.reason),
    createdAt: str(raw.createdAt),
    sync: toSync(raw.sync ?? raw.syncJob ?? raw.lastSync),
  };
}

export function toVipMe(raw: unknown): VipMe {
  const body = isObj(raw) ? raw : {};
  const memberships = (Array.isArray(body.memberships) ? body.memberships : [])
    .map(toVipMembership)
    .filter((m): m is VipMembership => m !== null);
  const explicit = toVipMembership(body.active ?? body.membership ?? body.current);
  const active =
    explicit ??
    memberships
      .filter((m) => m.status === 'active')
      .sort((a, b) => compareExpiry(b.expiresAt, a.expiresAt))[0] ??
    null;
  let vip = toVipBadge(body.vip ?? body.badge);
  if (!vip && active && active.state === 'active') {
    vip = {
      tierRank: active.package?.tierRank ?? 1,
      frameStyle: resolveFrameStyle(active.package?.frameStyle),
      label: active.package?.badgeLabel ?? 'VIP',
    };
  }
  const groups = (Array.isArray(body.groups) ? body.groups : [])
    .map((g) => (isObj(g) && str(g.group) ? { group: str(g.group)!, expiresAt: str(g.expiresAt) } : null))
    .filter((g): g is { group: string; expiresAt: string | null } => g !== null);
  return { vip, active, memberships, groups, steamLinked: body.steamLinked !== false };
}

/** Sort helper: null (permanent) is the latest possible expiry. */
export function compareExpiry(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** '199.00' -> '฿199', '1499.5' -> '฿1,499.50'. Display only; no arithmetic on the amount. */
export function formatThb(value: string | null | undefined): string {
  if (!value || !/^-?\d+(\.\d+)?$/.test(value)) return '—';
  const [intPart, frac = ''] = value.split('.');
  const neg = intPart.startsWith('-');
  const digits = (neg ? intPart.slice(1) : intPart).replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmedFrac = frac.replace(/0+$/, '');
  const fracOut = trimmedFrac ? `.${trimmedFrac.padEnd(2, '0').slice(0, 2)}` : '';
  return `${neg ? '-' : ''}฿${grouped}${fracOut}`;
}

/** True when the decimal string is exactly zero (unpriced package). */
export function isZeroPrice(value: string): boolean {
  return /^0+(\.0+)?$/.test(value.trim());
}

export function durationLabel(days: number | null): string {
  if (days === null) return 'ถาวร';
  if (days % 365 === 0 && days >= 365) return `${days / 365} ปี`;
  if (days % 30 === 0 && days >= 30) return `${days / 30} เดือน (${days} วัน)`;
  return `${days} วัน`;
}

/** Whole days left until `expiresAt` (ceil), 0 when past; null = permanent. */
export function daysRemaining(expiresAt: string | null, now: number = Date.now()): number | null {
  if (expiresAt === null) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now) / 86_400_000));
}

export const MEMBERSHIP_STATUS_TH: Record<string, string> = {
  active: 'ใช้งานอยู่',
  scheduled: 'รอเริ่ม (ต่ออายุล่วงหน้า)',
  expired: 'หมดอายุ',
  revoked: 'ถูกเพิกถอน',
};

export const SYNC_STATUS_TH: Record<string, string> = {
  pending: 'รอซิงก์เข้าเกม',
  synced: 'ซิงก์แล้ว',
  failed: 'ซิงก์ไม่สำเร็จ',
  no_steam: 'ยังไม่เชื่อม Steam',
  unqueued: 'รอเซิร์ฟเวอร์ออนไลน์',
};

export const MEMBERSHIP_SOURCE_TH: Record<string, string> = {
  purchase: 'ซื้อด้วยเงินจริง',
  admin: 'แอดมินมอบให้',
  legacy: 'ระบบเดิม',
};
