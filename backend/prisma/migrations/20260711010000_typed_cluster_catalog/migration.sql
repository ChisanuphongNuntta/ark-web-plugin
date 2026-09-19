CREATE TYPE "ProductType" AS ENUM ('item', 'dino', 'engram', 'kit', 'bundle', 'command', 'entitlement');

ALTER TABLE "products"
  ADD COLUMN "product_type" "ProductType" NOT NULL DEFAULT 'item',
  ADD COLUMN "external_key" TEXT,
  ADD COLUMN "delivery_payload" JSONB,
  ADD COLUMN "required_capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "item_blueprint" DROP NOT NULL;

CREATE UNIQUE INDEX "products_external_key_key" ON "products"("external_key");
CREATE INDEX "products_product_type_is_active_idx" ON "products"("product_type", "is_active");

ALTER TABLE "order_items"
  ADD COLUMN "product_type" "ProductType" NOT NULL DEFAULT 'item',
  ADD COLUMN "delivery_payload" JSONB,
  ALTER COLUMN "item_blueprint" DROP NOT NULL;
