// Ledger reconciliation (backend/contracts/admin-transactions-2026-10.md).
//
// The double-entry ledger (LedgerEntry) is the source of truth. Two caches are derived from it
// and must always agree:
//   1. WalletAccount.balance           == Σ LedgerEntry.amount for that account
//   2. User.pointsBalance (projection) == Σ LedgerEntry.amount for the user's available account
// plus the double-entry invariant: every ledger transaction's entries sum to zero.
//
// reconcileLedger() is read-only. The scheduler runs it every 15 minutes in the web process
// (one replica at a time via a Redis lock) and emits `admin:ledger:mismatch` to room `admin`
// when anything drifts.
import crypto from 'node:crypto';
import prisma from '../config/database.js';
import redis from '../config/redis.js';
import { emitAdminLedgerMismatch } from '../realtime/emit.js';
import auditService from './audit.service.js';

export const RECONCILE_LOCK_KEY = 'iris:ledger:reconcile:lock';
export const DEFAULT_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
/** Arrays in the result are capped; the *Count fields always carry the full number. */
export const RECONCILE_LIST_LIMIT = 500;
/**
 * Consecutive windows skipped because Redis (the lock) is unavailable before this replica runs
 * the read-only reconcile WITHOUT the lock (and audits the degradation once per outage).
 */
export const DEFAULT_MAX_SKIPPED_WINDOWS = 2;

export interface AccountMismatch {
  accountId: string;
  accountKey: string;
  accountType: string;
  userId: string | null;
  cachedBalance: string;
  ledgerSum: string;
  difference: string;
}

export interface LegacyPointsMismatch {
  userId: string;
  pointsBalance: string;
  availableAccountId: string | null;
  availableBalance: string | null;
  ledgerSum: string;
  difference: string;
}

/** A user `refundable` sub-account holding IC (legacy order refunds before the 2026-10 policy). */
export interface RefundableBalance {
  accountId: string;
  userId: string | null;
  balance: string;
}

export interface UnbalancedTransaction {
  transactionId: string;
  sum: string;
}

export interface ReconcileResult {
  ok: boolean;
  checkedAt: string;
  checkedAccounts: number;
  checkedUsers: number;
  mismatches: AccountMismatch[];
  mismatchCount: number;
  legacyPointsMismatches: LegacyPointsMismatch[];
  legacyPointsMismatchCount: number;
  unbalancedTransactions: UnbalancedTransaction[];
  unbalancedTransactionCount: number;
  /**
   * Informational (does not affect `ok`): IC parked in `refundable` sub-accounts. Since the
   * 2026-10 refund policy refunds credit `available`; nothing spends `refundable`, so any balance
   * here is a legacy refund the customer cannot use until an admin moves it.
   */
  refundableBalances: RefundableBalance[];
  refundableBalanceCount: number;
  refundableTotal: string;
}

interface AccountRow { id: string; key: string; type: string; userId: string | null; balance: bigint }
interface UserRow { id: string; pointsBalance: bigint }

