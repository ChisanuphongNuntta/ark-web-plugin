-- Destructive rollback. Export ledger tables before running in any environment with new transactions.
DROP TABLE IF EXISTS "ledger_entries";
DROP TABLE IF EXISTS "ledger_transactions";
DROP TABLE IF EXISTS "wallet_accounts";
DROP TYPE IF EXISTS "WalletAccountStatus";
DROP TYPE IF EXISTS "WalletAccountType";
