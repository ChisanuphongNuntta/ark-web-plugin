-- Add User API Key fields
ALTER TABLE "users" ADD COLUMN "api_key" TEXT;
ALTER TABLE "users" ADD COLUMN "api_key_ip" TEXT;
ALTER TABLE "users" ADD COLUMN "api_key_created_at" TIMESTAMP(3);

-- Add unique constraint for apiKey
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");
