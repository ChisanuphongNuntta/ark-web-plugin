// Admin "every transaction" view over the IRIS Wallet ledger
// (backend/contracts/admin-transactions-2026-10.md).
//
// LedgerTransaction rows are the source; the customer side of each row is derived from its
// LedgerEntry rows (customerSideOf). Everything here is read-only.
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { paginateQuery, parsePagination, parseSearch, type PaginationMeta } from '../utils/pagination.js';
import {
  LEDGER_CATEGORIES,
  LEDGER_TYPES,
  bangkokDayRange,
  bangkokToday,
  customerSideOf,
  formatBangkok,
  ledgerTypeCategory,
  ledgerTypeLabelTh,
  ledgerTypesInCategory,
  normalizeReferenceType,
  referenceLinkFor,
  referenceTypeWhere,
  type LedgerCategory,
} from './ledgerTypes.js';

export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_BATCH_SIZE = 1_000;

type Query = Record<string, unknown> | undefined;

export interface TransactionFilters {
  search?: string;
  types?: string[];
  category?: LedgerCategory;
  userId?: string;
  referenceType?: string;
  from?: Date;
  to?: Date;
  direction?: 'in' | 'out';
}

// ------------------------------------------------------------------------------ parsing

function singleString(query: Query, key: string, maxLength = 200): string | undefined {
  const raw = query?.[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') throw new AppError(`Invalid ${key}: expected a single string value`, 400);
  const value = raw.trim();
  if (value.length > maxLength) throw new AppError(`Invalid ${key}: must be at most ${maxLength} characters`, 400);
  if (value === '' || value.toLowerCase() === 'all') return undefined;
  return value;
}

function parseInstant(query: Query, key: string): Date | undefined {
  const value = singleString(query, key, 64);
  if (!value) return undefined;
  // Full ISO-8601 instants only; the UI converts Bangkok day boundaries before sending.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw new AppError(`Invalid ${key}: expected an ISO-8601 timestamp with timezone`, 400);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`Invalid ${key}`, 400);
  return date;
}

const TYPE_RE = /^[a-z0-9_]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_:.-]{1,128}$/;

export function parseTransactionFilters(query: Query): TransactionFilters {
  const filters: TransactionFilters = {};

  filters.search = parseSearch(query?.search);

  const type = singleString(query, 'type', 600);
  if (type) {
    const types = [...new Set(type.split(',').map((item) => item.trim()).filter(Boolean))];
    if (types.length === 0 || types.length > 20 || types.some((item) => !TYPE_RE.test(item))) {
      throw new AppError('Invalid type: comma-separated ledger types (a-z, 0-9, _)', 400);
    }
    filters.types = types;
  }

  const category = singleString(query, 'category', 32);
  if (category) {
    if (!LEDGER_CATEGORIES.includes(category as LedgerCategory)) {
      throw new AppError(`Invalid category: expected one of ${LEDGER_CATEGORIES.join(', ')}`, 400);
    }
    filters.category = category as LedgerCategory;
  }

  const userId = singleString(query, 'userId', 128);
  if (userId) {
    if (!ID_RE.test(userId)) throw new AppError('Invalid userId', 400);
    filters.userId = userId;
  }

  const referenceType = singleString(query, 'referenceType', 64);
  if (referenceType) {
    if (!TYPE_RE.test(referenceType)) throw new AppError('Invalid referenceType', 400);
    filters.referenceType = referenceType;
  }

  filters.from = parseInstant(query, 'from');
  filters.to = parseInstant(query, 'to');
  if (filters.from && filters.to && filters.from.getTime() >= filters.to.getTime()) {
    throw new AppError('Invalid range: from must be before to', 400);
  }

  const direction = singleString(query, 'direction', 8);
  if (direction) {
    if (direction !== 'in' && direction !== 'out') throw new AppError('Invalid direction: expected in or out', 400);
    filters.direction = direction;
  }

  return filters;
}

// ------------------------------------------------------------------------------ where

/** Entry-level scope for "the customer side": one user when filtered, else any user account. */
function customerAccountScope(filters: TransactionFilters): Prisma.WalletAccountWhereInput {
  return filters.userId ? { userId: filters.userId } : { userId: { not: null } };
}

