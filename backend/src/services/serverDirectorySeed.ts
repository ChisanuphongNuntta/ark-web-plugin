// Pure planning for prisma/seed-server-directory.ts (UI redesign 2026-10).
// Kept DB-free so the mapping from seed-data/server-directory.json to cluster/server rows is
// type-checked with the app and unit-testable.
import { z } from 'zod';

const seedServerSchema = z.object({
  map: z.string().min(1),
  name: z.string().min(1),
  host: z.string().min(1).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  available: z.boolean().optional(),
  flag: z.string().optional(),
});

const seedGroupSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1),
  gameMode: z.enum(['PVE', 'PVE_MOD', 'PVPVE']),
  rates: z.string().min(1).nullable().optional(),
  modded: z.boolean().optional(),
  servers: z.array(seedServerSchema).min(1),
});

export const serverDirectorySeedSchema = z.object({
  _anomalies: z.array(z.string()).optional(),
  statusPages: z.array(z.string().url()).optional(),
  groups: z.array(seedGroupSchema).min(1),
});

export type ServerDirectorySeed = z.infer<typeof serverDirectorySeedSchema>;

export interface PlannedCluster {
  key: string;
  name: string;
  gameMode: 'PVE' | 'PVE_MOD' | 'PVPVE';
  rates: string | null;
  isModded: boolean;
  sortOrder: number;
}

// Fields the seed owns on a directory server row. It never sets apiKey on update and never
// touches drainMode / isActive of an existing row, credentials, or plugin telemetry.
export interface PlannedServerListing {
  map: string;
  displayName: string;
  gameMode: 'PVE' | 'PVE_MOD' | 'PVPVE';
  connectHost: string | null;
  connectPort: number | null;
  rates: string | null;
  isModded: boolean;
  isListed: true;
  isAvailable: boolean;
  sortOrder: number;
}

export interface PlannedServer {
  directoryKey: string;
  clusterKey: string;
  name: string;
  listing: PlannedServerListing;
  flag?: string;
}

export interface DirectorySeedPlan {
  clusters: PlannedCluster[];
  servers: PlannedServer[];
  statusPages: string[];
  anomalies: string[];
}

export function directoryKeyFor(clusterKey: string, map: string): string {
  return `${clusterKey}:${map}`;
}

export function parseServerDirectorySeed(json: unknown): ServerDirectorySeed {
  return serverDirectorySeedSchema.parse(json);
}

export function planDirectorySeed(seed: ServerDirectorySeed): DirectorySeedPlan {
  const clusters: PlannedCluster[] = [];
  const servers: PlannedServer[] = [];
  const seen = new Set<string>();

  seed.groups.forEach((group, groupIndex) => {
    const rates = group.rates ?? null;
    const isModded = Boolean(group.modded);
    clusters.push({
      key: group.key,
      name: group.name,
      gameMode: group.gameMode,
      rates,
      isModded,
      sortOrder: (groupIndex + 1) * 10,
    });

    group.servers.forEach((server, serverIndex) => {
      const directoryKey = directoryKeyFor(group.key, server.map);
      if (seen.has(directoryKey)) throw new Error(`Duplicate directory key in seed data: ${directoryKey}`);
      seen.add(directoryKey);

      const host = server.host ?? null;
      const port = server.port ?? null;
      servers.push({
        directoryKey,
        clusterKey: group.key,
        name: `${group.name} - ${server.name}`,
        flag: server.flag,
        listing: {
          map: server.map,
          displayName: server.name,
          gameMode: group.gameMode,
          // Only list a connect address when both parts exist.
          connectHost: host && port ? host : null,
          connectPort: host && port ? port : null,
          rates,
          isModded,
          isListed: true,
          // No address => cannot be joined, regardless of the flag.
          isAvailable: server.available !== false && Boolean(host && port),
          sortOrder: (serverIndex + 1) * 10,
        },
      });
    });
  });

  return {
    clusters,
    servers,
    statusPages: seed.statusPages ?? [],
    anomalies: seed._anomalies ?? [],
  };
}
