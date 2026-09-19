ALTER TABLE "servers" DROP CONSTRAINT "servers_cluster_id_fkey";
DROP INDEX "servers_cluster_id_is_active_idx";
ALTER TABLE "servers"
  DROP COLUMN "drain_mode",
  DROP COLUMN "capabilities",
  DROP COLUMN "protocol_version",
  DROP COLUMN "ark_api_version",
  DROP COLUMN "plugin_build_hash",
  DROP COLUMN "plugin_version",
  DROP COLUMN "player_count",
  DROP COLUMN "cluster_id";
DROP TABLE "clusters";