export function buildTransactionWhere(filters: TransactionFilters): Prisma.LedgerTransactionWhereInput {
  const and: Prisma.LedgerTransactionWhereInput[] = [];

  if (filters.search) {
    const search = filters.search;
    and.push({
      OR: [
        { id: search },
        { referenceId: search },
        { idempotencyKey: search },
        { description: { contains: search, mode: 'insensitive' } },
        {
          entries: {
            some: {
              account: {
                user: {
                  OR: [
                    { id: search },
                    { discordId: search },
                    { steamId: search },
                    { discordUsername: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
      ],
    });
  }

  if (filters.types) and.push({ type: { in: filters.types } });

  if (filters.category) {
    if (filters.category === 'other') {
      const known = Object.keys(LEDGER_TYPES).filter((type) => LEDGER_TYPES[type].category !== 'other');
      and.push({ type: { notIn: known } });
    } else {
      and.push({ type: { in: ledgerTypesInCategory(filters.category) } });
    }
  }

  if (filters.userId) and.push({ entries: { some: { account: { userId: filters.userId } } } });

  if (filters.referenceType) and.push(referenceTypeWhere(filters.referenceType) as Prisma.LedgerTransactionWhereInput);

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) range.gte = filters.from;
    if (filters.to) range.lt = filters.to;
    // Migrated opening balances were never stamped postedAt; fall back to createdAt for them.
    and.push({ OR: [{ postedAt: range }, { postedAt: null, createdAt: range }] });
  }

  if (filters.direction) {
    const scope = customerAccountScope(filters);
    const positive = { amount: { gt: 0n }, account: scope };
    const negative = { amount: { lt: 0n }, account: scope };
    and.push(filters.direction === 'in'
      ? { entries: { some: positive, none: negative } }
      : { entries: { some: negative, none: positive } });
  }

  return and.length > 0 ? { AND: and } : {};
}

export const TRANSACTION_ORDER: Prisma.LedgerTransactionOrderByWithRelationInput[] = [
  { postedAt: { sort: 'desc', nulls: 'last' } },
  { id: 'desc' },
];

const ENTRY_INCLUDE = {
  entries: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      account: {
        select: {
          id: true,
          key: true,
          type: true,
          userId: true,
          user: { select: { id: true, discordUsername: true, steamId: true } },
        },
      },
    },
  },
} satisfies Prisma.LedgerTransactionInclude;

type TransactionWithEntries = Prisma.LedgerTransactionGetPayload<{ include: typeof ENTRY_INCLUDE }>;

// ------------------------------------------------------------------------------ rows

export interface AdminTransactionRow {
  id: string;
  type: string;
  typeLabelTh: string;
  category: LedgerCategory;
  createdAt: string;
  postedAt: string | null;
  createdBy: { id: string; name: string | null } | null;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceLink: string | null;
  user: { id: string; name: string | null; steamId: string | null } | null;
  amount: string | null;
  balanceAfter: string | null;
  /**
   * The customer's `refundable` balance after this transaction, only when it touched that
   * sub-account (legacy order refunds before the 2026-10 refund policy); otherwise null.
   */
  refundableAfter: string | null;
  entriesCount: number;
}

async function loadActorNames(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, discordUsername: true },
  });
  return new Map(users.map((user) => [user.id, user.discordUsername]));
}

/**
 * Available balance after a transaction that did not touch the customer's available account
 * (e.g. a refund into `refundable`): the latest available entry at or before it.
 */
async function availableBalanceAt(userId: string, row: TransactionWithEntries): Promise<bigint | null> {
  const at = row.postedAt ?? row.createdAt;
  const entry = await prisma.ledgerEntry.findFirst({
    where: {
      account: { userId, type: 'available', currency: 'IC' },
      transaction: { OR: [{ postedAt: { lte: at } }, { postedAt: null, createdAt: { lte: at } }] },
    },
    // Posting order, not insert order: postedAt is stamped after the account row lock is held,
    // so it is monotonic per account; entry createdAt/cuid ids are not.
    orderBy: [{ transaction: { postedAt: { sort: 'desc', nulls: 'last' } } }, { id: 'desc' }],
    select: { balanceAfter: true },
  });
  return entry?.balanceAfter ?? null;
}

