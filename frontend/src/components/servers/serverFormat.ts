import type { GameMode } from '@/lib/contracts/types';
import type { LiveServerStatus } from '@/lib/realtime/events';
import type { DirectoryGroup, DirectoryServer } from '@/lib/realtime/serverStatus';

/** Tab ids, also used as the `?mode=` URL value (legacy URLs redirect here). */
export type ModeTab = 'pve' | 'pve-mod' | 'pvpve' | 'other';

export const MODE_TABS: readonly { id: ModeTab; label: string; description: string }[] = [
  { id: 'pve', label: 'PvE', description: 'เล่นร่วมกันโดยไม่โจมตีกันระหว่างผู้เล่น ไม่ลงม็อด' },
  { id: 'pve-mod', label: 'PvE Mod', description: 'แนว PvE พร้อมม็อดเสริมของเซิร์ฟเวอร์' },
  { id: 'pvpve', label: 'PvPvE', description: 'ผสม PvE และ PvP ตามกติกาของเซิร์ฟเวอร์' },
  { id: 'other', label: 'อื่นๆ', description: 'เซิร์ฟเวอร์ที่ยังไม่ได้จัดโหมด' },
];

const MODE_BY_GAME_MODE: Record<GameMode, ModeTab> = { PVE: 'pve', PVE_MOD: 'pve-mod', PVPVE: 'pvpve' };

export function parseModeTab(value: string | null | undefined): ModeTab | null {
  const v = (value ?? '').toLowerCase().replace(/_/g, '-');
  return MODE_TABS.some((t) => t.id === v) ? (v as ModeTab) : null;
}

/** A server's tab comes from its directory group; groups without a mode go to 'อื่นๆ'. */
export function modeOfGroup(group: Pick<DirectoryGroup, 'gameMode'>): ModeTab {
  return group.gameMode ? MODE_BY_GAME_MODE[group.gameMode] : 'other';
}

/** Directory row merged with the latest live status. */
export interface ServerView {
  server: DirectoryServer;
  group: DirectoryGroup;
  mode: ModeTab;
  online: boolean;
  players: number;
  maxPlayers: number | null;
  version: string | null;
  source: string | null;
  /** In-game session name when the backend sends it (A2S). */
  sessionName: string | null;
}

export function toServerView(server: DirectoryServer, group: DirectoryGroup, live?: LiveServerStatus): ServerView {
  const sessionName = live?.name?.trim() || null;
  return {
    server,
    group,
    mode: modeOfGroup(group),
    online: live ? live.online : server.online,
    players: live ? live.players : server.playerCount,
    maxPlayers: live?.maxPlayers ?? null,
    version: live?.version ?? null,
    source: live?.source ?? null,
    sessionName,
  };
}

export function connectAddress(server: Pick<DirectoryServer, 'connect'>): string | null {
  return server.connect ? `${server.connect.host}:${server.connect.port}` : null;
}

/**
 * ARK: Survival Evolved joins through the Steam client with the server's
 * Steam QUERY port (the directory stores the query port):
 *   steam://connect/<host>:<queryPort>
 * Steam then queries the server and launches ASE (app 346110) into it.
 */
export function steamConnectUrl(server: Pick<DirectoryServer, 'connect'>): string | null {
  const address = connectAddress(server);
  return address ? `steam://connect/${address}` : null;
}

/**
 * Text Epic players type into the in-game server search. Uses the live
 * session name without the "(v361.7)" suffix when known.
 */
export function epicSearchName(view: ServerView): string {
  if (view.sessionName) {
    // Also covers the 63-byte-truncated "- (v361" / "- (" endings.
    const trimmed = view.sessionName.replace(/\s*\((v[\d.]*\)?)?\s*$/i, '').replace(/[\s-]+$/, '').trim();
    if (trimmed) return trimmed;
  }
  return `Iris Thailand - ${view.server.displayName}`;
}

/** 4352 -> "1 ชม. 12 นาที"; under a minute -> "ไม่ถึง 1 นาที". */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours === 0 && minutes === 0) return 'ไม่ถึง 1 นาที';
  if (hours === 0) return `${minutes} นาที`;
  if (minutes === 0) return `${hours} ชม.`;
  return `${hours} ชม. ${minutes} นาที`;
}

export const UNKNOWN_PLAYER_NAME = 'ไม่ระบุชื่อ';

/** False for blank names and for the backend's own placeholder (it already substitutes UNKNOWN_PLAYER_NAME). */
export function isNamedPlayer(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 && trimmed !== UNKNOWN_PLAYER_NAME;
}

export function displayPlayerName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed || UNKNOWN_PLAYER_NAME;
}

export function matchesSearch(view: ServerView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    view.server.displayName,
    view.server.name,
    view.server.map ?? '',
    view.server.cluster?.name ?? '',
    view.group.name,
    connectAddress(view.server) ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
