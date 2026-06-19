import { Prisma, WalletAccountStatus, WalletAccountType } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';

export const SYSTEM_ACCOUNTS = {
  issuance: 'system:issuance:IC',
  revenue: 'system:revenue:IC',
  clearing: 'system:clearing:IC',
} as const;

export const userAccountKey = (userId: string, type: 'available' | 'held' | 'promotional' | 'refundable') =>
  `user:${userId}:${type}:IC`;

type LedgerLine = { accountKey: string; amount: bigint };

export interface PostLedgerTransactionInput {
  idempotencyKey: string;
  type: string;
  entries: LedgerLine[];
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  createdBy?: string;
}

const serializeTransaction = (transaction: any) => ({
  ...transaction,
  entries: transaction.entries?.map((entry: any) => ({
    ...entry,
    amount: entry.amount.toString(),
    balanceAfter: entry.balanceAfter.toString(),
    account: entry.account ? {
      key: entry.account.key,
      type: entry.account.type,
      currency: entry.account.currency,
    } : undefined,
  })),
});

export class WalletService {
  async ensureUserAccounts(userId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, pointsBalance: true } });
    if (!user) throw new AppError('User not found', 404);

    const accountTypes: Array<'available' | 'held' | 'promotional' | 'refundable'> = [
      'available', 'held', 'promotional', 'refundable',
    ];

    await Promise.all(accountTypes.map((type) => client.walletAccount.upsert({
      where: { key: userAccountKey(userId, type) },
      create: {
        key: userAccountKey(userId, type),
        userId,
        type: type as WalletAccountType,
        balance: type === 'available' ? user.pointsBalance : 0n,
      },
      update: {},
    })));
  }

  async getBalance(userId: string) {
    await this.ensureUserAccounts(userId);
    const accounts = await prisma.walletAccount.findMany({
      where: { userId, currency: 'IC' },
      orderBy: { type: 'asc' },
    });

    return {
      currency: 'IC',
      accounts: Object.fromEntries(accounts.map((account) => [account.type, account.balance.toString()])),
      total: accounts.reduce((sum, account) => sum + account.balance, 0n).toString(),
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    await this.ensureUserAccounts(userId);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const where = { entries: { some: { account: { userId } } } };
    const [transactions, total] = await Promise.all([
      prisma.ledgerTransaction.findMany({
        where,
        include: { entries: { where: { account: { userId } }, include: { account: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.ledgerTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(serializeTransaction),
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async post(input: PostLedgerTransactionInput, client?: Prisma.TransactionClient) {
    if (!input.idempotencyKey?.trim()) throw new AppError('Idempotency key is required', 400);

    const aggregated = new Map<string, bigint>();
    for (const entry of input.entries) {
      if (!entry.accountKey || entry.amount === 0n) continue;
      aggregated.set(entry.accountKey, (aggregated.get(entry.accountKey) || 0n) + entry.amount);
    }
    const entries = [...aggregated.entries()]
      .map(([accountKey, amount]) => ({ accountKey, amount }))
      .filter((entry) => entry.amount !== 0n)
      .sort((a, b) => a.accountKey.localeCompare(b.accountKey));

    if (entries.length < 2 || entries.reduce((sum, entry) => sum + entry.amount, 0n) !== 0n) {
      throw new AppError('Ledger transaction must contain at least two balanced entries', 400);
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { entries: { include: { account: true } } },
      });
      if (existing) return serializeTransaction(existing);

      const accounts = await tx.walletAccount.findMany({
        where: { key: { in: entries.map((entry) => entry.accountKey) } },
      });
      const byKey = new Map(accounts.map((account) => [account.key, account]));
      if (accounts.length !== entries.length) {
        const missing = entries.filter((entry) => !byKey.has(entry.accountKey)).map((entry) => entry.accountKey);
        throw new AppError(`Wallet account not found: ${missing.join(', ')}`, 404);
      }

      const transaction = await tx.ledgerTransaction.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          type: input.type,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description,
          metadata: input.metadata,
          createdBy: input.createdBy,
        },
      });

      for (const entry of entries) {
        const account = byKey.get(entry.accountKey)!;
        if (account.status !== WalletAccountStatus.active) throw new AppError(`Wallet account is ${account.status}`, 409);

        const canOverdraw = account.type === WalletAccountType.system_issuance || account.type === WalletAccountType.system_clearing;
        const updated = entry.amount < 0n
          ? await tx.walletAccount.updateMany({
              where: {
                id: account.id,
                status: WalletAccountStatus.active,
                ...(canOverdraw ? {} : { balance: { gte: -entry.amount } }),
              },
              data: { balance: { increment: entry.amount }, version: { increment: 1 } },
            })
          : await tx.walletAccount.updateMany({
              where: { id: account.id, status: WalletAccountStatus.active },
              data: { balance: { increment: entry.amount }, version: { increment: 1 } },
            });
        if (updated.count !== 1) throw new AppError('Insufficient or unavailable wallet balance', 409);

        const current = await tx.walletAccount.findUniqueOrThrow({ where: { id: account.id } });
        await tx.ledgerEntry.create({
          data: { transactionId: transaction.id, accountId: account.id, amount: entry.amount, balanceAfter: current.balance },
        });
        if (current.userId && current.type === WalletAccountType.available) {
          await tx.user.update({ where: { id: current.userId }, data: { pointsBalance: current.balance } });
        }
      }

      const posted = await tx.ledgerTransaction.findUniqueOrThrow({
        where: { id: transaction.id },
        include: { entries: { include: { account: true } } },
      });
      return serializeTransaction(posted);
    };

    if (client) {
      return execute(client);
    }

    return prisma.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async creditUser(userId: string, amount: bigint, idempotencyKey: string, type: string, referenceId?: string) {
    if (amount <= 0n) throw new AppError('Credit amount must be positive', 400);
    await this.ensureUserAccounts(userId);
    return this.post({
      idempotencyKey,
      type,
      referenceType: referenceId ? 'external' : undefined,
      referenceId,
      entries: [
        { accountKey: SYSTEM_ACCOUNTS.issuance, amount: -amount },
        { accountKey: userAccountKey(userId, 'available'), amount },
      ],
    });
  }

  async holdUserFunds(userId: string, amount: bigint, idempotencyKey: string, referenceId?: string) {
    if (amount <= 0n) throw new AppError('Hold amount must be positive', 400);
    await this.ensureUserAccounts(userId);
    return this.post({
      idempotencyKey,
      type: 'wallet_hold',
      referenceType: referenceId ? 'checkout' : undefined,
      referenceId,
      entries: [
        { accountKey: userAccountKey(userId, 'available'), amount: -amount },
        { accountKey: userAccountKey(userId, 'held'), amount },
      ],
    });
  }
}

export default new WalletService();
