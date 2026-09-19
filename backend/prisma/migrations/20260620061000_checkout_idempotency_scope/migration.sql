DROP INDEX IF EXISTS "checkout_sessions_idempotency_key_key";
CREATE UNIQUE INDEX "checkout_sessions_user_id_idempotency_key_key"
  ON "checkout_sessions"("user_id", "idempotency_key");
