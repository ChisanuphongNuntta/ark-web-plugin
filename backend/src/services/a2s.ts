// Steam/Source server query protocol (A2S_INFO + A2S_PLAYER) over UDP.
// https://developer.valvesoftware.com/wiki/Server_queries
//
// ARK: Survival Evolved answers A2S on its Steam QUERY port (Server.connectPort in the public
// directory). Both requests may be answered with an S2C_CHALLENGE (0x41) that must be echoed
// back; A2S_PLAYER replies for busy servers can exceed one UDP datagram and arrive as a
// split (0xFFFFFFFE) multi-packet response.
//
// Packet builders/parsers are pure so they can be unit-tested with captured buffers; the
// transport takes an injectable socket factory so the challenge flow can be tested without
// the network.
import dgram from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const A2S_SINGLE = 0xffffffff; // -1 (LE int32) single-packet header
export const A2S_SPLIT = 0xfffffffe; // -2 (LE int32) multi-packet header
export const A2S_INFO_REQUEST = 0x54; // 'T'
export const A2S_INFO_RESPONSE = 0x49; // 'I'
export const A2S_PLAYER_REQUEST = 0x55; // 'U'
export const A2S_PLAYER_RESPONSE = 0x44; // 'D'
export const S2C_CHALLENGE = 0x41; // 'A'

const INFO_PAYLOAD = Buffer.from('Source Engine Query\0', 'latin1');
const NO_CHALLENGE = Buffer.from([0xff, 0xff, 0xff, 0xff]);

export interface A2SInfo {
  protocol: number;
  name: string;
  map: string;
  folder: string;
  game: string;
  appId: number;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: string;
  environment: string;
  visibility: number;
  vac: number;
  /** Game version from the version field (ARK puts the real build in the name, see parseArkVersion). */
  version: string | null;
  gamePort: number | null;
}

export interface A2SPlayer {
  index: number;
  name: string;
  score: number;
  durationSec: number;
}

export class A2SError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'malformed' | 'unexpected' | 'socket') {
    super(message);
    this.name = 'A2SError';
  }
}

// ── Packet builders ───────────────────────────────────────────────────────────────────────

const header = (type: number) => Buffer.from([0xff, 0xff, 0xff, 0xff, type]);

export function buildInfoRequest(challenge?: Buffer): Buffer {
  return challenge
    ? Buffer.concat([header(A2S_INFO_REQUEST), INFO_PAYLOAD, challenge])
    : Buffer.concat([header(A2S_INFO_REQUEST), INFO_PAYLOAD]);
}

export function buildPlayerRequest(challenge?: Buffer): Buffer {
  return Buffer.concat([header(A2S_PLAYER_REQUEST), challenge ?? NO_CHALLENGE]);
}

// ── Parsers ───────────────────────────────────────────────────────────────────────────────

class Reader {
  offset: number;
  constructor(readonly buf: Buffer, offset = 0) {
    this.offset = offset;
  }
  remaining() {
    return this.buf.length - this.offset;
  }
  private need(bytes: number) {
    if (this.offset + bytes > this.buf.length) throw new A2SError('A2S packet truncated', 'malformed');
  }
  u8() {
    this.need(1);
    return this.buf.readUInt8(this.offset++);
  }
  u16() {
    this.need(2);
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }
  cstring() {
    const end = this.buf.indexOf(0, this.offset);
    if (end === -1) throw new A2SError('A2S string not terminated', 'malformed');
    const value = this.buf.toString('utf8', this.offset, end);
    this.offset = end + 1;
    return value;
  }
}

/** Returns the 4-byte challenge if `packet` is an S2C_CHALLENGE, else null. */
export function readChallenge(packet: Buffer): Buffer | null {
  if (packet.length >= 9 && packet.readUInt32LE(0) === A2S_SINGLE && packet[4] === S2C_CHALLENGE) {
    return Buffer.from(packet.subarray(5, 9));
  }
  return null;
}

export function parseInfoResponse(packet: Buffer): A2SInfo {
  const r = new Reader(packet);
  if (r.remaining() < 5 || r.i32() !== -1) throw new A2SError('Not a single-packet A2S response', 'malformed');
  const type = r.u8();
  if (type !== A2S_INFO_RESPONSE) throw new A2SError(`Unexpected A2S_INFO response type 0x${type.toString(16)}`, 'unexpected');
  const info: A2SInfo = {
    protocol: r.u8(),
    name: r.cstring(),
    map: r.cstring(),
    folder: r.cstring(),
    game: r.cstring(),
    appId: r.u16(),
    players: r.u8(),
    maxPlayers: r.u8(),
    bots: r.u8(),
    serverType: String.fromCharCode(r.u8()),
    environment: String.fromCharCode(r.u8()),
    visibility: r.u8(),
    vac: r.u8(),
    version: null,
    gamePort: null,
  };
  // Optional trailing fields (version + Extra Data Flag). Tolerate truncation.
  try {
    if (r.remaining() > 0) info.version = r.cstring();
    if (r.remaining() > 0) {
      const edf = r.u8();
      if (edf & 0x80) info.gamePort = r.u16();
    }
  } catch {
    // older/short responses: keep what we have
  }
  return info;
}

