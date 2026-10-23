-- Rollback for 20261023010000_vip_memberships (manual use only, after a DB backup).
-- Refuses to run while VIP payment intents exist (they cannot get a package_id back).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "payment_intents" WHERE "vip_package_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'VIP payment intents exist; export and resolve them before rolling back';
  END IF;
END $$;

ALTER TABLE "payment_intents" DROP CONSTRAINT IF EXISTS "payment_intents_kind_check";
ALTER TABLE "payment_intents" DROP CONSTRAINT IF EXISTS "payment_intents_vip_package_id_fkey";
DROP INDEX IF EXISTS "payment_intents_vip_package_id_idx";
DROP TABLE IF EXISTS "vip_memberships";
DROP TABLE IF EXISTS "vip_packages";
ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "vip_package_id";
ALTER TABLE "payment_intents" ALTER COLUMN "package_id" SET NOT NULL;
-- The seeded chat rank (group_key 'VIP') is left in place: it may have been edited by admins.