/** Pure comparison (unit-tested): cached balances vs ledger sums. */
export function compareBalances(
  accounts: AccountRow[],
  ledgerSums: Map<string, bigint>,
  users: UserRow[],
  unbalanced: Array<{ transactionId: string; sum: bigint }>,
  checkedAt = new Date(),
): ReconcileResult {
  const mismatches: AccountMismatch[] = [];
  const availableByUser = new Map<string, AccountRow>();

  for (const account of accounts) {
    const ledgerSum = ledgerSums.get(account.id) ?? 0n;
    if (account.userId && account.type === 'available') availableByUser.set(account.userId, account);
    if (account.balance !== ledgerSum) {
      mismatches.push({
        accountId: account.id,
        accountKey: account.key,
        accountType: account.type,
        userId: account.userId,
        cachedBalance: account.balance.toString(),
        ledgerSum: ledgerSum.toString(),
        difference: (account.balance - ledgerSum).toString(),
      });
    }
  }

  const legacy: LegacyPointsMismatch[] = [];
  for (const user of users) {
    const available = availableByUser.get(user.id);
    const ledgerSum = available ? (ledgerSums.get(available.id) ?? 0n) : 0n;
    if (user.pointsBalance !== ledgerSum) {
      legacy.push({
        userId: user.id,
        pointsBalance: user.pointsBalance.toString(),
        availableAccountId: available?.id ?? null,
        availableBalance: available ? available.balance.toString() : null,
        ledgerSum: ledgerSum.toString(),
        difference: (user.pointsBalance - ledgerSum).toString(),
      });
    }
  }

  const refundable = accounts
    .filter((account) => account.type === 'refundable' && account.balance !== 0n)
    .map((account) => ({ accountId: account.id, userId: account.userId, balance: account.balance.toString() }));
  const refundableTotal = accounts
    .filter((account) => account.type === 'refundable')
    .reduce((sum, account) => sum + account.balance, 0n);

  const unbalancedRows = unbalanced
    .filter((row) => row.sum !== 0n)
    .map((row) => ({ transactionId: row.transactionId, sum: row.sum.toString() }));

  return {
    ok: mismatches.length === 0 && legacy.length === 0 && unbalancedRows.length === 0,
    checkedAt: checkedAt.toISOString(),
    checkedAccounts: accounts.length,
    checkedUsers: users.length,
    mismatches: mismatches.slice(0, RECONCILE_LIST_LIMIT),
    mismatchCount: mismatches.length,
    legacyPointsMismatches: legacy.slice(0, RECONCILE_LIST_LIMIT),
    legacyPointsMismatchCount: legacy.length,
    unbalancedTransactions: unbalancedRows.slice(0, RECONCILE_LIST_LIMIT),
    unbalancedTransactionCount: unbalancedRows.length,
    refundableBalances: refundable.slice(0, RECONCILE_LIST_LIMIT),
    refundableBalanceCount: refundable.length,
    refundableTotal: refundableTotal.toString(),
  };
}

export async function reconcileLedger(): Promise<ReconcileResult> {
  // One consistent snapshot: a posting landing between these reads would otherwise show up as
  // a transient false mismatch.
  const [accounts, sums, users, unbalanced] = await prisma.$transaction([
    prisma.walletAccount.findMany({ select: { id: true, key: true, type: true, userId: true, balance: true } }),
    prisma.ledgerEntry.groupBy({ by: ['accountId'], _sum: { amount: true }, orderBy: { accountId: 'asc' } }),
    prisma.user.findMany({ select: { id: true, pointsBalance: true } }),
    prisma.ledgerEntry.groupBy({
      by: ['transactionId'],
      _sum: { amount: true },
      having: { amount: { _sum: { not: 0n } } },
      orderBy: { transactionId: 'asc' },
    }),
  ], { isolationLevel: 'RepeatableRead' });

  const ledgerSums = new Map<string, bigint>(
    (sums as Array<{ accountId: string; _sum: { amount: bigint | null } | null }>)
      .map((row) => [row.accountId, row._sum?.amount ?? 0n]),
  );
  const unbalancedRows = (unbalanced as Array<{ transactionId: string; _sum: { amount: bigint | null } | null }>)
    .map((row) => ({ transactionId: row.transactionId, sum: row._sum?.amount ?? 0n }));

  return compareBalances(
    (accounts as AccountRow[]).map((account) => ({ ...account, type: String(account.type) })),
    ledgerSums,
    users as UserRow[],
    unbalancedRows,
  );
}

/** Emit + audit when a reconciliation run found drift. Returns true when it alerted. */
export async function alertOnMismatch(result: ReconcileResult): Promise<boolean> {
  if (result.ok) return false;
  console.error('[ledger-reconcile] MISMATCH', {
    accounts: result.mismatchCount,
    legacyPoints: result.legacyPointsMismatchCount,
    unbalanced: result.unbalancedTransactionCount,
  });
  emitAdminLedgerMismatch({
    at: result.checkedAt,
    checkedAccounts: result.checkedAccounts,
    mismatchCount: result.mismatchCount,
    legacyPointsMismatchCount: result.legacyPointsMismatchCount,
    unbalancedTransactionCount: result.unbalancedTransactionCount,
    sample: result.mismatches.slice(0, 10).map((row) => ({
      accountId: row.accountId,
      userId: row.userId,
      cachedBalance: row.cachedBalance,
      ledgerSum: row.ledgerSum,
    })),
  });
  await auditService.log({
    action: 'ledger_mismatch_detected',
    resource: 'ledger',
    status: 'failure',
    metadata: {
      checkedAt: result.checkedAt,
      mismatchCount: result.mismatchCount,
      legacyPointsMismatchCount: result.legacyPointsMismatchCount,
      unbalancedTransactionCount: result.unbalancedTransactionCount,
      sample: result.mismatches.slice(0, 10),
      legacySample: result.legacyPointsMismatches.slice(0, 10),
    },
  });
  return true;
}