export async function toAdminRows(rows: TransactionWithEntries[]): Promise<AdminTransactionRow[]> {
  const actors = await loadActorNames(rows.map((row) => row.createdBy ?? ''));

  return Promise.all(rows.map(async (row) => {
    const customer = customerSideOf(row.entries.map((entry) => ({
      amount: entry.amount,
      userId: entry.account.userId,
      accountType: entry.account.type,
      balanceAfter: entry.balanceAfter,
    })));
    const customerAccount = customer.userId
      ? row.entries.find((entry) => entry.account.userId === customer.userId)?.account
      : undefined;
    let availableAfter = customer.availableAfter;
    if (customer.userId && availableAfter === null) {
      availableAfter = await availableBalanceAt(customer.userId, row);
    }
    const refundableEntry = customer.userId
      ? row.entries.find((entry) => entry.account.userId === customer.userId && entry.account.type === 'refundable')
      : undefined;
    const referenceType = normalizeReferenceType(row.type, row.referenceType, row.referenceId);

    return {
      id: row.id,
      type: row.type,
      typeLabelTh: ledgerTypeLabelTh(row.type),
      category: ledgerTypeCategory(row.type),
      createdAt: row.createdAt.toISOString(),
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
      createdBy: row.createdBy ? { id: row.createdBy, name: actors.get(row.createdBy) ?? null } : null,
      description: row.description,
      referenceType,
      referenceId: row.referenceId,
      referenceLink: referenceLinkFor(referenceType, row.referenceId),
      user: customer.userId
        ? {
            id: customer.userId,
            name: customerAccount?.user?.discordUsername ?? null,
            steamId: customerAccount?.user?.steamId ?? null,
          }
        : null,
      amount: customer.amount === null ? null : customer.amount.toString(),
      balanceAfter: availableAfter === null ? null : availableAfter.toString(),
      refundableAfter: refundableEntry ? refundableEntry.balanceAfter.toString() : null,
      entriesCount: row.entries.length,
    };
  }));
}

// ------------------------------------------------------------------------------ list

export interface TransactionTotals {
  in: string;
  out: string;
  net: string;
  count: number;
}

export async function computeTotals(filters: TransactionFilters, where: Prisma.LedgerTransactionWhereInput, count: number): Promise<TransactionTotals> {
  const scope = { account: customerAccountScope(filters), transaction: where };
  const [credit, debit] = await Promise.all([
    prisma.ledgerEntry.aggregate({ where: { ...scope, amount: { gt: 0n } }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...scope, amount: { lt: 0n } }, _sum: { amount: true } }),
  ]);
  const inSum = credit._sum.amount ?? 0n;
  const outSum = -(debit._sum.amount ?? 0n);
  return { in: inSum.toString(), out: outSum.toString(), net: (inSum - outSum).toString(), count };
}

export async function listTransactions(query: Query): Promise<{
  items: AdminTransactionRow[];
  pagination: PaginationMeta;
  totals: TransactionTotals;
}> {
  const filters = parseTransactionFilters(query);
  const where = buildTransactionWhere(filters);
  const params = parsePagination(query);

  const { result, pagination } = await paginateQuery(params, (skip, take) => prisma.$transaction([
    prisma.ledgerTransaction.count({ where }),
    prisma.ledgerTransaction.findMany({ where, include: ENTRY_INCLUDE, orderBy: TRANSACTION_ORDER, skip, take }),
  ]) as Promise<[number, TransactionWithEntries[]]>);

  const [total, rows] = result;
  const [items, totals] = await Promise.all([
    toAdminRows(rows),
    computeTotals(filters, where, total),
  ]);
  return { items, pagination, totals };
}

// ------------------------------------------------------------------------------ detail

const SECRET_KEY_RE = /(secret|token|password|passwd|signature|api[_-]?key|authorization|cookie|session[_-]?key|card|cvv|qr[_-]?payload|private)/i;

