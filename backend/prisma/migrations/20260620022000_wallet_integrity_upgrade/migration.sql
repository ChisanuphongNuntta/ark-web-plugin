ALTER TABLE "ledger_transactions" ADD COLUMN "request_hash" TEXT;
ALTER TABLE "ledger_transactions" ADD COLUMN "posted_at" TIMESTAMP(3);
UPDATE "ledger_transactions" SET "request_hash" = 'legacy:' || "id" WHERE "request_hash" IS NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT t."id" FROM "ledger_transactions" t
    LEFT JOIN "ledger_entries" e ON e."transaction_id" = t."id"
    LEFT JOIN "wallet_accounts" a ON a."id" = e."account_id"
    GROUP BY t."id" HAVING COUNT(e."id") < 2 OR COALESCE(SUM(e."amount"), 0) <> 0 OR COUNT(DISTINCT a."currency") <> 1
  ) THEN RAISE EXCEPTION 'wallet integrity upgrade blocked: invalid legacy ledger transaction'; END IF;
END $$;

UPDATE "ledger_transactions" SET "posted_at" = "created_at";
ALTER TABLE "ledger_transactions" ALTER COLUMN "request_hash" SET NOT NULL;
CREATE INDEX "ledger_transactions_posted_at_id_idx" ON "ledger_transactions"("posted_at", "id");
CREATE UNIQUE INDEX "wallet_accounts_user_id_type_currency_key" ON "wallet_accounts"("user_id", "type", "currency") WHERE "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "wallet_accounts_system_type_currency_key" ON "wallet_accounts"("type", "currency") WHERE "user_id" IS NULL;
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_owner_type_currency_check" CHECK (
  "currency" = 'IC' AND (("user_id" IS NOT NULL AND "type" IN ('available','held','promotional','refundable') AND "balance" >= 0)
  OR ("user_id" IS NULL AND (("type" = 'system_issuance' AND "key" = 'system:issuance:IC')
    OR ("type" = 'platform_revenue' AND "key" = 'system:revenue:IC')
    OR ("type" = 'system_clearing' AND "key" = 'system:clearing:IC'))))
);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_nonzero_check" CHECK ("amount" <> 0);

CREATE FUNCTION iris_guard_ledger_entry_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (SELECT 1 FROM "ledger_transactions" WHERE "id" = OLD."transaction_id" AND "posted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'posted ledger entries are immutable';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (SELECT 1 FROM "ledger_transactions" WHERE "id" = NEW."transaction_id" AND "posted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot add entries to a posted ledger transaction';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_immutable BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION iris_guard_ledger_entry_mutation();

CREATE FUNCTION iris_validate_ledger_posting() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."posted_at" IS NOT NULL THEN RAISE EXCEPTION 'ledger transaction must be posted by guarded update'; END IF;
  IF TG_OP = 'UPDATE' AND OLD."posted_at" IS NOT NULL THEN RAISE EXCEPTION 'posted ledger transactions are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW."posted_at" IS NOT NULL AND (
    (SELECT COUNT(*) FROM "ledger_entries" WHERE "transaction_id" = NEW."id") < 2
    OR (SELECT COALESCE(SUM(e."amount"),0) FROM "ledger_entries" e WHERE e."transaction_id" = NEW."id") <> 0
    OR (SELECT COUNT(DISTINCT a."currency") FROM "ledger_entries" e JOIN "wallet_accounts" a ON a."id" = e."account_id" WHERE e."transaction_id" = NEW."id") <> 1
  ) THEN RAISE EXCEPTION 'ledger transaction is not balanced in one currency'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_transactions_posting_guard BEFORE INSERT OR UPDATE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION iris_validate_ledger_posting();