export function parsePlayerResponse(packet: Buffer): A2SPlayer[] {
  const r = new Reader(packet);
  if (r.remaining() < 5 || r.i32() !== -1) throw new A2SError('Not a single-packet A2S response', 'malformed');
  const type = r.u8();
  if (type !== A2S_PLAYER_RESPONSE) throw new A2SError(`Unexpected A2S_PLAYER response type 0x${type.toString(16)}`, 'unexpected');
  const count = r.u8();
  const players: A2SPlayer[] = [];
  // Some servers truncate the list; keep every complete entry.
  for (let i = 0; i < count; i += 1) {
    if (r.remaining() <= 0) break;
    try {
      const index = r.u8();
      const name = r.cstring();
      const score = r.i32();
      const duration = r.f32();
      players.push({
        index,
        name,
        score,
        durationSec: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
      });
    } catch {
      break; // truncated tail: keep the complete entries
    }
  }
  return players;
}

/**
 * "Iris Thailand - The Island - PvE X10 NO MOD - (v361.7)" -> "361.7".
 * ASE truncates the A2S name to 63 bytes, so long names end in "(v361" or "(v361." - the digits
 * that survive are still returned ("361"). ASE always reports the A2S version field as "1.0.0.0",
 * which says nothing about the game build, so that value is ignored.
 */
