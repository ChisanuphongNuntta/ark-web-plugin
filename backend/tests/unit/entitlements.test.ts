import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/realtime/emit.js", () => ({
  emitPerksUpdated: vi.fn(),
  emitAdminPerks: vi.fn(),
  emitAdminSlipCreated: vi.fn(),
}));
import prisma from "../../src/config/database.js";
import {
  evaluate,
  quotaWindow,
  consume,
} from "../../src/services/entitlements.service.js";
import {
  postTokens,
  serializable,
} from "../../src/services/perkTokens.service.js";
import paymentService, {
  fulfillPaidIntent,
} from "../../src/services/payment.service.js";
const db = prisma as any,
  steam = "76561198000000001",
  now = new Date("2026-10-24T17:00:00Z");
const feature = {
  key: "cmd.pod",
  commands: ["/pod"],
  isActive: true,
  freeForAll: false,
  tokenCost: 2,
};
beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u", isBanned: false });
  db.paymentIntent = { findUnique: vi.fn(), create: vi.fn() };
  db.perkTokenAccount = {
    findUnique: vi.fn().mockResolvedValue({ balance: 10 }),
    upsert: vi.fn().mockResolvedValue({ balance: 10, version: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  db.perkTokenLedgerEntry = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockImplementation(({ data }: any) => ({ ...data, id: "ledger" })),
  };
  db.perkFeature = { findUnique: vi.fn().mockResolvedValue(feature) };
  db.vipMembership = { findMany: vi.fn().mockResolvedValue([]) };
  db.perkPromotion = { findMany: vi.fn().mockResolvedValue([]) };
  db.entitlementUsage = {
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockImplementation(({ data }: any) => ({ ...data, id: "usage" })),
  };
  db.$executeRaw = vi.fn();
  db.$transaction.mockImplementation((fn: any) => fn(db));
});
describe("Bangkok quota windows", () => {
  it("resets day at 17:00 UTC", () => {
    expect(quotaWindow("per_day", now).start.toISOString()).toBe(
      "2026-10-24T17:00:00.000Z",
    );
  });
  it("starts week on Monday Bangkok", () => {
    expect(quotaWindow("per_week", now).start.toISOString()).toBe(
      "2026-10-18T17:00:00.000Z",
    );
  });
});
describe("entitlement precedence", () => {
  it("denies inactive even with tokens", async () =>
    expect(
      (await evaluate(db, steam, { ...feature, isActive: false }, now)).reason,
    ).toBe("feature_inactive"));
  it("blocks banned linked users", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", isBanned: true });
    expect(
      (await evaluate(db, steam, { ...feature, freeForAll: true }, now)).reason,
    ).toBe("banned");
  });
  it("uses free before promotions and tokens", async () =>
    expect(
      (await evaluate(db, steam, { ...feature, freeForAll: true }, now)).source,
    ).toBe("free"));
  it("allows unlinked promotional usage", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.perkPromotion.findMany.mockResolvedValue([
      {
        id: "p",
        key: "free-pod",
        audience: "all",
        quotaType: "per_day",
        quotaLimit: 3,
      },
    ]);
    const r = await evaluate(db, steam, feature, now);
    expect(r.source).toBe("promotion");
    expect(r.remaining).toBe(3);
  });
  it("counts promotion quota across all features of promotion", async () => {
    db.perkPromotion.findMany.mockResolvedValue([
      {
        id: "p",
        key: "offer",
        audience: "all",
        quotaType: "per_day",
        quotaLimit: 3,
      },
    ]);
    db.entitlementUsage.count.mockResolvedValue(3);
    expect((await evaluate(db, steam, feature, now)).source).toBe("tokens");
    expect(
      db.entitlementUsage.count.mock.calls[0][0].where.featureKey,
    ).toBeUndefined();
  });
  it("uses subscription before tokens", async () => {
    db.vipMembership.findMany.mockResolvedValue([
      {
        packageId: "plan",
        package: {
          key: "vip",
          grants: [{ featureKey: "cmd.pod", quotaType: "unlimited" }],
        },
      },
    ]);
    expect((await evaluate(db, steam, feature, now)).source).toBe(
      "subscription",
    );
  });
  it("rejects an unmatched unlinked user", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await evaluate(db, steam, feature, now)).reason).toBe("not_linked");
  });
});
describe("atomic consume", () => {
  it("debits exactly one token posting with immutable response", async () => {
    const r = await consume({
      steamId: steam,
      featureKey: "cmd.pod",
      idempotencyKey: "consume-1234",
      serverId: 1,
    });
    expect(r.tokensBalance).toBe(8);
    expect(r.tokensSpent).toBe(2);
    expect(db.perkTokenLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(
      db.entitlementUsage.create.mock.calls[0][0].data.responseJson
        .tokensBalance,
    ).toBe(8);
    expect(db.$executeRaw).toHaveBeenCalled();
  });
  it("replays stored result without reevaluating or charging", async () => {
    db.entitlementUsage.findUnique.mockResolvedValue({
      id: "u1",
      userId: "u",
      steamId: steam,
      featureKey: "cmd.pod",
      serverId: 1,
      command: null,
      responseJson: {
        allowed: true,
        source: "tokens",
        tokensSpent: 2,
        tokensBalance: 8,
      },
    });
    const r = await consume({
      steamId: steam,
      featureKey: "cmd.pod",
      idempotencyKey: "consume-1234",
      serverId: 1,
    });
    expect(r.replayed).toBe(true);
    expect(r.tokensBalance).toBe(8);
    expect(db.perkTokenLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.perkFeature.findUnique).not.toHaveBeenCalled();
  });
  it("rejects idempotency reuse across server/feature", async () => {
    db.entitlementUsage.findUnique.mockResolvedValue({
      steamId: steam,
      featureKey: "cmd.pod",
      serverId: 2,
      command: null,
    });
    await expect(
      consume({
        steamId: steam,
        featureKey: "cmd.pod",
        idempotencyKey: "consume-1234",
        serverId: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("stores denied attempts without spending", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const r = await consume({
      steamId: steam,
      featureKey: "cmd.pod",
      idempotencyKey: "consume-1234",
      serverId: 1,
    });
    expect(r.allowed).toBe(false);
    expect(db.entitlementUsage.create.mock.calls[0][0].data.source).toBe(
      "denied",
    );
    expect(db.perkTokenLedgerEntry.create).not.toHaveBeenCalled();
  });
  it("retries serialization conflicts", async () => {
    db.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("race"), { code: "P2034" }),
    );
    await expect(serializable(async () => 42)).resolves.toBe(42);
  });
});
describe("token ledger", () => {
  it("rejects overdraft", async () => {
    await expect(
      postTokens(db, {
        userId: "u",
        delta: -11,
        type: "consume",
        idempotencyKey: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.perkTokenAccount.updateMany).not.toHaveBeenCalled();
  });
  it("rejects idempotency key different amount", async () => {
    db.perkTokenLedgerEntry.findUnique.mockResolvedValue({
      userId: "u",
      delta: 5,
      type: "purchase_thb",
      packId: null,
      referenceId: null,
    });
    await expect(
      postTokens(db, {
        userId: "u",
        delta: 6,
        type: "purchase_thb",
        idempotencyKey: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("paid token intents credit tokens only with captured quantity", async () => {
    const r = await fulfillPaidIntent(
      db,
      {
        id: "pay",
        userId: "u",
        perkTokenPackId: "pack",
        pointsAmount: 999n,
        amountThb: "100.00",
        metadata: { tokenPackSnapshot: { tokens: 20 } },
      },
      { idempotencyKey: "pay-credit", type: "payment_topup", options: {} },
    );
    expect(r).toEqual({ kind: "tokens", tokens: 20 });
    expect(db.perkTokenLedgerEntry.create.mock.calls[0][0].data.delta).toBe(20);
  });
});

describe("token payment checkout and completion", () => {
  it("bank-slip checkout snapshots server-side tokens and amount, replays original intent", async () => {
    db.paymentIntent.findUnique.mockResolvedValue(null);
    db.perkTokenPack = {
      findUnique: vi.fn().mockResolvedValue({
        id: "pack",
        key: "ten",
        name: "Ten",
        tokens: 10,
        priceThb: "99.00",
        isActive: true,
      }),
    };
    db.paymentIntent.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      id: "payment-1",
    }));
    const first = await paymentService.createTokenIntent(
      "u",
      "pack",
      "payment-key",
      "bank_slip",
      { transferRef: "transfer-1" },
    );
    expect(first.intent.kind).toBe("tokens");
    expect(first.intent.pointsAmount).toBe("0");
    expect(first.intent.metadata.tokenPackSnapshot.tokens).toBe(10);
    expect(String(first.intent.amountThb)).toBe("99.00");
    db.paymentIntent.findUnique.mockResolvedValue({
      ...first.intent,
      pointsAmount: 0n,
    });
    const replay = await paymentService.createTokenIntent(
      "u",
      "pack",
      "payment-key",
      "bank_slip",
      { transferRef: "transfer-1" },
    );
    expect(replay.replayed).toBe(true);
    expect(db.paymentIntent.create).toHaveBeenCalledTimes(1);
  });
  it("completion replays token ledger once and rejects missing snapshots", async () => {
    const intent = {
      id: "pay",
      userId: "u",
      perkTokenPackId: "pack",
      pointsAmount: 0n,
      amountThb: "99.00",
      metadata: { tokenPackSnapshot: { tokens: 10 } },
    };
    const credit = {
      idempotencyKey: "ignored",
      type: "payment_topup",
      options: {},
    };
    await fulfillPaidIntent(db, intent, credit);
    const saved = db.perkTokenLedgerEntry.create.mock.calls[0][0].data;
    db.perkTokenLedgerEntry.findUnique.mockResolvedValue({
      ...saved,
      id: "entry",
      referenceId: null,
      reason: null,
      createdBy: null,
    });
    await fulfillPaidIntent(db, intent, credit);
    expect(db.perkTokenLedgerEntry.create).toHaveBeenCalledTimes(1);
    await expect(
      fulfillPaidIntent(db, { ...intent, metadata: {} }, credit),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
