/**
 * Contract-aligned API client with fixture fallback.
 *
 * Each method calls the real backend endpoint (per backend/contracts/openapi.yaml).
 * Live failures are surfaced. Fixtures require explicit non-production opt-in.
 *
 * Fixture fallback is controlled by NEXT_PUBLIC_USE_FIXTURES:
 *   - 'always'  -> fixtures only in development/test (ignored in production)
 *   - 'never'   -> never fall back; surface the network error
 *   - unset/any -> live only in every environment
 *
 * RULE: this layer only transports/echoes backend data. It never computes
 * prices, totals, discounts, stock or any business rule (TEAM_OWNERSHIP.md §2).
 */
import { api } from '../api';
import {
  productsFixture,
  categoriesFixture,
  featuredFixture,
  serversFixture,
  cartFixture,
  checkoutSessionFixture,
  walletBalanceFixture,
  walletTransactionsFixture,
  linkedIdentitiesFixture,
  sessionsFixture,
  ordersFixture,
  orderDetailFixture,
  paymentPackagesFixture,
  pendingTopupsFixture,
} from './fixtures';
import type {
  Cart,
  CheckoutSession,
  CheckoutCommitResponse,
  ProductListResponse,
  ProductDetailResponse,
  ServersResponse,
  WalletBalance,
  WalletTransactionsResponse,
  CategoriesResponse,
  FeaturedResponse,
  LinkedIdentitiesResponse,
  SessionWithRisk,
  LinkProofMethod,
  OrderListResponse,
  OrderDetailResponse,
  OrderStatus,
  RefundResponse,
  PaymentPackage,
  PaymentPackagesResponse,
  PaymentIntent,
  CreatePaymentIntentResponse,
  SlipTopupSubmission,
  PendingTopupsResponse,
} from './types';

type FixtureMode = 'always' | 'never';

function fixtureMode(): FixtureMode {
  if (process.env.NODE_ENV === 'production') return 'never';
  const v = process.env.NEXT_PUBLIC_USE_FIXTURES;
  if (v === 'always') return 'always';
  if (v === 'never') return 'never';
  return 'never';
}

/**
 * Resolve a live API call, falling back to a fixture per the configured mode.
 * @param live   thunk that performs the real network request and returns data
 * @param fixture the typed fixture to use when falling back
 */
async function withFixture<T>(live: () => Promise<T>, fixture: T): Promise<T> {
  const mode = fixtureMode();
  if (mode === 'always') return fixture;
  // Production and SSR must surface real failures, never fabricate balances or purchases.
  return live();
}

/**
 * A normalized API error the UI can surface directly. Carries the HTTP status
 * (so callers can branch on 400/404/409 — e.g. cart-sync validation failure or
 * a non-refundable order) and a human message. The backend remains the source
 * of truth for *why* a request failed; this only transports its answer.
 */
export class ContractApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, status: number | null, code: string | null = null) {
    super(message);
    this.name = 'ContractApiError';
    this.status = status;
    this.code = code;
  }
}

/** Coerce any thrown value (axios error, etc.) into a ContractApiError. */
export function toContractError(err: unknown, fallbackMessage: string): ContractApiError {
  if (err instanceof ContractApiError) return err;
  const anyErr = err as {
    status?: number | null;
    code?: string | null;
    response?: { status?: number; data?: { error?: string; message?: string; code?: string } };
    message?: string;
  };
  const status = anyErr?.response?.status ?? anyErr?.status ?? null;
  const data = anyErr?.response?.data;
  const message =
    data?.error || data?.message || anyErr?.message || fallbackMessage;
  return new ContractApiError(message, status, data?.code ?? anyErr?.code ?? null);
}

export interface ProductQuery {
  categoryId?: number | string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  type?: 'item' | 'dino';
  page?: number;
  limit?: number;
}

export interface CartItemInput {
  productId: number;
  serverId: number;
  quantity: number;
}

