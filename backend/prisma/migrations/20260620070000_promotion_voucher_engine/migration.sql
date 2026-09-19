-- Enterprise promotion / voucher engine.
-- Additive only: checkout keeps immutable monetary/promotion snapshots for final pricing.

ALTER TABLE "checkout_sessions"
  ADD COLUMN IF NOT EXISTS "subtotal_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "promotion_snapshot" JSONB;

UPDATE "checkout_sessions"
SET "subtotal_amount" = "total_amount"
WHERE "subtotal_amount" = 0 AND "total_amount" > 0;

ALTER TABLE "checkout_sessions"
  ADD CONSTRAINT "checkout_sessions_promotion_amounts_check" CHECK (
    "subtotal_amount" >= 0
    AND "discount_amount" >= 0
    AND "total_amount" >= 0
    AND "discount_amount" <= "subtotal_amount"
    AND "total_amount" = "subtotal_amount" - "discount_amount"
  );

CREATE TABLE "promotion_campaigns" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'IC',
    "discount_type" TEXT NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "max_discount" BIGINT,
    "min_subtotal" BIGINT NOT NULL DEFAULT 0,
    "min_quantity" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "requires_voucher" BOOLEAN NOT NULL DEFAULT false,
    "usage_limit_total" INTEGER,
    "usage_limit_per_user" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "scopes" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_campaigns_status_check" CHECK ("status" IN ('draft','active','paused','archived')),
    CONSTRAINT "promotion_campaigns_currency_check" CHECK ("currency" = 'IC'),
    CONSTRAINT "promotion_campaigns_discount_type_check" CHECK ("discount_type" IN ('fixed_amount','percentage_bps')),
    CONSTRAINT "promotion_campaigns_amounts_check" CHECK (
      "discount_value" > 0 AND ("max_discount" IS NULL OR "max_discount" >= 0)
      AND "min_subtotal" >= 0 AND "min_quantity" >= 0
      AND ("usage_limit_total" IS NULL OR "usage_limit_total" > 0)
      AND ("usage_limit_per_user" IS NULL OR "usage_limit_per_user" > 0)
      AND "redeemed_count" >= 0
    ),
    CONSTRAINT "promotion_campaigns_schedule_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE TABLE "voucher_codes" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "usage_limit_total" INTEGER,
    "usage_limit_per_user" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voucher_codes_status_check" CHECK ("status" IN ('active','paused','expired','revoked','archived')),
    CONSTRAINT "voucher_codes_limits_check" CHECK (
      ("usage_limit_total" IS NULL OR "usage_limit_total" > 0)
      AND ("usage_limit_per_user" IS NULL OR "usage_limit_per_user" > 0)
      AND "redeemed_count" >= 0
    ),
    CONSTRAINT "voucher_codes_schedule_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE TABLE "promotion_redemptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "voucher_id" TEXT,
    "checkout_session_id" TEXT,
    "order_group_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'redeemed',
    "currency" TEXT NOT NULL DEFAULT 'IC',
    "discount_amount" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_redemptions_status_check" CHECK ("status" IN ('reserved','redeemed','released','voided','cancelled')),
    CONSTRAINT "promotion_redemptions_currency_check" CHECK ("currency" = 'IC'),
    CONSTRAINT "promotion_redemptions_discount_check" CHECK ("discount_amount" >= 0)
);

CREATE UNIQUE INDEX "promotion_campaigns_code_key" ON "promotion_campaigns"("code");
CREATE INDEX "promotion_campaigns_status_starts_at_ends_at_idx" ON "promotion_campaigns"("status", "starts_at", "ends_at");
CREATE INDEX "promotion_campaigns_priority_idx" ON "promotion_campaigns"("priority");

CREATE UNIQUE INDEX "voucher_codes_code_hash_key" ON "voucher_codes"("code_hash");
CREATE INDEX "voucher_codes_campaign_id_status_idx" ON "voucher_codes"("campaign_id", "status");

CREATE INDEX "promotion_redemptions_user_id_created_at_idx" ON "promotion_redemptions"("user_id", "created_at");
CREATE INDEX "promotion_redemptions_campaign_id_status_idx" ON "promotion_redemptions"("campaign_id", "status");
CREATE INDEX "promotion_redemptions_voucher_id_status_idx" ON "promotion_redemptions"("voucher_id", "status");
CREATE INDEX "promotion_redemptions_checkout_session_id_idx" ON "promotion_redemptions"("checkout_session_id");
CREATE INDEX "promotion_redemptions_order_group_id_idx" ON "promotion_redemptions"("order_group_id");

-- One campaign should only reserve/redeem once per checkout session.
CREATE UNIQUE INDEX "promotion_redemptions_checkout_campaign_active_key"
  ON "promotion_redemptions"("checkout_session_id", "campaign_id")
  WHERE "checkout_session_id" IS NOT NULL AND "status" IN ('reserved','redeemed');

ALTER TABLE "voucher_codes"
  ADD CONSTRAINT "voucher_codes_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "promotion_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "promotion_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "voucher_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_checkout_session_id_fkey"
  FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_order_group_id_fkey"
  FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
