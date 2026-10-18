import prisma from '../config/database.js';
import { getRealtimeServer } from './io.js';
import {
  RealtimeEvents,
  RealtimeRooms,
  type AdminDeliveryFailedEvent,
  type AdminSlipCreatedEvent,
  type CatalogUpdatedEvent,
  type DeliveryUpdatedEvent,
  type OrderUpdatedEvent,
  type ServersStatusEvent,
  type WalletUpdateReason,
  type WalletUpdatedEvent,
} from './events.js';

// Emit helpers. Every function is fire-and-forget: it never throws into the caller (a realtime
// failure must not fail a purchase) and is a no-op when this process has no Socket.IO server.
// Callers inside a transaction should wrap these in afterCommit() so nothing is emitted for a
// rolled-back write. Payloads carry only the recipient's own data — never secrets, tokens,
// steam ids, or other users' information.

/** Delivery types whose DeliveryJob.referenceId is an Order id (see deliveryAdmin.service). */
export const ORDER_BACKED_DELIVERY_TYPES: ReadonlySet<string> = new Set(['order', 'dino_catalog']);

const now = () => new Date().toISOString();

function emitTo(room: string, event: string, payload: unknown): boolean {
  const io = getRealtimeServer();
  if (!io) return false;
  try {
    io.to(room).emit(event, payload);
    return true;
  } catch (error) {
    console.error(`[realtime] emit ${event} -> ${room} failed:`, error);
    return false;
  }
}

/** Map a ledger transaction type to the coarse wallet:updated reason shown to the user. */
export function walletReasonFor(ledgerType: string): WalletUpdateReason {
  const type = ledgerType.toLowerCase();
  if (type.includes('refund')) return 'refund';
  if (type.includes('topup') || type.includes('slip') || type.includes('payment')) return 'topup';
  if (type.startsWith('admin')) return 'admin';
  if (type.startsWith('earn') || type.includes('reward')) return 'reward';
  if (type.includes('release') || type.includes('transfer') || type.includes('legacy')) return 'transfer';
  if (type.includes('purchase') || type.includes('hold') || type.includes('checkout')) return 'purchase';
  return ledgerType;
}

export async function buildWalletPayload(userId: string, reason: WalletUpdateReason): Promise<WalletUpdatedEvent> {
  const accounts = await prisma.walletAccount.findMany({
    where: { userId, currency: 'IC' },
    select: { type: true, balance: true },
  });
  const byType = Object.fromEntries(accounts.map((account) => [account.type, account.balance.toString()]));
  const total = accounts.reduce((sum, account) => sum + account.balance, 0n).toString();
  return {
    balance: byType.available ?? '0',
    currency: 'IC',
    accounts: byType,
    total,
    reason,
    at: now(),
  };
}

export async function emitWalletUpdated(userIds: Iterable<string>, reason: WalletUpdateReason): Promise<void> {
  if (!getRealtimeServer()) return;
  for (const userId of new Set(userIds)) {
    try {
      const payload = await buildWalletPayload(userId, reason);
      emitTo(RealtimeRooms.user(userId), RealtimeEvents.walletUpdated, payload);
    } catch (error) {
      console.error('[realtime] wallet:updated failed:', error);
    }
  }
}

export function emitOrderUpdated(userId: string, orderId: string, status: string): void {
  const payload: OrderUpdatedEvent = { orderId, status, at: now() };
  emitTo(RealtimeRooms.user(userId), RealtimeEvents.orderUpdated, payload);
}

export function emitOrdersUpdated(userId: string, orderIds: Iterable<string>, status: string): void {
  for (const orderId of orderIds) emitOrderUpdated(userId, orderId, status);
}

export interface DeliveryChange {
  deliveryId: string;
  deliveryType: string;
  referenceId: string;
  status: string;
  /** Owner, if the caller already knows it; otherwise resolved from the order / dino listing. */
  userId?: string | null;
}

async function resolveDeliveryOwner(change: DeliveryChange): Promise<string | null> {
  if (change.userId) return change.userId;
  if (ORDER_BACKED_DELIVERY_TYPES.has(change.deliveryType)) {
    const order = await prisma.order.findUnique({ where: { id: change.referenceId }, select: { userId: true } });
    return order?.userId ?? null;
  }
  if (change.deliveryType === 'dino_marketplace') {
    const listing = await prisma.dinoListing.findUnique({ where: { id: change.referenceId }, select: { buyerId: true } });
    return listing?.buyerId ?? null;
  }
  return null;
}

export async function emitDeliveryUpdated(change: DeliveryChange): Promise<void> {
  if (!getRealtimeServer()) return;
  try {
    const userId = await resolveDeliveryOwner(change);
    if (!userId) return;
    const payload: DeliveryUpdatedEvent = {
      deliveryId: change.deliveryId,
      ...(ORDER_BACKED_DELIVERY_TYPES.has(change.deliveryType) ? { orderId: change.referenceId } : {}),
      deliveryType: change.deliveryType,
      status: change.status,
      at: now(),
    };
    emitTo(RealtimeRooms.user(userId), RealtimeEvents.deliveryUpdated, payload);
  } catch (error) {
    console.error('[realtime] delivery:updated failed:', error);
  }
}

export function emitServersStatus(payload: ServersStatusEvent): void {
  emitTo(RealtimeRooms.servers, RealtimeEvents.serversStatus, payload);
}

let catalogTimer: NodeJS.Timeout | null = null;
let pendingCatalogScope: CatalogUpdatedEvent['scope'] = 'products';
/** Broadcast to everyone; coalesced to at most one event per second (bulk admin edits). */
export function emitCatalogUpdated(scope: CatalogUpdatedEvent['scope'] = 'products'): void {
  if (!getRealtimeServer()) return;
  pendingCatalogScope = catalogTimer && pendingCatalogScope !== scope ? 'all' : scope;
  if (catalogTimer) return;
  catalogTimer = setTimeout(() => {
    catalogTimer = null;
    const io = getRealtimeServer();
    if (!io) return;
    try {
      const payload: CatalogUpdatedEvent = { at: now(), scope: pendingCatalogScope };
      io.emit(RealtimeEvents.catalogUpdated, payload);
    } catch (error) {
      console.error('[realtime] catalog:updated failed:', error);
    }
  }, 1000);
  catalogTimer.unref?.();
}

export function emitAdminSlipCreated(intentId: string): void {
  const payload: AdminSlipCreatedEvent = { intentId, at: now() };
  emitTo(RealtimeRooms.admin, RealtimeEvents.adminSlipCreated, payload);
}

export function emitAdminDeliveryFailed(deliveryId: string, deliveryType: string, serverId: number): void {
  const payload: AdminDeliveryFailedEvent = { deliveryId, deliveryType, serverId, at: now() };
  emitTo(RealtimeRooms.admin, RealtimeEvents.adminDeliveryFailed, payload);
}
