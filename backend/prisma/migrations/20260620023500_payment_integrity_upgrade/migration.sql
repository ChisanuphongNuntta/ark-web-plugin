DROP INDEX IF EXISTS "payment_intents_idempotency_key_key";
DROP INDEX IF EXISTS "payment_intents_provider_intent_id_key";
CREATE UNIQUE INDEX "payment_intents_user_id_idempotency_key_key" ON "payment_intents"("user_id", "idempotency_key");
CREATE UNIQUE INDEX "payment_intents_provider_provider_intent_id_key" ON "payment_intents"("provider", "provider_intent_id");
ALTER TABLE "payment_webhook_events" ADD COLUMN "payload_hash" TEXT;
UPDATE "payment_webhook_events" SET "payload_hash" = 'legacy-md5:' || md5("payload"::text) WHERE "payload_hash" IS NULL;
ALTER TABLE "payment_webhook_events" ALTER COLUMN "payload_hash" SET NOT NULL;
