-- M3: Order state machine (§8), Fulfillment + delivery orchestrator backoff/dead-letter (§18)

-- 1. Order lifecycle timestamps + updated_at.
ALTER TABLE "orders" ADD COLUMN     "paid_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN     "queued_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN     "refunded_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. DeliveryJob backoff / dead-letter support.
--    Add the 'dead_letter' enum value by recreating the type. This avoids the PostgreSQL
--    restriction that a value added with `ALTER TYPE ... ADD VALUE` cannot be used in the
--    same transaction (Prisma runs each migration in a transaction), and is fully portable.
ALTER TYPE "DeliveryJobStatus" RENAME TO "DeliveryJobStatus_old";
CREATE TYPE "DeliveryJobStatus" AS ENUM ('pending', 'leased', 'completed', 'failed', 'dead_letter');
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" TYPE "DeliveryJobStatus" USING ("status"::text::"DeliveryJobStatus");
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';
DROP TYPE "DeliveryJobStatus_old";

ALTER TABLE "delivery_jobs" ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "delivery_jobs" ADD COLUMN     "next_retry_at" TIMESTAMP(3);

-- 3. Fulfillment: one per Order, bridges Order -> DeliveryJob and records the delivery timeline.
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_job_id" TEXT,
    "server_id" INTEGER NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "delivery_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "receipt_id" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_order_id_key" ON "fulfillments"("order_id");
CREATE INDEX "fulfillments_server_id_status_idx" ON "fulfillments"("server_id", "status");
CREATE INDEX "fulfillments_delivery_key_idx" ON "fulfillments"("delivery_key");

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
