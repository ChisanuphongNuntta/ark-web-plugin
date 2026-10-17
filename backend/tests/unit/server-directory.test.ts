import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import prisma from '../../src/config/database.js';
import serverController from '../../src/controllers/server.controller.js';
import {
  groupDirectory,
  humanizeMapName,
  isServerDeliverable,
  toServerSummary,
  UNASSIGNED_GROUP_KEY,
} from '../../src/services/serverDirectory.service.js';
import { HEARTBEAT_ONLINE_WINDOW_MS } from '../../src/utils/serverStatus.js';
import {
  parseServerDirectorySeed,
  planDirectorySeed,
} from '../../src/services/serverDirectorySeed.js';

const db = prisma as any;
db.siteSetting ??= { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), create: vi.fn() };

const now = new Date('2026-10-17T05:00:00.000Z');
const fresh = new Date(now.getTime() - 30_000);
const stale = new Date(now.getTime() - HEARTBEAT_ONLINE_WINDOW_MS - 1000);

const clusterA = { id: 'c-a', key: 'pve-x10', name: 'PvE X10', isActive: true, gameMode: 'PVE', rates: 'X10', isModded: false, description: null, sortOrder: 10 };
const clusterB = { id: 'c-b', key: 'pvpve-x10', name: 'PvPvE X10', isActive: true, gameMode: 'PVPVE', rates: 'X10', isModded: true, description: 'Mod', sortOrder: 5 };
const clusterOff = { id: 'c-off', key: 'old', name: 'Old', isActive: false, gameMode: 'PVE', rates: null, isModded: false, description: null, sortOrder: 0 };

const server = (overrides: Record<string, unknown>) => ({
  id: 1,
  name: 'srv',
  map: 'TheIsland',
  displayName: null,
  gameMode: 'PVE',
  connectHost: 'ark.iris-th.cloud',
  connectPort: 28014,
  rates: null,
  isModded: false,
  isListed: true,
  isAvailable: true,
  isActive: true,
  drainMode: false,
  lastHeartbeat: null,
  playerCount: 0,
  sortOrder: 0,
  cluster: null,
  credentials: [],
  ...overrides,
});

describe('deliverable computation', () => {
  it('requires active, not draining, and an active credential', () => {
    expect(isServerDeliverable({ isActive: true, drainMode: false, credentials: [{ id: 'k' }] })).toBe(true);
    expect(isServerDeliverable({ isActive: true, drainMode: false, credentials: [] })).toBe(false);
    expect(isServerDeliverable({ isActive: true, drainMode: true, credentials: [{ id: 'k' }] })).toBe(false);
    expect(isServerDeliverable({ isActive: false, drainMode: false, credentials: [{ id: 'k' }] })).toBe(false);
    expect(isServerDeliverable({ isActive: true, drainMode: false, credentials: undefined })).toBe(false);
  });
});

describe('toServerSummary', () => {
  it('maps every ServerSummary field and derives online/deliverable', () => {
    const summary = toServerSummary(server({
      id: 7,
      name: 'PvE X10 - The Island',
      displayName: 'The Island',
      cluster: clusterA,
      lastHeartbeat: fresh,
      playerCount: 12,
      credentials: [{ id: 'cred-1' }],
      sortOrder: 10,
    }) as any, now);
    expect(summary).toEqual({
      id: 7,
      name: 'PvE X10 - The Island',
      map: 'TheIsland',
      displayName: 'The Island',
      gameMode: 'PVE',
      cluster: { id: 'c-a', key: 'pve-x10', name: 'PvE X10' },
      connect: { host: 'ark.iris-th.cloud', port: 28014 },
      rates: 'X10', // inherited from the cluster
      isModded: false,
      available: true,
      online: true,
      playerCount: 12,
      deliverable: true,
      sortOrder: 10,
    });
  });

  it('nulls connect when host or port is missing and humanizes the map when no displayName', () => {
    const summary = toServerSummary(server({ map: 'ScorchedEarth', connectHost: null, connectPort: null, lastHeartbeat: stale, isAvailable: false }) as any, now);
    expect(summary.connect).toBeNull();
    expect(summary.displayName).toBe('Scorched Earth');
    expect(summary.online).toBe(false);
    expect(summary.available).toBe(false);
    expect(summary.deliverable).toBe(false);
  });

  it('humanizes ARK map ids', () => {
    expect(humanizeMapName('TheIsland')).toBe('The Island');
    expect(humanizeMapName('Genesis2')).toBe('Genesis 2');
    expect(humanizeMapName(null)).toBeNull();
  });
});

describe('groupDirectory', () => {
  it('orders groups by cluster.sortOrder then servers by sortOrder, filtering unlisted/inactive', () => {
    const groups = groupDirectory([
      server({ id: 1, map: 'Ragnarok', cluster: clusterA, sortOrder: 30 }),
      server({ id: 2, map: 'TheIsland', cluster: clusterA, sortOrder: 10 }),
      server({ id: 3, map: 'TheCenter', cluster: clusterA, sortOrder: 20, isListed: false }),
      server({ id: 4, map: 'TheIsland', cluster: clusterB, sortOrder: 10, isModded: true }),
      server({ id: 5, map: 'Valguero', cluster: clusterOff, sortOrder: 10 }),
      server({ id: 6, map: 'Fjordur', cluster: null, sortOrder: 0 }),
      server({ id: 8, map: 'Aberration', cluster: clusterA, sortOrder: 10, isActive: false }),
      server({ id: 9, map: 'Extinction', cluster: clusterA, sortOrder: 10 }),
    ] as any, now);

    expect(groups.map((g) => g.key)).toEqual(['pvpve-x10', 'pve-x10', UNASSIGNED_GROUP_KEY]);
    expect(groups[0]).toMatchObject({ name: 'PvPvE X10', gameMode: 'PVPVE', rates: 'X10', isModded: true, description: 'Mod' });
    // sortOrder ties broken by id; unlisted (#3), inactive server (#8) and inactive cluster (#5) dropped
    expect(groups[1].servers.map((s) => s.id)).toEqual([2, 9, 1]);
    expect(groups[2]).toMatchObject({ gameMode: null, rates: null });
    expect(groups[2].servers.map((s) => s.id)).toEqual([6]);
  });

  it('omits the unassigned group when every server has a cluster', () => {
    const groups = groupDirectory([server({ id: 1, cluster: clusterA })] as any, now);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('pve-x10');
  });
});

