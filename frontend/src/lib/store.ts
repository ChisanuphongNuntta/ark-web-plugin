import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface User {
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
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
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
 * Lines are keyed by the (productId, serverId) PAIR — matching the backend
 * cart contract (openapi.yaml CartItem requires both productId AND serverId;
 * POST/PUT/DELETE /cart/items are addressed by the pair). The same product
 * on two different servers is two distinct lines.
 *
 * MONEY RULE: this store never sums prices, applies discounts, or computes a
 * final total. Affordability is a comparison of two backend-authoritative
 * decimal strings only (wallet `available` vs. a backend-computed total such
 * as CheckoutSession.totalAmount). The backend ledger remains authoritative.
 * ------------------------------------------------------------------ */

export interface CartLine {
  productId: number;
  serverId: number;
  quantity: number;
}

/** Stable identity for a cart line (React keys, equality, maps). */
export function cartLineKey(productId: number, serverId: number): string {
  return `${productId}:${serverId}`;
}

function sameLine(line: CartLine, productId: number, serverId: number): boolean {
  return line.productId === productId && line.serverId === serverId;
}

interface CartState {
  items: CartLine[];
  isDrawerOpen: boolean;
  /** Add (or increment) the line for the (productId, serverId) pair. */
  addItem: (productId: number, serverId: number, quantity?: number) => void;
  /** Remove the line for the (productId, serverId) pair. */
  removeItem: (productId: number, serverId: number) => void;
  /** Set the quantity for a line; quantity <= 0 removes it. */
  setQuantity: (productId: number, serverId: number, quantity: number) => void;
  /** Move a line to a different target server, merging if the target exists. */
  setLineServer: (productId: number, fromServerId: number, toServerId: number) => void;
  setDrawerOpen: (open: boolean) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isDrawerOpen: false,
      addItem: (productId, serverId, quantity = 1) =>
        set((state) => {
          const safeQuantity = Math.max(1, Math.floor(quantity));
          const existing = state.items.find((item) => sameLine(item, productId, serverId));
          let newItems: CartLine[];
          if (existing) {
            newItems = state.items.map((item) =>
              sameLine(item, productId, serverId)
                ? { ...item, quantity: item.quantity + safeQuantity }
                : item
            );
          } else {
            newItems = [...state.items, { productId, serverId, quantity: safeQuantity }];
          }
          return { items: newItems, isDrawerOpen: true }; // Auto-open drawer on add
        }),
      removeItem: (productId, serverId) =>
        set((state) => ({
          items: state.items.filter((item) => !sameLine(item, productId, serverId)),
        })),
      setQuantity: (productId, serverId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => !sameLine(item, productId, serverId))
              : state.items.map((item) =>
                  sameLine(item, productId, serverId)
                    ? { ...item, quantity: Math.floor(quantity) }
                    : item
                ),
        })),
      setLineServer: (productId, fromServerId, toServerId) =>
        set((state) => {
          if (fromServerId === toServerId) return state;
          const moving = state.items.find((item) => sameLine(item, productId, fromServerId));
          if (!moving) return state;
          const rest = state.items.filter((item) => !sameLine(item, productId, fromServerId));
          const targetIdx = rest.findIndex((item) => sameLine(item, productId, toServerId));
          if (targetIdx >= 0) {
            // Merge into the existing line on the target server.
            rest[targetIdx] = {
              ...rest[targetIdx],
              quantity: rest[targetIdx].quantity + moving.quantity,
            };
            return { items: rest };
          }
          return { items: [...rest, { ...moving, serverId: toServerId }] };
        }),
      setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'iris-cart-v1',
      // v2: lines are keyed by (productId, serverId). The v1 shape kept a
      // single global `serverId` and product-only lines. Migrate by stamping
      // each old line with the old global serverId (or dropping it if none).
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          const old = persisted as {
            items?: Array<{ productId: number; serverId?: number; quantity: number }>;
            serverId?: number | null;
          };
          const globalServerId = typeof old.serverId === 'number' ? old.serverId : null;
          const migratedItems: CartLine[] = (old.items ?? [])
            .map((item) => {
              const serverId =
                typeof item.serverId === 'number' ? item.serverId : globalServerId;
              if (serverId === null || serverId === undefined) return null;
              return { productId: item.productId, serverId, quantity: item.quantity };
            })
            .filter((x): x is CartLine => x !== null);
          return { items: migratedItems, isDrawerOpen: false };
        }
        return persisted as CartState;
      },
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
