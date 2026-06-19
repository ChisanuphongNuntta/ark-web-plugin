-- CreateEnum
CREATE TYPE "DeliveryJobStatus" AS ENUM ('pending', 'leased', 'completed', 'failed');

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "server_id" INTEGER NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "DeliveryJobStatus" NOT NULL DEFAULT 'pending',
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receipt_id" TEXT,
    "error" TEXT,
    "game_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dino_asset_locks" (
    "id" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "seller_steam_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "asset_fingerprint" TEXT,
    "price" INTEGER,
    "listing_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dino_asset_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions"("token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "delivery_jobs_server_id_status_idx" ON "delivery_jobs"("server_id", "status");

-- CreateIndex
CREATE INDEX "delivery_jobs_player_steam_id_status_idx" ON "delivery_jobs"("player_steam_id", "status");

-- CreateIndex
CREATE INDEX "dino_asset_locks_seller_steam_id_idx" ON "dino_asset_locks"("seller_steam_id");

-- CreateIndex
CREATE INDEX "dino_asset_locks_expires_at_status_idx" ON "dino_asset_locks"("expires_at", "status");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
