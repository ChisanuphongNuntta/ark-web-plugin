CREATE TYPE "WalletAccountType" AS ENUM (
  'available', 'held', 'promotional', 'refundable',
  'system_issuance', 'platform_revenue', 'system_clearing'
);
CREATE TYPE "WalletAccountStatus" AS ENUM ('active', 'frozen', 'closed');

CREATE TABLE "wallet_accounts" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "user_id" TEXT,
  "type" "WalletAccountType" NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IC',
  "status" "WalletAccountStatus" NOT NULL DEFAULT 'active', "balance" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ledger_transactions" (
  "id" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL, "type" TEXT NOT NULL,
  "reference_type" TEXT, "reference_id" TEXT, "description" TEXT, "metadata" JSONB,
  "created_by" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ledger_entries" (
  "id" TEXT NOT NULL, "transaction_id" TEXT NOT NULL, "account_id" TEXT NOT NULL,
  "amount" BIGINT NOT NULL, "balance_after" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_accounts_key_key" ON "wallet_accounts"("key");
CREATE INDEX "wallet_accounts_user_id_type_idx" ON "wallet_accounts"("user_id", "type");
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");
CREATE INDEX "ledger_transactions_created_at_idx" ON "ledger_transactions"("created_at");
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "wallet_accounts" ("id", "key", "type", "currency", "balance", "version", "updated_at") VALUES
  ('system-issuance-ic', 'system:issuance:IC', 'system_issuance', 'IC', 0, 0, CURRENT_TIMESTAMP),
  ('platform-revenue-ic', 'system:revenue:IC', 'platform_revenue', 'IC', 0, 0, CURRENT_TIMESTAMP),
  ('system-clearing-ic', 'system:clearing:IC', 'system_clearing', 'IC', 0, 0, CURRENT_TIMESTAMP);
INSERT INTO "wallet_accounts" ("id", "key", "user_id", "type", "currency", "balance", "version", "updated_at")
SELECT 'wallet-' || "id" || '-available', 'user:' || "id" || ':available:IC', "id", 'available', 'IC', "points_balance", 0, CURRENT_TIMESTAMP FROM "users";
INSERT INTO "ledger_transactions" ("id", "idempotency_key", "type", "reference_type", "reference_id", "description")
SELECT 'opening-' || "id", 'wallet-opening:' || "id", 'opening_balance', 'user', "id", 'Migrated legacy points balance' FROM "users" WHERE "points_balance" <> 0;
INSERT INTO "ledger_entries" ("id", "transaction_id", "account_id", "amount", "balance_after")
SELECT 'opening-user-' || u."id", 'opening-' || u."id", 'wallet-' || u."id" || '-available', u."points_balance", u."points_balance" FROM "users" u WHERE u."points_balance" <> 0;
INSERT INTO "ledger_entries" ("id", "transaction_id", "account_id", "amount", "balance_after")
SELECT 'opening-system-' || u."id", 'opening-' || u."id", 'system-issuance-ic', -u."points_balance", -SUM(u."points_balance") OVER (ORDER BY u."id") FROM "users" u WHERE u."points_balance" <> 0;
UPDATE "wallet_accounts" SET "balance" = COALESCE((SELECT SUM(-u."points_balance") FROM "users" u), 0),
  "version" = (SELECT COUNT(*) FROM "users" WHERE "points_balance" <> 0), "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'system:issuance:IC';
