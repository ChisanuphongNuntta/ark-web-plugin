/**
 * Admin transactions (every ledger transaction) — API client + response normalizers.
 * Contract: backend/contracts/admin-transactions-2026-10.md
 * Backend:  backend/src/services/adminTransactions.service.ts, ledgerReconcile.service.ts
 *
 *   GET /admin/transactions               list (admin|root), server-paginated
 *   GET /admin/transactions/:id           detail with every LedgerEntry + related rows
 *   GET /admin/transactions/summary       one Bangkok day's totals
 *   GET /admin/transactions/export.csv    CSV (same filters, max 50k rows, audited)
 *   GET /admin/ledger/reconcile           ledger vs cached balances (root)
 *
 * Every parser is defensive: a slightly different payload degrades to '—'
 * instead of crashing the page. Money stays a decimal string end to end.
 */
import { api, fetchAdminPage, type AdminListRequest } from '@/lib/api';
import type { PageRequest, PageResult } from '@/components/admin/paginationMath';
import {
  bangkokDayEndExclusiveIso,
  bangkokDayStartIso,
  isIsoDate,
  redactSecrets,
  toAmountString,
  toSummaryMetric,
  transactionCategory,
  transactionTypeLabel,
  type SummaryMetric,
  type TransactionCategory,
} from '@/lib/adminTransactionsMath';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminTransactionFilter = 'type' | 'category' | 'userId' | 'referenceType' | 'from' | 'to' | 'direction';
export const TRANSACTION_DIRECTIONS = ['in', 'out'] as const;

export interface PersonRef {
  id: string;
  name: string | null;
}

export interface AdminTransactionRow {
  id: string;
  type: string;
  typeLabelTh: string;
  category: TransactionCategory;
  createdAt: string | null;
  postedAt: string | null;
  createdBy: PersonRef | null;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceLink: string | null;
  /** The customer side of the transaction (null for system-only postings). */
  user: (PersonRef & { steamId: string | null }) | null;
  /** Signed IC amount for the customer side (decimal string). */
  amount: string | null;
  /** Customer available balance after this transaction. */
  balanceAfter: string | null;
  /** Customer `refundable` balance after, only when the row touched it (legacy refunds). */
  refundableAfter: string | null;
  entriesCount: number | null;
  /** Client-only: prepended from a realtime event, not yet confirmed by a refetch. */
  live?: boolean;
}

export interface TransactionTotals {
  in: string | null;
  /** Money out as a positive magnitude (server) — display with asDebit(). */
  out: string | null;
  net: string | null;
  count: number | null;
}

export type AdminTransactionsPage = PageResult<AdminTransactionRow> & {
  totals: TransactionTotals | null;
};

export interface LedgerEntryRow {
  id: string;
  accountId: string | null;
  accountType: string | null;
  accountLabelTh: string | null;
  accountKey: string | null;
  owner: (PersonRef & { steamId: string | null }) | null;
  amount: string | null;
  balanceAfter: string | null;
}

export interface RelatedRef {
  /** order | checkout | quote | payment | listing | delivery | … */
  kind: string;
  id: string;
  status: string | null;
  label: string | null;
  /** Extra one-liner (attempts, error, THB amount …). */
  note: string | null;
  link: string | null;
  amount: string | null;
}

export interface AdminTransactionDetail extends AdminTransactionRow {
  idempotencyKey: string | null;
  /** The referenceType as stored (before the server normalised legacy spellings). */
  storedReferenceType: string | null;
  /** false = entries do not sum to zero (should never happen; shown as a warning). */
  balanced: boolean | null;
  metadata: unknown;
  entries: LedgerEntryRow[];
  related: RelatedRef[];
}

export interface TransactionsSummary {
  date: string | null;
  topups: SummaryMetric;
  purchases: SummaryMetric;
  refunds: SummaryMetric;
  /** Admin adjustments: amount = net (credit − debit). */
  adjustments: SummaryMetric;
  rewards: SummaryMetric;
  /** P2P: amount = buyer volume held into escrow. */
  p2p: SummaryMetric;
  /** Net of every customer-side movement that day (in − out). */
  net: SummaryMetric;
}

