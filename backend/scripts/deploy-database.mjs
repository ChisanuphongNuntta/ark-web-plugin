import { PrismaClient } from '@prisma/client';
import { readdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(root, 'prisma', 'migrations');
const prisma = new PrismaClient();

function runPrisma(args) {
  const isBun = Boolean(process.versions.bun);
  const executable = isBun
    ? 'bunx'
    : process.platform === 'win32'
      ? 'npx.cmd'
      : 'npx';
  const result = spawnSync(executable, ['prisma', ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} exited with status ${result.status}`);
  }
}

async function relationState() {
  const [state] = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('public._prisma_migrations')::text AS "migrationTable",
      to_regclass('public.users')::text AS "usersTable",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
      ) AS "applicationTableCount"
  `);
  return state;
}

async function listMigrations() {
  return (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{8,}_[a-z0-9_]+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function recordMigrationHistory(migrations) {
  const baselinePrisma = new PrismaClient();
  await baselinePrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);

  const recorded = await baselinePrisma.$queryRawUnsafe(
    'SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL',
  );
  const recordedNames = new Set(recorded.map((row) => row.migration_name));

  for (const migration of migrations) {
    if (recordedNames.has(migration)) continue;
    const sql = await readFile(path.join(migrationsDirectory, migration, 'migration.sql'));
    const checksum = createHash('sha256').update(sql).digest('hex');
    const now = new Date();
    await baselinePrisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
       VALUES ($1, $2, $3, $4, $3, 0)`,
      randomUUID(),
      checksum,
      now,
      migration,
    );
  }

  await baselinePrisma.$disconnect();
  console.log(`${migrations.length} migration history entries are now recorded.`);
}

async function bootstrapEmptyDatabase() {
  console.log('Empty PostgreSQL database detected; creating the current schema baseline.');
  runPrisma(['db', 'push', '--skip-generate']);
  runPrisma(['db', 'execute', '--file', 'prisma/bootstrap-wallet.sql', '--schema', 'prisma/schema.prisma']);
  await recordMigrationHistory(await listMigrations());
  runPrisma(['migrate', 'deploy']);
}

async function baselineVerifiedLegacyDatabase() {
  const through = process.env.LEGACY_BASELINE_THROUGH;
  const confirmation = process.env.CONFIRM_LEGACY_BASELINE;
  const backupHash = process.env.LEGACY_BASELINE_BACKUP_SHA256 || '';

  if (!through || confirmation !== 'I_HAVE_A_VERIFIED_BACKUP' || !/^[a-f0-9]{64}$/i.test(backupHash)) {
    throw new Error(
      'Refusing automatic migration: this database contains application tables but has no Prisma migration history. Back it up, verify the schema diff, and provide the explicit legacy-baseline controls.',
    );
  }

  const requiredTables = [
    'users',
    'wallet_accounts',
    'payment_intents',
    'user_sessions',
    'cart_items',
    'server_credentials',
    'fulfillments',
    'order_groups',
    'checkout_sessions',
  ];
  const relations = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    requiredTables,
  );
  const present = new Set(relations.map((row) => row.tablename));
  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Legacy baseline precondition failed; missing required tables: ${missing.join(', ')}`);
  }

  const migrations = await listMigrations();
  const throughIndex = migrations.indexOf(through);
  if (throughIndex < 0) throw new Error(`Unknown LEGACY_BASELINE_THROUGH migration: ${through}`);

  await prisma.$disconnect();
  await recordMigrationHistory(migrations.slice(0, throughIndex + 1));
  console.log(`Verified legacy baseline recorded through ${through}; applying later migrations.`);
  runPrisma(['migrate', 'deploy']);
}

async function main() {
  const state = await relationState();
  const isEmpty = Number(state.applicationTableCount) === 0 && !state.usersTable;

  if (!state.migrationTable && isEmpty) {
    await prisma.$disconnect();
    await bootstrapEmptyDatabase();
    return;
  }

  if (!state.migrationTable) {
    await baselineVerifiedLegacyDatabase();
    return;
  }

  await prisma.$disconnect();
  runPrisma(['migrate', 'deploy']);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
