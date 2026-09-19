ALTER TABLE "order_items"
  DROP COLUMN "delivery_payload",
  DROP COLUMN "product_type",
  ALTER COLUMN "item_blueprint" SET NOT NULL;

DROP INDEX "products_product_type_is_active_idx";
DROP INDEX "products_external_key_key";

ALTER TABLE "products"
  DROP COLUMN "required_capabilities",
  DROP COLUMN "delivery_payload",
  DROP COLUMN "external_key",
  DROP COLUMN "product_type",
  ALTER COLUMN "item_blueprint" SET NOT NULL;

DROP TYPE "ProductType";
