/**
 * Pure helpers for the admin transactions page (/admin/transactions).
 * No imports, no DOM: tested with `node --test src/lib/adminTransactionsMath.test.mts`.
 *
 * Contract: backend/contracts/admin-transactions-2026-10.md
 */

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

/** Mirrors backend/src/services/ledgerTypes.ts (LEDGER_CATEGORIES). */
export type TransactionCategory = 'topup' | 'purchase' | 'refund' | 'admin' | 'reward' | 'p2p' | 'legacy' | 'opening' | 'other';

export const TRANSACTION_CATEGORIES: readonly TransactionCategory[] = [
  'topup', 'purchase', 'refund', 'admin', 'reward', 'p2p', 'legacy', 'opening', 'other',
];

export interface TransactionTypeInfo {
  type: string;
  labelTh: string;
  category: TransactionCategory;
}

/**
 * Mirrors backend LEDGER_TYPES. The server's `typeLabelTh` / `category` win when present; this
 * list is the fallback (live events, older payloads) and the type filter options.
 */
export const TRANSACTION_TYPES: readonly TransactionTypeInfo[] = [
  { type: 'payment_topup', labelTh: 'เติมเงินออนไลน์', category: 'topup' },
  { type: 'payment_topup_sandbox', labelTh: 'เติมเงิน (ทดสอบ)', category: 'topup' },
  { type: 'stripe_topup', labelTh: 'เติมเงินผ่านบัตร', category: 'topup' },
  { type: 'bank_slip_approval', labelTh: 'เติมเงินด้วยสลิป (อนุมัติแล้ว)', category: 'topup' },
  { type: 'bank_slip_approval_demo', labelTh: 'เติมเงินด้วยสลิป (เดโม)', category: 'topup' },
  { type: 'order_purchase', labelTh: 'ซื้อสินค้า', category: 'purchase' },
  { type: 'checkout_purchase', labelTh: 'ซื้อสินค้า (ตะกร้า)', category: 'purchase' },
  { type: 'game_purchase', labelTh: 'ซื้อสินค้าในเกม', category: 'purchase' },
  { type: 'order_refund', labelTh: 'คืนเงินคำสั่งซื้อ', category: 'refund' },
  { type: 'dino_escrow_refund', labelTh: 'คืนเงินไดโน P2P (ส่งไม่สำเร็จ)', category: 'refund' },
  { type: 'admin_adjustment', labelTh: 'แอดมินปรับยอด', category: 'admin' },
  { type: 'earn_playtime', labelTh: 'รางวัลจากการเล่นเกม', category: 'reward' },
  { type: 'dino_escrow_hold', labelTh: 'ซื้อไดโน P2P (พักเงินไว้)', category: 'p2p' },
  { type: 'dino_escrow_release', labelTh: 'จ่ายเงินผู้ขายไดโน P2P', category: 'p2p' },
  { type: 'legacy_balance_claim', labelTh: 'รับยอดเงินจากระบบเดิม', category: 'legacy' },
  { type: 'opening_balance', labelTh: 'ยอดยกมาตอนย้ายระบบ', category: 'opening' },
  { type: 'wallet_hold', labelTh: 'กันวงเงิน', category: 'other' },
];

const TYPE_INDEX = new Map(TRANSACTION_TYPES.map((t) => [t.type, t]));

export const CATEGORY_LABEL_TH: Record<TransactionCategory, string> = {
  topup: 'เติมเงิน',
  purchase: 'ซื้อสินค้า',
  refund: 'คืนเงิน',
  admin: 'แอดมินปรับยอด',
  reward: 'รางวัล',
  p2p: 'ตลาดไดโน P2P',
  legacy: 'ย้ายยอดจากระบบเดิม',
  opening: 'ยอดยกมา',
  other: 'อื่น ๆ',
};

/** Badge tone per category (StatusBadge tones). */
export const CATEGORY_TONE: Record<TransactionCategory, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  topup: 'success',
  purchase: 'info',
  refund: 'warning',
  admin: 'warning',
  reward: 'success',
  p2p: 'info',
  legacy: 'neutral',
  opening: 'neutral',
  other: 'neutral',
};

