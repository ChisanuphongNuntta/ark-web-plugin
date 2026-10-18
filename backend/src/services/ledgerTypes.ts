// Ledger transaction vocabulary shared by the admin transactions API, the CSV export and the
// realtime `admin:transaction` event (backend/contracts/admin-transactions-2026-10.md).
//
// Ledger `type` strings are part of each posting's idempotency request hash, so historical
// types are NEVER renamed; this registry only adds a Thai label and a reporting category.
// Unknown types still list fine (label = raw type, category = 'other').

export type LedgerCategory =
  | 'topup'
  | 'purchase'
  | 'refund'
  | 'admin'
  | 'reward'
  | 'p2p'
  | 'legacy'
  | 'opening'
  | 'other';

export const LEDGER_CATEGORIES: readonly LedgerCategory[] = [
  'topup', 'purchase', 'refund', 'admin', 'reward', 'p2p', 'legacy', 'opening', 'other',
];

export const LEDGER_CATEGORY_LABELS_TH: Record<LedgerCategory, string> = {
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

interface LedgerTypeInfo {
  labelTh: string;
  category: LedgerCategory;
}

export const LEDGER_TYPES: Record<string, LedgerTypeInfo> = {
  payment_topup: { labelTh: 'เติมเงินออนไลน์', category: 'topup' },
  payment_topup_sandbox: { labelTh: 'เติมเงิน (ทดสอบ)', category: 'topup' },
  stripe_topup: { labelTh: 'เติมเงินผ่านบัตร', category: 'topup' },
  bank_slip_approval: { labelTh: 'เติมเงินด้วยสลิป (อนุมัติแล้ว)', category: 'topup' },
  bank_slip_approval_demo: { labelTh: 'เติมเงินด้วยสลิป (เดโม)', category: 'topup' },
  order_purchase: { labelTh: 'ซื้อสินค้า', category: 'purchase' },
  checkout_purchase: { labelTh: 'ซื้อสินค้า (ตะกร้า)', category: 'purchase' },
  game_purchase: { labelTh: 'ซื้อสินค้าในเกม', category: 'purchase' },
  order_refund: { labelTh: 'คืนเงินคำสั่งซื้อ', category: 'refund' },
  dino_escrow_refund: { labelTh: 'คืนเงินไดโน P2P (ส่งไม่สำเร็จ)', category: 'refund' },
  admin_adjustment: { labelTh: 'แอดมินปรับยอด', category: 'admin' },
  earn_playtime: { labelTh: 'รางวัลจากการเล่นเกม', category: 'reward' },
  dino_escrow_hold: { labelTh: 'ซื้อไดโน P2P (พักเงินไว้)', category: 'p2p' },
  dino_escrow_release: { labelTh: 'จ่ายเงินผู้ขายไดโน P2P', category: 'p2p' },
  legacy_balance_claim: { labelTh: 'รับยอดเงินจากระบบเดิม', category: 'legacy' },
  opening_balance: { labelTh: 'ยอดยกมาตอนย้ายระบบ', category: 'opening' },
  wallet_hold: { labelTh: 'กันวงเงิน', category: 'other' },
};

export function ledgerTypeLabelTh(type: string): string {
  return LEDGER_TYPES[type]?.labelTh ?? type;
}

export function ledgerTypeCategory(type: string): LedgerCategory {
  return LEDGER_TYPES[type]?.category ?? 'other';
}

/** Known ledger types in a category (empty for 'other', which means "not a known type"). */
export function ledgerTypesInCategory(category: LedgerCategory): string[] {
  return Object.entries(LEDGER_TYPES)
    .filter(([, info]) => info.category === category)
    .map(([type]) => type);
}

// ---------------------------------------------------------------------------------------------
// Reference types
//
// Canonical referenceType values written by current code. Rows posted before 2026-10-18 used a
// few older spellings ('admin', 'gameplay', 'external'); normalizeReferenceType maps them so the
// admin UI and the referenceType filter see one vocabulary.

export const REFERENCE_TYPES = [
  'order',
  'checkout',
  'game_purchase_quote',
  'payment_intent',
  'slip',
  'stripe_session',
  'admin_adjustment',
  'reward',
  'dino_listing',
  'legacy_balance_claim',
  'delivery',
  'user',
] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];

const SLIP_TYPES = ['bank_slip_approval', 'bank_slip_approval_demo'];
const PAYMENT_INTENT_TYPES = ['payment_topup', 'payment_topup_sandbox'];

export function normalizeReferenceType(
  type: string,
  referenceType: string | null | undefined,
  referenceId: string | null | undefined,
): string | null {
  if (!referenceType) return null;
  if (referenceType === 'admin') return 'admin_adjustment';
  if (referenceType === 'gameplay') return 'reward';
  if (referenceType === 'external') {
    if (SLIP_TYPES.includes(type)) return 'slip';
    if (PAYMENT_INTENT_TYPES.includes(type)) return 'payment_intent';
    if (type === 'stripe_topup') return referenceId?.startsWith('cs_') ? 'stripe_session' : 'payment_intent';
    if (type === 'legacy_balance_claim') return 'legacy_balance_claim';
  }
  return referenceType;
}