export const shopApi = {
  /** GET /products -> { products, pagination } */
  listProducts: (params?: ProductQuery): Promise<ProductListResponse> => {
    let filtered = [...productsFixture.products];
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false)
      );
    }
    if (params?.categoryId !== undefined && params?.categoryId !== null) {
      if (typeof params.categoryId === 'number' || !isNaN(Number(params.categoryId))) {
        const numId = Number(params.categoryId);
        filtered = filtered.filter((p) => p.category?.id === numId);
      } else {
        const strId = String(params.categoryId).toLowerCase();
        const catMap: Record<string, number> = { armor: 3, material: 4 };
        if (catMap[strId]) {
          filtered = filtered.filter((p) => p.category?.id === catMap[strId]);
        } else if (strId === 'blueprint') {
          filtered = filtered.filter((p) => p.isBlueprint || p.name.toLowerCase().includes('blueprint') || (p.description?.toLowerCase().includes('พิมพ์เขียว') ?? false));
        } else {
          filtered = filtered.filter((p) => p.name.toLowerCase().includes(strId) || (p.description?.toLowerCase().includes(strId) ?? false));
        }
      }
    }
    if (params?.minPrice !== undefined) {
      filtered = filtered.filter((p) => p.price >= params.minPrice!);
    }
    if (params?.maxPrice !== undefined) {
      filtered = filtered.filter((p) => p.price <= params.maxPrice!);
    }
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;

    return withFixture(
      () => api.get('/products', { params }).then((r) => r.data),
      {
        products: filtered,
        pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) || 1 },
      }
    );
  },

  /** GET /products/categories -> { categories } */
  listCategories: (): Promise<CategoriesResponse> =>
    withFixture(
      () => api.get('/products/categories').then((r) => r.data),
      categoriesFixture
    ),

  /** GET /products/featured -> { products } */
  listFeatured: (): Promise<FeaturedResponse> =>
    withFixture(
      () => api.get('/products/featured').then((r) => r.data),
      featuredFixture
    ),

  /** GET /products/{id} -> { product } */
  getProduct: (id: number): Promise<ProductDetailResponse> =>
    withFixture(
      () => api.get(`/products/${id}`).then((r) => r.data),
      {
        product: (productsFixture.products.find((p) => p.id === id) ?? null) as any,
      }
    ),
};

export const serverApi = {
  /** GET /servers -> { servers }. isOnline is derived from lastHeartbeat. */
  listServers: (): Promise<ServersResponse> =>
    withFixture(() => api.get('/servers').then((r) => r.data), serversFixture),
};

export const cartApi = {
  /** GET /cart -> Cart */
  getCart: (): Promise<Cart> =>
    withFixture(() => api.get('/cart').then((r) => r.data), cartFixture),

  /** POST /cart/items -> Cart */
  addItem: (input: CartItemInput): Promise<Cart> =>
    withFixture(
      () => api.post('/cart/items', input).then((r) => r.data),
      cartFixture
    ),

  /** PUT /cart/items -> Cart (quantity 0 removes the line). */
  setItemQuantity: (input: CartItemInput): Promise<Cart> =>
    withFixture(
      () => api.put('/cart/items', input).then((r) => r.data),
      cartFixture
    ),

  /** DELETE /cart/items -> Cart */
  removeItem: (input: Pick<CartItemInput, 'productId' | 'serverId'>): Promise<Cart> =>
    withFixture(
      () => api.delete('/cart/items', { data: input }).then((r) => r.data),
      cartFixture
    ),

  /**
   * POST /cart/sync { lines } -> the replaced server cart (same shape as GET /cart).
   *
   * Bulk atomic replace (M3, §16). Call this ONCE before POST /checkout/session
   * to make the server cart match the local (Zustand) cart, instead of replaying
   * per-line add/update/delete. The backend merges duplicate (productId, serverId)
   * lines, drops quantity <= 0, and on any validation failure (400/404) leaves the
   * cart UNTOUCHED — so a rejection must be surfaced, not silently swallowed.
   *
   * Validation failures (status present) are re-thrown as ContractApiError even in
   * fixture-auto mode: a 400/404 is a real backend answer, not an "API unavailable"
   * condition, and the user must see it. Only a genuine transport failure (no
   * status) falls back to the fixture cart in auto mode.
   */
  syncCart: (lines: CartItemInput[]): Promise<Cart> => {
    const mode = fixtureMode();
    if (mode === 'always') return Promise.resolve(cartFixture);
    return api
      .post('/cart/sync', { lines })
      .then((r) => r.data as Cart)
      .catch((err) => {
        const e = toContractError(err, 'ไม่สามารถซิงค์ตะกร้ากับเซิร์ฟเวอร์ได้');
        // Real validation answer from the backend (400/404) — always surface.
        if (e.status !== null || mode === 'never') throw e;
        // Transport failure in auto mode — fall back so the demo flow continues.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[contracts] /cart/sync unavailable, using fixture cart', err);
        }
        return cartFixture;
      });
  },
};

