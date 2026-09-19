-- M4 additive commerce aggregate: OrderGroup -> OrderItem -> Fulfillment.
-- Legacy `orders` remains readable/writable during dual-write and is backfilled 1:1 to
-- OrderItem. Checkout-created legacy rows sharing a checkout_session_id share one group.

CREATE TABLE "order_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "checkout_session_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "currency" TEXT NOT NULL DEFAULT 'IC',
    "subtotal" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "promotion_snapshot" JSONB,
    "paid_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_groups_amounts_check" CHECK (
      "subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0
      AND "discount" <= "subtotal" AND "total" = "subtotal" - "discount"
    )
);

CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_group_id" TEXT NOT NULL,
    "legacy_order_id" TEXT,
    "line_no" INTEGER NOT NULL,
    "product_id" INTEGER,
    "server_id" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "item_blueprint" TEXT NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 0,
    "is_blueprint" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "paid_at" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_values_check" CHECK (
      "line_no" > 0 AND "quantity" > 0 AND "unit_price" >= 0
      AND "subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0
      AND "discount" <= "subtotal" AND "total" = "subtotal" - "discount"
    )
);

ALTER TABLE "orders" ADD COLUMN "order_group_id" TEXT;
ALTER TABLE "fulfillments" ADD COLUMN "order_item_id" TEXT;
ALTER TABLE "fulfillments" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_purchase_owner_check"
  CHECK ("order_id" IS NOT NULL OR "order_item_id" IS NOT NULL);

CREATE UNIQUE INDEX "order_groups_checkout_session_id_key" ON "order_groups"("checkout_session_id");
CREATE INDEX "order_groups_user_id_created_at_idx" ON "order_groups"("user_id", "created_at");
CREATE INDEX "order_groups_user_id_status_idx" ON "order_groups"("user_id", "status");
CREATE UNIQUE INDEX "order_items_legacy_order_id_key" ON "order_items"("legacy_order_id");
CREATE UNIQUE INDEX "order_items_order_group_id_line_no_key" ON "order_items"("order_group_id", "line_no");
CREATE INDEX "order_items_order_group_id_status_idx" ON "order_items"("order_group_id", "status");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");
CREATE INDEX "order_items_server_id_status_idx" ON "order_items"("server_id", "status");
CREATE INDEX "orders_order_group_id_idx" ON "orders"("order_group_id");

ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_checkout_session_id_fkey"
  FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_group_id_fkey"
  FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_legacy_order_id_fkey"
  FOREIGN KEY ("legacy_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_group_id_fkey"
  FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deterministic IDs make the data migration restart-auditable. No UUID extension is needed.
WITH grouped AS (
  SELECT
    CASE WHEN o."checkout_session_id" IS NOT NULL
      THEN 'checkout-group:' || o."checkout_session_id"
      ELSE 'legacy-group:' || o."id"
    END AS group_id,
    o."user_id",
    o."checkout_session_id",
    SUM(o."total_price"::BIGINT) AS subtotal,
    CASE
      WHEN BOOL_AND(o."status" = 'refunded') THEN 'refunded'
      WHEN BOOL_AND(o."status" = 'delivered') THEN 'delivered'
      WHEN BOOL_OR(o."status" = 'failed') THEN 'failed'
      WHEN BOOL_OR(o."status" IN ('queued', 'delivering')) THEN 'fulfilling'
      WHEN BOOL_OR(o."status" = 'paid') THEN 'paid'
      ELSE 'pending_payment'
    END AS group_status,
    MIN(o."paid_at") AS paid_at,
    CASE WHEN BOOL_AND(o."status" = 'delivered') THEN MAX(o."delivered_at") END AS completed_at,
    CASE WHEN BOOL_AND(o."status" = 'refunded') THEN MAX(o."refunded_at") END AS refunded_at,
    MIN(o."created_at") AS created_at,
    MAX(o."updated_at") AS updated_at
  FROM "orders" o
  GROUP BY group_id, o."user_id", o."checkout_session_id"
)
INSERT INTO "order_groups" (
  "id", "user_id", "checkout_session_id", "status", "currency", "subtotal",
  "discount", "total", "paid_at", "completed_at", "refunded_at", "created_at", "updated_at"
)
SELECT group_id, "user_id", "checkout_session_id", group_status, 'IC', subtotal,
       0, subtotal, paid_at, completed_at, refunded_at, created_at, updated_at
FROM grouped;

WITH source AS (
  SELECT
    o.*,
    p."name" AS product_name,
    p."item_blueprint",
    p."quality",
    p."is_blueprint",
    CASE WHEN o."checkout_session_id" IS NOT NULL
      THEN 'checkout-group:' || o."checkout_session_id"
      ELSE 'legacy-group:' || o."id"
    END AS group_id
  FROM "orders" o
  JOIN "products" p ON p."id" = o."product_id"
), numbered AS (
  SELECT source.*, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY "created_at", "id")::INTEGER AS line_no
  FROM source
)
INSERT INTO "order_items" (
  "id", "order_group_id", "legacy_order_id", "line_no", "product_id", "server_id",
  "product_name", "item_blueprint", "quality", "is_blueprint", "quantity", "unit_price",
  "subtotal", "discount", "total", "status", "paid_at", "queued_at", "delivered_at",
  "failed_at", "refunded_at", "created_at", "updated_at"
)
SELECT
  'legacy-item:' || "id", group_id, "id", line_no, "product_id", "server_id",
  product_name, "item_blueprint", "quality", "is_blueprint", "quantity",
  ("total_price"::BIGINT / "quantity"), "total_price"::BIGINT, 0, "total_price"::BIGINT,
  CASE WHEN "status" = 'pending' THEN 'pending_payment' ELSE "status" END,
  "paid_at", "queued_at", "delivered_at",
  CASE WHEN "status" = 'failed' THEN "updated_at" END, "refunded_at", "created_at", "updated_at"
FROM numbered;

UPDATE "orders" o
SET "order_group_id" = oi."order_group_id"
FROM "order_items" oi
WHERE oi."legacy_order_id" = o."id";

UPDATE "fulfillments" f
SET "order_item_id" = oi."id"
FROM "order_items" oi
WHERE oi."legacy_order_id" = f."order_id";

-- Delivery idempotency was implicit in the legacy implementation (all three values were
-- the Order id). Promote it to database-enforced invariants after backfill.
CREATE UNIQUE INDEX "fulfillments_order_item_id_key" ON "fulfillments"("order_item_id");
CREATE UNIQUE INDEX "fulfillments_delivery_job_id_key" ON "fulfillments"("delivery_job_id");
DROP INDEX "fulfillments_delivery_key_idx";
CREATE UNIQUE INDEX "fulfillments_delivery_key_key" ON "fulfillments"("delivery_key");
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_delivery_job_id_fkey"
  FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
