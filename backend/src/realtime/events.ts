// Realtime event contract (backend/contracts/realtime-2026-10.md). Server -> client only.

export const RealtimeRooms = {
  user: (userId: string) => `user:${userId}`,
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
