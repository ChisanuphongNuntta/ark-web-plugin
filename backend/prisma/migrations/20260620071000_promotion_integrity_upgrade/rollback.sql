ALTER TABLE "voucher_codes" DROP CONSTRAINT IF EXISTS "voucher_codes_redeemed_limit_check";
ALTER TABLE "promotion_campaigns" DROP CONSTRAINT IF EXISTS "promotion_campaigns_redeemed_limit_check";
ALTER TABLE "promotion_campaigns" DROP CONSTRAINT IF EXISTS "promotion_campaigns_discount_value_semantics_check";

ALTER TABLE "voucher_codes"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "promotion_campaigns"
  ALTER COLUMN "updated_at" DROP DEFAULT;
