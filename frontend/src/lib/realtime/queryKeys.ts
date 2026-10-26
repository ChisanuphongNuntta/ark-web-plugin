/**
 * Which react-query caches each realtime event touches.
 *
 * The app grew many ad-hoc query keys, so matching is done on the first key
 * segment. Keep these lists in sync when adding wallet/order/catalog queries.
 */
import type { Query, QueryClient } from '@tanstack/react-query';

/** Live server status snapshot (GET /servers/status, servers:status). */
export const SERVERS_STATUS_KEY = ['servers', 'status'] as const;
/** Public server directory (GET /servers/directory). */
export const SERVERS_DIRECTORY_KEY = ['servers', 'directory'] as const;
/** Player list of one server (GET /servers/:id/players). */
export const serverPlayersKey = (serverId: number) => ['servers', 'players', serverId] as const;

const WALLET_ROOTS = new Set([
  'wallet',
  'wallet-balance',
  'wallet-balance-cart-contract',
  'user-wallet-popup',
  'dashboard-wallet',
  'user',
  'user-profile',
  'profile',
]);

const ORDER_ROOTS = new Set([
  'orders',
  'order-detail',
  'dashboard-active-orders',
  'myDinoPurchases',
  'myDinoListings',
]);

const CATALOG_ROOTS = new Set([
  'featured-products',
  'catalog-categories',
  'categories',
  'catalog-kits',
  'products-block',
  'cart-product-contract',
  'product-drawer-contract',
]);

/** Legacy server lists that show online/player counts. */
const SERVER_LIST_ROOTS = new Set([
  'servers',
  'home-servers',
  'servers-cart-contract',
  'dinoDeliveryServers',
]);

function root(query: Query): unknown {
  return query.queryKey[0];
}

export function isWalletQuery(query: Query): boolean {
  return WALLET_ROOTS.has(String(root(query)));
}

export function isOrderQuery(query: Query): boolean {
  const r = String(root(query));
  return ORDER_ROOTS.has(r) || /deliver/i.test(r);
}

export function isCatalogQuery(query: Query): boolean {
  const [first, second] = query.queryKey;
  if (first === 'contract' && second === 'products') return true;
  return CATALOG_ROOTS.has(String(first));
}

/** Legacy server lists, excluding the live caches the realtime layer writes itself. */
export function isLegacyServerListQuery(query: Query): boolean {
  const [first, second] = query.queryKey;
  if (first === 'contract' && second === 'servers') return true;
  if (first === 'servers' && (second === 'status' || second === 'directory' || second === 'players')) return false;
  return SERVER_LIST_ROOTS.has(String(first));
}

export function isAdminOpsQuery(query: Query): boolean {
  const r = String(root(query));
  return r.startsWith('admin') && /(topup|slip|payment|deliver|stats|dashboard|order|vip|market|audit)/i.test(r);
}

/** Player VIP caches (GET /vip/me, /vip/packages) refreshed by 'vip:updated'. */
export const VIP_ME_KEY = ['vip-me'] as const;
export const VIP_PACKAGES_KEY = ['vip-packages'] as const;

/** Player perks caches (GET /perks/me, /perks/catalog) refreshed by 'perks:updated'. */
export const PERKS_ME_KEY = ['perks-me'] as const;
export const PERKS_CATALOG_KEY = ['perks-catalog'] as const;

/**
 * Self-healing defaults: if the socket drops, these caches still refresh on
 * window focus and every 60 s while the tab is visible. Per-query options win.
 */
export function applyRealtimeFallbackDefaults(client: QueryClient): void {
  const live = { refetchOnWindowFocus: true, refetchInterval: 60_000, staleTime: 15_000 } as const;
  [...WALLET_ROOTS, ...ORDER_ROOTS, 'servers', 'home-servers'].forEach((key) => {
    client.setQueryDefaults([key], live);
  });
}