describe('GET /servers and GET /servers/directory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('?deliverable=true filters in the query and keeps legacy fields', async () => {
    db.server.findMany.mockResolvedValueOnce([
      { ...server({ id: 1, cluster: clusterA, credentials: [{ id: 'k' }], lastHeartbeat: new Date() }), chatTag: '[ISL]', chatColor: null, chatIcon: null, capabilities: ['delivery.dino.v2'] },
    ]);
    const res: any = { json: vi.fn() };
    await serverController.getServers({ query: { deliverable: 'true' } } as any, res, vi.fn());

    const args = db.server.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true, drainMode: false, credentials: { some: { status: 'active' } } });
    expect(args.select.apiKey).toBeUndefined();
    expect(args.select.webhookUrl).toBeUndefined();
    expect(args.select.credentials.select).toEqual({ id: true });

    const [item] = res.json.mock.calls[0][0].servers;
    expect(item).toMatchObject({ id: 1, deliverable: true, isOnline: true, online: true, supportsDinoDelivery: true, chatTag: '[ISL]' });
    expect(item.credentials).toBeUndefined();
    expect(item.apiKey).toBeUndefined();
  });

  it('defensively drops non-deliverable rows when ?deliverable=true', async () => {
    db.server.findMany.mockResolvedValueOnce([
      { ...server({ id: 2, drainMode: true, credentials: [{ id: 'k' }] }), capabilities: [] },
    ]);
    const res: any = { json: vi.fn() };
    await serverController.getServers({ query: { deliverable: 'true' } } as any, res, vi.fn());
    expect(res.json.mock.calls[0][0].servers).toEqual([]);
  });

  it('directory returns groups + status pages (default when unset)', async () => {
    db.server.findMany.mockResolvedValueOnce([server({ id: 1, cluster: clusterA })]);
    db.siteSetting.findUnique.mockResolvedValueOnce(null);
    const res: any = { json: vi.fn() };
    const next = vi.fn();
    await serverController.getDirectory({} as any, res, next);

    expect(next).not.toHaveBeenCalled();
    const args = db.server.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isListed: true, isActive: true });
    const body = res.json.mock.calls[0][0];
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].servers[0]).toMatchObject({ id: 1, deliverable: false });
    expect(body.statusPages).toHaveLength(3);
  });
});

describe('server-directory seed plan', () => {
  const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../prisma/seed-data/server-directory.json'), 'utf-8'));
  const plan = planDirectorySeed(parseServerDirectorySeed(json));

  it('plans 3 clusters and 39 uniquely keyed servers (Pre-Aqua removed by owner)', () => {
    expect(plan.clusters.map((c) => c.key)).toEqual(['pve-x10', 'pve-mod-x10', 'pvpve-x10']);
    expect(plan.clusters.map((c) => c.gameMode)).toEqual(['PVE', 'PVE_MOD', 'PVPVE']);
    expect(plan.servers).toHaveLength(39);
    expect(new Set(plan.servers.map((s) => s.directoryKey)).size).toBe(39);
    expect(plan.statusPages).toHaveLength(3);
  });

  it('uses human display names and marks address-less / not-available maps unavailable', () => {
    const island = plan.servers.find((s) => s.directoryKey === 'pve-x10:TheIsland')!;
    expect(island.listing).toMatchObject({ displayName: 'The Island', connectHost: 'ark.iris-th.cloud', connectPort: 28014, isAvailable: true, isListed: true });
    const synthetic = planDirectorySeed(parseServerDirectorySeed({
      groups: [{
        key: 'test-group', name: 'Test', gameMode: 'PVPVE', rates: 'X10', modded: true,
        servers: [
          { map: 'ScorchedEarth', name: 'Scorched Earth', host: null, port: null, available: false },
          { map: 'Valguero', name: 'Valguero', host: 'h.example', port: 1, available: false },
        ],
      }],
    }));
    const scorched = synthetic.servers.find((s) => s.directoryKey === 'test-group:ScorchedEarth')!;
    expect(scorched.listing).toMatchObject({ connectHost: null, connectPort: null, isAvailable: false });
    const valguero = synthetic.servers.find((s) => s.directoryKey === 'test-group:Valguero')!;
    expect(valguero.listing.isAvailable).toBe(false);
    expect(plan.servers.find((s) => s.directoryKey === 'pvpve-x10:Genesis2')!.flag).toBe('duplicate-port-needs-confirmation');
  });

  it('never plans credentials, apiKeys or drain/activation changes for listing updates', () => {
    for (const s of plan.servers) {
      expect(Object.keys(s.listing)).not.toEqual(expect.arrayContaining(['apiKey']));
      expect(s.listing).not.toHaveProperty('apiKey');
      expect(s.listing).not.toHaveProperty('drainMode');
      expect(s.listing).not.toHaveProperty('isActive');
      expect(s.listing).not.toHaveProperty('credentials');
    }
  });
});
