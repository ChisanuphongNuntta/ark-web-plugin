import { beforeEach, describe, it, expect, vi } from "vitest";
import prisma from "../../src/config/database.js";
import {
  publishMarketDrafts,
  cancelMarketListing,
} from "../../src/services/marketDrafts.service.js";
const db = prisma as any;
const draft = {
  id: "d",
  sellerId: "seller",
  originServerId: 1,
  status: "draft",
  price: 0,
  species: "Rex",
  level: 123,
  cryopodData: Buffer.from("exact-native"),
  assetFingerprint: "same-dino",
};
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: any) => fn(db));
  db.dinoListing = {
    findUnique: vi.fn().mockResolvedValue(draft),
    findUniqueOrThrow: vi
      .fn()
      .mockResolvedValue({ ...draft, status: "listed", price: 99 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  db.user.findUnique.mockResolvedValue({ steamId: "76561198000000001" });
  db.deliveryJob.create = vi.fn().mockResolvedValue({ id: "return-job" });
  db.auditLog = { create: vi.fn().mockResolvedValue({}) };
});
describe("exact dino draft publication", () => {
  it("publishes only price and status without touching exact native or metadata", async () => {
    const r = await publishMarketDrafts("seller", [{ id: "d", price: 99 }]);
    expect(r[0].cryopodData).toBeUndefined();
    const data = db.dinoListing.updateMany.mock.calls[0][0].data;
    expect(data.price).toBe(99);
    expect(data.status).toBe("listed");
    expect(data.cryopodData).toBeUndefined();
    expect(data.level).toBeUndefined();
  });
  it("rejects another owner", async () => {
    await expect(
      publishMarketDrafts("thief", [{ id: "d", price: 99 }]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.dinoListing.updateMany).not.toHaveBeenCalled();
  });
  it("rejects missing native snapshot", async () => {
    db.dinoListing.findUnique.mockResolvedValue({
      ...draft,
      cryopodData: null,
    });
    await expect(
      publishMarketDrafts("seller", [{ id: "d", price: 99 }]),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("limits batch and rejects duplicate or invalid price", async () => {
    await expect(
      publishMarketDrafts(
        "seller",
        Array.from({ length: 21 }, (_, i) => ({ id: String(i), price: 1 })),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      publishMarketDrafts("seller", [
        { id: "d", price: 1 },
        { id: "d", price: 2 },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      publishMarketDrafts("seller", [{ id: "d", price: 0 }]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("idempotently returns same listing terms without second mutation", async () => {
    db.dinoListing.findUnique.mockResolvedValue({
      ...draft,
      status: "listed",
      price: 99,
    });
    await publishMarketDrafts("seller", [{ id: "d", price: 99 }]);
    expect(db.dinoListing.updateMany).not.toHaveBeenCalled();
  });
  it("refuses sold or changed publish terms", async () => {
    db.dinoListing.findUnique.mockResolvedValue({ ...draft, status: "sold" });
    await expect(
      publishMarketDrafts("seller", [{ id: "d", price: 99 }]),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
describe("native return", () => {
  it("returns through durable delivery and never exposes native bytes on web", async () => {
    const r = await cancelMarketListing("seller", "d");
    expect(r.returnDeliveryId).toBe("return-job");
    const job = db.deliveryJob.create.mock.calls[0][0].data;
    expect(job.deliveryType).toBe("dino_return");
    expect(job.serverId).toBe(1);
    expect(Buffer.from(job.payload.cryopodData, "base64")).toEqual(
      draft.cryopodData,
    );
    expect(job.payload.dinoDataSize).toBe(draft.cryopodData.length);
  });
  it("cancellation replay never creates another return", async () => {
    db.dinoListing.findUnique.mockResolvedValue({
      ...draft,
      status: "cancelled",
    });
    expect((await cancelMarketListing("seller", "d")).replayed).toBe(true);
    expect(db.deliveryJob.create).not.toHaveBeenCalled();
  });
  it("rejects ownership and cancellation race", async () => {
    await expect(cancelMarketListing("thief", "d")).rejects.toMatchObject({
      statusCode: 403,
    });
    db.dinoListing.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelMarketListing("seller", "d")).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
