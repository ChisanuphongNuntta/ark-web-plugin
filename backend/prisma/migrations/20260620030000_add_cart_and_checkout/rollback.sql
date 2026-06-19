-- RemoveForeignKey
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "checkout_sessions_user_id_fkey";
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_server_id_fkey";
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_product_id_fkey";
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_cart_id_fkey";
ALTER TABLE "carts" DROP CONSTRAINT "carts_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "checkout_sessions";
DROP TABLE IF EXISTS "cart_items";
DROP TABLE IF EXISTS "carts";

-- Remove checkout_session_id from orders
ALTER TABLE "orders" DROP COLUMN IF EXISTS "checkout_session_id";
