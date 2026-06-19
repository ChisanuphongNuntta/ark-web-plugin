-- M2 Hardening: scoped, rotatable server/plugin signing credentials.
-- ADDITIVE + REVERSIBLE: creates a new table only. No existing column/data is altered or
-- dropped, so legacy X-API-Key and the transitional signed flow keep working unchanged.
-- Down migration (manual): DROP TABLE "server_credentials";

-- CreateTable
CREATE TABLE "server_credentials" (
    "id" TEXT NOT NULL,
    "server_id" INTEGER NOT NULL,
    "key_id" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "server_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "server_credentials_key_id_key" ON "server_credentials"("key_id");

-- CreateIndex
CREATE INDEX "server_credentials_server_id_status_idx" ON "server_credentials"("server_id", "status");

-- AddForeignKey
ALTER TABLE "server_credentials" ADD CONSTRAINT "server_credentials_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
