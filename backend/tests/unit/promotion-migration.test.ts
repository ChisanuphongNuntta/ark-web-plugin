import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(root, 'prisma/migrations/20260620070000_promotion_voucher_engine/migration.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve(root, 'prisma/migrations/20260620070000_promotion_voucher_engine/rollback.sql'),
  'utf8',
);
const integrityMigration = readFileSync(
  resolve(root, 'prisma/migrations/20260620071000_promotion_integrity_upgrade/migration.sql'),
  'utf8',
);

describe('M5 Promotion / Voucher engine migration', () => {
  it('keeps Prisma schema and migration aligned for checkout price snapshots', () => {
    expect(schema).toMatch(/subtotalAmount\s+BigInt/);
    expect(schema).toMatch(/discountAmount\s+BigInt/);
    expect(schema).toMatch(/promotionSnapshot\s+Json\?/);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "subtotal_amount" BIGINT NOT NULL DEFAULT 0');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "discount_amount" BIGINT NOT NULL DEFAULT 0');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "promotion_snapshot" JSONB');
    expect(migration).toContain('checkout_sessions_promotion_amounts_check');
  });

  it('creates campaign, voucher and redemption audit tables with enterprise guardrails', () => {
    expect(schema).toContain('model PromotionCampaign');
    expect(schema).toContain('model VoucherCode');
    expect(schema).toContain('model PromotionRedemption');
    expect(migration).toContain('"discount_type" IN (\'fixed_amount\',\'percentage_bps\')');
    expect(migration).toContain('promotion_redemptions_checkout_campaign_active_key');
    expect(migration).toContain('FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("id")');
  });

  it('blocks unsafe rollback after redeemed promotions or promotion-priced checkouts', () => {
    expect(rollback).toContain("WHERE \"status\" IN ('reserved','redeemed')");
    expect(rollback).toContain('active promotion_redemptions exist');
    expect(rollback).toContain('checkout_sessions contain promotion snapshots');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "promotion_snapshot"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "discount_amount"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "subtotal_amount"');
  });

  it('adds additive promotion integrity constraints for unsafe percentage and oversold limits', () => {
    expect(integrityMigration).toContain('promotion_campaigns_discount_value_semantics_check');
    expect(integrityMigration).toContain('"discount_type" = \'percentage_bps\' AND "discount_value" > 0 AND "discount_value" <= 10000');
    expect(integrityMigration).toContain('promotion_campaigns_redeemed_limit_check');
    expect(integrityMigration).toContain('voucher_codes_redeemed_limit_check');
  });
});
