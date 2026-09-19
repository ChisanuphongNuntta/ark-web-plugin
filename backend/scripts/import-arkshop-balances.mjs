import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const paths = (process.env.ARKSHOP_SQLITE_PATHS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const steamHash = (steamId) =>
  crypto.createHash('sha256').update(`steam:${steamId}`).digest('hex');

async function main() {
  if (paths.length === 0) throw new Error('ARKSHOP_SQLITE_PATHS is required');

  // The same ArkShop.db is commonly copied to every map and may contain
  // duplicate rows internally. A cluster balance is therefore the maximum
  // observed balance per Steam ID, never the sum of rows or server copies.
  const balances = new Map();
  let rawRows = 0;
  for (const sqlitePath of paths) {
    const database = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const rows = database.prepare(
        'SELECT CAST(SteamId AS TEXT) AS steamId, Points AS points FROM Players',
      ).all();
      rawRows += rows.length;
      for (const row of rows) {
        const steamId = String(row.steamId || '');
        const points = Number(row.points);
        if (!/^\d{17}$/.test(steamId) || !Number.isSafeInteger(points) || points < 0) continue;
        balances.set(steamId, Math.max(balances.get(steamId) || 0, points));
      }
    } finally {
      database.close();
    }
  }

  const total = [...balances.values()].reduce((sum, value) => sum + value, 0);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', files: paths.length, rawRows, uniquePlayers: balances.size, totalPoints: total }));
  if (!apply) return;

  let created = 0;
  let updated = 0;
  for (const [steamId, points] of balances) {
    const externalIdHash = steamHash(steamId);
    const existing = await prisma.legacyBalanceClaim.findUnique({
      where: { provider_externalIdHash: { provider: 'arkshop-steam', externalIdHash } },
    });
    if (!existing) {
      await prisma.legacyBalanceClaim.create({
        data: {
          provider: 'arkshop-steam',
          externalIdHash,
          amount: BigInt(points),
          sourceSnapshot: { files: paths.length, dedupe: 'maximum-per-steam-id' },
        },
      });
      created += 1;
    } else if (existing.status === 'pending' && existing.amount !== BigInt(points)) {
      await prisma.legacyBalanceClaim.update({
        where: { id: existing.id },
        data: { amount: BigInt(points) },
      });
      updated += 1;
    }
  }
  console.log(JSON.stringify({ success: true, created, updated, unchanged: balances.size - created - updated }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
