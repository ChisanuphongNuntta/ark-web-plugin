DO $$ BEGIN
  IF EXISTS (
    SELECT "idempotency_key" FROM "checkout_sessions"
    GROUP BY "idempotency_key" HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'rollback blocked: duplicate checkout idempotency keys exist across users'; END IF;
END $$;
DROP INDEX IF EXISTS "checkout_sessions_user_id_idempotency_key_key";
CREATE UNIQUE INDEX "checkout_sessions_idempotency_key_key" ON "checkout_sessions"("idempotency_key");
