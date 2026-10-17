import type { GameMode, ServerSummary } from '@/lib/contracts/types';
import type { StatusKind } from '@/components/ui/StatusDot';

/** Display order of game modes everywhere (tabs, directory sections). */
export const GAME_MODE_ORDER: readonly GameMode[] = ['PVE', 'PVE_MOD', 'PVPVE'];

/** Short labels (proper nouns stay English). */
export const GAME_MODE_LABEL: Record<GameMode, string> = {
  PVE: 'PvE',
  PVE_MOD: 'PvE Mod',
  PVPVE: 'PvPvE',
};

/** One-line Thai description per mode for headers and tooltips. */
export const GAME_MODE_DESCRIPTION: Record<GameMode, string> = {
  PVE: 'เล่นร่วมกันโดยไม่มีการโจมตีกันระหว่างผู้เล่น ไม่ลงม็อด',
  PVE_MOD: 'แนว PvE พร้อมม็อดเสริมของเซิร์ฟเวอร์',
  PVPVE: 'ผสม PvE และ PvP ตามกติกาของเซิร์ฟเวอร์ ลงม็อด',
};

/** Live status of a server for StatusDot. */
export function serverStatusKind(server: Pick<ServerSummary, 'available' | 'online'>): StatusKind {
  if (!server.available) return 'maintenance';
  return server.online ? 'online' : 'offline';
}

/** Short Thai status text. */
export function serverStatusText(server: Pick<ServerSummary, 'available' | 'online'>): string {
  if (!server.available) return 'ปิดให้บริการ';
  return server.online ? 'ออนไลน์' : 'ออฟไลน์';
}

/**
 * Why a server cannot receive shop delivery, or null when it can.
 * Mirrors backend fields only — `deliverable` is backend-authoritative.
 */
export function deliveryBlockReason(server: ServerSummary): string | null {
  if (!server.available) return 'เซิร์ฟเวอร์นี้ปิดให้บริการชั่วคราว';
  if (!server.deliverable) return 'ยังไม่เปิดรับของจากร้านค้า';
  return null;
}

/** "host:port" or null. */
export function connectAddress(server: Pick<ServerSummary, 'connect'>): string | null {
  return server.connect ? `${server.connect.host}:${server.connect.port}` : null;
}
