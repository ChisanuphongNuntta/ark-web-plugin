/**
 * Contract-aligned API client with fixture fallback.
 *
 * Each method calls the real backend endpoint (per backend/contracts/openapi.yaml).
 * While the live API is unavailable (offline / not yet mounted / network error)
 * it resolves the typed fixture snapshot instead, so the UI can be built and
 * demoed against contract-shaped data.
 *
 * Fixture fallback is controlled by NEXT_PUBLIC_USE_FIXTURES:
 *   - 'always'  -> never hit the network, always return fixtures
 *   - 'never'   -> never fall back; surface the network error
 *   - unset/any -> try the network, fall back to fixtures on failure (default)
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
} from './types';

type FixtureMode = 'always' | 'never' | 'auto';

function fixtureMode(): FixtureMode {
  const v = process.env.NEXT_PUBLIC_USE_FIXTURES;
  if (v === 'always') return 'always';
  if (v === 'never') return 'never';
  return 'auto';
}

/**
 * Resolve a live API call, falling back to a fixture per the configured mode.
 * @param live   thunk that performs the real network request and returns data
 * @param fixture the typed fixture to use when falling back
 */
async function withFixture<T>(live: () => Promise<T>, fixture: T): Promise<T> {
  const mode = fixtureMode();
  if (mode === 'always') return fixture;
  try {
    return await live();
  } catch (err) {
    if (mode === 'never') throw err;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[contracts] live API unavailable, using fixture fallback', err);
    }
    return fixture;
  }
}

export interface ProductQuery {
  categoryId?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
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
  listProducts: (params?: ProductQuery): Promise<ProductListResponse> =>
    withFixture(
      () => api.get('/products', { params }).then((r) => r.data),
      productsFixture
    ),

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
        product:
          productsFixture.products.find((p) => p.id === id) ??
          productsFixture.products[0],
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
      // No dedicated GET in the contract yet — /auth/me carries linked ids.
      // Flagged in handoff: a GET /auth/identities matching this shape is desired.
      () => api.get('/auth/me').then((r) => r.data.identities ?? linkedIdentitiesFixture),
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
