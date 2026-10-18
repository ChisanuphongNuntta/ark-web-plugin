'use client';

/**
 * Maps Socket.IO events onto react-query caches and the auth store so every
 * page updates without a refresh. Mounted once in <Providers>.
 *
 *   wallet:updated   -> navbar IC pill + wallet/profile queries
 *   order:updated    -> orders, order detail, dashboard + Thai toast
 *   delivery:updated -> order detail / delivery timelines + Thai toast
 *   catalog:updated  -> product lists
 *   servers:status   -> live server status cache (room 'servers')
 *   admin:*          -> admin slip / delivery queues (staff sockets only)
 *
 * The polling fallbacks live in lib/realtime/queryKeys.ts
 * (applyRealtimeFallbackDefaults).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ensureSocket, getSocket, onSocketEvent, reauthenticateSocket, useSocketStatus } from '@/lib/socket';
import { useAuthStore } from '@/lib/store';
import {
  REALTIME_EVENTS,
  type CatalogUpdatedEvent,
  type DeliveryUpdatedEvent,
  type OrderUpdatedEvent,
  type ServersStatusEvent,
  type WalletUpdatedEvent,
} from '@/lib/realtime/events';
import {
  SERVERS_STATUS_KEY,
  isAdminOpsQuery,
  isCatalogQuery,
  isLegacyServerListQuery,
  isOrderQuery,
} from '@/lib/realtime/queryKeys';
import { applyWalletBalance, invalidateWalletQueries, syncWalletNow } from '@/lib/realtime/walletSync';
import { applyServersStatusEvent } from '@/lib/realtime/serverStatus';
import { pushToast } from '@/lib/realtime/toastStore';
import { RealtimeToaster } from './RealtimeToaster';

const LEGACY_SERVER_REFRESH_MS = 30_000;
const WALLET_FALLBACK_MS = 60_000;

function formatIc(balance: string): string {
  const n = Number(balance);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : balance;
}

// Deliveries for one checkout (one order per cart line) complete within seconds of each other:
// collect them briefly and show a single toast instead of one per order.
const DELIVERED_BATCH_MS = 2_500;
const deliveredBatch = new Set<string>();
const deliveredToasted = new Set<string>();
let deliveredTimer: ReturnType<typeof setTimeout> | null = null;

function flushDelivered() {
  deliveredTimer = null;
  const fresh = [...deliveredBatch].filter((ref) => !deliveredToasted.has(ref));
  deliveredBatch.clear();
  if (fresh.length === 0) return;
  fresh.forEach((ref) => deliveredToasted.add(ref));
  if (fresh.length === 1) {
    pushToast({
      tone: 'success',
      title: 'ส่งของเข้าเกมแล้ว',
      description: 'ตรวจสอบกระเป๋าตัวละครในเกมได้เลย',
      href: `/orders/${encodeURIComponent(fresh[0])}`,
    });
    return;
  }
  pushToast({
    tone: 'success',
    title: `ส่งของเข้าเกมแล้ว ${fresh.length.toLocaleString('th-TH')} รายการ`,
    description: 'ตรวจสอบกระเป๋าตัวละครในเกมได้เลย',
    href: '/orders',
  });
}

/** order:updated 'delivered' and delivery:updated 'completed' for the same order count once. */
function queueDelivered(ref: string) {
  if (deliveredToasted.has(ref)) return;
  deliveredBatch.add(ref);
  if (!deliveredTimer) deliveredTimer = setTimeout(flushDelivered, DELIVERED_BATCH_MS);
}

function orderToast(event: OrderUpdatedEvent) {
  const href = `/orders/${encodeURIComponent(event.orderId)}`;
  switch (event.status) {
    case 'delivered':
      queueDelivered(event.orderId);
      break;
    case 'failed':
      pushToast({ tone: 'error', title: 'ส่งของไม่สำเร็จ', description: 'ดูรายละเอียดหรือติดต่อทีมงานจากหน้าคำสั่งซื้อ', href, dedupeKey: `failed:${event.orderId}`, once: true });
      break;
    case 'refunded':
      // Refunds credit the refundable sub-account, not the spendable balance in the navbar pill.
      pushToast({ tone: 'info', title: 'คืนเหรียญเข้ายอดที่ขอคืนได้แล้ว', description: 'ดูรายละเอียดได้ที่หน้าคำสั่งซื้อ', href, dedupeKey: `refunded:${event.orderId}`, once: true });
      break;
    case 'cancelled':
      pushToast({ tone: 'warning', title: 'คำสั่งซื้อถูกยกเลิก', href, dedupeKey: `cancelled:${event.orderId}`, once: true });
      break;
    default:
      break;
  }
}

