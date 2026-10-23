// Realtime event contract (backend/contracts/realtime-2026-10.md). Server -> client only.

export const RealtimeRooms = {
  user: (userId: string) => `user:${userId}`,
  /** Every socket authenticated by one UserSession (so a logout/revoke can disconnect them). */
  session: (sessionId: string) => `session:${sessionId}`,
  admin: 'admin',
  servers: 'servers',
} as const;

export const RealtimeEvents = {
  walletUpdated: 'wallet:updated',
  orderUpdated: 'order:updated',
  deliveryUpdated: 'delivery:updated',
  serversStatus: 'servers:status',
  catalogUpdated: 'catalog:updated',
  adminSlipCreated: 'admin:slip:created',
  adminDeliveryFailed: 'admin:delivery:failed',
  adminTransaction: 'admin:transaction',
  adminLedgerMismatch: 'admin:ledger:mismatch',
  vipUpdated: 'vip:updated',
  adminVip: 'admin:vip',
} as const;

// Client -> server
export const RealtimeClientEvents = {
  serversSubscribe: 'servers:subscribe',
  serversUnsubscribe: 'servers:unsubscribe',
} as const;

export type WalletUpdateReason =
  | 'purchase'
  | 'refund'
  | 'topup'
  | 'admin'
  | 'reward'
  | 'transfer'
  | (string & {});

export interface WalletUpdatedEvent {
  /** Available IC balance (string bigint) — same value as GET /api/wallet `accounts.available`. */
  balance: string;
  currency: 'IC';
  /** Same shape as GET /api/wallet `accounts`. */
  accounts: Record<string, string>;
  /** Same as GET /api/wallet `total`. */
  total: string;
  reason: WalletUpdateReason;
  at: string;
}

export interface OrderUpdatedEvent {
  orderId: string;
  status: string;
  at: string;
}

export interface DeliveryUpdatedEvent {
  deliveryId: string;
  orderId?: string;
  deliveryType: string;
  /** DeliveryJob status: pending | leased | completed | failed | dead_letter */
  status: string;
  at: string;
}

export type ServerStatusSource = 'a2s' | 'heartbeat';

export interface ServerLiveStatus {
  id: number;
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
  version?: string | null;
  map?: string | null;
  /** A2S session name without the "(v361.7)" build suffix — what players search for in the in-game browser. */
  name?: string | null;
  source: ServerStatusSource;
}

export interface ServersStatusEvent {
  at: string;
  servers: ServerLiveStatus[];
}

export interface CatalogUpdatedEvent {
  at: string;
  scope?: 'products' | 'categories' | (string & {});
}

export interface AdminSlipCreatedEvent {
  intentId: string;
  at: string;
}

export interface AdminDeliveryFailedEvent {
  deliveryId: string;
  deliveryType: string;
  serverId: number;
  at: string;
}

/** One per posted ledger transaction (contracts/admin-transactions-2026-10.md). */
export interface AdminTransactionEvent {
  id: string;
  type: string;
  typeLabelTh: string;
  /** Signed IC (bigint string) for the customer side; null for system-only transactions. */
  amount: string | null;
  user: { id: string; name: string | null } | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/** Public VIP badge (contracts/vip-2026-10.md). */
export interface VipBadgePayload {
  tierRank: number;
  frameStyle: string;
  label: string;
}

/** vip:updated -> user:<id>. The user's VIP state changed (purchase, admin grant/extend/revoke, expiry). */
export interface VipUpdatedEvent {
  /** Current badge, null when the user no longer holds VIP. */
  vip: VipBadgePayload | null;
  /** Latest expiry over the user's effective VIP rows; null = permanent or not VIP (see vip). */
  expiresAt: string | null;
  reason: 'purchase' | 'admin_grant' | 'admin_extend' | 'admin_revoke' | 'expired' | 'sync' | (string & {});
  at: string;
}

/** admin:vip -> room admin. Any VIP membership / permission-sync change. */
export interface AdminVipEvent {
  action: 'granted' | 'extended' | 'revoked' | 'expired' | 'sync' | 'resync' | 'package' | (string & {});
  userId: string | null;
  membershipId: string | null;
  /** For action=sync: synced | failed. */
  status?: string | null;
  at: string;
}

/** Scheduled reconciliation found drift between cached balances and the ledger. */
export interface AdminLedgerMismatchEvent {
  at: string;
  checkedAccounts: number;
  mismatchCount: number;
  legacyPointsMismatchCount: number;
  unbalancedTransactionCount: number;
  /** First few account mismatches (amounts as bigint strings). */
  sample: Array<{ accountId: string; userId: string | null; cachedBalance: string; ledgerSum: string }>;
}
