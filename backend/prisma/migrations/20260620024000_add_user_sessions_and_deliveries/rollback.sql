-- RemoveForeignKey
ALTER TABLE "delivery_jobs" DROP CONSTRAINT "delivery_jobs_server_id_fkey";
ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "dino_asset_locks";
DROP TABLE IF EXISTS "delivery_jobs";
DROP TABLE IF EXISTS "user_sessions";

-- DropEnum
DROP TYPE IF EXISTS "DeliveryJobStatus";