function deliveryToast(event: DeliveryUpdatedEvent) {
  const ref = event.orderId ?? event.deliveryId;
  const href = event.orderId ? `/orders/${encodeURIComponent(event.orderId)}` : '/orders';
  switch (event.status) {
    // 'pending' / 'leased' / 'released' repeat every plugin poll while the buyer is offline:
    // they refresh the order timeline (query invalidation) but never toast.
    case 'completed':
      queueDelivered(ref);
      break;
    case 'failed':
      pushToast({ tone: 'warning', title: 'ส่งของยังไม่สำเร็จ', description: 'ระบบจะลองส่งใหม่อัตโนมัติ', href, dedupeKey: `retry:${ref}`, once: true });
      break;
    case 'dead_letter':
      pushToast({ tone: 'error', title: 'ส่งของไม่สำเร็จ', description: 'ทีมงานได้รับแจ้งแล้ว หรือติดต่อศูนย์ช่วยเหลือ', href, dedupeKey: `failed:${ref}`, once: true });
      break;
    default:
      break;
  }
}

function walletToast(event: WalletUpdatedEvent) {
  const balance = `ยอดคงเหลือ ${formatIc(event.balance)} IC`;
  switch (event.reason) {
    case 'topup':
      pushToast({ tone: 'success', title: 'เติมเหรียญสำเร็จ', description: balance, href: '/profile', dedupeKey: `wallet:topup:${event.at ?? event.balance}` });
      break;
    case 'reward':
      pushToast({ tone: 'success', title: 'ได้รับรางวัลเหรียญ', description: balance, dedupeKey: `wallet:reward:${event.at ?? event.balance}` });
      break;
    case 'admin':
      pushToast({ tone: 'info', title: 'ยอดเหรียญได้รับการปรับปรุง', description: balance, dedupeKey: `wallet:admin:${event.at ?? event.balance}` });
      break;
    default:
      // purchase / transfer: the buyer already sees the result on screen.
      // refund: goes to the refundable sub-account (balance here is unchanged); the
      // order:updated 'refunded' toast covers it.
      break;
  }
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const authLoading = useAuthStore((state) => state.isLoading);
  const connectCount = useSocketStatus((state) => state.connectCount);
  const lastUserId = useRef<string | null | undefined>(undefined);
  const lastLegacyServerRefresh = useRef(0);

  // Connect once, and repeat the handshake when the signed-in user changes.
  useEffect(() => {
    if (authLoading) return;
    if (lastUserId.current === undefined) {
      lastUserId.current = userId;
      ensureSocket();
      return;
    }
    if (lastUserId.current !== userId) {
      lastUserId.current = userId;
      reauthenticateSocket();
    }
  }, [userId, authLoading]);

  // Event wiring (listeners survive reconnects on the shared socket).
  useEffect(() => {
    if (!getSocket() && !ensureSocket()) return;

    const offs = [
      onSocketEvent<WalletUpdatedEvent>(REALTIME_EVENTS.walletUpdated, (event) => {
        if (!event) return;
        applyWalletBalance(event.balance);
        void invalidateWalletQueries(queryClient);
        walletToast(event);
      }),
      onSocketEvent<OrderUpdatedEvent>(REALTIME_EVENTS.orderUpdated, (event) => {
        if (!event?.orderId) return;
        void queryClient.invalidateQueries({ predicate: isOrderQuery });
        orderToast(event);
      }),
      onSocketEvent<DeliveryUpdatedEvent>(REALTIME_EVENTS.deliveryUpdated, (event) => {
        if (!event?.deliveryId) return;
        void queryClient.invalidateQueries({ predicate: isOrderQuery });
        deliveryToast(event);
      }),
      onSocketEvent<CatalogUpdatedEvent>(REALTIME_EVENTS.catalogUpdated, () => {
        void queryClient.invalidateQueries({ predicate: isCatalogQuery });
      }),
      onSocketEvent<ServersStatusEvent>(REALTIME_EVENTS.serversStatus, (event) => {
        if (!event || !Array.isArray(event.servers)) return;
        applyServersStatusEvent(queryClient, event);
        const now = Date.now();
        if (now - lastLegacyServerRefresh.current > LEGACY_SERVER_REFRESH_MS) {
          lastLegacyServerRefresh.current = now;
          void queryClient.invalidateQueries({ predicate: isLegacyServerListQuery });
        }
      }),
    ];

    const socket = getSocket();
    const onAdminEvent = (event: string) => {
      if (!event.startsWith('admin:')) return;
      void queryClient.invalidateQueries({ predicate: isAdminOpsQuery });
    };
    socket?.onAny(onAdminEvent);

    return () => {
      offs.forEach((off) => off());
      socket?.offAny(onAdminEvent);
    };
  }, [queryClient]);

  // After a reconnect, anything may have changed while we were away.
  useEffect(() => {
    if (connectCount <= 1) return;
    void syncWalletNow(queryClient);
    void queryClient.invalidateQueries({ predicate: isOrderQuery });
    void queryClient.invalidateQueries({ queryKey: SERVERS_STATUS_KEY });
  }, [connectCount, queryClient]);

  // Fallback for the navbar pill if the socket is down: re-read the wallet on
  // focus and every 60 s while the tab is visible.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void syncWalletNow(queryClient);
    };
    const timer = window.setInterval(refresh, WALLET_FALLBACK_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, queryClient]);

  return (
    <>
      {children}
      <RealtimeToaster />
    </>
  );
}
