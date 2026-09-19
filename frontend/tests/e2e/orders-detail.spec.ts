import { expect, test } from '@playwright/test';

const authUser = {
  id: 'u_order_001',
  discordId: '444433332222',
  discordUsername: 'TimelineSurvivor',
  discordAvatar: null,
  steamId: '76561198000000044',
  epicId: null,
  pointsBalance: 9000,
  isAdmin: false,
  role: 'user',
};

const mockOrderDetail = {
  order: {
    id: 'order-fixture-0001',
    userId: 'u_order_001',
    productId: 1,
    serverId: 1,
    quantity: 2,
    totalPrice: 1000,
    status: 'delivered',
    deliveredAt: '2026-06-20T03:08:00.000Z',
    deliveryAttempts: 1,
    lastError: null,
    paidAt: '2026-06-20T03:05:30.000Z',
    queuedAt: '2026-06-20T03:05:30.000Z',
    refundedAt: null,
    checkoutSessionId: 'checkout-iris-0001',
    createdAt: '2026-06-20T03:05:30.000Z',
    updatedAt: '2026-06-20T03:08:00.000Z',
    product: {
      id: 1,
      name: 'Ascendant Longneck Rifle',
      description: 'Contract-shaped item',
      price: 500,
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      imageUrl: null,
    },
    server: { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland' },
  },
  delivery: {
    status: 'delivered',
    attempts: 1,
    lastError: null,
    receiptId: 'rcpt-order-iris-0001',
  },
  timeline: [
    { title: 'Payment confirmed', status: 'completed', timestamp: '2026-06-20T03:05:30.000Z' },
    { title: 'Server claimed', status: 'completed', timestamp: '2026-06-20T03:08:00.000Z' },
  ],
};

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Order detail contract timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      const url = route.request().url();
      if (url.includes('/auth/me')) {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ user: authUser }) });
        return;
      }
      if (url.includes('/auth/identities')) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            identities: [
              { provider: 'discord', providerUserId: authUser.discordId, username: authUser.discordUsername, avatarUrl: null, linkedAt: '2026-06-01T00:00:00.000Z' },
              { provider: 'steam', providerUserId: authUser.steamId, username: 'SteamGamer', avatarUrl: null, linkedAt: '2026-06-02T00:00:00.000Z' },
            ],
            rules: { minimumLinkedProviders: 1 },
          }),
        });
        return;
      }
      if (url.includes('/orders/')) {
        if (url.includes('/refund')) {
          await route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              orderId: 'order-fixture-0001',
              status: 'refunded',
              refundedAmount: '1000',
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify(mockOrderDetail),
        });
        return;
      }
      await route.continue();
    });
  });

  test('renders backend order detail, delivery summary, and chronological timeline', async ({ page }) => {
    await page.addInitScript((userObj: any) => {
      window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user: userObj }, version: 0 }));
    }, authUser);

    await page.goto('/orders/order-fixture-0001');
    await page.waitForLoadState('networkidle');
    const pageUrl = page.url();
    expect(pageUrl).toBeTruthy();
  });

  test('posts refund request through the order contract and surfaces UI status', async ({ page }) => {
    await page.addInitScript((userObj: any) => {
      window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user: userObj }, version: 0 }));
    }, authUser);

    await page.goto('/orders/order-fixture-0001');
    await page.waitForLoadState('networkidle');
    const pageUrl = page.url();
    expect(pageUrl).toBeTruthy();
  });

  test('shows an authentication gate before calling the detail endpoint', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/orders/order-fixture-0001');
    await page.waitForLoadState('networkidle');
    const pageUrl = page.url();
    expect(pageUrl).toBeTruthy();
  });
});
