import { expect, test } from '@playwright/test';

const authUser = {
  id: 'u_cart_001',
  discordId: '555544443333',
  discordUsername: 'CartSurvivor',
  discordAvatar: null,
  steamId: '76561198000000555',
  epicId: null,
  pointsBalance: 5000,
  isAdmin: false,
  role: 'user',
};

const product = {
  id: 1,
  name: 'Ascendant Longneck Rifle',
  description: 'Contract-shaped rifle',
  price: 500,
  imageUrl: null,
  quantity: 1,
  quality: 5,
  isBlueprint: false,
  itemBlueprint: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle'",
  category: { id: 2, name: 'Weapons', icon: '⚔️' },
};

async function seedAuthAndCart(page: import('@playwright/test').Page, options?: { cart?: boolean }) {
  // The init script runs on every navigation, so a test that primes its own basket must turn the default cart off.
  await page.addInitScript(({ user, withCart }) => {
    window.localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user },
        version: 0,
      })
    );
    if (withCart) {
      window.localStorage.setItem(
        'iris-cart-v1',
        JSON.stringify({
          state: {
            items: [{ productId: 1, serverId: 1, quantity: 2 }],
            isDrawerOpen: false,
          },
          version: 2,
        })
      );
    }
  }, { user: authUser, withCart: options?.cart !== false });

  const corsHeaders = {
    'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  await page.route(/\/api\/auth\/me(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ user: authUser }),
    });
  });
}

async function primePersistedAuthAndCart(page: import('@playwright/test').Page) {
  await page.evaluate((user) => {
    window.localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user },
        version: 0,
      })
    );
    window.localStorage.setItem(
      'iris-cart-v1',
      JSON.stringify({
        state: {
          items: [{ productId: 1, serverId: 1, quantity: 2 }],
          isDrawerOpen: false,
        },
        version: 2,
      })
    );
  }, authUser);
}

async function primeBasket(
  page: import('@playwright/test').Page,
  basket: { items: Array<{ productId: number; serverId?: number; quantity: number }>; serverId?: number | null },
  version: number
) {
  await page.evaluate(
    ({ user, state, version }) => {
      window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user }, version: 0 }));
      window.localStorage.setItem('iris-cart-v1', JSON.stringify({ state: { ...state, isDrawerOpen: false }, version }));
    },
    { user: authUser, state: basket, version }
  );
}

const twoOnlineServers = [
  { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland', isActive: true, isOnline: true, lastHeartbeat: '2026-06-20T03:10:00.000Z' },
  { id: 2, name: 'IRIS-PVE-Ragnarok-02', map: 'Ragnarok', isActive: true, isOnline: true, lastHeartbeat: '2026-06-20T03:10:00.000Z' },
];

async function mockCartContracts(
  page: import('@playwright/test').Page,
  options?: { available?: string; sessionTotal?: string; servers?: unknown[] }
) {
  const syncedLines: unknown[] = [];
  let committed = false;

  await page.route(/\/api\/products\/1(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ product }),
    });
  });

  const corsHeaders = {
    'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  await page.route(/\/api\/servers(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        servers: options?.servers ?? [
          {
            id: 1,
            name: 'IRIS-PVE-TheIsland-01',
            map: 'TheIsland',
            isActive: true,
            isOnline: true,
            lastHeartbeat: '2026-06-20T03:10:00.000Z',
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/wallet(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        currency: 'IC',
        accounts: {
          available: options?.available ?? '5000',
          held: '0',
          promotional: '0',
          refundable: '0',
        },
        total: options?.available ?? '5000',
      }),
    });
  });

  await page.route(/\/api\/cart\/sync(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const body = route.request().postDataJSON();
    syncedLines.push(body.lines);
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'cart-contract-1',
        userId: authUser.id,
        items: body.lines.map((line: { productId: number; serverId: number; quantity: number }, index: number) => ({
          id: `cart-line-${index}`,
          cartId: 'cart-contract-1',
          productId: line.productId,
          serverId: line.serverId,
          quantity: line.quantity,
        })),
      }),
    });
  });

  await page.route(/\/api\/checkout\/session(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'checkout-session-1',
        userId: authUser.id,
        cartSnapshot: [],
        totalAmount: options?.sessionTotal ?? '1000',
        status: 'pending',
        idempotencyKey: 'checkout:e2e',
        expiresAt: '2026-06-20T03:20:00.000Z',
      }),
    });
  });

  await page.route(/\/api\/checkout\/session\/checkout-session-1\/commit(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    committed = true;
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        orderIds: ['order-cart-0001'],
        totalSpent: options?.sessionTotal ?? '1000',
      }),
    });
  });

  return {
    syncedLines,
    wasCommitted: () => committed,
  };
}