/**
 * Prisma where-fragment matching a canonical referenceType, including the legacy spellings that
 * normalizeReferenceType folds into it.
 */
export function referenceTypeWhere(referenceType: string): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ referenceType }];
  switch (referenceType) {
    case 'admin_adjustment':
      or.push({ referenceType: 'admin' });
      break;
    case 'reward':
      or.push({ referenceType: 'gameplay' });
      break;
    case 'slip':
      or.push({ referenceType: 'external', type: { in: SLIP_TYPES } });
      break;
    case 'payment_intent':
      or.push({ referenceType: 'external', type: { in: PAYMENT_INTENT_TYPES } });
      or.push({ referenceType: 'external', type: 'stripe_topup', NOT: { referenceId: { startsWith: 'cs_' } } });
      break;
    case 'stripe_session':
      or.push({ referenceType: 'external', type: 'stripe_topup', referenceId: { startsWith: 'cs_' } });
      break;
    case 'legacy_balance_claim':
      or.push({ referenceType: 'external', type: 'legacy_balance_claim' });
      break;
    default:
      break;
  }
  return or.length === 1 ? or[0] : { OR: or };
}

/**
 * Admin console URL for a transaction's reference (frontend routes; see the contract). Null when
 * the reference has no admin page.
 */
export function referenceLinkFor(referenceType: string | null, referenceId: string | null): string | null {
  if (!referenceType || !referenceId) return null;
  const id = encodeURIComponent(referenceId);
  // Only routes that exist in the admin frontend (frontend/src/lib/adminTransactionsMath.ts
  // ADMIN_ROUTES); list pages take the admin kit's `?q=` search param (frontend/ADMIN_UI.md).
  switch (referenceType) {
    // No dedicated admin page: open the ledger searched by the same reference id, which shows the
    // whole money trail (escrow hold -> release/refund, purchase -> refund). Search matches
    // referenceId exactly (adminTransactions.service buildWhere).
    case 'order':
    case 'checkout':
    case 'game_purchase_quote':
    case 'dino_listing':
    case 'delivery':
    case 'stripe_session':
    case 'legacy_balance_claim':
      return `/admin/transactions?q=${id}`;
    case 'payment_intent':
    case 'slip':
      return `/admin?tab=slips&intent=${id}`;
    case 'admin_adjustment':
    case 'reward':
    case 'user':
      // Users search matches the exact user id (serverAdmin.service getAccessibleUsers).
      return `/admin/users?q=${id}`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Customer side

export interface CustomerSideEntry {
  amount: bigint;
  userId: string | null;
  accountType: string;
  balanceAfter?: bigint;
}

export interface CustomerSide {
  userId: string | null;
  /** Signed net movement across all of the customer's accounts in this transaction. */
  amount: bigint | null;
  /** The customer's available balance after this transaction, when it touched `available`. */
  availableAfter: bigint | null;
}

/**
 * The customer of a ledger transaction is the user whose accounts moved the most (by absolute
 * net amount; ties keep the first user in entry order). Every current posting touches at most
 * one user (P2P settles through the clearing account), so this is the buyer, seller, top-up
 * owner or adjusted user. System-only transactions have no customer.
 */
export function customerSideOf(entries: CustomerSideEntry[]): CustomerSide {
  const nets = new Map<string, bigint>();
  for (const entry of entries) {
    if (!entry.userId) continue;
    nets.set(entry.userId, (nets.get(entry.userId) ?? 0n) + entry.amount);
  }
  if (nets.size === 0) return { userId: null, amount: null, availableAfter: null };

  const abs = (value: bigint) => (value < 0n ? -value : value);
  let userId: string | null = null;
  let amount = 0n;
  for (const [candidate, net] of nets) {
    if (userId === null || abs(net) > abs(amount)) {
      userId = candidate;
      amount = net;
    }
  }
  const available = entries.find((entry) => entry.userId === userId && entry.accountType === 'available');
  return {
    userId,
    amount,
    availableAfter: available?.balanceAfter ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Bangkok day boundaries (UTC+7, no DST)

export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** [start, end) of a Bangkok calendar day 'YYYY-MM-DD' as UTC instants. */
export function bangkokDayRange(date: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Invalid date');
  const [, y, m, d] = match;
  const startUtc = Date.UTC(Number(y), Number(m) - 1, Number(d)) - BANGKOK_OFFSET_MS;
  const from = new Date(startUtc);
  // Reject impossible dates such as 2026-02-31 (Date.UTC would roll them over).
  const check = new Date(startUtc + BANGKOK_OFFSET_MS);
  if (check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(m) - 1 || check.getUTCDate() !== Number(d)) {
    throw new Error('Invalid date');
  }
  return { from, to: new Date(startUtc + 24 * 60 * 60 * 1000) };
}

/** Today's Bangkok calendar date as 'YYYY-MM-DD'. */
export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD HH:mm:ss' in Bangkok time (for CSV). */
export function formatBangkok(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
}