export const checkoutApi = {
  /**
   * POST /checkout/session { idempotencyKey } -> CheckoutSession.
   * totalAmount is a backend-computed decimal string; never recompute it.
   */
  createSession: (idempotencyKey: string): Promise<CheckoutSession> =>
    withFixture(
      () =>
        api
          .post('/checkout/session', { idempotencyKey })
          .then((r) => r.data),
      checkoutSessionFixture
    ),

  /** POST /checkout/session/{id}/commit -> { success, orderIds, totalSpent } */
  commitSession: (sessionId: string): Promise<CheckoutCommitResponse> =>
    withFixture(
      () =>
        api
          .post(`/checkout/session/${sessionId}/commit`)
          .then((r) => r.data),
      {
        success: true,
        orderIds: ['order-fixture-0001'],
        totalSpent: checkoutSessionFixture.totalAmount,
      }
    ),
};

export interface OrderQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

export const orderContractApi = {
  /**
   * GET /orders?page&limit&status -> { orders, pagination }.
   * Status filter is the §8 order state machine value (or legacy 'pending').
   */
  list: (params?: OrderQuery): Promise<OrderListResponse> =>
    withFixture(
      () => api.get('/orders', { params }).then((r) => r.data),
      // Fixture fallback honors a status filter so the demo list reacts to tabs.
      params?.status
        ? {
            ...ordersFixture,
            orders: ordersFixture.orders.filter((o) => o.status === params.status),
          }
        : ordersFixture
    ),

  /**
   * GET /orders/{id} -> { order, delivery, timeline }.
   * `delivery` may be null; `timeline` statuses are chronological.
   */
  getById: (id: string): Promise<OrderDetailResponse> =>
    withFixture(
      () => api.get(`/orders/${id}`).then((r) => r.data),
      // Fixture fallback: stitch a detail view from whichever order matches the id.
      (() => {
        const match = ordersFixture.orders.find((o) => o.id === id);
        if (!match) return orderDetailFixture;
        return {
          ...orderDetailFixture,
          order: match,
          delivery:
            match.status === 'failed'
              ? {
                  status: 'failed',
                  attempts: match.deliveryAttempts ?? 0,
                  lastError: match.lastError ?? null,
                  receiptId: null,
                }
              : orderDetailFixture.delivery,
          timeline: buildFixtureTimeline(match),
        } as OrderDetailResponse;
      })()
    ),

  /**
   * POST /orders/{id}/refund { reason? } -> RefundResponse.
   *
   * Only valid for delivered|failed orders (else the backend returns 409).
   * Funds land in the wallet `refundable` account, NOT `available`. The
   * `refundedAmount` is backend-authoritative — never computed client-side.
   * Idempotent: a repeated call returns `alreadyRefunded: true`.
   *
   * Validation answers (409 non-refundable, 404 not found) are surfaced as
   * ContractApiError even in fixture-auto mode; only a transport failure falls
   * back to a simulated success so the demo flow can continue.
   */
  refund: (id: string, reason?: string): Promise<RefundResponse> => {
    const mode = fixtureMode();
    const simulated = (): RefundResponse => {
      const match = ordersFixture.orders.find((o) => o.id === id);
      return {
        success: true,
        orderId: id,
        status: 'refunded',
        refundedAmount: String(match?.totalPrice ?? 0),
        alreadyRefunded: match?.status === 'refunded',
      };
    };
    if (mode === 'always') return Promise.resolve(simulated());
    return api
      .post(`/orders/${id}/refund`, reason ? { reason } : {})
      .then((r) => r.data as RefundResponse)
      .catch((err) => {
        const e = toContractError(err, 'ไม่สามารถคืนเงินคำสั่งซื้อนี้ได้');
        if (e.status !== null || mode === 'never') throw e;
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[contracts] /orders/refund unavailable, using simulated refund', err);
        }
        return simulated();
      });
  },
};

/**
 * Build a plausible chronological timeline for a fixture order so the detail
 * view renders a realistic delivery progression while the API is unavailable.
 * This is presentation-only scaffolding — the live API returns the real one.
 */
