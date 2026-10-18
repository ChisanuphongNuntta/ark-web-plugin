import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/redis.js', () => {
  const client = { get: vi.fn(), set: vi.fn(), eval: vi.fn() };
  return { default: client, redis: client };
});
vi.mock('../../src/realtime/emit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/realtime/emit.js')>();
  return { ...actual, emitServersStatus: vi.fn() };
});

import redis from '../../src/config/redis.js';
import prisma from '../../src/config/database.js';
import { emitServersStatus } from '../../src/realtime/emit.js';
import {
  A2SError,
  SplitAssembler,
  buildInfoRequest,
  buildPlayerRequest,
  parseArkVersion,
  parseInfoResponse,
  parsePlayerResponse,
  queryA2S,
  readChallenge,
  type A2SQueryResult,
  type UdpSocketLike,
} from '../../src/services/a2s.js';
import {
  A2S_MISS_THRESHOLD,
  ANONYMOUS_PLAYER_NAME,
  ServerQueryService,
  SERVER_STATUS_KEY,
  cleanSessionName,
  computeEntry,
  hasVisibleChange,
  mapWithConcurrency,
  parseTargetOverrides,
  playersRevFor,
  resolveTarget,
  toPublicSnapshot,
  type ServerRow,
  type StoredSnapshot,
} from '../../src/services/serverQuery.service.js';
import { mergeLiveStatus, toServerSummary } from '../../src/services/serverDirectory.service.js';

const db = prisma as any;
const r = redis as any;
const hex = (value: string) => Buffer.from(value, 'hex');

// Captured 2026-10-18 from the local plugin server (151.141.23.59:1001, query port).
const CAPTURED_INFO_SERVER1 = hex(
  'ffffffff491148656c6c6f20776f726c642049736c616e6420303120583130202d2028763336312e37290054686549736c616e64' +
  '0061726b5f737572766976616c5f65766f6c7665640041524b3a20537572766976616c2045766f6c76656400000000370064770001' +
  '312e302e302e3000b1e7030810dbd5f7ca40012c4f574e494e4749443a39303239353135383334313034363238302c4f574e494e47' +
  '4e414d453a39303239353135383334313034363238302c4e554d4f50454e505542434f4e4e3a35352c503250414444523a39303239' +
  '353135383334313034363238302c503250504f52543a3939392c4c45474143595f693a3000fe47050000000000',
);
// Captured from ark.iris-th.cloud:28014 (public directory server): 4/66 players.
const CAPTURED_INFO_28014 = hex(
  'ffffffff49114972697320546861696c616e64202d205468652049736c616e64202d2050764520583130204e4f204d4f44202d2028' +
  '763336312e37290054686549736c616e640061726b5f737572766976616c5f65766f6c7665640041524b3a20537572766976616c20' +
  '45766f6c76656400000004420064770001312e302e302e3000b1261a0cb01923f2ca40012c4f574e494e4749443a3930323935313333' +
  '3836373139323333322c4f574e494e474e414d453a39303239353133333836373139323333322c4e554d4f50454e505542434f4e4e3a' +
  '36332c503250414444523a39303239353133333836373139323333322c503250504f52543a363639342c4c45474143595f693a3000fe' +
  '47050000000000',
);
const CAPTURED_CHALLENGE = hex('ffffffff41674d1888');
const CAPTURED_EMPTY_PLAYERS = hex('ffffffff4400');

function playerPacket(players: Array<{ name: string; score?: number; duration: number }>): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xff, 0xff, 0xff, 0x44, players.length])];
  players.forEach((player, index) => {
    const score = Buffer.alloc(4);
    score.writeInt32LE(player.score ?? 0);
    const duration = Buffer.alloc(4);
    duration.writeFloatLE(player.duration);
    parts.push(Buffer.from([index]), Buffer.from(`${player.name}\0`, 'utf8'), score, duration);
  });
  return Buffer.concat(parts);
}

function splitPackets(payload: Buffer, chunk: number, id = 0x1234): Buffer[] {
  const total = Math.ceil(payload.length / chunk);
  return Array.from({ length: total }, (_, number) => {
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0xfffffffe, 0);
    head.writeUInt32LE(id, 4);
    head.writeUInt8(total, 8);
    head.writeUInt8(number, 9);
    head.writeUInt16LE(1248, 10);
    return Buffer.concat([head, payload.subarray(number * chunk, (number + 1) * chunk)]);
  });
}

