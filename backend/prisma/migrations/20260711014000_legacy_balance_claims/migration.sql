CREATE TABLE "legacy_balance_claims" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_id_hash" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IC',
  "amount" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claimed_by_user_id" TEXT,
  "claimed_at" TIMESTAMP(3),
  "source_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legacy_balance_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legacy_balance_claims_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "legacy_balance_claims_status_check" CHECK ("status" IN ('pending','claimed','void')),
  CONSTRAINT "legacy_balance_claims_currency_check" CHECK ("currency" = 'IC')
);

CREATE UNIQUE INDEX "legacy_balance_claims_provider_external_id_hash_key"
  ON "legacy_balance_claims"("provider", "external_id_hash");
CREATE INDEX "legacy_balance_claims_status_created_at_idx"
  ON "legacy_balance_claims"("status", "created_at");
CREATE INDEX "legacy_balance_claims_claimed_by_user_id_idx"
  ON "legacy_balance_claims"("claimed_by_user_id");

ALTER TABLE "legacy_balance_claims"
  ADD CONSTRAINT "legacy_balance_claims_claimed_by_user_id_fkey"
  FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
