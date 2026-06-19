CREATE TYPE "PaymentIntentStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'expired', 'refunded');
CREATE TABLE "payment_packages" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL,
  "price_thb" DECIMAL(10,2) NOT NULL, "points" BIGINT NOT NULL,
  "bonus_points" BIGINT NOT NULL DEFAULT 0, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "payment_packages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payment_intents" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "package_id" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "provider_intent_id" TEXT, "reference" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL,
  "amount_thb" DECIMAL(10,2) NOT NULL, "points_amount" BIGINT NOT NULL,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'pending', "payment_url" TEXT, "qr_payload" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL, "completed_at" TIMESTAMP(3), "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "provider_event_id" TEXT NOT NULL,
  "payment_intent_id" TEXT, "signature" TEXT, "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received', "error" TEXT, "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_packages_slug_key" ON "payment_packages"("slug");
CREATE UNIQUE INDEX "payment_intents_provider_intent_id_key" ON "payment_intents"("provider_intent_id");
CREATE UNIQUE INDEX "payment_intents_reference_key" ON "payment_intents"("reference");
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");
CREATE INDEX "payment_intents_user_id_created_at_idx" ON "payment_intents"("user_id", "created_at");
CREATE INDEX "payment_intents_status_expires_at_idx" ON "payment_intents"("status", "expires_at");
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");
CREATE INDEX "payment_webhook_events_payment_intent_id_idx" ON "payment_webhook_events"("payment_intent_id");
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "payment_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "payment_packages" ("id","slug","name","price_thb","points","bonus_points","sort_order","updated_at") VALUES
('pkg-100','iris-100','100 Iris Coin',35,100,0,10,CURRENT_TIMESTAMP),
('pkg-300','iris-300','300 + 10 Iris Coin',99,300,10,20,CURRENT_TIMESTAMP),
('pkg-1000','iris-1000','1000 + 100 Iris Coin',299,1000,100,30,CURRENT_TIMESTAMP);