// Scripted UDP socket: `respond(packet)` returns the datagrams to deliver for each send.
function mockSocketFactory(respond: (packet: Buffer) => Buffer[]) {
  const sent: Buffer[] = [];
  let closed = 0;
  const factory = () => {
    const handlers: Record<string, Array<(arg: any) => void>> = {};
    const socket: UdpSocketLike = {
      on(event: string, listener: (arg: any) => void) {
        (handlers[event] ||= []).push(listener);
        return socket;
      },
      send(msg: Buffer, _port: number, _address: string, callback?: (error: Error | null) => void) {
        sent.push(Buffer.from(msg));
        callback?.(null);
        for (const reply of respond(msg)) setImmediate(() => handlers.message?.forEach((h) => h(reply)));
      },
      close() {
        closed += 1;
      },
    } as UdpSocketLike;
    return socket;
  };
  return { factory, sent, closedCount: () => closed };
}

describe('A2S packet parsing', () => {
  it('parses a captured A2S_INFO response from the local plugin server', () => {
    const info = parseInfoResponse(CAPTURED_INFO_SERVER1);
    expect(info.name).toBe('Hello world Island 01 X10 - (v361.7)');
    expect(info.map).toBe('TheIsland');
    expect(info.folder).toBe('ark_survival_evolved');
    expect(info.players).toBe(0);
    expect(info.maxPlayers).toBe(55);
    expect(info.version).toBe('1.0.0.0');
    expect(info.gamePort).toBe(999);
    expect(parseArkVersion(info.name, info.version)).toBe('361.7');
  });

  it('reads the ARK build from 63-byte truncated names and ignores the 1.0.0.0 version field', () => {
    // Real names captured 2026-10-18 from ark.iris-th.cloud:28032 and :28028.
    expect(parseArkVersion('Iris Thailand - Genesis Part 2 - PvE X20 MOD +Additions - (v361', '1.0.0.0')).toBe('361');
    expect(parseArkVersion('Iris Thailand - Crystal Isles - PvE X20 MOD +Additions - (v361.', '1.0.0.0')).toBe('361');
    expect(parseArkVersion('Some server', '1.0.0.0')).toBeNull();
    expect(parseArkVersion('Some server', '2.1')).toBe('2.1');
  });

  it('parses a captured A2S_INFO response from a directory server', () => {
    const info = parseInfoResponse(CAPTURED_INFO_28014);
    expect(info.name).toBe('Iris Thailand - The Island - PvE X10 NO MOD - (v361.7)');
    expect(info.players).toBe(4);
    expect(info.maxPlayers).toBe(66);
  });

  it('recognises the S2C challenge and builds challenge-carrying requests', () => {
    const challenge = readChallenge(CAPTURED_CHALLENGE);
    expect(challenge?.toString('hex')).toBe('674d1888');
    expect(readChallenge(CAPTURED_INFO_SERVER1)).toBeNull();
    expect(buildInfoRequest(challenge!).subarray(-4).toString('hex')).toBe('674d1888');
    expect(buildPlayerRequest().toString('hex')).toBe('ffffffff55ffffffff');
    expect(buildPlayerRequest(challenge!).toString('hex')).toBe('ffffffff55674d1888');
  });

  it('parses A2S_PLAYER including empty names and tolerates a truncated tail', () => {
    expect(parsePlayerResponse(CAPTURED_EMPTY_PLAYERS)).toEqual([]);
    const packet = playerPacket([
      { name: 'Survivor', duration: 125.7 },
      { name: '', duration: 3 },
      { name: 'ผู้เล่นไทย', score: 5, duration: 3600.2 },
    ]);
    const players = parsePlayerResponse(packet);
    expect(players.map((p) => p.name)).toEqual(['Survivor', '', 'ผู้เล่นไทย']);
    expect(players.map((p) => p.durationSec)).toEqual([125, 3, 3600]);
    // cut the last entry in half: the complete entries survive
    expect(parsePlayerResponse(packet.subarray(0, packet.length - 3)).map((p) => p.name)).toEqual(['Survivor', '']);
  });

  it('rejects wrong response types and garbage', () => {
    expect(() => parseInfoResponse(CAPTURED_EMPTY_PLAYERS)).toThrow(A2SError);
    expect(() => parsePlayerResponse(CAPTURED_INFO_SERVER1)).toThrow(A2SError);
    expect(() => parseInfoResponse(Buffer.from([1, 2, 3]))).toThrow(A2SError);
  });

  it('reassembles split (multi-packet) responses delivered out of order', () => {
    const payload = playerPacket(Array.from({ length: 70 }, (_, i) => ({ name: `Player_${i}_LongerName`, duration: i })));
    const parts = splitPackets(payload, 600);
    expect(parts.length).toBeGreaterThan(1);
    const assembler = new SplitAssembler();
    const order = [...parts].reverse();
    let result: Buffer | null = null;
    for (const part of order) result = assembler.push(part);
    expect(result?.equals(payload)).toBe(true);
    expect(parsePlayerResponse(result!)).toHaveLength(70);
  });
});

