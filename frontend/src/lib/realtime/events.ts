/**
 * Socket.IO event payloads (server -> client). Source of truth:
 * backend/contracts/realtime-2026-10.md. Every field the UI does not strictly
 * need is optional so a slightly different backend payload never crashes.
 */

export const REALTIME_EVENTS = {
  walletUpdated: 'wallet:updated',
  orderUpdated: 'order:updated',
  deliveryUpdated: 'delivery:updated',
  serversStatus: 'servers:status',
  catalogUpdated: 'catalog:updated',
  /** Room 'admin': one per posted ledger transaction (emitted after commit by walletService.post). */
  adminTransaction: 'admin:transaction',
  /** Room 'admin': the scheduled ledger reconcile found mismatches. */
  adminLedgerMismatch: 'admin:ledger:mismatch',
  /** Room user:<id>: the player's VIP membership changed (purchase, grant, extend, revoke, expiry). */
  vipUpdated: 'vip:updated',
  /** Room 'admin': any VIP membership / package change (refreshes /admin/vip). */
  adminVip: 'admin:vip',
  /** Room user:<id>: subscription / token balance / quota changed (contracts/entitlements-2026-10.md). */
  perksUpdated: 'perks:updated',
  /** Room 'admin': any perks catalog / subscription / token / usage change (refreshes /admin/perks). */
  adminPerks: 'admin:perks',
  /** Room 'admin': chat moderation / channel mapping / bot status changed (refreshes /admin/chat). */
  adminChat: 'admin:chat',
} as const;

/** Client -> server: join / leave the public `servers` room. */
export const SERVERS_SUBSCRIBE = 'servers:subscribe';
export const SERVERS_UNSUBSCRIBE = 'servers:unsubscribe';

export type WalletReason = 'purchase' | 'refund' | 'topup' | 'admin' | 'reward' | 'transfer' | (string & {});

export interface WalletUpdatedEvent {
  /** Available IC balance, decimal string (same format as GET /wallet accounts.available). */
  balance: string;
  reason?: WalletReason;
  at?: string;
}

export interface OrderUpdatedEvent {
  orderId: string;
  status: string;
  at?: string;
}

export interface DeliveryUpdatedEvent {
  deliveryId: string;
  orderId?: string | null;
  /** pending | leased | completed | failed | dead_letter */
  status: string;
  at?: string;
}

export interface LiveServerStatus {
  id: number;
  online: boolean;
  players: number;
  maxPlayers?: number | null;
  version?: string | null;
  /** In-game session name (A2S), optional. */
  name?: string | null;
  source?: 'a2s' | 'heartbeat' | (string & {});
  /** Roster hash (A2S only); changes when someone joins/leaves even if the count does not. */
  playersRev?: string | null;
  map?: string | null;
}

/** Also the shape of GET /api/servers/status (full snapshot). */
export interface ServersStatusEvent {
  at?: string;
  servers: LiveServerStatus[];
}

export interface CatalogUpdatedEvent {
  at?: string;
}

export interface AdminEvent {
  at?: string;
  [key: string]: unknown;
}

/** 'vip:updated' (room user:<id>) — see backend/contracts/vip-2026-10.md. */
export interface VipUpdatedEvent {
  /** Current badge after the change; null when the player is no longer VIP. */
  vip?: { tierRank?: number; frameStyle?: string; label?: string } | null;
  reason?: 'purchase' | 'admin_grant' | 'admin_extend' | 'admin_revoke' | 'expired' | (string & {});
  expiresAt?: string | null;
  membershipId?: string;
  at?: string;
}

/** 'perks:updated' (room user:<id>) — see backend/contracts/entitlements-2026-10.md. */
export interface PerksUpdatedEvent {
  reason?: 'consume' | 'purchase' | 'admin_grant' | 'admin_tokens' | 'expired' | (string & {});
  /** Token balance after the change (null when not reported). */
  tokens?: number | null;
  at?: string;
}

/** 'admin:transaction' — see backend/contracts/admin-transactions-2026-10.md. */
export interface AdminTransactionEvent {
  id: string;
  type?: string | null;
  typeLabelTh?: string | null;
  /** Signed IC amount for the customer side (decimal string). */
  amount?: string | number | null;
  user?: { id?: string | null; name?: string | null } | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt?: string | null;
}

/** 'admin:ledger:mismatch' (room admin) — the scheduled reconcile found drift. */
export interface AdminLedgerMismatchEvent {
  at?: string;
  checkedAccounts?: number;
  mismatchCount?: number;
  legacyPointsMismatchCount?: number;
  unbalancedTransactionCount?: number;
  /** First few account mismatches (amounts as strings). */
  sample?: unknown[];
  [key: string]: unknown;
}
