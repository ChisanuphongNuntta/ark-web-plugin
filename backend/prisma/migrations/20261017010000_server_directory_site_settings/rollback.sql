-- Rollback for 20261017010000_server_directory_site_settings (manual use only).
DROP TABLE IF EXISTS "site_settings";

DROP INDEX IF EXISTS "servers_is_listed_sort_order_idx";
DROP INDEX IF EXISTS "servers_directory_key_key";
ALTER TABLE "servers"
  DROP COLUMN IF EXISTS "image_url",
  DROP COLUMN IF EXISTS "sort_order",
  DROP COLUMN IF EXISTS "is_available",
  DROP COLUMN IF EXISTS "is_listed",
  DROP COLUMN IF EXISTS "is_modded",
  DROP COLUMN IF EXISTS "rates",
  DROP COLUMN IF EXISTS "connect_port",
  DROP COLUMN IF EXISTS "connect_host",
  DROP COLUMN IF EXISTS "game_mode",
  DROP COLUMN IF EXISTS "display_name",
  DROP COLUMN IF EXISTS "directory_key";

DROP INDEX IF EXISTS "clusters_sort_order_idx";
ALTER TABLE "clusters"
  DROP COLUMN IF EXISTS "sort_order",
  DROP COLUMN IF EXISTS "is_modded",
  DROP COLUMN IF EXISTS "rates",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "game_mode";

DROP TYPE IF EXISTS "GameMode";