describe('A2S query transport (mock dgram)', () => {
  it('answers both challenges and returns info + players', async () => {
    const players = playerPacket([{ name: 'Mars', duration: 60 }, { name: '', duration: 10 }]);
    const mock = mockSocketFactory((packet) => {
      const type = packet[4];
      const hasChallenge = packet.subarray(-4).toString('hex') === '674d1888';
      if (type === 0x54) return [hasChallenge ? CAPTURED_INFO_SERVER1 : CAPTURED_CHALLENGE];
      if (type === 0x55) return [hasChallenge ? players : CAPTURED_CHALLENGE];
      return [];
    });

    const result = await queryA2S('127.0.0.1', 1001, { socketFactory: mock.factory, timeoutMs: 500 });
    expect(result.info.maxPlayers).toBe(55);
    expect(result.players?.map((p) => p.name)).toEqual(['Mars', '']);
    expect(mock.sent.map((p) => p.toString('hex'))).toEqual([
      buildInfoRequest().toString('hex'),
      buildInfoRequest(CAPTURED_CHALLENGE.subarray(5)).toString('hex'),
      buildPlayerRequest().toString('hex'),
      buildPlayerRequest(CAPTURED_CHALLENGE.subarray(5)).toString('hex'),
    ]);
    expect(mock.closedCount()).toBe(1);
  });

  it('works without a challenge and with a split player response', async () => {
    const payload = playerPacket(Array.from({ length: 60 }, (_, i) => ({ name: `P${i}-xxxxxxxxxxxx`, duration: i })));
    const mock = mockSocketFactory((packet) => (packet[4] === 0x54 ? [CAPTURED_INFO_28014] : splitPackets(payload, 500)));
    const result = await queryA2S('h', 1, { socketFactory: mock.factory, timeoutMs: 500 });
    expect(result.info.players).toBe(4);
    expect(result.players).toHaveLength(60);
  });

  it('times out when the server never answers and still closes the socket', async () => {
    const mock = mockSocketFactory(() => []);
    await expect(queryA2S('h', 1, { socketFactory: mock.factory, timeoutMs: 30 })).rejects.toMatchObject({ code: 'timeout' });
    expect(mock.closedCount()).toBe(1);
  });

  it('keeps the info result when only A2S_PLAYER fails', async () => {
    const mock = mockSocketFactory((packet) => (packet[4] === 0x54 ? [CAPTURED_INFO_SERVER1] : []));
    const result = await queryA2S('h', 1, { socketFactory: mock.factory, timeoutMs: 30 });
    expect(result.info.name).toContain('Hello world');
    expect(result.players).toBeNull();
  });

  it('ignores datagrams that do not come from the queried host:port', async () => {
    const sentTo: string[] = [];
    const factory = () => {
      const handlers: Record<string, Array<(...args: any[]) => void>> = {};
      const socket: UdpSocketLike = {
        on(event: string, listener: (...args: any[]) => void) {
          (handlers[event] ||= []).push(listener);
          return socket;
        },
        send(msg: Buffer, port: number, address: string, callback?: (error: Error | null) => void) {
          sentTo.push(`${address}:${port}`);
          callback?.(null);
          if (msg[4] !== 0x54) return;
          setImmediate(() => {
            // Spoofed replies first (wrong port, wrong address), then the real one.
            handlers.message?.forEach((h) => h(CAPTURED_INFO_28014, { address: '10.6.6.6', port: 28014 }));
            handlers.message?.forEach((h) => h(CAPTURED_INFO_28014, { address: '203.0.113.7', port: 9999 }));
            handlers.message?.forEach((h) => h(CAPTURED_INFO_SERVER1, { address: '::ffff:203.0.113.7', port: 28014 }));
          });
        },
        close() {},
      } as UdpSocketLike;
      return socket;
    };
    const result = await queryA2S('ark.example.test', 28014, {
      socketFactory: factory,
      resolveHost: async () => '203.0.113.7',
      skipPlayers: true,
      timeoutMs: 200,
    });
    expect(result.info.name).toContain('Hello world');
    expect(sentTo).toEqual(['203.0.113.7:28014']);
  });
});

