-- Rollback for M3 order state machine + fulfillment + delivery backoff/dead-letter.

-- 3. Drop Fulfillment.
ALTER TABLE "fulfillments" DROP CONSTRAINT IF EXISTS "fulfillments_order_id_fkey";
DROP TABLE IF EXISTS "fulfillments";

-- 2. Revert DeliveryJob backoff / dead-letter support.
ALTER TABLE "delivery_jobs" DROP COLUMN IF EXISTS "next_retry_at";
ALTER TABLE "delivery_jobs" DROP COLUMN IF EXISTS "max_attempts";

-- Recreate the enum without 'dead_letter'. Any rows in dead_letter must be reconciled to
-- 'failed' first or the cast will fail.
UPDATE "delivery_jobs" SET "status" = 'failed' WHERE "status" = 'dead_letter';
ALTER TYPE "DeliveryJobStatus" RENAME TO "DeliveryJobStatus_new";
CREATE TYPE "DeliveryJobStatus" AS ENUM ('pending', 'leased', 'completed', 'failed');
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" TYPE "DeliveryJobStatus" USING ("status"::text::"DeliveryJobStatus");
ALTER TABLE "delivery_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';
DROP TYPE "DeliveryJobStatus_new";

-- 1. Drop Order lifecycle columns.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "refunded_at";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "queued_at";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "paid_at";
