-- VIP 2026-10 (backend/contracts/vip-2026-10.md): VIP packages sold for real money, one
-- membership row per grant, and PaymentIntent support for VIP purchases.
-- ADDITIVE: two new tables, one new nullable column, new indexes/constraints, seed rows.
-- The only change to an existing column is payment_intents.package_id DROP NOT NULL (a VIP
-- intent has no IC package); every existing row keeps its package_id, and the CHECK below
-- requires exactly one of package_id / vip_package_id, so no existing row is affected.
-- NOT applied automatically from the host: deploy with `prisma migrate deploy` inside the
-- Docker network after a DB backup.

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "vip_package_id" TEXT,
ALTER COLUMN "package_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "vip_packages" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permission_group" TEXT NOT NULL DEFAULT 'VIP',
    "tier_rank" INTEGER NOT NULL DEFAULT 1,
    "frame_style" TEXT NOT NULL DEFAULT 'vip-gold',
    "badge_label" TEXT NOT NULL DEFAULT 'VIP',
    "price_thb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "duration_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vip_packages_price_check" CHECK ("price_thb" >= 0),
    CONSTRAINT "vip_packages_duration_check" CHECK ("duration_days" IS NULL OR "duration_days" > 0)
);

-- CreateTable
CREATE TABLE "vip_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "permission_group" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'purchase',
    "payment_intent_id" TEXT,
    "granted_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "reason" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vip_memberships_status_check" CHECK ("status" IN ('active', 'expired', 'revoked')),
    CONSTRAINT "vip_memberships_source_check" CHECK ("source" IN ('purchase', 'admin', 'legacy')),
    CONSTRAINT "vip_memberships_period_check" CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_packages_key_key" ON "vip_packages"("key");
CREATE INDEX "vip_packages_is_active_sort_order_idx" ON "vip_packages"("is_active", "sort_order");
CREATE UNIQUE INDEX "vip_memberships_payment_intent_id_key" ON "vip_memberships"("payment_intent_id");
CREATE INDEX "vip_memberships_user_id_status_idx" ON "vip_memberships"("user_id", "status");
CREATE INDEX "vip_memberships_status_expires_at_idx" ON "vip_memberships"("status", "expires_at");
CREATE INDEX "vip_memberships_permission_group_status_idx" ON "vip_memberships"("permission_group", "status");
CREATE INDEX "vip_memberships_package_id_status_idx" ON "vip_memberships"("package_id", "status");
CREATE INDEX "payment_intents_vip_package_id_idx" ON "payment_intents"("vip_package_id");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_vip_package_id_fkey" FOREIGN KEY ("vip_package_id") REFERENCES "vip_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vip_memberships" ADD CONSTRAINT "vip_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vip_memberships" ADD CONSTRAINT "vip_memberships_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "vip_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vip_memberships" ADD CONSTRAINT "vip_memberships_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A payment intent buys EITHER an IC package OR a VIP package, and a VIP intent never
-- carries IC (defence in depth for "VIP is never paid out as IC").
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_kind_check" CHECK (
    ("package_id" IS NULL) <> ("vip_package_id" IS NULL)
    AND ("vip_package_id" IS NULL OR "points_amount" = 0)
);

-- Seed: one VIP package, INACTIVE with price 0 until the owner sets a price and activates it.
INSERT INTO "vip_packages" ("id", "key", "name", "description", "permission_group", "tier_rank", "frame_style", "badge_label", "price_thb", "duration_days", "is_active", "sort_order")
VALUES ('vippkg_vip_30d', 'vip-30d', 'VIP 30 วัน', 'สิทธิ์ VIP ในเกม 30 วัน (คำสั่ง VIP ตามระบบเดิม)', 'VIP', 1, 'vip-gold', 'VIP', 0, 30, false, 0)
ON CONFLICT ("key") DO NOTHING;

-- Seed: in-game chat rank for the VIP Permissions group (reuses the Chat Ranks system).
-- Skipped when an admin already created a global rank for the group.
INSERT INTO "chat_ranks" ("name", "group_key", "color", "icon", "priority", "server_id", "is_active", "created_at", "updated_at")
SELECT 'VIP', 'VIP', '#D4AF37', NULL, 50, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "chat_ranks" WHERE "group_key" = 'VIP' AND "server_id" IS NULL);