const NOW = new Date('2026-10-18T12:00:00.000Z');
const row = (overrides: Partial<ServerRow> = {}): ServerRow => ({
  id: 10,
  connectHost: 'ark.iris-th.cloud',
  connectPort: 28014,
  lastHeartbeat: null,
  playerCount: 0,
  ...overrides,
});
const a2sResult = (players: number, names: string[] = []): A2SQueryResult => ({
  info: {
    ...parseInfoResponse(CAPTURED_INFO_28014),
    players,
  },
  players: names.map((name, index) => ({ index, name, score: 0, durationSec: 30 })),
  latencyMs: 12,
});

describe('cleanSessionName', () => {
  it('strips the full and the 63-byte-truncated ARK build suffix', () => {
    expect(cleanSessionName('Iris Thailand - The Island - PvE X10 NO MOD - (v361.7)')).toBe('Iris Thailand - The Island - PvE X10 NO MOD');
    expect(cleanSessionName('Iris Thailand - Genesis Part 2 - PvE X20 MOD +Additions - (v361')).toBe('Iris Thailand - Genesis Part 2 - PvE X20 MOD +Additions');
    expect(cleanSessionName('Iris Thailand - Crystal Isles - PvE X20 MOD +Additions - (')).toBe('Iris Thailand - Crystal Isles - PvE X20 MOD +Additions');
    expect(cleanSessionName('Genesis: Part 2 - PvPvE X10 MOD')).toBe('Genesis: Part 2 - PvPvE X10 MOD');
    expect(cleanSessionName('')).toBeNull();
    expect(cleanSessionName(' - (v361.7)')).toBeNull();
  });
});

