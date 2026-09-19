ALTER TABLE "dino_listings" DROP CONSTRAINT "dino_listings_delivery_server_id_fkey";
ALTER TABLE "dino_listings" DROP CONSTRAINT "dino_listings_origin_server_id_fkey";
DROP INDEX "dino_asset_locks_origin_server_id_status_idx";
DROP INDEX "dino_listings_delivery_server_id_delivery_status_idx";
DROP INDEX "dino_listings_origin_server_id_status_idx";
DROP INDEX "dino_listings_asset_fingerprint_key";
DROP INDEX "dino_listings_asset_lock_id_key";
ALTER TABLE "dino_asset_locks" DROP COLUMN "origin_server_id";
ALTER TABLE "dino_listings"
  DROP COLUMN "asset_fingerprint",
  DROP COLUMN "asset_lock_id",
  DROP COLUMN "origin_server_id";
