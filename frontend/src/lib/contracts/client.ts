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
