-- Prisma db push cannot express these ledger invariants or seed system accounts.
-- Apply to a fresh baseline before recording migration history.
INSERT INTO wallet_accounts (id, key, type, currency, balance, version, updated_at) VALUES
  ('system-issuance-ic', 'system:issuance:IC', 'system_issuance', 'IC', 0, 0, CURRENT_TIMESTAMP),
  ('platform-revenue-ic', 'system:revenue:IC', 'platform_revenue', 'IC', 0, 0, CURRENT_TIMESTAMP),
  ('system-clearing-ic', 'system:clearing:IC', 'system_clearing', 'IC', 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_accounts_user_id_type_currency_key ON wallet_accounts(user_id,type,currency) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_accounts_system_type_currency_key ON wallet_accounts(type,currency) WHERE user_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wallet_accounts_owner_type_currency_check') THEN
    ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_accounts_owner_type_currency_check CHECK (
      currency='IC' AND ((user_id IS NOT NULL AND type IN ('available','held','promotional','refundable') AND balance>=0)
      OR (user_id IS NULL AND ((type='system_issuance' AND key='system:issuance:IC')
      OR (type='platform_revenue' AND key='system:revenue:IC') OR (type='system_clearing' AND key='system:clearing:IC')))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ledger_entries_nonzero_check') THEN
    ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_nonzero_check CHECK(amount<>0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION iris_guard_ledger_entry_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (SELECT 1 FROM ledger_transactions WHERE id=OLD.transaction_id AND posted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'posted ledger entries are immutable';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (SELECT 1 FROM ledger_transactions WHERE id=NEW.transaction_id AND posted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot add entries to a posted ledger transaction';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION iris_validate_ledger_posting() RETURNS trigger AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'ledger transaction must be posted by guarded update'; END IF;
  IF TG_OP='UPDATE' AND OLD.posted_at IS NOT NULL THEN RAISE EXCEPTION 'posted ledger transactions are immutable'; END IF;
  IF TG_OP='UPDATE' AND NEW.posted_at IS NOT NULL AND (
    (SELECT COUNT(*) FROM ledger_entries WHERE transaction_id=NEW.id)<2
    OR (SELECT COALESCE(SUM(amount),0) FROM ledger_entries WHERE transaction_id=NEW.id)<>0
    OR (SELECT COUNT(DISTINCT a.currency) FROM ledger_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.transaction_id=NEW.id)<>1
  ) THEN RAISE EXCEPTION 'ledger transaction is not balanced in one currency'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ledger_entries_immutable') THEN
    CREATE TRIGGER ledger_entries_immutable BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION iris_guard_ledger_entry_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ledger_transactions_posting_guard') THEN
    CREATE TRIGGER ledger_transactions_posting_guard BEFORE INSERT OR UPDATE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION iris_validate_ledger_posting();
  END IF;
END $$;
