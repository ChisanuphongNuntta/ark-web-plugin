// Unit tests for the pure server directory / live status helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/components/servers/serverFormat.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const f = await import(new URL('./serverFormat.ts', import.meta.url).href);
const m = await import(new URL('../../lib/realtime/statusMerge.ts', import.meta.url).href);

const group = (gameMode: string | null, key = 'pve-x10') => ({
  key,
  name: 'PvE X10 (No Mod)',
  gameMode,
  rates: 'X10',
  isModded: false,
  description: null,
  servers: [],
});

const server = {
  id: 101,
  name: 'PvE X10 (No Mod) - The Island',
  map: 'TheIsland',
  displayName: 'The Island',
  gameMode: 'PVE',
  cluster: { id: 'c1', key: 'pve-x10', name: 'PvE X10 (No Mod)' },
  connect: { host: 'ark.iris-th.cloud', port: 28014 },
  rates: 'X10',
  isModded: false,
  available: true,
  online: false,
  playerCount: 0,
  deliverable: false,
  sortOrder: 10,
};

test('formatDuration renders Thai hours and minutes', () => {
  assert.equal(f.formatDuration(4352), '1 ชม. 12 นาที');
  assert.equal(f.formatDuration(3600), '1 ชม.');
  assert.equal(f.formatDuration(125), '2 นาที');
  assert.equal(f.formatDuration(30), 'ไม่ถึง 1 นาที');
  assert.equal(f.formatDuration(-5), 'ไม่ถึง 1 นาที');
  assert.equal(f.formatDuration(Number.NaN), 'ไม่ถึง 1 นาที');
});

test('empty player names show ไม่ระบุชื่อ', () => {
  assert.equal(f.displayPlayerName(''), 'ไม่ระบุชื่อ');
  assert.equal(f.displayPlayerName('   '), 'ไม่ระบุชื่อ');
  assert.equal(f.displayPlayerName(null), 'ไม่ระบุชื่อ');
  assert.equal(f.displayPlayerName('Mars'), 'Mars');
});

test('mode tabs: URL values, group mapping, unknown -> other', () => {
  assert.equal(f.parseModeTab('pve-mod'), 'pve-mod');
  assert.equal(f.parseModeTab('PVE_MOD'), 'pve-mod');
  assert.equal(f.parseModeTab('PvPvE'), 'pvpve');
  assert.equal(f.parseModeTab('pre-aqua'), null);
  assert.equal(f.parseModeTab(null), null);
  assert.equal(f.modeOfGroup(group('PVE')), 'pve');
  assert.equal(f.modeOfGroup(group('PVE_MOD')), 'pve-mod');
  assert.equal(f.modeOfGroup(group('PVPVE')), 'pvpve');
  assert.equal(f.modeOfGroup(group(null, 'unassigned')), 'other');
});

test('steam join link uses host:queryPort', () => {
  assert.equal(f.steamConnectUrl(server), 'steam://connect/ark.iris-th.cloud:28014');
  assert.equal(f.steamConnectUrl({ connect: null }), null);
  assert.equal(f.connectAddress(server), 'ark.iris-th.cloud:28014');
});

test('live status overrides directory heartbeat fields', () => {
  const g = group('PVE');
  const offline = f.toServerView(server, g, undefined);
  assert.equal(offline.online, false);
  assert.equal(offline.players, 0);
  const live = f.toServerView(server, g, {
    id: 101,
    online: true,
    players: 6,
    maxPlayers: 66,
    version: '361.7',
    name: 'Iris Thailand - The Island - PvE X10 NO MOD - (v361.7)',
    source: 'a2s',
  });
  assert.equal(live.online, true);
  assert.equal(live.players, 6);
  assert.equal(live.maxPlayers, 66);
  assert.equal(f.epicSearchName(live), 'Iris Thailand - The Island - PvE X10 NO MOD');
  assert.equal(f.epicSearchName(offline), 'Iris Thailand - The Island');
  const truncated = f.toServerView(server, group('PVE'), {
    id: 3, online: true, players: 1, maxPlayers: 70, source: 'a2s',
    name: 'Iris Thailand - Crystal Isles - PvE X20 MOD +Additions - (v361',
  });
  assert.equal(f.epicSearchName(truncated), 'Iris Thailand - Crystal Isles - PvE X20 MOD +Additions');
});

test('placeholder player names are treated as unnamed', () => {
  assert.equal(f.isNamedPlayer('Mars'), true);
  assert.equal(f.isNamedPlayer(''), false);
  assert.equal(f.isNamedPlayer('  '), false);
  assert.equal(f.isNamedPlayer(f.UNKNOWN_PLAYER_NAME), false);
});

test('search matches map, cluster and address', () => {
  const view = f.toServerView(server, group('PVE'), undefined);
  assert.equal(f.matchesSearch(view, 'island'), true);
  assert.equal(f.matchesSearch(view, '28014'), true);
  assert.equal(f.matchesSearch(view, 'no mod'), true);
  assert.equal(f.matchesSearch(view, 'ragnarok'), false);
  assert.equal(f.matchesSearch(view, '  '), true);
});

test('status merge upserts partial events and keeps other servers', () => {
  const snapshot = m.mergeServerStatus(
    undefined,
    { at: 't1', servers: [{ id: 1, online: true, players: 3 }, { id: 2, online: false, players: 0 }] },
    true,
  );
  assert.deepEqual(Object.keys(snapshot.byId).sort(), ['1', '2']);
  const next = m.mergeServerStatus(snapshot, { at: 't2', servers: [{ id: 2, online: true, players: 5, maxPlayers: 70 }] });
  assert.equal(next.at, 't2');
  assert.equal(next.byId[1].players, 3);
  assert.equal(next.byId[2].online, true);
  assert.equal(next.byId[2].maxPlayers, 70);
  const replaced = m.mergeServerStatus(next, { servers: [{ id: 3, online: true, players: 1 }] }, true);
  assert.deepEqual(Object.keys(replaced.byId), ['3']);
});

test('status normaliser tolerates legacy field names and junk', () => {
  assert.deepEqual(m.normalizeLiveStatus({ id: '7', isOnline: 1, playerCount: '4' }), {
    id: 7,
    online: true,
    players: 4,
    maxPlayers: null,
    version: null,
    name: null,
    source: undefined,
    playersRev: null,
    map: null,
  });
  // Backend payload (contracts/realtime-2026-10.md): playersRev + map are carried through.
  assert.deepEqual(
    m.normalizeLiveStatus({ id: 3, online: true, players: 6, maxPlayers: 66, version: '361.7', map: 'TheIsland', source: 'a2s', playersRev: 'abc123' }),
    { id: 3, online: true, players: 6, maxPlayers: 66, version: '361.7', name: null, source: 'a2s', playersRev: 'abc123', map: 'TheIsland' },
  );
  assert.equal(m.normalizeLiveStatus(null), null);
  assert.equal(m.normalizeLiveStatus({ id: 'x' }), null);
});
