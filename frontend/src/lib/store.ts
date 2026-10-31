import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toVipBadge, type VipBadge } from '@/lib/vip';
import { mergeCartLines, migrateCartState, type CartLine } from '@/lib/cartLines';

export { mergeCartLines, type CartLine };

// User role types
export type UserRole = 'user' | 'admin' | 'server_admin' | 'root';

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  server_admin: 2,
  root: 3,
};

// Helper functions for role checks
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

export function canAccessAdminPanel(role: UserRole): boolean {
  return role !== 'user';
}

export function canManageWebsite(role: UserRole): boolean {
  return role === 'admin' || role === 'root';
}

export function canManageServerUsers(role: UserRole): boolean {
  return role === 'server_admin' || role === 'root';
}

export interface User {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  epicId: string | null;
  /**
   * DEPRECATED for affordability checks. `pointsBalance` is a read-only
   * projection of the wallet ledger (contract: User.pointsBalance is a
   * decimal STRING). For "can the user pay?" use the wallet `available`
   * sub-account from GET /wallet via `canAfford()` below — never this field
   * and never client-side money math (TEAM_OWNERSHIP.md §2).
   */
  pointsBalance: number;
  isAdmin: boolean;
  role: UserRole;
  apiKeyServerId?: number | null;
  /** VIP frame data (GET /auth/me `user.vip`), null when not VIP. Refreshed by 'vip:updated'. */
  vip?: VipBadge | null;
}

/**
 * Store user from a GET /auth/me body (`{ user, vip? }`). The VIP badge may sit
 * on `user.vip` or at the top level; anything else is passed through as-is.
 */
export function userFromMe(data: unknown): User | null {
  const body = (data && typeof data === 'object' ? data : {}) as { user?: Record<string, unknown> | null; vip?: unknown };
  if (!body.user || typeof body.user !== 'object') return null;
  const raw = body.user;
  return {
    ...(raw as unknown as User),
    pointsBalance: Number(raw.pointsBalance ?? 0),
    // undefined = this backend does not report VIP in /me (callers then use GET /vip/badges).
    vip: raw.vip !== undefined ? toVipBadge(raw.vip) : body.vip !== undefined ? toVipBadge(body.vip) : undefined,
  };
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  /** Patch only the VIP badge (realtime 'vip:updated'). */
  setVip: (vip: VipBadge | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setVip: (vip) => set((state) => (state.user ? { user: { ...state.user, vip } } : state)),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

/* ------------------------------------------------------------------ *
 * Cart store
 *
 * Lines are keyed by productId alone. The player picks ONE delivery server
 * for the whole basket at checkout (`serverId`), so adding to the cart never
 * asks a server question. The backend cart contract still addresses lines by
 * the (productId, serverId) pair, so the cart page stamps the chosen server
 * onto every line when it syncs; the backend then validates the server
 * (online, delivery-ready, capabilities) before any money moves.
 *
 * MONEY RULE: this store never sums prices, applies discounts, or computes a
 * final total. Affordability is a comparison of two backend-authoritative
 * decimal strings only (wallet `available` vs. a backend-computed total such
 * as CheckoutSession.totalAmount). The backend ledger remains authoritative.
 * ------------------------------------------------------------------ */

/** Stable identity for a cart line (React keys, equality, maps). */
export function cartLineKey(productId: number): string {
  return String(productId);
}

interface CartState {
  items: CartLine[];
  /** Delivery server for the whole basket; null until the player picks one. Survives checkout as a default. */
  serverId: number | null;
  isDrawerOpen: boolean;
  /** Add (or increment) the line for a product. */
  addItem: (productId: number, quantity?: number, openDrawer?: boolean) => void;
  /** Remove the line for a product. */
  removeItem: (productId: number) => void;
  /** Set the quantity for a line; quantity <= 0 removes it. */
  setQuantity: (productId: number, quantity: number) => void;
  /** Choose the delivery server for the whole basket. */
  setServerId: (serverId: number | null) => void;
  setDrawerOpen: (open: boolean) => void;
  /** Empty the basket (the chosen server is kept as the next default). */
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      serverId: null,
      isDrawerOpen: false,
      addItem: (productId, quantity = 1, openDrawer = false) =>
        set((state) => {
          const safeQuantity = Math.max(1, Math.floor(quantity));
          const existing = state.items.find((item) => item.productId === productId);
          const newItems: CartLine[] = existing
            ? state.items.map((item) =>
                item.productId === productId ? { ...item, quantity: item.quantity + safeQuantity } : item
              )
            : [...state.items, { productId, quantity: safeQuantity }];
          return { items: newItems, isDrawerOpen: Boolean(openDrawer) };
        }),
      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.productId !== productId)
              : state.items.map((item) =>
                  item.productId === productId ? { ...item, quantity: Math.floor(quantity) } : item
                ),
        })),
      setServerId: (serverId) => set({ serverId }),
      setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'iris-cart-v1',
      // Persist the basket and the chosen server, not the transient modal state. Old saved drawers
      // must also start closed so refresh cannot trap focus behind startup UI.
      partialize: (state) => ({ items: state.items, serverId: state.serverId }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<CartState>), isDrawerOpen: false }),
      // v3: one delivery server per basket. v2 lines carried a serverId each; merge duplicates of the same
      // product (summing quantity) and keep the server of the most recently added line as the basket server.
      // v1 had a single global serverId and product-only lines, which already fits the v3 shape.
      version: 3,
      migrate: (persisted, version) => migrateCartState(persisted, version) as unknown as CartState,
    }
  )
);

/* ------------------------------------------------------------------ *
 * Affordability — comparison ONLY, no money math.
 *
 * Both arguments are backend-provided decimal strings (`^-?[0-9]+$`):
 *   - `available`: the wallet `available` sub-account from GET /wallet
 *   - `requiredTotal`: a backend-computed total (e.g.
 *     CheckoutSession.totalAmount). The frontend must NOT compute this from
 *     line prices — fetch it from the backend.
 *
 * Returns whether `available >= requiredTotal`. Implemented as a sign/length/
 * lexicographic comparison of normalized integer strings so it is exact for
 * arbitrarily large values and performs no arithmetic on amounts.
 * ------------------------------------------------------------------ */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const na = normalizeIntString(a);
  const nb = normalizeIntString(b);
  const aNeg = na.startsWith('-');
  const bNeg = nb.startsWith('-');
  if (aNeg && !bNeg) return -1;
  if (!aNeg && bNeg) return 1;
  const ua = aNeg ? na.slice(1) : na;
  const ub = bNeg ? nb.slice(1) : nb;
  let cmp: -1 | 0 | 1;
  if (ua.length !== ub.length) {
    cmp = ua.length < ub.length ? -1 : 1;
  } else if (ua === ub) {
    cmp = 0;
  } else {
    cmp = ua < ub ? -1 : 1;
  }
  // Both negative -> invert the magnitude comparison.
  if (aNeg && bNeg) return (cmp === 0 ? 0 : cmp === 1 ? -1 : 1) as -1 | 0 | 1;
  return cmp;
}

/** True when the available balance covers the backend-computed required total. */
export function canAfford(available: string, requiredTotal: string): boolean {
  return compareDecimalStrings(available, requiredTotal) >= 0;
}

function normalizeIntString(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!/^-?[0-9]+$/.test(trimmed)) return '0';
  const neg = trimmed.startsWith('-');
  let digits = (neg ? trimmed.slice(1) : trimmed).replace(/^0+/, '');
  if (digits === '') digits = '0';
  return neg && digits !== '0' ? `-${digits}` : digits;
}
