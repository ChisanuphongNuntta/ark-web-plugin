-- UI redesign 2026-10: public server directory, cluster grouping, site settings.
-- ADDITIVE ONLY: new enum, nullable/defaulted columns, new table, new indexes.
-- No existing column is altered or dropped; existing rows keep their behaviour
-- (game_mode defaults to PVE, is_listed/is_available default to true).

CREATE TYPE "GameMode" AS ENUM ('PVE', 'PVE_MOD', 'PVPVE');

ALTER TABLE "clusters"
  ADD COLUMN "game_mode" "GameMode",
  ADD COLUMN "description" TEXT,
  ADD COLUMN "rates" TEXT,
  ADD COLUMN "is_modded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "clusters_sort_order_idx" ON "clusters"("sort_order");

ALTER TABLE "servers"
  ADD COLUMN "directory_key" TEXT,
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "game_mode" "GameMode" NOT NULL DEFAULT 'PVE',
  ADD COLUMN "connect_host" TEXT,
  ADD COLUMN "connect_port" INTEGER,
  ADD COLUMN "rates" TEXT,
  ADD COLUMN "is_modded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_listed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "image_url" TEXT;

CREATE UNIQUE INDEX "servers_directory_key_key" ON "servers"("directory_key");
CREATE INDEX "servers_is_listed_sort_order_idx" ON "servers"("is_listed", "sort_order");

CREATE TABLE "site_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" TEXT,
  CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);