describe('status snapshot rules', () => {
  it('parses SERVER_QUERY_TARGETS overrides and prefers them over connectHost', () => {
    const overrides = parseTargetOverrides('1=151.141.23.59:1001, 2=151.141.23.59:1004;bad=x:1,3=host:99999');
    expect([...overrides.entries()]).toEqual([
      [1, { host: '151.141.23.59', port: 1001 }],
      [2, { host: '151.141.23.59', port: 1004 }],
    ]);
    expect(resolveTarget(row({ id: 1, connectHost: null, connectPort: null }), overrides)).toEqual({ host: '151.141.23.59', port: 1001 });
    expect(resolveTarget(row(), overrides)).toEqual({ host: 'ark.iris-th.cloud', port: 28014 });
    expect(resolveTarget(row({ id: 5, connectHost: null }), overrides)).toBeNull();
  });

  it('builds a2s, heartbeat and offline entries', () => {
    const ok = computeEntry(row(), a2sResult(2, ['Mars', '']), undefined, NOW);
    expect(ok).toMatchObject({ id: 10, online: true, players: 2, maxPlayers: 66, version: '361.7', map: 'TheIsland', source: 'a2s', misses: 0 });
    expect(ok.playerList).toEqual([{ name: 'Mars', durationSec: 30 }, { name: '', durationSec: 30 }]);
    expect(ok.fetchedAt).toBe(NOW.toISOString());

    const heartbeat = computeEntry(row({ id: 1, connectHost: null, lastHeartbeat: new Date(NOW.getTime() - 60_000), playerCount: 7 }), undefined, undefined, NOW);
    expect(heartbeat).toMatchObject({ online: true, players: 7, source: 'heartbeat', playerList: null });

    const staleHeartbeat = computeEntry(row({ id: 1, connectHost: null, lastHeartbeat: new Date(NOW.getTime() - 10 * 60_000), playerCount: 7 }), undefined, undefined, NOW);
    expect(staleHeartbeat).toMatchObject({ online: false, players: 0 });
  });

  it('does not flap offline on a single lost UDP round', () => {
    const ok = computeEntry(row(), a2sResult(3, ['a', 'b', 'c']), undefined, NOW);
    const miss1 = computeEntry(row(), null, ok, NOW);
    expect(miss1).toMatchObject({ online: true, players: 3, misses: 1 });
    expect(A2S_MISS_THRESHOLD).toBe(2);
    const miss2 = computeEntry(row(), null, miss1, NOW);
    expect(miss2).toMatchObject({ online: false, players: 0, misses: 2, maxPlayers: 66 });
    // heartbeat fallback when the plugin still reports
    const viaHeartbeat = computeEntry(row({ lastHeartbeat: NOW, playerCount: 4 }), null, miss1, NOW);
    expect(viaHeartbeat).toMatchObject({ online: true, players: 4, source: 'heartbeat' });
  });

  it('detects only visible changes (count, online, roster) and strips player names from the public payload', () => {
    const a = computeEntry(row(), a2sResult(2, ['Mars', 'conni']), undefined, NOW);
    const later = computeEntry(row(), a2sResult(2, ['conni', 'Mars']), undefined, new Date(NOW.getTime() + 30_000));
    const snapA: StoredSnapshot = { at: NOW.toISOString(), servers: [a] };
    const snapSame: StoredSnapshot = { at: 'later', servers: [later] };
    expect(hasVisibleChange(snapA, snapSame)).toBe(false); // same roster, only fetchedAt moved

    const swapped = computeEntry(row(), a2sResult(2, ['Mars', 'WattZap']), undefined, NOW);
    expect(hasVisibleChange(snapA, { at: 'x', servers: [swapped] })).toBe(true); // same count, new player
    expect(hasVisibleChange(snapA, { at: 'x', servers: [computeEntry(row(), a2sResult(3, ['a', 'b', 'c']), undefined, NOW)] })).toBe(true);
    expect(hasVisibleChange(snapA, { at: 'x', servers: [] })).toBe(true);
    expect(hasVisibleChange(null, snapA)).toBe(true);

    const pub = toPublicSnapshot(snapA);
    expect(JSON.stringify(pub)).not.toContain('Mars');
    expect(pub.servers[0]).toEqual({
      id: 10, online: true, players: 2, maxPlayers: 66, version: '361.7', map: 'TheIsland', source: 'a2s',
      name: 'Iris Thailand - The Island - PvE X10 NO MOD',
      playersRev: playersRevFor(a.playerList),
    });
  });

  it('limits concurrency', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 8, async (i) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return i * 2;
    });
    expect(peak).toBe(8);
    expect(out[19]).toBe(38);
  });

  it('merges live status into directory summaries', () => {
    const summary = toServerSummary({ id: 10, name: 'x', connectHost: 'h', connectPort: 1, lastHeartbeat: null });
    expect(summary.online).toBe(false);
    const merged = mergeLiveStatus(summary, { online: true, players: 6, maxPlayers: 66, version: '361.7', source: 'a2s', playersRev: 'abc' });
    expect(merged).toMatchObject({ online: true, playerCount: 6, maxPlayers: 66, version: '361.7', statusSource: 'a2s', playersRev: 'abc' });
    expect(mergeLiveStatus(summary, undefined)).toMatchObject({ online: false, maxPlayers: null, statusSource: 'heartbeat' });
  });
});