export function isTransactionCategory(value: unknown): value is TransactionCategory {
  return typeof value === 'string' && (TRANSACTION_CATEGORIES as readonly string[]).includes(value);
}

/** Same rule as the backend: known type -> its category, anything else -> 'other'. */
export function transactionCategory(type: string | null | undefined, serverCategory?: unknown): TransactionCategory {
  if (isTransactionCategory(serverCategory)) return serverCategory;
  if (!type) return 'other';
  return TYPE_INDEX.get(type)?.category ?? 'other';
}

/** true when the local table knows this type (so its category is certain). */
export function isKnownTransactionType(type: string | null | undefined): boolean {
  return Boolean(type && TYPE_INDEX.has(type));
}

/** Server label first, then the local table, then the raw type (never empty). */
export function transactionTypeLabel(type: string | null | undefined, serverLabel?: string | null): string {
  if (typeof serverLabel === 'string' && serverLabel.trim()) return serverLabel.trim();
  if (!type) return 'ไม่ระบุ';
  return TYPE_INDEX.get(type)?.labelTh ?? type;
}

export const ACCOUNT_TYPE_LABEL_TH: Record<string, string> = {
  available: 'ยอดใช้ได้',
  held: 'ยอดกันไว้',
  promotional: 'ยอดโปรโมชัน',
  refundable: 'ยอดขอคืนได้',
  system_issuance: 'ระบบ: ออกเหรียญ',
  platform_revenue: 'ระบบ: รายได้ร้าน',
  system_clearing: 'ระบบ: บัญชีพัก',
};

export function accountTypeLabel(type: string | null | undefined): string {
  if (!type) return 'ไม่ระบุ';
  return ACCOUNT_TYPE_LABEL_TH[type] ?? type;
}

/** Canonical referenceType values (backend REFERENCE_TYPES) plus legacy spellings. */
export const REFERENCE_TYPE_LABEL_TH: Record<string, string> = {
  order: 'คำสั่งซื้อ',
  checkout: 'ตะกร้า',
  game_purchase_quote: 'ใบเสนอราคาในเกม',
  payment_intent: 'การชำระเงิน',
  slip: 'สลิปโอน',
  stripe_session: 'บัตร (Stripe)',
  admin_adjustment: 'ปรับยอดโดยแอดมิน',
  reward: 'รางวัล',
  dino_listing: 'ประกาศไดโน',
  legacy_balance_claim: 'ยอดระบบเดิม',
  delivery: 'การส่งของ',
  user: 'ผู้ใช้',
  // legacy spellings (normalized by the backend, kept for older payloads)
  admin: 'ปรับยอดโดยแอดมิน',
  gameplay: 'รางวัล',
  external: 'ภายนอก',
};

export function referenceTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return REFERENCE_TYPE_LABEL_TH[type] ?? type;
}

// ---------------------------------------------------------------------------
// IC amounts (decimal strings; never converted to floating point for display)
// ---------------------------------------------------------------------------

/** Accepts string | number | bigint; returns a canonical decimal string or null. */
export function toAmountString(value: unknown): string | null {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const s = String(value);
    return /^[+-]?\d+(\.\d+)?$/.test(s) ? s : null; // rejects exponent forms (1e+21)
  }
  if (typeof value === 'string') {
    const v = value.trim();
    return /^[+-]?\d+(\.\d+)?$/.test(v) ? v : null;
  }
  return null;
}

/** -1 | 0 | 1 */
export function amountSign(value: unknown): -1 | 0 | 1 {
  const s = toAmountString(value);
  if (s === null) return 0;
  if (/^[+-]?0+(\.0+)?$/.test(s)) return 0;
  return s.startsWith('-') ? -1 : 1;
}

