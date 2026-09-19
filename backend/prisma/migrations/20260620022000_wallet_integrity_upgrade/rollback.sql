DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "wallet_accounts" WHERE "type" IN ('held','promotional','refundable') AND "balance" <> 0) THEN
    RAISE EXCEPTION 'rollback blocked: non-available user funds must be settled or exported first';
  END IF;
END $$;
UPDATE "users" u SET "points_balance" = w."balance" FROM "wallet_accounts" w
WHERE w."user_id" = u."id" AND w."type" = 'available' AND w."currency" = 'IC';
DROP TRIGGER IF EXISTS ledger_entries_immutable ON "ledger_entries";
DROP TRIGGER IF EXISTS ledger_transactions_posting_guard ON "ledger_transactions";
DROP FUNCTION IF EXISTS iris_guard_ledger_entry_mutation();
DROP FUNCTION IF EXISTS iris_validate_ledger_posting();
ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_nonzero_check";
ALTER TABLE "wallet_accounts" DROP CONSTRAINT IF EXISTS "wallet_accounts_owner_type_currency_check";
DROP INDEX IF EXISTS "wallet_accounts_user_id_type_currency_key";
DROP INDEX IF EXISTS "wallet_accounts_system_type_currency_key";
DROP INDEX IF EXISTS "ledger_transactions_posted_at_id_idx";
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "posted_at";
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "request_hash";