describe('ServerQueryService poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERVER_QUERY_TARGETS;
  });

  const servers = [
    row({ id: 1, connectHost: null, connectPort: null, lastHeartbeat: NOW, playerCount: 2 }),
    row({ id: 10 }),
  ];

  it('skips the round when another replica holds the lock', async () => {
    r.set.mockResolvedValueOnce(null);
    r.eval.mockResolvedValueOnce(0);
    const query = vi.fn();
    const service = new ServerQueryService({ query, now: () => NOW });
    expect(await service.tick()).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(db.server.findMany).not.toHaveBeenCalled();
  });

  it('polls targets, caches the snapshot in Redis and emits only on change', async () => {
    process.env.SERVER_QUERY_TARGETS = '1=151.141.23.59:1001';
    const query = vi.fn(async (host: string) => (host === '151.141.23.59' ? a2sResult(0) : a2sResult(2, ['Mars', ''])));
    const service = new ServerQueryService({ query, now: () => NOW });
    db.server.findMany.mockResolvedValue(servers);

    // round 1: lock acquired, no previous snapshot -> emit
    r.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK');
    r.get.mockResolvedValueOnce(null);
    const first = await service.tick();
    expect(query).toHaveBeenCalledWith('151.141.23.59', 1001, 2500);
    expect(query).toHaveBeenCalledWith('ark.iris-th.cloud', 28014, 2500);
    expect(first?.servers.map((s) => [s.id, s.source, s.players])).toEqual([[1, 'a2s', 0], [10, 'a2s', 2]]);
    const [key, json, ex] = r.set.mock.calls[1];
    expect([key, ex]).toEqual([SERVER_STATUS_KEY, 'EX']);
    expect(JSON.parse(json).servers[1].playerList).toEqual([{ name: 'Mars', durationSec: 30 }, { name: '', durationSec: 30 }]);
    expect(emitServersStatus).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(emitServersStatus).mock.calls[0][0])).not.toContain('Mars');

    // round 2: lock renewed, nothing changed -> no emit
    r.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');
    r.eval.mockResolvedValueOnce(1);
    r.get.mockResolvedValueOnce(json);
    await service.tick();
    expect(emitServersStatus).toHaveBeenCalledTimes(1);
  });

  it('serves player names with the anonymous placeholder', async () => {
    const snapshot: StoredSnapshot = {
      at: NOW.toISOString(),
      servers: [{ ...computeEntry(row(), a2sResult(2, ['Mars', '']), undefined, new Date()), id: 10 }],
    };
    r.get.mockResolvedValueOnce(JSON.stringify(snapshot));
    const service = new ServerQueryService({ query: vi.fn() });
    const result = await service.getPlayers(10);
    expect(result?.players).toEqual([
      { name: 'Mars', durationSec: 30 },
      { name: ANONYMOUS_PLAYER_NAME, durationSec: 30 },
    ]);
    expect(await service.getPlayers(999)).toBeNull();
  });

  it('refreshes a stale player list with a live query', async () => {
    const stale = computeEntry(row(), a2sResult(1, ['old']), undefined, new Date(Date.now() - 60_000));
    r.get.mockResolvedValueOnce(JSON.stringify({ at: NOW.toISOString(), servers: [stale] }));
    db.server.findUnique.mockResolvedValueOnce({ ...row(), isActive: true });
    const query = vi.fn().mockResolvedValue(a2sResult(1, ['fresh']));
    const service = new ServerQueryService({ query });
    const result = await service.getPlayers(10);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result?.players.map((p) => p.name)).toEqual(['fresh']);
  });

  it('falls back to a heartbeat-only snapshot when Redis is empty', async () => {
    r.get.mockResolvedValueOnce(null);
    db.server.findMany.mockResolvedValueOnce(servers);
    const service = new ServerQueryService({ now: () => NOW });
    const status = await service.getPublicStatus();
    expect(status.servers.map((s) => [s.id, s.online, s.source])).toEqual([[1, true, 'heartbeat'], [10, false, 'heartbeat']]);
  });

  it('applies plugin heartbeats to heartbeat-sourced entries immediately', async () => {
    const entry = computeEntry(row({ id: 1, connectHost: null, lastHeartbeat: NOW, playerCount: 2 }), undefined, undefined, NOW);
    r.get.mockResolvedValueOnce(JSON.stringify({ at: NOW.toISOString(), servers: [entry] }));
    r.set.mockResolvedValueOnce('OK');
    const service = new ServerQueryService({ now: () => NOW });
    await service.applyHeartbeat(1, 5);
    expect(emitServersStatus).toHaveBeenCalledWith(expect.objectContaining({
      servers: [expect.objectContaining({ id: 1, online: true, players: 5, source: 'heartbeat' })],
    }));
  });
});
