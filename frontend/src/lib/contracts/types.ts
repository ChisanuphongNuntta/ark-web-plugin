/**
 * Typed mirror of the Backend contract schemas.
 *
 * SOURCE OF TRUTH: backend/contracts/openapi.yaml (#/components/schemas/*)
 * Backend owns these shapes. Do NOT diverge here — if the UI needs a field
 * that the contract does not provide, propose the change back to Backend
 * (see TEAM_OWNERSHIP.md rule 5) rather than inventing it on the frontend.
 *
 * Money rule (contract): catalog Product.price is an INTEGER (Iris Coin);
 * every wallet ledger amount/balance is a DECIMAL STRING (/^-?[0-9]+$/).
 * Never compute final prices or business rules on the frontend — the
 * backend is authoritative for totals, discounts, stock and limits.
 */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /** Present on GET /products/categories */
  _count?: { products: number };
}

/**
 * Catalog product. Contract field is `itemBlueprint` (matches openapi.yaml
 * Product.itemBlueprint, the live API, and fixtures/products.json).
 */
export interface Product {
  id: number;
  categoryId?: number | null;
  name: string;
  description?: string | null;
  /** Iris Coin price — INTEGER per contract. */
  price: number;
  itemBlueprint?: string | null;
  /**
   * @deprecated Legacy alias of `itemBlueprint`. Kept optional only so any
   * not-yet-migrated caller still type-checks; read `itemBlueprint`.
   */
  blueprint?: string | null;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  imageUrl?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  maxPerUser?: number | null;
  stock?: number | null;
  createdAt?: string;
  updatedAt?: string;
  category?: Category | null;
}

export interface ProductListResponse {
  products: Product[];
  pagination: Pagination;
}

export interface CategoriesResponse {
  categories: Category[];
}

export interface FeaturedResponse {
  products: Product[];
}

export interface ProductDetailResponse {
  product: Product;
}

/** Server live status. isOnline is DERIVED from lastHeartbeat, not stored. */
export interface ServerStatus {
  id: number;
  name: string;
  map?: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastHeartbeat?: string | null;
  chatTag?: string | null;
  chatColor?: string | null;
  chatIcon?: string | null;
}

export interface ServersResponse {
  servers: ServerStatus[];
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: number;
  serverId: number;
  quantity: number;
  createdAt?: string;
  updatedAt?: string;
  product?: {
    id: number;
    name: string;
    price: number;
    itemBlueprint?: string;
    quantity: number;
    quality: number;
    isBlueprint: boolean;
  };
  server?: {
    id: number;
    name: string;
    map?: string | null;
  };
}

export interface Cart {
  id: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
  items: CartItem[];
}

export interface CheckoutSession {
  id: string;
  userId: string;
  cartSnapshot: unknown;
  /** Decimal STRING = backend-computed sum of snapshot price*quantity. */
  totalAmount: string;
  status: 'pending' | 'completed' | 'expired';
  idempotencyKey: string;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CheckoutCommitResponse {
  success: boolean;
  orderIds: string[];
  totalSpent: string;
}

/** Decimal-string balances per sub-account. */
export interface WalletBalance {
  currency: string;
  accounts: {
    available: string;
    held: string;
    promotional: string;
    refundable: string;
    [key: string]: string;
  };
  total: string;
}

export interface LedgerEntry {
  id: string;
  /** Decimal string. */
  amount: string;
  /** Decimal string. */
  balanceAfter: string;
  account: {
    key: string;
    type: string;
    currency: string;
  };
}

export interface LedgerTransaction {
  id: string;
  idempotencyKey: string;
  type: string;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdAt: string;
  entries: LedgerEntry[];
}

export interface WalletTransactionsResponse {
  transactions: LedgerTransaction[];
  pagination: Pagination;
}

/* ---------------------------- IRIS ID / Auth ---------------------------- */

export type IdentityProvider = 'discord' | 'steam' | 'epic';

/** Proof-of-control methods accepted by the backend for linking. */
export type LinkProofMethod =
  | 'steam_openid'
  | 'epic_oauth'
  | 'discord_oauth'
  | 'provider_callback';

/**
 * One row of the Account Center linked-identities view
 * (fixtures/linked-identities.json). A provider with a null
 * providerAccountId / linkedAt is NOT linked yet.
 */
export interface LinkedIdentity {
  provider: IdentityProvider;
  providerAccountId: string | null;
  displayName: string | null;
  linkedAt: string | null;
  proofMethod: LinkProofMethod | null;
  isPrimary: boolean;
  /** Backend-decided: false when unlinking would break the minimum-linked rule. */
  canUnlink: boolean;
}

export interface IdentityRules {
  autoMergeByEmailOrName: boolean;
  proofOfControlRequired: boolean;
  minimumLinkedProviders: number;
  note?: string;
}

/** GET (Account Center linked-identities view). */
export interface LinkedIdentitiesResponse {
  userId: string;
  identities: LinkedIdentity[];
  rules: IdentityRules;
}

/** Risk-based login reasons surfaced per session. */
export type SessionRiskReason = 'new_ip' | 'new_device';

/**
 * GET /auth/sessions item. Extends the base UserSession with derived
 * risk flags (openapi.yaml SessionWithRisk).
 */
export interface SessionWithRisk {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  isActive?: boolean;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  isCurrent: boolean;
  riskFlag: boolean;
  riskReasons: SessionRiskReason[];
}
