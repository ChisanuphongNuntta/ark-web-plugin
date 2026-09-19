import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(root, 'prisma/migrations/20260620060000_order_groups_and_items/migration.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve(root, 'prisma/migrations/20260620060000_order_groups_and_items/rollback.sql'),
  'utf8',
);

describe('M4 OrderGroup / OrderItem additive migration', () => {
  it('models a purchase aggregate without removing the legacy Order path', () => {
    expect(schema).toContain('model OrderGroup {');
    expect(schema).toContain('model OrderItem {');
    expect(schema).toMatch(/legacyOrderId\s+String\?/);
    expect(schema).toMatch(/orderGroupId\s+String\?/);
    expect(schema).toMatch(/legacyOrders\s+Order\[\]/);
    expect(schema).toMatch(/orderGroup\s+OrderGroup\?/);
  });

  it('keeps immutable money and product delivery snapshots on each line', () => {
    for (const field of [
      'productName', 'itemBlueprint', 'unitPrice', 'subtotal', 'discount', 'total',
      'quantity', 'serverId', 'paidAt', 'queuedAt', 'deliveredAt', 'refundedAt',
    ]) {
      expect(schema).toContain(field);
    }
    expect(migration).toContain('CONSTRAINT "order_items_values_check"');
    expect(migration).toContain('"total" = "subtotal" - "discount"');
  });

  it('backfills one line per legacy order and groups checkout siblings together', () => {
    expect(migration).toContain("'checkout-group:' || o.\"checkout_session_id\"");
    expect(migration).toContain("'legacy-group:' || o.\"id\"");
    expect(migration).toContain("'legacy-item:' || \"id\"");
    expect(migration).toContain('ROW_NUMBER() OVER (PARTITION BY group_id');
    expect(migration).toContain('UPDATE "orders" o');
    expect(migration).toContain('UPDATE "fulfillments" f');
  });

  it('enforces receipt, line and delivery idempotency in the database', () => {
    expect(migration).toContain('order_groups_checkout_session_id_key');
    expect(migration).toContain('order_items_legacy_order_id_key');
    expect(migration).toContain('order_items_order_group_id_line_no_key');
    expect(migration).toContain('fulfillments_order_item_id_key');
    expect(migration).toContain('fulfillments_delivery_job_id_key');
    expect(migration).toContain('fulfillments_delivery_key_key');
    expect(migration).toContain('fulfillments_purchase_owner_check');
    expect(migration).toContain('fulfillments_delivery_job_id_fkey');
  });

  it('provides a rollback that restores the legacy non-unique delivery index', () => {
    expect(rollback).toContain('DROP TABLE IF EXISTS "order_items"');
    expect(rollback).toContain('DROP TABLE IF EXISTS "order_groups"');
    expect(rollback).toContain('CREATE INDEX IF NOT EXISTS "fulfillments_delivery_key_idx"');
    expect(rollback).toContain('ALTER TABLE "orders" DROP COLUMN IF EXISTS "order_group_id"');
  });
});