export interface ReconcileMismatch {
  accountId: string | null;
  accountKey: string | null;
  accountType: string | null;
  userId: string | null;
  userName: string | null;
  cachedBalance: string | null;
  ledgerSum: string | null;
  difference: string | null;
}

export interface UnbalancedTransaction {
  transactionId: string;
  sum: string | null;
}

export interface ReconcileResult {
  ok: boolean;
  checkedAt: string | null;
  checkedAccounts: number | null;
  checkedUsers: number | null;
  mismatches: ReconcileMismatch[];
  mismatchCount: number;
  legacyPointsMismatches: ReconcileMismatch[];
  legacyPointsMismatchCount: number;
  unbalancedTransactions: UnbalancedTransaction[];
  unbalancedTransactionCount: number;
  /** Informational: user `refundable` sub-accounts still holding IC (legacy refunds). */
  refundableBalanceCount: number;
  refundableTotal: string | null;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null);
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null;

function toPerson(v: unknown): PersonRef | null {
  if (typeof v === 'string' && v) return { id: v, name: null };
  if (!isObj(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  const name = str(v.name) ?? str(v.discordUsername) ?? str(v.username) ?? str(v.displayName);
  return { id, name };
}

function toCustomer(v: unknown): (PersonRef & { steamId: string | null }) | null {
  const person = toPerson(v);
  if (!person) return null;
  return { ...person, steamId: isObj(v) ? str(v.steamId) : null };
}

export function toTransactionRow(raw: unknown): AdminTransactionRow {
  const r: Raw = isObj(raw) ? raw : {};
  const type = str(r.type) ?? '';
  return {
    id: str(r.id) ?? '',
    type,
    typeLabelTh: transactionTypeLabel(type, str(r.typeLabelTh)),
    category: transactionCategory(type, r.category),
    createdAt: str(r.createdAt),
    postedAt: str(r.postedAt),
    createdBy: toPerson(r.createdBy),
    description: str(r.description),
    referenceType: str(r.referenceType),
    referenceId: str(r.referenceId),
    referenceLink: str(r.referenceLink),
    user: toCustomer(r.user),
    amount: toAmountString(r.amount),
    balanceAfter: toAmountString(r.balanceAfter),
    refundableAfter: toAmountString(r.refundableAfter),
    entriesCount: int(r.entriesCount) ?? (Array.isArray(r.entries) ? r.entries.length : null),
  };
}

function toTotals(raw: unknown): TransactionTotals | null {
  if (!isObj(raw)) return null;
  return {
    in: toAmountString(raw.in),
    out: toAmountString(raw.out),
    net: toAmountString(raw.net),
    count: int(raw.count),
  };
}

function toEntry(raw: unknown, index: number): LedgerEntryRow {
  const e: Raw = isObj(raw) ? raw : {};
  const account: Raw = isObj(e.account) ? e.account : {};
  const owner =
    toCustomer(e.owner) ??
    toCustomer(account.user) ??
    (str(account.userId) ? { id: str(account.userId)!, name: null, steamId: null } : null);
  return {
    id: str(e.id) ?? `entry-${index}`,
    accountId: str(e.accountId) ?? str(account.id),
    accountType: str(e.accountType) ?? str(account.type),
    accountLabelTh: str(e.accountLabelTh),
    accountKey: str(e.accountKey) ?? str(account.key),
    owner,
    amount: toAmountString(e.amount),
    balanceAfter: toAmountString(e.balanceAfter),
  };
}

const RELATED_KIND: Record<string, string> = {
  order: 'order',
  orderGroup: 'checkout',
  quote: 'quote',
  paymentIntent: 'payment',
  payment: 'payment',
  listing: 'listing',
  deliveries: 'delivery',
  delivery: 'delivery',
  slip: 'payment',
};

function toRelated(key: string, raw: unknown): RelatedRef | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const kind = RELATED_KIND[key] ?? key;
  const product = isObj(raw.product) ? str(raw.product.name) : null;
  let label = str(raw.label) ?? product ?? str(raw.productName) ?? str(raw.name) ?? str(raw.title);
  let note: string | null = null;
  let amount = toAmountString(raw.amount) ?? toAmountString(raw.totalPrice) ?? toAmountString(raw.total) ?? null;

  switch (kind) {
    case 'checkout': {
      const items = Array.isArray(raw.items) ? raw.items : [];
      label = items.length ? `${items.length.toLocaleString('th-TH')} รายการในตะกร้า` : label;
      break;
    }
    case 'payment': {
      const provider = str(raw.provider);
      const ref = str(raw.reference);
      label = [provider, ref].filter(Boolean).join(' · ') || label;
      amount = toAmountString(raw.pointsAmount) ?? amount;
      const thb = toAmountString(raw.amountThb);
      note = thb ? `฿${thb}` : null;
      break;
    }
    case 'listing': {
      const species = str(raw.species);
      const level = str(raw.level);
      label = species ? `${species}${level ? ` Lv.${level}` : ''}` : label;
      amount = toAmountString(raw.price) ?? amount;
      const ds = str(raw.deliveryStatus);
      note = ds ? `ส่งของ: ${ds}` : null;
      break;
    }
    case 'delivery': {
      label = str(raw.deliveryType) ?? label;
      const attempts = int(raw.attempts);
      const max = int(raw.maxAttempts);
      const parts: string[] = [];
      if (attempts !== null) parts.push(`ลองส่ง ${attempts}${max !== null ? `/${max}` : ''} ครั้ง`);
      const err = str(raw.error);
      if (err) parts.push(err.length > 120 ? `${err.slice(0, 120)}…` : err);
      note = parts.length ? parts.join(' · ') : null;
      amount = null;
      break;
    }
    case 'order': {
      const err = str(raw.lastError);
      note = err ? (err.length > 120 ? `${err.slice(0, 120)}…` : err) : null;
      break;
    }
    default:
      break;
  }

  return {
    kind,
    id,
    status: str(raw.status),
    label,
    note,
    link: str(raw.link) ?? str(raw.referenceLink) ?? str(raw.href),
    amount,
  };
}

export function toTransactionDetail(body: unknown): AdminTransactionDetail {
  const b: Raw = isObj(body) ? body : {};
  const t: Raw = isObj(b.transaction) ? b.transaction : b;
  const row = toTransactionRow(t);
  const entries = (Array.isArray(t.entries) ? t.entries : Array.isArray(b.entries) ? b.entries : []).map(toEntry);

  const related: RelatedRef[] = [];
  const seen = new Set<string>();
  const push = (key: string, value: unknown) => {
    const ref = toRelated(key, value);
    if (!ref) return;
    const k = `${ref.kind}:${ref.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    related.push(ref);
  };
  const relatedSrc: Raw = isObj(b.related) ? b.related : isObj(t.related) ? t.related : {};
  for (const [key, value] of Object.entries(relatedSrc)) {
    if (Array.isArray(value)) value.forEach((v) => push(key, v));
    else push(key, value);
  }

  return {
    ...row,
    entriesCount: row.entriesCount ?? entries.length,
    idempotencyKey: str(t.idempotencyKey),
    storedReferenceType: str(t.storedReferenceType),
    balanced: typeof t.balanced === 'boolean' ? t.balanced : null,
    metadata: t.metadata === undefined ? null : redactSecrets(t.metadata),
    entries,
    related,
  };
}

export function toSummary(body: unknown): TransactionsSummary {
  const b: Raw = isObj(body) ? (isObj(body.summary) ? body.summary : body) : {};
  return {
    date: str(b.date),
    topups: toSummaryMetric(b.topups),
    purchases: toSummaryMetric(b.purchases),
    refunds: toSummaryMetric(b.refunds),
    adjustments: toSummaryMetric(b.adminAdjustments ?? b.adjustments),
    rewards: toSummaryMetric(b.rewards),
    p2p: toSummaryMetric(b.p2p),
    net: toSummaryMetric(b.totals ?? b.net),
  };
}

function toMismatch(raw: unknown): ReconcileMismatch {
  const m: Raw = isObj(raw) ? raw : {};
  const user = toPerson(m.user);
  return {
    accountId: str(m.accountId) ?? str(m.availableAccountId),
    accountKey: str(m.accountKey),
    accountType: str(m.accountType),
    userId: str(m.userId) ?? user?.id ?? null,
    userName: str(m.userName) ?? user?.name ?? null,
    cachedBalance: toAmountString(m.cachedBalance) ?? toAmountString(m.pointsBalance) ?? toAmountString(m.balance),
    ledgerSum: toAmountString(m.ledgerSum),
    difference: toAmountString(m.difference) ?? toAmountString(m.diff),
  };
}

export function toReconcile(body: unknown): ReconcileResult {
  const b: Raw = isObj(body) ? body : {};
  const mismatches = Array.isArray(b.mismatches) ? b.mismatches.map(toMismatch) : [];
  const legacy = Array.isArray(b.legacyPointsMismatches) ? b.legacyPointsMismatches.map(toMismatch) : [];
  const unbalanced: UnbalancedTransaction[] = Array.isArray(b.unbalancedTransactions)
    ? b.unbalancedTransactions
        .map((u) => (isObj(u) ? { transactionId: str(u.transactionId) ?? '', sum: toAmountString(u.sum) } : null))
        .filter((u): u is UnbalancedTransaction => Boolean(u?.transactionId))
    : [];
  const mismatchCount = int(b.mismatchCount) ?? mismatches.length;
  const legacyCount = int(b.legacyPointsMismatchCount) ?? legacy.length;
  const unbalancedCount = int(b.unbalancedTransactionCount) ?? unbalanced.length;
  return {
    ok: typeof b.ok === 'boolean' ? b.ok : mismatchCount === 0 && legacyCount === 0 && unbalancedCount === 0,
    checkedAt: str(b.checkedAt) ?? str(b.at),
    checkedAccounts: int(b.checkedAccounts),
    checkedUsers: int(b.checkedUsers),
    mismatches,
    mismatchCount,
    legacyPointsMismatches: legacy,
    legacyPointsMismatchCount: legacyCount,
    unbalancedTransactions: unbalanced,
    unbalancedTransactionCount: unbalancedCount,
    refundableBalanceCount: int(b.refundableBalanceCount) ?? (Array.isArray(b.refundableBalances) ? b.refundableBalances.length : 0),
    refundableTotal: toAmountString(b.refundableTotal),
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * The UI keeps Bangkok days (YYYY-MM-DD) in the URL. The API wants ISO instants:
 * `from` = 00:00 +07:00 of the first day (inclusive), `to` = 00:00 +07:00 of the day
 * AFTER the last day (exclusive). An inverted range is swapped (the server rejects from >= to).
 */
function toOutgoing(request: PageRequest): PageRequest {
  const filters = { ...request.filters };
  let from = isIsoDate(filters.from) ? filters.from : '';
  let to = isIsoDate(filters.to) ? filters.to : '';
  if (from && to && from > to) [from, to] = [to, from];
  delete filters.from;
  delete filters.to;
  if (from) filters.from = bangkokDayStartIso(from)!;
  if (to) filters.to = bangkokDayEndExclusiveIso(to)!;
  return { ...request, filters };
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error && !(err as { response?: unknown }).response && err.message && !/^Request failed|Network Error|timeout/i.test(err.message)) {
    return err.message;
  }
  if (err && typeof err === 'object') {
    const e = err as { response?: { status?: number; data?: { error?: unknown; message?: unknown } } };
    const status = e.response?.status;
    if (status === 403) return 'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลนี้';
    if (status === 404) return 'ไม่พบรายการ';
    if (status === 429) return 'เรียกใช้บ่อยเกินไป โปรดรอสักครู่แล้วลองใหม่';
    const fromApi = e.response?.data?.error ?? e.response?.data?.message;
    if (typeof fromApi === 'string' && fromApi) return fromApi;
  }
  return fallback;
}

export const adminTransactionsApi = {
  /** GET /admin/transactions — filters: type (comma list), category, userId, referenceType, from/to (Bangkok days), direction. */
  getPage: async (req: AdminListRequest<AdminTransactionFilter>, signal?: AbortSignal): Promise<AdminTransactionsPage> => {
    const { result, body } = await fetchAdminPage<AdminTransactionRow>('/admin/transactions', 'items', req, {
      signal,
      mapItem: toTransactionRow,
      mapOutgoing: toOutgoing,
    });
    return { ...result, totals: toTotals(body.totals) };
  },

  getDetail: async (id: string, signal?: AbortSignal): Promise<AdminTransactionDetail> => {
    const { data } = await api.get(`/admin/transactions/${encodeURIComponent(id)}`, { signal, timeout: 15_000 });
    return toTransactionDetail(data);
  },

  /** `date` = Bangkok day YYYY-MM-DD. */
  getSummary: async (date: string, signal?: AbortSignal): Promise<TransactionsSummary> => {
    const { data } = await api.get('/admin/transactions/summary', { params: { date }, signal, timeout: 15_000 });
    return toSummary(data);
  },

  /** Root only. Reads every account in one snapshot: can take a while on a big ledger. */
  reconcile: async (signal?: AbortSignal): Promise<ReconcileResult> => {
    const { data } = await api.get('/admin/ledger/reconcile', { signal, timeout: 120_000 });
    return toReconcile(data);
  },

  /**
   * GET /admin/transactions/export.csv with the current filters (no paging; the server caps at 50k rows
   * and rate-limits exports). Returns the file as a Blob; the caller saves it.
   */
  exportCsv: async (req: { search?: string; filters?: Record<string, string> }): Promise<{ blob: Blob; filename: string }> => {
    const outgoing = toOutgoing({ page: 1, pageSize: 25, search: (req.search ?? '').trim(), filters: { ...(req.filters ?? {}) } });
    const params: Record<string, string> = {};
    if (outgoing.search) params.search = outgoing.search;
    for (const [k, v] of Object.entries(outgoing.filters)) if (v) params[k] = v;
    try {
      const res = await api.get('/admin/transactions/export.csv', { params, responseType: 'blob', timeout: 300_000 });
      const disposition = String(res.headers?.['content-disposition'] ?? '');
      const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
      let filename = `iris-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      if (match) {
        try {
          filename = decodeURIComponent(match[1]);
        } catch {
          filename = match[1];
        }
      }
      return { blob: res.data as Blob, filename };
    } catch (err) {
      // Error bodies arrive as a Blob too: read the JSON message out of it.
      const response = (err as { response?: { status?: number; data?: unknown } })?.response;
      if (response?.status === 429) throw new Error('ส่งออกบ่อยเกินไป โปรดรอสักครู่แล้วลองใหม่');
      if (response?.status === 403) throw new Error('บัญชีนี้ไม่มีสิทธิ์ส่งออกข้อมูล');
      const data = response?.data;
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        let msg: unknown = null;
        try {
          const parsed = JSON.parse(await data.text()) as { error?: unknown; message?: unknown };
          msg = parsed.error ?? parsed.message;
        } catch {
          // not JSON
        }
        if (typeof msg === 'string' && msg) throw new Error(msg);
      }
      throw new Error('ส่งออกไฟล์ไม่สำเร็จ โปรดลองอีกครั้ง');
    }
  },
};

export { errorText as transactionsErrorText };