export function parseArkVersion(name: string, versionField?: string | null): string | null {
  const match = /\(v(\d+(?:\.\d+)*)\)\s*$/i.exec(name);
  if (match) return match[1];
  const truncated = /\(v(\d+(?:\.\d+)*)\.?$/i.exec(name);
  if (truncated) return truncated[1];
  const field = versionField?.trim();
  return field && field !== '1.0.0.0' ? field : null;
}

// ── Multi-packet (split) reassembly — Source engine format ───────────────────────────────

interface SplitState {
  id: number;
  total: number;
  parts: Map<number, Buffer>;
}

/**
 * Feeds one datagram. Returns the complete single-packet payload (starting with 0xFFFFFFFF)
 * once available, otherwise null. Throws on compressed (bzip2) responses, which ARK never sends.
 */
export class SplitAssembler {
  private state: SplitState | null = null;

  push(packet: Buffer): Buffer | null {
    if (packet.length < 4) throw new A2SError('A2S packet too short', 'malformed');
    const head = packet.readUInt32LE(0);
    if (head === A2S_SINGLE) return packet;
    if (head !== A2S_SPLIT) throw new A2SError('Unknown A2S packet header', 'malformed');

    if (packet.length < 12) throw new A2SError('A2S split packet too short', 'malformed');
    const id = packet.readUInt32LE(4);
    if (id & 0x80000000) throw new A2SError('Compressed A2S responses are not supported', 'unexpected');
    const total = packet.readUInt8(8);
    const number = packet.readUInt8(9);
    // Source format: 2-byte max packet size follows; payload starts at 12.
    const payload = packet.subarray(12);
    if (total === 0 || number >= total) throw new A2SError('Invalid A2S split numbering', 'malformed');

    if (!this.state || this.state.id !== id) this.state = { id, total, parts: new Map() };
    this.state.parts.set(number, Buffer.from(payload));
    if (this.state.parts.size < this.state.total) return null;

    const ordered: Buffer[] = [];
    for (let i = 0; i < this.state.total; i += 1) {
      const part = this.state.parts.get(i);
      if (!part) return null;
      ordered.push(part);
    }
    this.state = null;
    const joined = Buffer.concat(ordered);
    if (joined.length < 4 || joined.readUInt32LE(0) !== A2S_SINGLE) {
      throw new A2SError('Reassembled A2S payload has no single-packet header', 'malformed');
    }
    return joined;
  }
}

// ── Transport ─────────────────────────────────────────────────────────────────────────────

export interface UdpSocketLike {
  on(event: 'message', listener: (msg: Buffer, rinfo?: { address: string; port: number }) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  send(msg: Buffer, port: number, address: string, callback?: (error: Error | null) => void): void;
  close(): void;
  unref?: () => unknown;
}

export type UdpSocketFactory = () => UdpSocketLike;

export const defaultSocketFactory: UdpSocketFactory = () => dgram.createSocket('udp4') as unknown as UdpSocketLike;

export interface A2SQueryOptions {
  timeoutMs?: number;
  socketFactory?: UdpSocketFactory;
  /** Skip A2S_PLAYER (only server info). */
  skipPlayers?: boolean;
  /**
   * Resolves the host to the IP replies must come from. Defaults to a DNS lookup (IPv4) for the
   * real UDP socket; identity when a custom socketFactory is injected (tests).
   */
  resolveHost?: (host: string) => Promise<string>;
}

async function defaultResolveHost(host: string): Promise<string> {
  if (isIP(host)) return host;
  try {
    const { address } = await lookup(host, { family: 4 });
    return address;
  } catch (error) {
    throw new A2SError(`A2S host lookup failed: ${(error as Error).message}`, 'socket');
  }
}

export interface A2SQueryResult {
  info: A2SInfo;
  players: A2SPlayer[] | null;
  latencyMs: number;
}

function stripV4Mapped(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/** One UDP socket per server query; requests are sequential, each with its own timeout. */
class A2SConnection {
  private waiter: { resolve: (buf: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout } | null = null;
  private assembler = new SplitAssembler();
  private closed = false;

  constructor(
    private readonly socket: UdpSocketLike,
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs: number,
  ) {
    socket.on('message', (msg: Buffer, rinfo?: { address: string; port: number }) => {
      // The socket is unconnected: drop datagrams that do not come from the queried server so a
      // spoofed/stray packet can neither inject fake info/players nor fail the real query.
      if (rinfo && (rinfo.port !== this.port || stripV4Mapped(rinfo.address) !== this.host)) return;
      this.onMessage(msg);
    });
    socket.on('error', (err: Error) => this.fail(new A2SError(err.message, 'socket')));
    socket.unref?.();
  }

  private onMessage(msg: Buffer) {
    if (!this.waiter) return; // late / unsolicited datagram
    let complete: Buffer | null;
    try {
      complete = this.assembler.push(msg);
    } catch (error) {
      this.fail(error as Error);
      return;
    }
    if (!complete) return;
    const { resolve, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;
    resolve(complete);
  }

  private fail(error: Error) {
    if (!this.waiter) return;
    const { reject, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;
    reject(error);
  }

  request(packet: Buffer): Promise<Buffer> {
    if (this.closed) return Promise.reject(new A2SError('A2S socket closed', 'socket'));
    this.assembler = new SplitAssembler();
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new A2SError(`A2S timeout after ${this.timeoutMs}ms`, 'timeout'));
      }, this.timeoutMs);
      this.waiter = { resolve, reject, timer };
      try {
        this.socket.send(packet, this.port, this.host, (error) => {
          if (error) this.fail(new A2SError(error.message, 'socket'));
        });
      } catch (error) {
        this.fail(new A2SError((error as Error).message, 'socket'));
      }
    });
  }

  /** Sends `build()`; if answered with a challenge, resends `build(challenge)` (max 2 rounds). */
  async requestWithChallenge(build: (challenge?: Buffer) => Buffer): Promise<Buffer> {
    let response = await this.request(build());
    for (let round = 0; round < 2; round += 1) {
      const challenge = readChallenge(response);
      if (!challenge) return response;
      response = await this.request(build(challenge));
    }
    if (readChallenge(response)) throw new A2SError('A2S challenge loop', 'unexpected');
    return response;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new A2SError('A2S socket closed', 'socket'));
    try {
      this.socket.close();
    } catch {
      // already closed
    }
  }
}

export async function queryA2S(host: string, port: number, options: A2SQueryOptions = {}): Promise<A2SQueryResult> {
  const timeoutMs = options.timeoutMs ?? 2500;
  const resolveHost = options.resolveHost ?? (options.socketFactory ? async (h: string) => h : defaultResolveHost);
  // Resolve once per query so replies are matched against the IP the requests were sent to.
  const address = await resolveHost(host);
  const socket = (options.socketFactory ?? defaultSocketFactory)();
  const connection = new A2SConnection(socket, address, port, timeoutMs);
  const started = Date.now();
  try {
    const info = parseInfoResponse(await connection.requestWithChallenge(buildInfoRequest));
    const latencyMs = Date.now() - started;
    let players: A2SPlayer[] | null = null;
    if (!options.skipPlayers) {
      try {
        players = parsePlayerResponse(await connection.requestWithChallenge(buildPlayerRequest));
      } catch {
        players = null; // info succeeded: the server is up even if the player list failed
      }
    }
    return { info, players, latencyMs };
  } finally {
    connection.close();
  }
}
