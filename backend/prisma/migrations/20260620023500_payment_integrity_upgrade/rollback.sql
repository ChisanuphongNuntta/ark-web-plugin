DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "payment_intents") OR EXISTS (SELECT 1 FROM "payment_webhook_events") THEN
    RAISE EXCEPTION 'rollback blocked: payment intents and webhook audit records must be exported and reconciled first';
  END IF;
END $$;
ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "payload_hash";
DROP INDEX IF EXISTS "payment_intents_provider_provider_intent_id_key";
DROP INDEX IF EXISTS "payment_intents_user_id_idempotency_key_key";
CREATE UNIQUE INDEX "payment_intents_provider_intent_id_key" ON "payment_intents"("provider_intent_id");
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");
