import crypto from "node:crypto";
import { beforeEach, it, expect, vi } from "vitest";
import prisma from "../../src/config/database.js";
import { PluginController } from "../../src/controllers/plugin.controller.js";
const db = prisma as any,
  controller = new PluginController();
const snapshot = Buffer.from("exact-native-stat-colors-imprint");
const body = {
  assetLockId: "lock",
  assetFingerprint: "aabbccddeeff00112233",
  listingMode: "draft",
  uploadBatchId: "batch1",
  price: 0,
  dinoDataVersion: 1,
  cryopodData: snapshot.toString("base64"),
  dinoDataSize: snapshot.length,
  dinoDataSha256: crypto.createHash("sha256").update(snapshot).digest("hex"),
  baseHealth: 45,
  addedDamage: 12,
  colorRegion0: 6,
  imprintQuality: 1,
  maternalMutations: 123,
};
let tx: any;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_DINO_TRADING = "true";
  db.dinoAssetLock.findUnique.mockResolvedValue({
    id: "lock",
    originServerId: 1,
    sellerSteamId: "76561198000000001",
    status: "prepared",
    species: "Rex",
    level: 123,
    expiresAt: new Date(0),
    snapshotSha256: body.dinoDataSha256,
  });
  db.user.findUnique.mockResolvedValue({ id: "seller", isBanned: false });
  tx = {
    dinoAssetLock: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    dinoListing: {
      create: vi
        .fn()
        .mockImplementation(({ data }: any) => ({ ...data, id: "listing" })),
    },
  };
  db.$transaction.mockImplementation((fn: any) => fn(tx));
});
async function confirm(overrides: any = {}) {
  const res = { json: vi.fn() },
    next = vi.fn();
  await controller.confirmLock(
    { serverId: 1, body: { ...body, ...overrides } } as any,
    res as any,
    next,
  );
  return { res, next };
}
it("recovers a snapshot-bound upload after expiry without rebuilding its native payload", async () => {
  const { next } = await confirm();
  expect(next).not.toHaveBeenCalled();
  const data = tx.dinoListing.create.mock.calls[0][0].data;
  expect(data.status).toBe("draft");
  expect(data.price).toBe(0);
  expect(data.expiresAt).toBeNull();
  expect(data.uploadBatchId).toBe("batch1");
  expect(data.cryopodData).toEqual(snapshot);
  expect(data.baseHealth).toBe(45);
  expect(data.maternalMutations).toBe(123);
});
it("rejects changed prepared snapshot before creating listing", async () => {
  db.dinoAssetLock.findUnique.mockResolvedValue({
    id: "lock",
    originServerId: 1,
    snapshotSha256: "0".repeat(64),
  });
  const { next } = await confirm();
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
  expect(tx.dinoListing.create).not.toHaveBeenCalled();
});
it("rejects duplicate lock payload whose metadata changed", async () => {
  db.dinoAssetLock.findUnique.mockResolvedValue({
    id: "lock",
    originServerId: 1,
    status: "confirmed",
    listingId: "listing",
    assetFingerprint: body.assetFingerprint,
    price: 0,
    confirmRequestHash: "different-hash",
  });
  const { next } = await confirm();
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
  expect(tx.dinoListing.create).not.toHaveBeenCalled();
});
it("rejects invalid native stat metadata and checksum", async () => {
  const { next } = await confirm({ baseHealth: -1 });
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
  const second = await confirm({ dinoDataSha256: "0".repeat(64) });
  expect(second.next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
});
it("rejects other signed server", async () => {
  db.dinoAssetLock.findUnique.mockResolvedValue({ originServerId: 2 });
  const { next } = await confirm();
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
});
