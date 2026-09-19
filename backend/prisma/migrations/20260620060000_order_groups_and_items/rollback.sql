-- Safe only before new checkout traffic treats OrderGroup/OrderItem as authoritative.
ALTER TABLE "fulfillments" DROP CONSTRAINT IF EXISTS "fulfillments_order_item_id_fkey";
ALTER TABLE "fulfillments" DROP CONSTRAINT IF EXISTS "fulfillments_delivery_job_id_fkey";
ALTER TABLE "fulfillments" DROP CONSTRAINT IF EXISTS "fulfillments_purchase_owner_check";
DROP INDEX IF EXISTS "fulfillments_delivery_key_key";
CREATE INDEX IF NOT EXISTS "fulfillments_delivery_key_idx" ON "fulfillments"("delivery_key");
DROP INDEX IF EXISTS "fulfillments_delivery_job_id_key";
DROP INDEX IF EXISTS "fulfillments_order_item_id_key";
ALTER TABLE "fulfillments" DROP COLUMN IF EXISTS "order_item_id";
ALTER TABLE "fulfillments" ALTER COLUMN "order_id" SET NOT NULL;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_group_id_fkey";
DROP INDEX IF EXISTS "orders_order_group_id_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "order_group_id";

DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "order_groups";