/** Deep copy of ledger metadata with secret-looking keys removed and strings bounded. */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(key)) continue;
      out[key] = sanitizeMetadata(item, depth + 1);
    }
    return out;
  }
  return value;
}

const SYSTEM_ACCOUNT_LABELS_TH: Record<string, string> = {
  system_issuance: 'ระบบ: ออกเหรียญ',
  platform_revenue: 'ระบบ: รายได้ร้าน',
  system_clearing: 'ระบบ: พักเงิน (Escrow)',
};

const ACCOUNT_TYPE_LABELS_TH: Record<string, string> = {
  available: 'ยอดใช้ได้',
  held: 'ยอดถูกกัน',
  promotional: 'ยอดโปรโมชัน',
  refundable: 'ยอดคืนเงิน',
  ...SYSTEM_ACCOUNT_LABELS_TH,
};

const DELIVERY_SELECT = {
  id: true,
  deliveryType: true,
  referenceId: true,
  serverId: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  nextRetryAt: true,
  error: true,
  receiptId: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function deliveriesFor(referenceIds: string[]) {
  const ids = referenceIds.filter(Boolean);
  if (ids.length === 0) return [];
  return prisma.deliveryJob.findMany({
    where: { referenceId: { in: ids } },
    select: DELIVERY_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 50,
  });
}

async function relatedFor(referenceType: string | null, referenceId: string | null) {
  if (!referenceType || !referenceId) return {};
  switch (referenceType) {
    case 'order': {
      const order = await prisma.order.findUnique({
        where: { id: referenceId },
        select: {
          id: true, userId: true, status: true, quantity: true, totalPrice: true,
          createdAt: true, paidAt: true, deliveredAt: true, refundedAt: true, lastError: true,
          product: { select: { id: true, name: true } },
          server: { select: { id: true, name: true } },
        },
      });
      return { order, deliveries: await deliveriesFor([referenceId]) };
    }
    case 'checkout': {
      const orderGroup = await prisma.orderGroup.findUnique({
        where: { checkoutSessionId: referenceId },
        select: {
          id: true, status: true, subtotal: true, discount: true, total: true, paidAt: true, refundedAt: true,
          items: { select: { id: true, productName: true, quantity: true, total: true, status: true, legacyOrderId: true }, orderBy: { lineNo: 'asc' } },
        },
      });
      const orderIds = (orderGroup?.items ?? []).map((item) => item.legacyOrderId ?? '').filter(Boolean);
      return { orderGroup, deliveries: await deliveriesFor(orderIds) };
    }
    case 'game_purchase_quote': {
      const quote = await prisma.gamePurchaseQuote.findUnique({
        where: { id: referenceId },
        select: {
          id: true, status: true, quantity: true, totalPrice: true, orderId: true, serverId: true,
          createdAt: true, completedAt: true, product: { select: { id: true, name: true } },
        },
      });
      return { quote, deliveries: await deliveriesFor(quote?.orderId ? [quote.orderId] : []) };
    }
    case 'payment_intent':
    case 'slip': {
      const paymentIntent = await prisma.paymentIntent.findUnique({
        where: { id: referenceId },
        select: {
          id: true, provider: true, status: true, reference: true, amountThb: true, pointsAmount: true,
          createdAt: true, completedAt: true,
        },
      });
      return { paymentIntent };
    }
    case 'dino_listing': {
      const listing = await prisma.dinoListing.findUnique({
        where: { id: referenceId },
        select: {
          id: true, species: true, level: true, price: true, status: true, deliveryStatus: true,
          sellerId: true, buyerId: true, soldAt: true, deliveredAt: true,
        },
      });
      return { listing, deliveries: await deliveriesFor([referenceId]) };
    }
    case 'delivery':
      return { deliveries: await prisma.deliveryJob.findMany({ where: { id: referenceId }, select: DELIVERY_SELECT }) };
    default:
      return {};
  }
}

/** JSON-safe copy: bigint -> string, Decimal -> string, Date -> ISO. */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJsonSafe(item)]));
  }
  return value;
}

