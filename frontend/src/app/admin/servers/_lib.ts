import type { AdminCluster, AdminServer, GameMode } from '@/lib/contracts/types';

/**
 * GET /admin/servers row (backend/contracts/ui-redesign-2026-10.md §5).
 * Secrets are never rendered; `apiKey` is only ever copied to the clipboard.
 */
export type ServerRow = AdminServer;

/** GET /admin/clusters row. */
export type ClusterRow = AdminCluster;

/** Known ARK map ids (from the legacy server list) for the map field suggestions. */
export const KNOWN_MAPS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'TheIsland', name: 'The Island' },
  { id: 'TheCenter', name: 'The Center' },
  { id: 'ScorchedEarth', name: 'Scorched Earth' },
  { id: 'Ragnarok', name: 'Ragnarok' },
  { id: 'Aberration', name: 'Aberration' },
  { id: 'Extinction', name: 'Extinction' },
  { id: 'Valguero', name: 'Valguero' },
  { id: 'Genesis', name: 'Genesis Part 1' },
  { id: 'CrystalIsles', name: 'Crystal Isles' },
  { id: 'Genesis2', name: 'Genesis Part 2' },
  { id: 'LostIsland', name: 'Lost Island' },
  { id: 'Fjordur', name: 'Fjordur' },
  { id: 'Aquatica', name: 'Aquatica' },
];

export const UNASSIGNED = '__none__';

export function serverTitle(s: ServerRow): string {
  return s.displayName || s.name;
}

export function addressKey(s: Pick<ServerRow, 'connectHost' | 'connectPort'>): string | null {
  if (!s.connectHost || !s.connectPort) return null;
  return `${s.connectHost.trim().toLowerCase()}:${s.connectPort}`;
}

/** Groups of servers that share the same host:port (data anomaly). */
export function findDuplicateAddresses(servers: ServerRow[]): Array<{ address: string; servers: ServerRow[] }> {
  const byAddress = new Map<string, ServerRow[]>();
  for (const s of servers) {
    const key = addressKey(s);
    if (!key) continue;
    byAddress.set(key, [...(byAddress.get(key) ?? []), s]);
  }
  return [...byAddress.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([address, list]) => ({ address, servers: list }));
}

/**
 * Display-only explanation of why `deliverable` is false. The flag itself is
 * backend-authoritative; this only names the field that blocks it.
 */
export function deliverableNote(s: ServerRow): string | null {
  if (s.deliverable) return null;
  if (!s.isActive) return 'ปิดใช้งานอยู่';
  if (s.drainMode) return 'อยู่ในโหมด drain';
  if ((s.activeCredentialCount ?? 0) === 0) return 'ยังไม่มี credential ของปลั๊กอิน';
  return 'ยังไม่พร้อมรับของ';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Backend error text (`{ error }`) or a fallback. */
export function apiErrorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown };
  const data = e?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

export function sortClusters(clusters: ClusterRow[]): ClusterRow[] {
  return [...clusters].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

export function sortServers(servers: ServerRow[]): ServerRow[] {
  return [...servers].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export const GAME_MODE_OPTIONS: Array<{ value: GameMode; label: string }> = [
  { value: 'PVE', label: 'PvE' },
  { value: 'PVE_MOD', label: 'PvE Mod' },
  { value: 'PVPVE', label: 'PvPvE' },
];
