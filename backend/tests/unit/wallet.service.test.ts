import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import walletService from '../../src/services/wallet.service.js';

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
    const existing = {
      id: 'tx-1', idempotencyKey: 'same-key', type: 'credit', createdAt: new Date(),
      entries: [{ id: 'entry-1', amount: 10n, balanceAfter: 10n, account: { key: 'a', type: 'available', currency: 'IC' } }],
    };
    const tx = { ledgerTransaction: { findUnique: vi.fn().mockResolvedValue(existing) } };
    db.$transaction.mockImplementationOnce((callback: any) => callback(tx));

    const result = await walletService.post({
      idempotencyKey: 'same-key', type: 'credit',
      entries: [{ accountKey: 'a', amount: 10n }, { accountKey: 'b', amount: -10n }],
    });

    expect(result.id).toBe('tx-1');
    expect(result.entries[0].amount).toBe('10');
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
