-- Rollback is only safe before promotion/voucher traffic is enabled.
-- Refuse to drop financial audit rows that have already been redeemed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "promotion_redemptions" WHERE "status" IN ('reserved','redeemed')) THEN
    RAISE EXCEPTION 'Cannot rollback promotion engine: active promotion_redemptions exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "checkout_sessions"
    WHERE "discount_amount" <> 0 OR "promotion_snapshot" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot rollback promotion engine: checkout_sessions contain promotion snapshots';
  END IF;
END $$;

ALTER TABLE "promotion_redemptions" DROP CONSTRAINT IF EXISTS "promotion_redemptions_order_group_id_fkey";
ALTER TABLE "promotion_redemptions" DROP CONSTRAINT IF EXISTS "promotion_redemptions_checkout_session_id_fkey";
ALTER TABLE "promotion_redemptions" DROP CONSTRAINT IF EXISTS "promotion_redemptions_voucher_id_fkey";
ALTER TABLE "promotion_redemptions" DROP CONSTRAINT IF EXISTS "promotion_redemptions_campaign_id_fkey";
ALTER TABLE "promotion_redemptions" DROP CONSTRAINT IF EXISTS "promotion_redemptions_user_id_fkey";
ALTER TABLE "voucher_codes" DROP CONSTRAINT IF EXISTS "voucher_codes_campaign_id_fkey";

DROP INDEX IF EXISTS "promotion_redemptions_checkout_campaign_active_key";
DROP TABLE IF EXISTS "promotion_redemptions";
DROP TABLE IF EXISTS "voucher_codes";
DROP TABLE IF EXISTS "promotion_campaigns";

ALTER TABLE "checkout_sessions" DROP CONSTRAINT IF EXISTS "checkout_sessions_promotion_amounts_check";
ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "promotion_snapshot";
ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "discount_amount";
ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "subtotal_amount";