export async function getTransactionDetail(id: string) {
  if (!ID_RE.test(id)) throw new AppError('Transaction not found', 404);
  const row = await prisma.ledgerTransaction.findUnique({ where: { id }, include: ENTRY_INCLUDE });
  if (!row) throw new AppError('Transaction not found', 404);

  const [summary] = await toAdminRows([row]);
  let related: Record<string, unknown> = {};
  try {
    related = await relatedFor(summary.referenceType, summary.referenceId);
  } catch (error) {
    // A missing/renamed related row must not hide the money movement itself.
    console.error('[admin-transactions] related lookup failed:', error);
  }

  return {
    transaction: {
      ...summary,
      idempotencyKey: row.idempotencyKey,
      storedReferenceType: row.referenceType,
      metadata: sanitizeMetadata(row.metadata ?? null),
      balanced: row.entries.reduce((sum, entry) => sum + entry.amount, 0n) === 0n,
      entries: row.entries.map((entry) => ({
        id: entry.id,
        accountId: entry.accountId,
        accountKey: entry.account.key,
        accountType: entry.account.type,
        accountLabelTh: ACCOUNT_TYPE_LABELS_TH[entry.account.type] ?? entry.account.type,
        owner: entry.account.user
          ? { id: entry.account.user.id, name: entry.account.user.discordUsername, steamId: entry.account.user.steamId }
          : null,
        amount: entry.amount.toString(),
        balanceAfter: entry.balanceAfter.toString(),
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    related: toJsonSafe(related),
  };
}

// ------------------------------------------------------------------------------ summary

interface TypeTotalsRow {
  type: string;
  count: number | bigint;
  credit: bigint | number | string | null;
  debit: bigint | number | string | null;
}

const asBigInt = (value: bigint | number | string | null | undefined): bigint => {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  return BigInt(String(value).split('.')[0]);
};

/** UTC wall-clock literal for timestamp(3) columns (Prisma stores DateTime as UTC). */
const utcLiteral = (date: Date) => date.toISOString().replace('T', ' ').replace('Z', '');

export function parseSummaryDate(query: Query): string {
  const raw = query?.date;
  if (raw === undefined || raw === null || raw === '') return bangkokToday();
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    throw new AppError('Invalid date: expected YYYY-MM-DD', 400);
  }
  try {
    bangkokDayRange(raw.trim());
  } catch {
    throw new AppError('Invalid date: expected YYYY-MM-DD', 400);
  }
  return raw.trim();
}

export function foldSummary(date: string, from: Date, to: Date, rows: TypeTotalsRow[]) {
  const bucket = () => ({ count: 0, amount: '0' });
  const add = (target: { count: number; amount: string }, count: number, amount: bigint) => {
    target.count += count;
    target.amount = (BigInt(target.amount) + amount).toString();
  };

  const topups = bucket();
  const purchases = bucket();
  const refunds = bucket();
  const rewards = bucket();
  const legacy = bucket();
  const adminAdjustments = { count: 0, credit: '0', debit: '0', net: '0' };
  const p2p = { count: 0, volume: '0', releasedToSellers: '0' };
  const other = { count: 0, credit: '0', debit: '0' };
  let totalIn = 0n;
  let totalOut = 0n;
  let totalCount = 0;

  const byType = rows.map((row) => {
    const count = Number(row.count);
    const credit = asBigInt(row.credit);
    const debit = asBigInt(row.debit);
    totalIn += credit;
    totalOut += debit;
    totalCount += count;
    const category = ledgerTypeCategory(row.type);
    switch (category) {
      case 'topup': add(topups, count, credit - debit); break;
      case 'purchase': add(purchases, count, debit - credit); break;
      case 'refund': add(refunds, count, credit - debit); break;
      case 'reward': add(rewards, count, credit - debit); break;
      case 'legacy': add(legacy, count, credit - debit); break;
      case 'admin':
        adminAdjustments.count += count;
        adminAdjustments.credit = (BigInt(adminAdjustments.credit) + credit).toString();
        adminAdjustments.debit = (BigInt(adminAdjustments.debit) + debit).toString();
        adminAdjustments.net = (BigInt(adminAdjustments.credit) - BigInt(adminAdjustments.debit)).toString();
        break;
      case 'p2p':
        if (row.type === 'dino_escrow_hold') {
          p2p.count += count;
          p2p.volume = (BigInt(p2p.volume) + debit).toString();
        } else if (row.type === 'dino_escrow_release') {
          p2p.releasedToSellers = (BigInt(p2p.releasedToSellers) + credit).toString();
        }
        break;
      default:
        other.count += count;
        other.credit = (BigInt(other.credit) + credit).toString();
        other.debit = (BigInt(other.debit) + debit).toString();
    }
    return {
      type: row.type,
      typeLabelTh: ledgerTypeLabelTh(row.type),
      category,
      count,
      credit: credit.toString(),
      debit: debit.toString(),
    };
  }).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return {
    date,
    timezone: 'Asia/Bangkok',
    from: from.toISOString(),
    to: to.toISOString(),
    topups,
    purchases,
    refunds,
    adminAdjustments,
    rewards,
    p2p,
    legacy,
    other,
    totals: { count: totalCount, in: totalIn.toString(), out: totalOut.toString(), net: (totalIn - totalOut).toString() },
    byType,
  };
}

export async function getDailySummary(query: Query) {
  const date = parseSummaryDate(query);
  const { from, to } = bangkokDayRange(date);
  const fromLiteral = utcLiteral(from);
  const toLiteral = utcLiteral(to);
  // Customer-side (user-owned account) movements grouped by ledger type for the Bangkok day.
  const rows = await prisma.$queryRaw<TypeTotalsRow[]>`
    SELECT t."type" AS "type",
           COUNT(DISTINCT t."id")::int AS "count",
           COALESCE(SUM(CASE WHEN e."amount" > 0 THEN e."amount" ELSE 0 END), 0)::bigint AS "credit",
           COALESCE(SUM(CASE WHEN e."amount" < 0 THEN -e."amount" ELSE 0 END), 0)::bigint AS "debit"
      FROM "ledger_transactions" t
      JOIN "ledger_entries" e ON e."transaction_id" = t."id"
      JOIN "wallet_accounts" a ON a."id" = e."account_id"
     WHERE a."user_id" IS NOT NULL
       AND COALESCE(t."posted_at", t."created_at") >= ${fromLiteral}::timestamp
       AND COALESCE(t."posted_at", t."created_at") < ${toLiteral}::timestamp
     GROUP BY t."type"`;
  return foldSummary(date, from, to, rows);
}

// ------------------------------------------------------------------------------ export

export const CSV_HEADER = [
  'วันเวลา (เวลาไทย)',
  'เวลา UTC',
  'รหัสธุรกรรม',
  'ประเภท',
  'รหัสประเภท',
  'หมวด',
  'ผู้ใช้',
  'Steam ID',
  'User ID',
  'จำนวน (IC)',
  'ยอดใช้ได้หลังทำรายการ (IC)',
  'ประเภทอ้างอิง',
  'รหัสอ้างอิง',
  'รายละเอียด',
  'ผู้ทำรายการ',
  'จำนวนรายการบัญชี',
];

/** RFC 4180 cell; text cells are guarded against spreadsheet formula injection. */
export function csvCell(value: unknown, text = true): string {
  if (value === null || value === undefined) return '';
  let out = String(value);
  if (text && /^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  if (/[",\r\n]/.test(out)) out = `"${out.replace(/"/g, '""')}"`;
  return out;
}

export function csvLine(row: AdminTransactionRow): string {
  const at = row.postedAt ?? row.createdAt;
  return [
    csvCell(formatBangkok(new Date(at)), false),
    csvCell(at, false),
    csvCell(row.id),
    csvCell(row.typeLabelTh),
    csvCell(row.type),
    csvCell(row.category),
    csvCell(row.user?.name ?? ''),
    csvCell(row.user?.steamId ?? ''),
    csvCell(row.user?.id ?? ''),
    csvCell(row.amount ?? '', false),
    csvCell(row.balanceAfter ?? '', false),
    csvCell(row.referenceType ?? ''),
    csvCell(row.referenceId ?? ''),
    csvCell(row.description ?? ''),
    csvCell(row.createdBy ? (row.createdBy.name ?? row.createdBy.id) : ''),
    csvCell(row.entriesCount, false),
  ].join(',');
}

/** Marker row appended when the export hits the row cap, so the downloaded file says so. */
export const csvTruncatedLine = (maxRows: number) =>
  `${csvCell(`*** ข้อมูลถูกตัดที่ ${maxRows.toLocaleString('en-US')} แถว (truncated at ${maxRows.toLocaleString('en-US')} rows) — กรุณากรองช่วงวันที่ให้แคบลงแล้วส่งออกใหม่ ***`)}\r\n`;

/**
 * Postings whose postedAt is within this many ms of the export start are left out: postedAt is
 * stamped just before commit, so the newest rows may not be visible yet. Excluding the settle
 * window makes the snapshot boundary deterministic.
 */
export const EXPORT_SETTLE_MS = 5_000;

type ExportCursor = { postedAt: Date | null; id: string };

/** Keyset continuation for TRANSACTION_ORDER (postedAt desc nulls last, id desc). */
export function exportCursorWhere(cursor: ExportCursor | null): Prisma.LedgerTransactionWhereInput | null {
  if (!cursor) return null;
  if (cursor.postedAt === null) return { postedAt: null, id: { lt: cursor.id } };
  return {
    OR: [
      { postedAt: { lt: cursor.postedAt } },
      { postedAt: cursor.postedAt, id: { lt: cursor.id } },
      { postedAt: null },
    ],
  };
}

/**
 * Yields CSV text chunks: BOM + header first, then one chunk per batch. Rows are read with
 * keyset pagination on (postedAt, id) against a snapshot (postedAt <= start - settle, or
 * createdAt for unposted legacy rows), so a posting that commits during the export can neither
 * shift a window nor be read twice. Stops at `maxRows`; when more rows exist `state.truncated`
 * is set and a marker row is written as the file's last line.
 */
export async function* exportTransactionsCsv(
  filters: TransactionFilters,
  state: { rows: number; truncated: boolean },
  options: { maxRows?: number; batchSize?: number; now?: Date } = {},
): AsyncGenerator<string> {
  const maxRows = options.maxRows ?? EXPORT_MAX_ROWS;
  const batchSize = options.batchSize ?? EXPORT_BATCH_SIZE;
  const snapshot = new Date((options.now ?? new Date()).getTime() - EXPORT_SETTLE_MS);
  const base = buildTransactionWhere(filters);
  const snapshotWhere: Prisma.LedgerTransactionWhereInput = {
    OR: [{ postedAt: { lte: snapshot } }, { postedAt: null, createdAt: { lte: snapshot } }],
  };
  const whereAfter = (cursor: ExportCursor | null): Prisma.LedgerTransactionWhereInput => {
    const keyset = exportCursorWhere(cursor);
    return { AND: keyset ? [base, snapshotWhere, keyset] : [base, snapshotWhere] };
  };

  yield `﻿${CSV_HEADER.map((cell) => csvCell(cell)).join(',')}\r\n`;

  let cursor: ExportCursor | null = null;
  while (state.rows < maxRows) {
    const take = Math.min(batchSize, maxRows - state.rows);
    const rows: TransactionWithEntries[] = await prisma.ledgerTransaction.findMany({ where: whereAfter(cursor), include: ENTRY_INCLUDE, orderBy: TRANSACTION_ORDER, take });
    if (rows.length === 0) return;
    const adminRows = await toAdminRows(rows);
    state.rows += adminRows.length;
    const last: TransactionWithEntries = rows[rows.length - 1];
    cursor = { postedAt: last.postedAt ?? null, id: last.id };
    yield adminRows.map((row) => `${csvLine(row)}\r\n`).join('');
    if (rows.length < take) return;
  }
  // Hit the cap: report truncation only if at least one more row exists.
  const more = await prisma.ledgerTransaction.findMany({ where: whereAfter(cursor), orderBy: TRANSACTION_ORDER, take: 1, select: { id: true } });
  state.truncated = more.length > 0;
  if (state.truncated) yield csvTruncatedLine(maxRows);
}