/** Money-out totals may arrive as a positive magnitude or already negative: always return the negative form. */
export function asDebit(value: unknown): string | null {
  const s = toAmountString(value);
  if (s === null) return null;
  if (amountSign(s) === 0) return s.replace(/^[+-]/, '');
  return `-${s.replace(/^[+-]/, '')}`;
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats an IC amount with thousands separators.
 * `signed: true` always prints the sign ('+1,000' / '−1,000'; zero has none).
 * Uses U+2212 MINUS SIGN when signed so the column reads cleanly.
 */
export function formatIc(value: unknown, options: { signed?: boolean } = {}): string {
  const s = toAmountString(value);
  if (s === null) return '—';
  const negative = s.startsWith('-');
  const unsigned = s.replace(/^[+-]/, '');
  const [intPart, frac] = unsigned.split('.');
  const intClean = intPart.replace(/^0+(?=\d)/, '');
  const body = groupDigits(intClean) + (frac ? `.${frac}` : '');
  const sign = amountSign(s);
  if (options.signed) {
    if (sign === 0) return body;
    return `${sign < 0 ? '−' : '+'}${body}`;
  }
  return negative && sign !== 0 ? `-${body}` : body;
}

// ---------------------------------------------------------------------------
// Dates (Asia/Bangkok, UTC+7 all year — no DST)
// ---------------------------------------------------------------------------

export const BANGKOK_TZ = 'Asia/Bangkok';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 'YYYY-MM-DD' of the given instant in Bangkok. */
export function bangkokDate(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Start of a Bangkok day as an ISO instant (00:00:00.000 +07:00). */
export function bangkokDayStartIso(day: string): string | null {
  if (!isIsoDate(day)) return null;
  return new Date(`${day}T00:00:00.000+07:00`).toISOString();
}

/**
 * Exclusive end of a Bangkok day: the next day's 00:00 +07:00 as an ISO instant.
 * The API's `to` is exclusive (`< to`), so 'to=2026-10-18' covers the whole 18th.
 */
export function bangkokDayEndExclusiveIso(day: string): string | null {
  const start = bangkokDayStartIso(day);
  if (!start) return null;
  return new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

const dateTimeFormat = new Intl.DateTimeFormat('th-TH', {
  timeZone: BANGKOK_TZ,
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const timeFormat = new Intl.DateTimeFormat('th-TH', {
  timeZone: BANGKOK_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** '18 ต.ค. 69 14:03:22' in Bangkok time; '—' for missing/invalid input. */
export function formatBangkokDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormat.format(d);
}

const dateFormat = new Intl.DateTimeFormat('th-TH', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'long', year: 'numeric' });

/** A Bangkok day 'YYYY-MM-DD' as '18 ตุลาคม 2569'. */
export function formatBangkokDay(day: string): string {
  if (!isIsoDate(day)) return '—';
  return dateFormat.format(new Date(`${day}T12:00:00+07:00`));
}

/** '14:03:22' in Bangkok time. */
export function formatBangkokTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : timeFormat.format(d);
}

// ---------------------------------------------------------------------------
// Live rows ('admin:transaction')
// ---------------------------------------------------------------------------

export interface LiveTransactionEvent {
  id: string;
  type?: string | null;
  typeLabelTh?: string | null;
  /** Signed customer-side IC (string); null for system-only transactions. */
  amount?: string | number | null;
  user?: { id?: string | null; name?: string | null } | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt?: string | null;
}

export interface LiveMatchContext {
  search: string;
  filters: Record<string, string>;
}

/**
 * Can a live event be shown in the current view? Mirrors the backend list filters
 * (adminTransactions.service buildTransactionWhere) as far as the event payload allows.
 *   'yes'     -> it certainly matches every active filter
 *   'no'      -> it certainly does not (ignore it)
 *   'unknown' -> a filter cannot be evaluated from the event payload (count it in the pill)
 */
export function matchLiveEvent(event: LiveTransactionEvent, ctx: LiveMatchContext): 'yes' | 'no' | 'unknown' {
  const f = ctx.filters;
  let unknown = false;

  if (f.type) {
    const types = f.type.split(',').map((t) => t.trim()).filter(Boolean);
    if (!event.type) unknown = true;
    else if (!types.includes(event.type)) return 'no';
  }
  if (f.category) {
    // A type we do not know may still be categorised by a newer backend: undecidable here.
    if (!event.type || !isKnownTransactionType(event.type)) unknown = true;
    else if (transactionCategory(event.type) !== f.category) return 'no';
  }
  if (f.userId) {
    if (!event.user?.id) return event.user === null ? 'no' : 'unknown';
    if (event.user.id !== f.userId) return 'no';
  }
  if (f.direction === 'in' || f.direction === 'out') {
    const sign = amountSign(event.amount);
    if (event.amount === null) return 'no'; // system-only: no customer side, never "in"/"out"
    if (sign === 0) unknown = true;
    else if ((f.direction === 'in') !== (sign > 0)) return 'no';
  }
  if (f.from || f.to) {
    const at = event.createdAt ? new Date(event.createdAt).getTime() : NaN;
    if (Number.isNaN(at)) unknown = true;
    else {
      const from = f.from ? bangkokDayStartIso(f.from) : null;
      const to = f.to ? bangkokDayEndExclusiveIso(f.to) : null;
      if (from && at < new Date(from).getTime()) return 'no';
      if (to && at >= new Date(to).getTime()) return 'no';
    }
  }
  if (f.referenceType) {
    if (event.referenceType === undefined) unknown = true;
    else if (event.referenceType !== f.referenceType) return 'no';
  }

  if (ctx.search) {
    const needle = ctx.search.toLowerCase();
    const hit =
      event.id.toLowerCase() === needle ||
      (typeof event.referenceId === 'string' && event.referenceId.toLowerCase() === needle) ||
      (typeof event.user?.name === 'string' && event.user.name.toLowerCase().includes(needle)) ||
      event.user?.id?.toLowerCase() === needle;
    // Search also covers description / Steam ID / Discord ID / idempotency key, which the event does not carry.
    if (!hit) unknown = true;
  }
  return unknown ? 'unknown' : 'yes';
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Only same-origin absolute paths are rendered as links (never `//host` or `javascript:`). */
export function safeAdminHref(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const v = link.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null;
  return v;
}

/** Admin routes that exist in this frontend. A server link to any other route is shown as plain text. */
export const ADMIN_ROUTES: readonly string[] = [
  '/admin',
  '/admin/transactions',
  '/admin/users',
  '/admin/products',
  '/admin/categories',
  '/admin/servers',
  '/admin/content',
  '/admin/chat-ranks',
  '/admin/protection',
  '/admin/api-keys',
  '/admin/orders',
  '/admin/deliveries',
  '/admin/audit',
  '/admin/market',
  '/admin/settings',
  '/admin/plugin-keys',
  '/admin/vip',
  '/admin/payments',
  '/admin/perks',
  '/admin/chat',
];

/**
 * A server-provided `referenceLink`, made safe and pointed at a page that exists:
 * same-origin path only, known admin route only, and `?search=` rewritten to the
 * admin kit's `?q=` (ADMIN_UI.md) for list pages.
 */
export function resolveAdminLink(link: unknown): string | null {
  const href = safeAdminHref(link);
  if (!href) return null;
  const hashAt = href.indexOf('#');
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = noHash.indexOf('?');
  const path = (qAt >= 0 ? noHash.slice(0, qAt) : noHash).replace(/\/+$/, '') || '/';
  if (!ADMIN_ROUTES.includes(path)) return null;
  if (qAt < 0 || path === '/admin') return noHash;
  const params = new URLSearchParams(noHash.slice(qAt + 1));
  const search = params.get('search');
  if (search !== null && !params.has('q')) {
    params.delete('search');
    params.set('q', search);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

const SECRET_KEY_RE = /secret|token|password|passwd|api[-_]?key|signature|hmac|authorization|cookie|card|cvv|pan\b/i;

/** Defence in depth: the server already strips secrets from metadata; drop anything that looks like one. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[…]';
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[ซ่อน]' : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Summary metric: `{ amount, count }` from a number/string or an object of any reasonable shape. */
export interface SummaryMetric {
  amount: string | null;
  count: number | null;
}

export function toSummaryMetric(raw: unknown): SummaryMetric {
  if (raw === null || raw === undefined) return { amount: null, count: null };
  if (typeof raw !== 'object') return { amount: toAmountString(raw), count: null };
  const o = raw as Record<string, unknown>;
  const amount =
    toAmountString(o.amount) ?? toAmountString(o.total) ?? toAmountString(o.sum) ?? toAmountString(o.volume) ?? toAmountString(o.net);
  const countRaw = o.count ?? o.n;
  const count = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : typeof countRaw === 'string' && /^\d+$/.test(countRaw) ? Number(countRaw) : null;
  return { amount, count };
}
