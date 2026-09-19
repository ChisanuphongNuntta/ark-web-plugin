import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import walletService, { SYSTEM_ACCOUNTS, userAccountKey } from '../../src/services/wallet.service.js';

// End-to-end proof that the migrated money flows keep the read-only projection consistent
// with the immutable ledger. We wire the globally-mocked Prisma client to a tiny in-memory
// double-entry store so the REAL walletService.post mutates balances + records entries, and
// walletService.verifyProjection reads them back. After each flow we assert the wallet
// invariant the migration exists to guarantee:
//
//     User.pointsBalance === available WalletAccount.balance === Σ (ledger entries for available)
//
// plus the global double-entry invariant: the sum of every ledger entry amount is exactly 0.

const db = prisma as any;

type Account = { id: string; key: string; userId: string | null; type: string; currency: string; status: string; balance: bigint; version: number };
type Entry = { id: string; transactionId: string; accountId: string; amount: bigint; balanceAfter: bigint };
type Txn = { id: string; idempotencyKey: string; type: string; referenceType?: string; referenceId?: string; description?: string; createdAt: Date; entries: Entry[] };

function installLedger() {
  const accountsByKey = new Map<string, Account>();
  const accountsById = new Map<string, Account>();
  const users = new Map<string, { pointsBalance: bigint }>();
  const transactions: Txn[] = [];
  const txByKey = new Map<string, Txn>();
  const txById = new Map<string, Txn>();
  const entries: Entry[] = [];
  let seq = 0;

  const addAccount = (key: string, type: string, userId: string | null, balance = 0n) => {
    const acct: Account = { id: `acct-${++seq}`, key, userId, type, currency: 'IC', status: 'active', balance, version: 0 };
    accountsByKey.set(key, acct);
    accountsById.set(acct.id, acct);
    return acct;
  };
  const recordEntry = (transactionId: string, accountId: string, amount: bigint, balanceAfter: bigint) => {
    const e: Entry = { id: `e-${++seq}`, transactionId, accountId, amount, balanceAfter };
    entries.push(e);
    return e;
  };

  // System accounts, seeded like the wallet migration does.
  addAccount(SYSTEM_ACCOUNTS.issuance, 'system_issuance', null, 0n);
  addAccount(SYSTEM_ACCOUNTS.revenue, 'platform_revenue', null, 0n);
  addAccount(SYSTEM_ACCOUNTS.clearing, 'system_clearing', null, 0n);

  // Seed a user with all four sub-accounts. A nonzero opening balance gets a balanced
  // opening transaction (available +balance, issuance -balance) so the ledger projection
  // starts consistent — mirroring the migration's opening_balance entries.
  const seedUser = (id: string, openingBalance = 0n) => {
    users.set(id, { pointsBalance: openingBalance });
    const available = addAccount(userAccountKey(id, 'available'), 'available', id, openingBalance);
    addAccount(userAccountKey(id, 'held'), 'held', id, 0n);
    addAccount(userAccountKey(id, 'promotional'), 'promotional', id, 0n);
    addAccount(userAccountKey(id, 'refundable'), 'refundable', id, 0n);
    if (openingBalance !== 0n) {
      const issuance = accountsByKey.get(SYSTEM_ACCOUNTS.issuance)!;
      issuance.balance -= openingBalance;
      const opening: Txn = { id: `tx-${++seq}`, idempotencyKey: `opening:${id}`, type: 'opening_balance', createdAt: new Date(0), entries: [] };
      transactions.push(opening); txById.set(opening.id, opening); txByKey.set(opening.idempotencyKey, opening);
      recordEntry(opening.id, available.id, openingBalance, openingBalance);
      recordEntry(opening.id, issuance.id, -openingBalance, issuance.balance);
    }
  };

  const withAccount = (e: Entry) => ({ ...e, account: accountsById.get(e.accountId) });
  const txWithEntries = (t: Txn) => ({ ...t, entries: t.entries.map(withAccount) });

  // $transaction(fn, opts) runs the callback with `db` itself as the transaction client.
  db.$transaction.mockImplementation((arg: any) => {
    if (typeof arg === 'function') return arg(db);
    return Promise.all(arg);
  });

  db.ledgerTransaction.findUnique.mockImplementation(({ where }: any) => {
    const t = txByKey.get(where.idempotencyKey);
    return Promise.resolve(t ? txWithEntries(t) : null);
  });
  db.ledgerTransaction.create.mockImplementation(({ data }: any) => {
    const t: Txn = { id: `tx-${++seq}`, createdAt: new Date(), entries: [], ...data };
    transactions.push(t); txById.set(t.id, t); txByKey.set(t.idempotencyKey, t);
    return Promise.resolve({ id: t.id });
  });
  db.ledgerTransaction.update.mockImplementation(({ where, data }: any) => {
    const t = txById.get(where.id) as (Txn & { postedAt?: Date }) | undefined;
    if (!t) return Promise.reject(new Error('transaction not found'));
    if (data.postedAt) t.postedAt = data.postedAt;
    return Promise.resolve(t);
  });
  db.ledgerTransaction.findUniqueOrThrow.mockImplementation(({ where }: any) => {
    const t = txById.get(where.id);
    if (!t) return Promise.reject(new Error('transaction not found'));
    return Promise.resolve(txWithEntries(t));
  });

  db.walletAccount.findMany.mockImplementation(({ where }: any) => {
    const keys: string[] = where.key.in;
    return Promise.resolve(keys.map((k) => accountsByKey.get(k)).filter(Boolean).map((a) => ({ ...a })));
  });
  db.walletAccount.updateMany.mockImplementation(({ where, data }: any) => {
    const acct = accountsById.get(where.id);
    if (!acct) return Promise.resolve({ count: 0 });
    if (where.status && acct.status !== where.status) return Promise.resolve({ count: 0 });
    if (where.balance?.gte !== undefined && !(acct.balance >= where.balance.gte)) return Promise.resolve({ count: 0 });
    acct.balance += data.balance.increment;
    acct.version += data.version.increment;
    return Promise.resolve({ count: 1 });
  });
  db.walletAccount.findUniqueOrThrow.mockImplementation(({ where }: any) => {
    const acct = accountsById.get(where.id);
    if (!acct) return Promise.reject(new Error('account not found'));
    return Promise.resolve({ ...acct });
  });
  db.walletAccount.findUnique.mockImplementation(({ where }: any) => {
    const acct = where.key ? accountsByKey.get(where.key) : accountsById.get(where.id);
    return Promise.resolve(acct ? { ...acct } : null);
  });

  db.ledgerEntry.create.mockImplementation(({ data }: any) => {
    const e = recordEntry(data.transactionId, data.accountId, data.amount, data.balanceAfter);
    const t = txById.get(data.transactionId);
    if (t) t.entries.push(e);
    return Promise.resolve({ ...e });
  });
  db.ledgerEntry.aggregate.mockImplementation(({ where }: any) => {
    const w = where.account;
    let sum = 0n;
    for (const e of entries) {
      const acct = accountsById.get(e.accountId);
      if (acct && acct.userId === w.userId && acct.type === w.type && acct.currency === (w.currency ?? 'IC')) {
        sum += e.amount;
      }
    }
    return Promise.resolve({ _sum: { amount: sum } });
  });

  db.user.findUnique.mockImplementation(({ where }: any) => {
    const u = users.get(where.id);
    return Promise.resolve(u ? { pointsBalance: u.pointsBalance } : null);
  });
  db.user.update.mockImplementation(({ where, data }: any) => {
    const u = users.get(where.id);
    if (u && data.pointsBalance !== undefined) u.pointsBalance = data.pointsBalance;
    return Promise.resolve({});
  });

  const balanceOf = (key: string) => accountsByKey.get(key)!.balance;
  const globalEntryNet = () => entries.reduce((s, e) => s + e.amount, 0n);

  return { seedUser, balanceOf, globalEntryNet };
}