type LockClient = { status?: string; set: (...args: any[]) => Promise<unknown> };

export class LedgerReconcileScheduler {
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;
  private readonly instanceId = crypto.randomUUID();

  constructor(
    private readonly intervalMs = Number(process.env.LEDGER_RECONCILE_INTERVAL_MS) || DEFAULT_RECONCILE_INTERVAL_MS,
    private readonly lockClient: LockClient = redis,
    private readonly run: () => Promise<ReconcileResult> = reconcileLedger,
    private readonly maxSkippedWindows = Number(process.env.LEDGER_RECONCILE_MAX_SKIPPED_WINDOWS) || DEFAULT_MAX_SKIPPED_WINDOWS,
  ) {}

  private resetDegraded(): void {
    if (this.skippedWindows > 0) console.warn(`[ledger-reconcile] Redis lock available again after ${this.skippedWindows} skipped window(s)`);
    this.skippedWindows = 0;
    this.degradedAudited = false;
  }

  start(): void {
    if (this.timer || process.env.LEDGER_RECONCILE_ENABLED === 'false') return;
    // First check shortly after boot, then on the interval.
    this.firstRun = setTimeout(() => void this.tick(), Math.min(60_000, this.intervalMs));
    this.firstRun.unref?.();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
    this.timer = null;
    this.firstRun = null;
  }

  /** Consecutive windows skipped because the lock store was unavailable. */
  skippedWindows = 0;
  private degradedAudited = false;

  /**
   * Try the per-interval lock. The lock is never released early: it expires just before the
   * next interval so exactly one replica runs per window. 'unavailable' = Redis not ready or the
   * SET failed (distinct from 'held', where another replica owns this window).
   */
  async lockState(): Promise<'acquired' | 'held' | 'unavailable'> {
    if (this.lockClient.status !== undefined && this.lockClient.status !== 'ready') return 'unavailable';
    try {
      const ttl = Math.max(1_000, this.intervalMs - 30_000);
      const acquired = await this.lockClient.set(RECONCILE_LOCK_KEY, this.instanceId, 'PX', ttl, 'NX');
      return acquired === 'OK' ? 'acquired' : 'held';
    } catch (error) {
      console.error('[ledger-reconcile] lock failed:', error);
      return 'unavailable';
    }
  }

  async acquireLock(): Promise<boolean> {
    return (await this.lockState()) === 'acquired';
  }

  /**
   * One scheduled round. Returns the result, or null when skipped (lock held / overlapping /
   * Redis outage still within the grace windows). A Redis outage is never silent: every skipped
   * window logs a warning, and after `maxSkippedWindows` consecutive skips this replica runs the
   * (read-only) reconcile without the lock and audits `ledger_reconcile_degraded` once per
   * outage, so mismatches keep reaching admins.
   */
  async tick(): Promise<ReconcileResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const lock = await this.lockState();
      if (lock === 'held') {
        this.resetDegraded();
        return null;
      }
      if (lock === 'unavailable') {
        this.skippedWindows += 1;
        if (this.skippedWindows <= this.maxSkippedWindows) {
          console.warn(`[ledger-reconcile] skipped: Redis lock unavailable (${this.skippedWindows}/${this.maxSkippedWindows} windows before running without the lock)`);
          return null;
        }
        console.warn(`[ledger-reconcile] Redis lock unavailable for ${this.skippedWindows} windows: running without the lock`);
        if (!this.degradedAudited) {
          this.degradedAudited = true;
          await auditService.log({
            action: 'ledger_reconcile_degraded',
            resource: 'ledger',
            status: 'failure',
            errorMessage: 'Redis lock unavailable; reconcile running without the per-window lock',
            metadata: { skippedWindows: this.skippedWindows, instanceId: this.instanceId },
          });
        }
      } else {
        this.resetDegraded();
      }
      const result = await this.run();
      await alertOnMismatch(result);
      return result;
    } catch (error) {
      console.error('[ledger-reconcile] run failed:', error);
      return null;
    } finally {
      this.running = false;
    }
  }
}

export const ledgerReconcileScheduler = new LedgerReconcileScheduler();
