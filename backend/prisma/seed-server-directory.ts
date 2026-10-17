// Idempotent server-directory seed (UI redesign 2026-10).
//
//   npm run seed:servers             # apply
//   npm run seed:servers -- --dry-run  # print the plan, write nothing
//
// Upserts the 4 directory clusters and 52 listed servers from
// prisma/seed-data/server-directory.json, keyed by Server.directoryKey = "<clusterKey>:<map>".
//
// SAFETY CONTRACT
//   * Never modifies or deactivates a plugin-connected server: any row that has a
//     ServerCredential (any status), a heartbeat, or plugin telemetry is skipped, and rows
//     without a directoryKey (e.g. the existing Server1/Server2) are never matched.
//   * Never creates, rotates or revokes ServerCredentials.
//   * New rows get a random unique apiKey, isActive=true and drainMode=true. drainMode keeps
//     checkout from routing purchases to a server that has no plugin yet; an operator clears
//     it only after issuing a credential and smoke-testing delivery.
//   * On re-run, existing directory rows only get their listing fields refreshed; isActive,
//     drainMode, apiKey, chat settings and admin-edited imageUrl are left alone.
//   * Status pages are written only if the setting does not exist yet.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import type * as SeedModule from '../src/services/serverDirectorySeed.js';

// Source checkouts run from src/; the production image only ships the compiled dist/.
async function loadSeedModule(): Promise<typeof SeedModule> {
  for (const candidate of ['../src/services/serverDirectorySeed.js', '../dist/services/serverDirectorySeed.js']) {
    try {
      return await import(candidate);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw err;
    }
  }
  throw new Error('serverDirectorySeed module not found in src/ or dist/');
}

const STATUS_PAGES_KEY = 'directory.statusPages';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(here, 'seed-data', 'server-directory.json');
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { parseServerDirectorySeed, planDirectorySeed } = await loadSeedModule();
  const plan = planDirectorySeed(parseServerDirectorySeed(JSON.parse(fs.readFileSync(dataPath, 'utf-8'))));

  console.log(`Server directory seed: ${plan.clusters.length} clusters, ${plan.servers.length} servers${dryRun ? ' (dry run)' : ''}`);
  for (const anomaly of plan.anomalies) console.warn(`  ! data anomaly (admin must confirm): ${anomaly}`);
  for (const server of plan.servers.filter((s) => s.flag)) {
    console.warn(`  ! ${server.directoryKey} flagged: ${server.flag}`);
  }

  if (dryRun) {
    for (const cluster of plan.clusters) console.log(`  cluster ${cluster.key} (${cluster.gameMode}) sort=${cluster.sortOrder}`);
    for (const server of plan.servers) {
      const addr = server.listing.connectHost ? `${server.listing.connectHost}:${server.listing.connectPort}` : '(no address)';
      console.log(`  server ${server.directoryKey} "${server.listing.displayName}" ${addr} available=${server.listing.isAvailable}`);
    }
    return;
  }

  const prisma = new PrismaClient();
  try {
    const stats = { clustersCreated: 0, clustersUpdated: 0, serversCreated: 0, serversUpdated: 0, serversSkipped: 0 };

    await prisma.$transaction(async (tx) => {
      const clusterIds = new Map<string, string>();
      for (const cluster of plan.clusters) {
        const existing = await tx.cluster.findUnique({ where: { key: cluster.key } });
        const row = await tx.cluster.upsert({
          where: { key: cluster.key },
          create: { ...cluster, isActive: true },
          // Keep admin-edited description/isActive; refresh the directory metadata.
          update: {
            name: cluster.name,
            gameMode: cluster.gameMode,
            rates: cluster.rates,
            isModded: cluster.isModded,
            sortOrder: cluster.sortOrder,
          },
        });
        clusterIds.set(cluster.key, row.id);
        if (existing) stats.clustersUpdated += 1;
        else stats.clustersCreated += 1;
      }

      for (const server of plan.servers) {
        const clusterId = clusterIds.get(server.clusterKey)!;
        const existing = await tx.server.findUnique({
          where: { directoryKey: server.directoryKey },
          include: { _count: { select: { credentials: true } } },
        });

        if (existing) {
          const pluginConnected =
            existing._count.credentials > 0 ||
            existing.lastHeartbeat !== null ||
            existing.pluginVersion !== null ||
            existing.pluginBuildHash !== null;
          if (pluginConnected) {
            stats.serversSkipped += 1;
            console.warn(`  - skip ${server.directoryKey}: server #${existing.id} is plugin-connected`);
            continue;
          }
          await tx.server.update({
            where: { id: existing.id },
            data: { ...server.listing, clusterId },
          });
          stats.serversUpdated += 1;
          continue;
        }

        await tx.server.create({
          data: {
            ...server.listing,
            directoryKey: server.directoryKey,
            name: server.name,
            clusterId,
            apiKey: crypto.randomBytes(32).toString('base64url'),
            isActive: true,
            drainMode: true,
          },
        });
        stats.serversCreated += 1;
      }

      if (plan.statusPages.length > 0) {
        const existing = await tx.siteSetting.findUnique({ where: { key: STATUS_PAGES_KEY } });
        if (!existing) {
          await tx.siteSetting.create({ data: { key: STATUS_PAGES_KEY, value: plan.statusPages } });
        }
      }
    }, { timeout: 120_000, isolationLevel: 'Serializable' });

    console.log('Done:', stats);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Server directory seed failed:', error);
  process.exit(1);
});