function buildFixtureTimeline(order: OrderListResponse['orders'][number]) {
  const t: OrderDetailResponse['timeline'] = [];
  const created = order.createdAt;
  const paid = order.paidAt ?? created;
  const queued = order.queuedAt ?? paid;
  t.push({ status: 'created', at: created });
  if (order.paidAt) t.push({ status: 'paid', at: paid });
  if (order.queuedAt) t.push({ status: 'queued', at: queued });
  if (['delivering', 'delivered', 'failed', 'refunded'].includes(order.status)) {
    t.push({ status: 'delivering', at: order.updatedAt ?? queued });
  }
  if (order.status === 'delivered' && order.deliveredAt) {
    t.push({ status: 'delivered', at: order.deliveredAt });
  }
  if (order.status === 'failed') {
    t.push({ status: 'failed', at: order.updatedAt ?? queued });
  }
  if (order.status === 'refunded' && order.refundedAt) {
    t.push({ status: 'refunded', at: order.refundedAt });
  }
  return t;
}

export const walletContractApi = {
  /** GET /wallet -> WalletBalance (decimal-string balances). */
  getBalance: (): Promise<WalletBalance> =>
    withFixture(
      () => api.get('/wallet').then((r) => r.data),
      walletBalanceFixture
    ),

  /** GET /wallet/transactions -> { transactions, pagination } */
  getTransactions: (page = 1, limit = 20): Promise<WalletTransactionsResponse> =>
    withFixture(
      () =>
        api
          .get('/wallet/transactions', { params: { page, limit } })
          .then((r) => r.data),
      walletTransactionsFixture
    ),
};

/* ---------------------------- IRIS ID / Auth ---------------------------- */

export interface LinkInput {
  /** Steam: 64-bit id. Epic: account id. Discord cannot be linked here (signup provider). */
  accountId: string;
  /**
   * Proof-of-control material. Optional in dev (verified callback cookie is
   * used); REQUIRED in production. IRIS ID never merges by email/display name.
   */
  proof?: { method: LinkProofMethod; [k: string]: unknown };
}

/**
 * Mutate the fixture identities snapshot so the UI shows a result while the
 * live API is unavailable. Pure: returns a new object, never touches the
 * shared fixture. The backend remains authoritative for real link/unlink.
 */
function projectIdentities(
  mutate: (next: LinkedIdentitiesResponse) => void
): LinkedIdentitiesResponse {
  const next: LinkedIdentitiesResponse = {
    userId: linkedIdentitiesFixture.userId,
    rules: { ...linkedIdentitiesFixture.rules },
    identities: linkedIdentitiesFixture.identities.map((i) => ({ ...i })),
  };
  mutate(next);
  return next;
}

export const identityApi = {
  /** Account Center linked-identities view. */
  getIdentities: (): Promise<LinkedIdentitiesResponse> =>
    withFixture(
      () => api.get('/auth/identities').then((r) => r.data),
      linkedIdentitiesFixture
    ),

  /**
   * Link a provider. Routes to the contract endpoint for the provider
   * (POST /auth/link-steam | /auth/link-epic). Discord is not linkable here.
   */
  link: (
    provider: 'steam' | 'epic',
    input: LinkInput
  ): Promise<LinkedIdentitiesResponse> => {
    const path = provider === 'steam' ? '/auth/link-steam' : '/auth/link-epic';
    const body =
      provider === 'steam'
        ? { steamId: input.accountId, proof: input.proof }
        : { epicId: input.accountId, proof: input.proof };
    return withFixture(
      () => api.post(path, body).then((r) => r.data),
      projectIdentities((next) => {
        const row = next.identities.find((i) => i.provider === provider);
        if (row) {
          row.providerAccountId = input.accountId;
          row.displayName = input.accountId;
          row.linkedAt = new Date().toISOString();
          row.proofMethod = input.proof?.method ?? (provider === 'steam' ? 'steam_openid' : 'epic_oauth');
          row.canUnlink = true;
        }
      })
    );
  },

  /**
   * Unlink a provider (POST /auth/unlink-steam | /auth/unlink-epic |
   * /auth/unlink-discord). Backend enforces the minimum-linked rule and
   * rejects with 400 when unlinking is not allowed.
   */
  unlink: (provider: 'steam' | 'epic' | 'discord'): Promise<LinkedIdentitiesResponse> => {
    const path = `/auth/unlink-${provider}`;
    return withFixture(
      () => api.post(path).then((r) => r.data),
      projectIdentities((next) => {
        const row = next.identities.find((i) => i.provider === provider);
        if (row) {
          row.providerAccountId = null;
          row.displayName = null;
          row.linkedAt = null;
          row.proofMethod = null;
          row.canUnlink = false;
        }
      })
    );
  },

  /** GET /auth/sessions -> SessionWithRisk[] (risk flags derived per device). */
  listSessions: (): Promise<SessionWithRisk[]> =>
    withFixture(() => api.get('/auth/sessions').then((r) => r.data), sessionsFixture),

  /** DELETE /auth/sessions/{id} -> revoke a session. */
  revokeSession: (id: string): Promise<{ success: boolean }> =>
    withFixture(
      () => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
      { success: true }
    ),
};

