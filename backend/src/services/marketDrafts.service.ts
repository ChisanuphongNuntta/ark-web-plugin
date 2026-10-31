import crypto from "node:crypto";
import { z } from "zod";
import prisma from "../config/database.js";
import { AppError } from "../middlewares/errorHandler.js";
import { serializable } from "./perkTokens.service.js";
export const publishMarketSchema = z
  .object({
    id: z.string().min(1).max(100),
    price: z.number().int().min(1).max(2000000000),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();
export const safeMarketListing = (listing: any) => {
  const { cryopodData, ...safe } = listing;
  return safe;
};
export function nativeMarketPayload(listing: any) {
  if (!listing.cryopodData?.length || listing.cryopodData.length > 1048576)
    throw new AppError("Native snapshot missing or invalid", 409);
  return {
    schemaVersion: 2,
    dinoDataVersion: 1,
    dinoDataSha256: crypto
      .createHash("sha256")
      .update(listing.cryopodData)
      .digest("hex"),
    dinoDataSize: listing.cryopodData.length,
    listingId: listing.id,
    species: listing.species,
    blueprintPath: listing.blueprintPath,
    dinoName: listing.dinoName,
    level: listing.level,
    gender: listing.gender,
    cryopodData: listing.cryopodData.toString("base64"),
  };
}
export async function publishMarketDrafts(userId: string, raw: unknown) {
  const parsed = z.array(publishMarketSchema).min(1).max(20).safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      parsed.error.issues.map((i) => i.message).join("; "),
      400,
    );
  if (new Set(parsed.data.map((i) => i.id)).size !== parsed.data.length)
    throw new AppError("Duplicate listing IDs", 400);
  return serializable(async (tx) => {
    const published = [];
    for (const item of [...parsed.data].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const row = await tx.dinoListing.findUnique({ where: { id: item.id } });
      if (!row) throw new AppError("Listing not found", 404);
      if (row.sellerId !== userId)
        throw new AppError("Only the seller may publish this listing", 403);
      if (
        row.status === "listed" &&
        row.price === item.price &&
        (item.description === undefined || item.description === row.description)
      ) {
        published.push(safeMarketListing(row));
        continue;
      }
      if (row.status !== "draft")
        throw new AppError("Only uploaded drafts can be published", 409);
      nativeMarketPayload(row);
      const updated = await tx.dinoListing.updateMany({
        where: { id: item.id, sellerId: userId, status: "draft" },
        data: {
          price: item.price,
          description: item.description,
          status: "listed",
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      if (updated.count !== 1)
        throw new AppError("Listing changed concurrently", 409);
      published.push(
        safeMarketListing(
          await tx.dinoListing.findUniqueOrThrow({ where: { id: item.id } }),
        ),
      );
    }
    await tx.auditLog.create({
      data: {
        userId,
        action: "market_publish",
        resource: "dino_listing",
        newValue: JSON.stringify(parsed.data),
      },
    });
    return published;
  });
}
export async function cancelMarketListing(userId: string, id: string) {
  return serializable(async (tx) => {
    const listing = await tx.dinoListing.findUnique({ where: { id } });
    if (!listing) throw new AppError("Listing not found", 404);
    if (listing.sellerId !== userId)
      throw new AppError("Only the seller may cancel this listing", 403);
    if (listing.status === "cancelled")
      return { success: true, replayed: true };
    if (!["draft", "listed"].includes(listing.status))
      throw new AppError("Listing cannot be cancelled", 409);
    const seller = await tx.user.findUnique({ where: { id: userId } });
    if (!seller?.steamId || !listing.originServerId)
      throw new AppError("Seller Steam account or origin server missing", 409);
    const payload = nativeMarketPayload(listing);
    const changed = await tx.dinoListing.updateMany({
      where: { id, sellerId: userId, status: { in: ["draft", "listed"] } },
      data: { status: "cancelled", deliveryStatus: "return_pending" },
    });
    if (changed.count !== 1)
      throw new AppError("Listing changed concurrently", 409);
    const job = await tx.deliveryJob.create({
      data: {
        serverId: listing.originServerId,
        playerSteamId: seller.steamId,
        deliveryType: "dino_return",
        referenceId: id,
        payload,
        payloadHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex"),
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "market_cancel",
        resource: "dino_listing",
        resourceId: id,
        newValue: JSON.stringify({ jobId: job.id }),
      },
    });
    return {
      success: true,
      replayed: false,
      returnDeliveryId: job.id,
      message: "Your exact dino is queued for return to the origin server.",
    };
  });
}
