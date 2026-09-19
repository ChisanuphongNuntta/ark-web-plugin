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
  productType?: 'item' | 'dino' | 'engram' | 'kit';
  deliveryPayload?: {
    spawn?: {
      blueprint?: string;
      level?: number;
      forceTame?: boolean;
      neutered?: boolean;
      command?: string;
    };
    [key: string]: unknown;
  } | null;
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

/* ------------------------------- Orders (M3) ------------------------------ *
 * Order state machine (§8). Contract enum OrderStatus. `pending` is a legacy
 * single-item status kept for not-yet-migrated rows. The frontend renders
 * status but never decides transitions — the backend owns the machine.
 * ------------------------------------------------------------------------- */
export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'queued'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'refunded'
  | 'cancelled'
  /** @deprecated legacy single-item status (pre-M3 rows). */
  | 'pending';

/**
 * One order row (openapi.yaml Order). `totalPrice` is an INTEGER Iris Coin
 * amount echoed from the backend — never recomputed on the frontend.
 */
export interface Order {
  id: string;
  userId: string;
  productId: number;
  serverId: number;
  quantity: number;
  /** Iris Coin charged — INTEGER per contract; the wallet ledger is authoritative. */
  totalPrice: number;
  status: OrderStatus;
  deliveredAt?: string | null;
  deliveryAttempts?: number;
  lastError?: string | null;
  paidAt?: string | null;
  queuedAt?: string | null;
  refundedAt?: string | null;
  checkoutSessionId?: string | null;
  createdAt: string;
  updatedAt?: string;
  product?: Product;
  server?: {
    id: number;
    name: string;
    map?: string | null;
  };
}

export interface OrderListResponse {
  orders: Order[];
  pagination: Pagination;
}

/** Per-order delivery summary (from the Fulfillment row) on GET /orders/{id}. */
export interface DeliverySummary {
  status: 'queued' | 'claimed' | 'delivered' | 'failed';
  attempts?: number;
  lastError?: string | null;
  receiptId?: string | null;
}

/** Timeline status values, in canonical chronological order. */
export type TimelineStatus =
  | 'created'
  | 'paid'
  | 'queued'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'refunded';

/** One chronological delivery event (openapi.yaml TimelineEvent). */
export interface TimelineEvent {
  status: TimelineStatus;
  at: string;
}

/** GET /orders/{id} -> order + delivery summary + chronological timeline. */
export interface OrderDetailResponse {
  order: Order;
  /** null when no Fulfillment exists yet (e.g. pre-delivery / legacy rows). */
  delivery: DeliverySummary | null;
  timeline: TimelineEvent[];
}

/**
 * POST /orders/{id}/refund response. `refundedAmount` is a backend decimal
 * string; funds land in the wallet `refundable` account, NOT `available`.
 * Idempotent: a second call returns `alreadyRefunded: true` with the same
 * amount. The frontend never computes the refund amount.
 */
export interface RefundResponse {
  success: boolean;
  orderId: string;
  status: 'refunded';
  /** Decimal string (`^[0-9]+$`). */
  refundedAmount: string;
  alreadyRefunded?: boolean;
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

export interface PaymentPackage {
  id: string;
  name: string;
  priceThb: string;
  points: string;
  bonusPoints: string;
  totalPoints: string;
  tier: string;
  isPopular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PaymentPackagesResponse {
  packages: PaymentPackage[];
}

export interface PaymentIntent {
  id: string;
  userId: string;
  packageId: string;
  provider: string;
  providerIntentId?: string | null;
  reference: string;
  idempotencyKey: string;
  amountThb: string;
  pointsAmount: string;
  paymentUrl?: string | null;
  qrPayload?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  expiresAt: string;
  completedAt?: string | null;
}

export interface CreatePaymentIntentResponse {
  intent: PaymentIntent;
  replayed: boolean;
}

export interface SlipTopupSubmission {
  id: string;
  userId: string;
  userName: string;
  userDiscordId?: string;
  userAvatar?: string;
  packageId: string;
  packageName: string;
  amountThb: number;
  pointsToCredit: number;
  slipImageUrl: string;
  transferBank: string;
  transferRef?: string;
  transferredAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: string;
  createdAt: string;
}

export interface PendingTopupsResponse {
  topups: SlipTopupSubmission[];
  count: number;
}