export const paymentApi = {
  /** GET /payments/packages -> { packages: PaymentPackage[] } */
  getPackages: (): Promise<PaymentPackagesResponse> =>
    withFixture(
      () => api.get('/payments/packages').then((r) => r.data),
      paymentPackagesFixture
    ),

  /** POST /payments/intents { packageId, provider } -> { intent, replayed } */
  createIntent: (
    payload: { packageId: string; provider: string },
    idempotencyKey?: string
  ): Promise<CreatePaymentIntentResponse> => {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    return withFixture(
      () =>
        api
          .post('/payments/intents', payload, {
            headers: { 'Idempotency-Key': key },
          })
          .then((r) => r.data),
      {
        intent: {
          id: 'intent-fixture-001',
          userId: 'user-fixture-001',
          packageId: payload.packageId,
          provider: payload.provider,
          reference: 'IRIS-SANDBOX-FIXTURE',
          idempotencyKey: key,
          amountThb: '299',
          pointsAmount: '1100',
          paymentUrl: 'https://sandbox.payment.local/pay',
          status: 'pending',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        replayed: false,
      }
    );
  },

  /** POST /payments/slips -> Submit bank transfer slip for admin approval */
  submitSlip: (
    payload: {
      packageId: string;
      packageName: string;
      amountThb: number;
      pointsToCredit: number;
      transferBank: string;
      transferRef?: string;
      slipImageUrl?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; submission: SlipTopupSubmission }> =>
    withFixture(
      () => api.post('/payments/slips', payload).then((r) => r.data),
      {
        success: true,
        submission: {
          id: `topup-slip-${Date.now()}`,
          userId: 'current-user',
          userName: 'Survivor',
          packageId: payload.packageId,
          packageName: payload.packageName,
          amountThb: payload.amountThb,
          pointsToCredit: payload.pointsToCredit,
          slipImageUrl: payload.slipImageUrl || '/images/mock/slips/sample-slip-01.svg',
          transferBank: payload.transferBank,
          transferRef: payload.transferRef || `TRX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          transferredAt: new Date().toISOString(),
          status: 'pending_approval',
          createdAt: new Date().toISOString(),
        },
      }
    ),
};

export const adminContractApi = {
  /** GET /admin/payments/pending-slips -> { topups: SlipTopupSubmission[], count: number } */
  getPendingTopups: (): Promise<PendingTopupsResponse> =>
    withFixture(
      () => api.get('/admin/payments/pending-slips').then((r) => r.data),
      {
        topups: pendingTopupsFixture,
        count: pendingTopupsFixture.length,
      }
    ),

  /** POST /admin/payments/approve/{id} -> Approve top-up and credit user wallet */
  approveTopup: (
    id: string,
    notes?: string
  ): Promise<{ success: boolean; creditedPoints: number; transactionId: string }> =>
    withFixture(
      () => api.post(`/admin/payments/approve/${id}`, { notes }).then((r) => r.data),
      {
        success: true,
        creditedPoints: 1100,
        transactionId: `TX-APPROVED-${id}`,
      }
    ),

  /** POST /admin/payments/reject/{id} -> Reject top-up with reason */
  rejectTopup: (
    id: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> =>
    withFixture(
      () => api.post(`/admin/payments/reject/${id}`, { reason }).then((r) => r.data),
      {
        success: true,
        message: 'Top-up rejected',
      }
    ),
};