const PLATFORM_FEE_PERCENT = 0.05;
const feeSplit = (price: number) => {
  const platformFee = Math.floor(price * PLATFORM_FEE_PERCENT);
  return { platformFee, sellerReceives: price - platformFee };
};

describe('Wallet projection proof — pointsBalance == available account == ledger entry sum', () => {
  let ledger: ReturnType<typeof installLedger>;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = installLedger();
  });

  const expectConsistent = async (userId: string, expectedAvailable: bigint) => {
    const v = await walletService.verifyProjection(userId);
    expect(v.matches).toBe(true);
    expect(v.pointsBalance).toBe(expectedAvailable);
    expect(v.accountBalance).toBe(expectedAvailable);
    expect(v.ledgerProjection).toBe(expectedAvailable);
    // The whole ledger always nets to zero (double-entry invariant).
    expect(ledger.globalEntryNet()).toBe(0n);
  };

  it('order purchase: buyer available -> revenue stays consistent', async () => {
    ledger.seedUser('u1', 1000n);
    await walletService.post({
      idempotencyKey: 'order:purchase:o1', type: 'order_purchase',
      entries: [
        { accountKey: userAccountKey('u1', 'available'), amount: -300n },
        { accountKey: SYSTEM_ACCOUNTS.revenue, amount: 300n },
      ],
    });
    await expectConsistent('u1', 700n);
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.revenue)).toBe(300n);
  });

  it('admin credit: issuance -> available stays consistent', async () => {
    ledger.seedUser('u1', 100n);
    await walletService.post({
      idempotencyKey: 'admin:adjust:1', type: 'admin_adjustment',
      entries: [
        { accountKey: userAccountKey('u1', 'available'), amount: 500n },
        { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -500n },
      ],
    });
    await expectConsistent('u1', 600n);
  });

  it('admin debit: available -> issuance stays consistent', async () => {
    ledger.seedUser('u1', 700n);
    await walletService.post({
      idempotencyKey: 'admin:adjust:2', type: 'admin_adjustment',
      entries: [
        { accountKey: userAccountKey('u1', 'available'), amount: -300n },
        { accountKey: SYSTEM_ACCOUNTS.issuance, amount: 300n },
      ],
    });
    await expectConsistent('u1', 400n);
  });

  it('gameplay earn: issuance -> available stays consistent', async () => {
    ledger.seedUser('u1', 0n);
    await walletService.post({
      idempotencyKey: 'earn:playtime:u1:abc', type: 'earn_playtime',
      entries: [
        { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -28n },
        { accountKey: userAccountKey('u1', 'available'), amount: 28n },
      ],
    });
    await expectConsistent('u1', 28n);
  });

  it('order refund: revenue -> refundable leaves available consistent and funds refundable', async () => {
    ledger.seedUser('u1', 1000n);
    // Purchase first so revenue has funds to refund from (revenue cannot overdraw).
    await walletService.post({
      idempotencyKey: 'order:purchase:o2', type: 'order_purchase',
      entries: [
        { accountKey: userAccountKey('u1', 'available'), amount: -300n },
        { accountKey: SYSTEM_ACCOUNTS.revenue, amount: 300n },
      ],
    });
    await walletService.post({
      idempotencyKey: 'order:refund:o2', type: 'order_refund',
      entries: [
        { accountKey: SYSTEM_ACCOUNTS.revenue, amount: -300n },
        { accountKey: userAccountKey('u1', 'refundable'), amount: 300n },
      ],
    });
    // available is untouched by the refund; pointsBalance still projects available only.
    await expectConsistent('u1', 700n);
    expect(ledger.balanceOf(userAccountKey('u1', 'refundable'))).toBe(300n);
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.revenue)).toBe(0n);
  });

  it('P2P escrow: hold then release pays seller net + platform fee, both sides consistent', async () => {
    ledger.seedUser('b1', 1000n);
    ledger.seedUser('s1', 0n);
    const price = 200;
    const { platformFee, sellerReceives } = feeSplit(price); // 10 fee, 190 net

    // Hold buyer funds in escrow (clearing) — seller not paid yet.
    await walletService.post({
      idempotencyKey: 'dino:escrow:hold:list-1', type: 'dino_escrow_hold',
      entries: [
        { accountKey: userAccountKey('b1', 'available'), amount: -BigInt(price) },
        { accountKey: SYSTEM_ACCOUNTS.clearing, amount: BigInt(price) },
      ],
    });
    await expectConsistent('b1', 800n);
    await expectConsistent('s1', 0n); // seller unpaid at hold time
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.clearing)).toBe(200n);

    // Release on delivery confirmation.
    await walletService.post({
      idempotencyKey: 'dino:escrow:release:list-1', type: 'dino_escrow_release',
      entries: [
        { accountKey: SYSTEM_ACCOUNTS.clearing, amount: -BigInt(price) },
        { accountKey: userAccountKey('s1', 'available'), amount: BigInt(sellerReceives) },
        { accountKey: SYSTEM_ACCOUNTS.revenue, amount: BigInt(platformFee) },
      ],
    });
    await expectConsistent('b1', 800n);
    await expectConsistent('s1', 190n);
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.clearing)).toBe(0n); // escrow fully released
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.revenue)).toBe(10n);
  });

  it('a duplicated post (same idempotency key) does not double-apply', async () => {
    ledger.seedUser('u1', 1000n);
    const input = {
      idempotencyKey: 'order:purchase:dup', type: 'order_purchase',
      entries: [
        { accountKey: userAccountKey('u1', 'available'), amount: -300n },
        { accountKey: SYSTEM_ACCOUNTS.revenue, amount: 300n },
      ],
    };
    await walletService.post(input);
    await walletService.post(input); // replay
    await expectConsistent('u1', 700n); // applied exactly once
    expect(ledger.balanceOf(SYSTEM_ACCOUNTS.revenue)).toBe(300n);
  });
});