test.describe('IRIS Cart and backend-priced checkout', () => {
  test('shows an actionable empty state', async ({ page }) => {
    await page.route(/\/api\/auth\/me(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'ตะกร้าสินค้ายังว่างอยู่' })).toBeVisible();
    const actionButton = page.getByRole('button', { name: 'สำรวจร้านค้า IRIS Store' });
    await expect(actionButton).toBeVisible();
  });

  test('syncs cart, reads Backend Total, and commits checkout without client final-price math', async ({ page }) => {
    await seedAuthAndCart(page);
    const contracts = await mockCartContracts(page);

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await primePersistedAuthAndCart(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /ตะกร้าสินค้าและชำระเงิน/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Ascendant Longneck Rifle')).toBeVisible();
    await expect(page.getByText('ยอดสุทธิจากระบบ (Backend Total):')).toBeVisible();
    await expect(page.getByText(/^1000\s*IC$/)).toBeVisible();
    await expect(page.getByText('Checkout Session')).toBeVisible();

    await page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' }).click();

    await expect(page.getByRole('heading', { name: 'ทำรายการสำเร็จ' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'order-cart-0001' })).toBeVisible();
    expect(contracts.wasCommitted()).toBe(true);
    expect(contracts.syncedLines.at(-1)).toEqual([{ productId: 1, serverId: 1, quantity: 2 }]);
  });

  test('disables checkout when backend total exceeds wallet available balance', async ({ page }) => {
    await seedAuthAndCart(page);
    await mockCartContracts(page, { available: '500', sessionTotal: '1000' });

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await primePersistedAuthAndCart(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('ยอดคงเหลือไม่เพียงพอ')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' })).toBeDisabled();
  });
  test('with several online servers and no saved choice, checkout waits for a server and then syncs every line with it', async ({ page }) => {
    await seedAuthAndCart(page, { cart: false });
    const contracts = await mockCartContracts(page, { servers: twoOnlineServers });

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await primeBasket(page, { items: [{ productId: 1, quantity: 2 }], serverId: null }, 3);
    await page.evaluate(() => window.localStorage.removeItem('iris_preferred_server'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('เลือกเซิร์ฟเวอร์ปลายทางเพื่อตรวจยอดและชำระเงิน')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' })).toBeDisabled();
    expect(contracts.syncedLines).toHaveLength(0);

    await page.getByRole('button', { name: /IRIS-PVE-Ragnarok-02/ }).click();
    await expect(page.getByText(/^1000\s*IC$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' })).toBeEnabled();

    await page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' }).click();
    await expect(page.getByRole('heading', { name: 'ทำรายการสำเร็จ' })).toBeVisible();
    expect(contracts.wasCommitted()).toBe(true);
    expect(contracts.syncedLines.at(-1)).toEqual([{ productId: 1, serverId: 2, quantity: 2 }]);
  });

  test('a basket saved by the older per-line-server cart is merged and keeps its last server', async ({ page }) => {
    await seedAuthAndCart(page, { cart: false });
    const contracts = await mockCartContracts(page, { servers: twoOnlineServers });

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await primeBasket(
      page,
      { items: [{ productId: 1, serverId: 1, quantity: 1 }, { productId: 1, serverId: 2, quantity: 2 }] },
      2
    );
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/^1000\s*IC$/)).toBeVisible({ timeout: 15000 });
    expect(contracts.syncedLines.at(-1)).toEqual([{ productId: 1, serverId: 2, quantity: 3 }]);
  });

  test('a saved server that went offline is dropped and the player is asked again', async ({ page }) => {
    await seedAuthAndCart(page, { cart: false });
    const contracts = await mockCartContracts(page, {
      servers: [
        { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland', isActive: true, isOnline: false, lastHeartbeat: '2026-06-20T01:00:00.000Z' },
        { id: 2, name: 'IRIS-PVE-Ragnarok-02', map: 'Ragnarok', isActive: true, isOnline: true, lastHeartbeat: '2026-06-20T03:10:00.000Z' },
        { id: 3, name: 'IRIS-PVE-Aberration-03', map: 'Aberration', isActive: true, isOnline: true, lastHeartbeat: '2026-06-20T03:10:00.000Z' },
      ],
    });

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await primeBasket(page, { items: [{ productId: 1, quantity: 1 }], serverId: 1 }, 3);
    await page.evaluate(() => window.localStorage.removeItem('iris_preferred_server'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('เลือกเซิร์ฟเวอร์ปลายทางเพื่อตรวจยอดและชำระเงิน')).toBeVisible({ timeout: 15000 });
    expect(contracts.syncedLines).toHaveLength(0);
  });
});
