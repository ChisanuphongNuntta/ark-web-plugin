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

// Cart store (for multi-item purchases in the future)
interface CartItem {
  productId: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  serverId: number | null;
  isDrawerOpen: boolean;
  addItem: (productId: number, quantity?: number) => void;
  removeItem: (productId: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  setServer: (serverId: number) => void;
  setDrawerOpen: (open: boolean) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      serverId: null,
      isDrawerOpen: false,
      addItem: (productId, quantity = 1) =>
        set((state) => {
          const safeQuantity = Math.max(1, Math.floor(quantity));
          const existing = state.items.find((item) => item.productId === productId);
          let newItems;
          if (existing) {
            newItems = state.items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + safeQuantity } : item);
          } else {
            newItems = [...state.items, { productId, quantity: safeQuantity }];
          }
          return { items: newItems, isDrawerOpen: true }; // Automatically open cart drawer on add!
        }),
      removeItem: (productId) => set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),
      setQuantity: (productId, quantity) => set((state) => ({ items: quantity <= 0 ? state.items.filter((item) => item.productId !== productId) : state.items.map((item) => item.productId === productId ? { ...item, quantity: Math.floor(quantity) } : item) })),
      setServer: (serverId) => set({ serverId }),
      setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
      clear: () => set({ items: [], serverId: null }),
    }),
    { name: 'iris-cart-v1', version: 1 }
  )
);
