CREATE TABLE "clusters" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clusters_key_key" ON "clusters"("key");

ALTER TABLE "servers"
  ADD COLUMN "cluster_id" TEXT,
  ADD COLUMN "player_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plugin_version" TEXT,
  ADD COLUMN "plugin_build_hash" TEXT,
  ADD COLUMN "ark_api_version" TEXT,
  ADD COLUMN "protocol_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "drain_mode" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "servers_cluster_id_is_active_idx" ON "servers"("cluster_id", "is_active");

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_cluster_id_fkey"
  FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
