ALTER TABLE "dino_listings"
  ADD COLUMN "origin_server_id" INTEGER,
  ADD COLUMN "asset_lock_id" TEXT,
  ADD COLUMN "asset_fingerprint" TEXT;

ALTER TABLE "dino_asset_locks"
  ADD COLUMN "origin_server_id" INTEGER;

-- Asset locks are short-lived coordination records. Legacy locks cannot be proven
-- server-scoped and are discarded before enforcing the invariant.
DELETE FROM "dino_asset_locks" WHERE "origin_server_id" IS NULL;
ALTER TABLE "dino_asset_locks" ALTER COLUMN "origin_server_id" SET NOT NULL;

CREATE UNIQUE INDEX "dino_listings_asset_lock_id_key" ON "dino_listings"("asset_lock_id");
CREATE UNIQUE INDEX "dino_listings_asset_fingerprint_key" ON "dino_listings"("asset_fingerprint");
CREATE INDEX "dino_listings_origin_server_id_status_idx" ON "dino_listings"("origin_server_id", "status");
CREATE INDEX "dino_listings_delivery_server_id_delivery_status_idx" ON "dino_listings"("delivery_server_id", "delivery_status");
CREATE INDEX "dino_asset_locks_origin_server_id_status_idx" ON "dino_asset_locks"("origin_server_id", "status");

ALTER TABLE "dino_listings" ADD CONSTRAINT "dino_listings_origin_server_id_fkey"
  FOREIGN KEY ("origin_server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dino_listings" ADD CONSTRAINT "dino_listings_delivery_server_id_fkey"
  FOREIGN KEY ("delivery_server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
