CREATE TABLE "game_purchase_quotes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "server_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" INTEGER NOT NULL,
  "total_price" INTEGER NOT NULL,
  "product_snapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "order_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_purchase_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_purchase_quotes_order_id_key" ON "game_purchase_quotes"("order_id");
CREATE INDEX "game_purchase_quotes_user_id_status_expires_at_idx" ON "game_purchase_quotes"("user_id", "status", "expires_at");
CREATE INDEX "game_purchase_quotes_server_id_status_idx" ON "game_purchase_quotes"("server_id", "status");
ALTER TABLE "game_purchase_quotes" ADD CONSTRAINT "game_purchase_quotes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_purchase_quotes" ADD CONSTRAINT "game_purchase_quotes_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_purchase_quotes" ADD CONSTRAINT "game_purchase_quotes_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
