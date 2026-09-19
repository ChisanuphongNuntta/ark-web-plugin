-- Additive hardening for promotion/voucher integrity.
-- Keep this separate from 20260620070000 to avoid editing an already-applied migration.

ALTER TABLE "promotion_campaigns"
  ADD CONSTRAINT "promotion_campaigns_discount_value_semantics_check" CHECK (
    ("discount_type" = 'fixed_amount' AND "discount_value" > 0)
    OR ("discount_type" = 'percentage_bps' AND "discount_value" > 0 AND "discount_value" <= 10000)
  );

ALTER TABLE "promotion_campaigns"
  ADD CONSTRAINT "promotion_campaigns_redeemed_limit_check" CHECK (
    "usage_limit_total" IS NULL OR "redeemed_count" <= "usage_limit_total"
  );

ALTER TABLE "voucher_codes"
  ADD CONSTRAINT "voucher_codes_redeemed_limit_check" CHECK (
    "usage_limit_total" IS NULL OR "redeemed_count" <= "usage_limit_total"
  );

ALTER TABLE "promotion_campaigns"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "voucher_codes"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
