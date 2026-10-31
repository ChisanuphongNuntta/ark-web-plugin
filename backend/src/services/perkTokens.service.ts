import prisma from "../config/database.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler.js";
import walletService, {
  userAccountKey,
  SYSTEM_ACCOUNTS,
} from "./wallet.service.js";
export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 30000,
      });
    } catch (e: any) {
      if (attempt >= 12 || !["P2034", "P2002"].includes(e?.code)) throw e;
    }
}
export async function postTokens(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    delta: number;
    type: string;
    idempotencyKey: string;
    packId?: string;
    paymentIntentId?: string;
    icLedgerTransactionId?: string;
    amountThb?: string;
    amountIc?: bigint;
    referenceId?: string;
    reason?: string;
    createdBy?: string;
  },
) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0)
    throw new AppError("Invalid token amount", 400);
  const prior = await tx.perkTokenLedgerEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (prior) {
    if (
      prior.userId !== input.userId ||
      prior.delta !== input.delta ||
      prior.type !== input.type ||
      prior.packId !== (input.packId ?? null) ||
      prior.referenceId !== (input.referenceId ?? null) ||
      prior.reason !== (input.reason ?? null) ||
      prior.createdBy !== (input.createdBy ?? null)
    )
      throw new AppError("Idempotency key conflict", 409);
    return { entry: prior, balance: prior.balanceAfter, replayed: true };
  }
  const account = await tx.perkTokenAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId },
    update: {},
  });
  const balance = account.balance + input.delta;
  if (!Number.isSafeInteger(balance) || balance < 0 || balance > 2147483647)
    throw new AppError("Insufficient tokens or balance limit exceeded", 409);
  const changed = await tx.perkTokenAccount.updateMany({
    where: { userId: input.userId, version: account.version },
    data: { balance, version: { increment: 1 } },
  });
  if (!changed.count)
    throw Object.assign(new Error("Token conflict"), { code: "P2034" });
  return {
    entry: await tx.perkTokenLedgerEntry.create({
      data: { ...input, balanceAfter: balance },
    }),
    balance,
    replayed: false,
  };
}
export async function buyTokensIc(
  userId: string,
  packKey: string,
  key: string,
) {
  if (!key || key.length > 128)
    throw new AppError("Idempotency-Key required (max 128)", 400);
  return serializable(async (tx) => {
    const stableKey = `perk-tokens:ic:${userId}:${key}`;
    const prior = await tx.perkTokenLedgerEntry.findUnique({
      where: { idempotencyKey: stableKey },
    });
    const pack = await tx.perkTokenPack.findUnique({ where: { key: packKey } });
    if (prior) {
      if (!pack || prior.packId !== pack.id)
        throw new AppError("Idempotency key conflict", 409);
      return {
        entry: prior,
        tokens: { balance: prior.balanceAfter },
        ledgerTransactionId: prior.icLedgerTransactionId,
        replayed: true,
      };
    }
    if (!pack?.isActive) throw new AppError("Token pack not found", 404);
    if (pack.priceIc === null || pack.priceIc <= 0n)
      throw new AppError("Pack not sold for IC", 409);
    await walletService.ensureUserAccounts(userId, tx);
    const posted = await walletService.post(
      {
        idempotencyKey: stableKey,
        type: "perk_token_purchase",
        referenceType: "perk_token_pack",
        referenceId: pack.id,
        entries: [
          {
            accountKey: userAccountKey(userId, "available"),
            amount: -pack.priceIc,
          },
          { accountKey: SYSTEM_ACCOUNTS.revenue, amount: pack.priceIc },
        ],
      },
      tx,
    );
    const result = await postTokens(tx, {
      userId,
      delta: pack.tokens,
      type: "purchase_ic",
      idempotencyKey: stableKey,
      packId: pack.id,
      amountIc: pack.priceIc,
      icLedgerTransactionId: posted.id,
    });
    const wallet = await tx.walletAccount.findUnique({
      where: { key: userAccountKey(userId, "available") },
    });
    return {
      ...result,
      tokens: { balance: result.balance },
      ledgerTransactionId: posted.id,
      walletBalance: wallet?.balance.toString(),
    };
  });
}
