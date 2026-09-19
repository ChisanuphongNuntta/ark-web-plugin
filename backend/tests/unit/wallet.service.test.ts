import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import walletService, { walletRequestHashFor } from '../../src/services/wallet.service.js';

const db = prisma as any;

describe('WalletService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an unbalanced ledger transaction before touching the database', async () => {
    await expect(walletService.post({
      idempotencyKey: 'unbalanced-1',
      type: 'test',
      entries: [
        { accountKey: 'a', amount: 10n },
        { accountKey: 'b', amount: -9n },
      ],
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns the original transaction for a repeated idempotency key', async () => {
    const input = {
      idempotencyKey: 'same-key', type: 'credit',
      entries: [{ accountKey: 'a', amount: 10n }, { accountKey: 'b', amount: -10n }],
    };
    const existing = {
      id: 'tx-1', idempotencyKey: 'same-key', type: 'credit', createdAt: new Date(),
      requestHash: walletRequestHashFor(input, input.entries),
      entries: [{ id: 'entry-1', amount: 10n, balanceAfter: 10n, account: { key: 'a', type: 'available', currency: 'IC' } }],
    };
    const tx = { ledgerTransaction: { findUnique: vi.fn().mockResolvedValue(existing) } };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    const result = await walletService.post(input);

    expect(result.id).toBe('tx-1');
    expect(result.entries[0].amount).toBe('10');
  });

  it('aggregates and balances entries so every posted transaction is zero-sum', async () => {
    // Two entries to the SAME account plus an offsetting system entry net to zero overall.
    const createdEntries: Array<{ accountId: string; amount: bigint; balanceAfter: bigint }> = [];
    const balances: Record<string, bigint> = { available: 100n, issuance: 0n };
    const tx: any = {
      ledgerTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'tx-zero' }),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockImplementation(() => ({
          id: 'tx-zero', idempotencyKey: 'zero-sum', type: 'credit', createdAt: new Date(),
          entries: createdEntries.map((e, i) => ({ id: `e${i}`, amount: e.amount, balanceAfter: e.balanceAfter, account: { key: e.accountId, type: e.accountId, currency: 'IC' } })),
        })),
      },
      walletAccount: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'available', key: 'user:u1:available:IC', userId: 'u1', type: 'available', status: 'active', balance: 100n },
          { id: 'issuance', key: 'system:issuance:IC', userId: null, type: 'system_issuance', status: 'active', balance: 0n },
        ]),
        updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
          balances[where.id] += data.balance.increment;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }: any) => ({
          id: where.id, userId: where.id === 'available' ? 'u1' : null, type: where.id === 'available' ? 'available' : 'system_issuance', balance: balances[where.id],
        })),
      },
      ledgerEntry: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          createdEntries.push({ accountId: data.accountId, amount: data.amount, balanceAfter: data.balanceAfter });
          return {};
        }),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    await walletService.post({
      idempotencyKey: 'zero-sum', type: 'credit',
      entries: [
        { accountKey: 'system:issuance:IC', amount: -30n },
        { accountKey: 'user:u1:available:IC', amount: 50n },
        { accountKey: 'user:u1:available:IC', amount: -20n }, // aggregates to net +30 on available
      ],
    });

    // Net of all persisted entries must be exactly zero (double-entry invariant)
    const net = createdEntries.reduce((sum, e) => sum + e.amount, 0n);
    expect(net).toBe(0n);
    // pointsBalance projection synced from the available account's post-balance
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { pointsBalance: 130n } });
  });

  it('verifyProjection proves pointsBalance == available account == ledger entry sum', async () => {
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 130n });
    db.walletAccount.findUnique.mockResolvedValueOnce({ balance: 130n });
    db.ledgerEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 130n } });

    const result = await walletService.verifyProjection('u1');
    expect(result).toEqual({ pointsBalance: 130n, accountBalance: 130n, ledgerProjection: 130n, matches: true });
  });

  it('verifyProjection flags a mismatch when the cached projection drifts from the ledger', async () => {
    db.user.findUnique.mockResolvedValueOnce({ pointsBalance: 130n });
    db.walletAccount.findUnique.mockResolvedValueOnce({ balance: 130n });
    db.ledgerEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 999n } });

    const result = await walletService.verifyProjection('u1');
    expect(result.matches).toBe(false);
  });

  it('rejects a debit when the spendable account has insufficient balance', async () => {
    const tx = {
      ledgerTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'tx-2' }),
      },
      walletAccount: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'available', key: 'user:u1:available:IC', userId: 'u1', type: 'available', status: 'active', balance: 5n },
          { id: 'held', key: 'user:u1:held:IC', userId: 'u1', type: 'held', status: 'active', balance: 0n },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    await expect(walletService.post({
      idempotencyKey: 'hold-too-much', type: 'wallet_hold',
      entries: [
        { accountKey: 'user:u1:available:IC', amount: -10n },
        { accountKey: 'user:u1:held:IC', amount: 10n },
      ],
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
