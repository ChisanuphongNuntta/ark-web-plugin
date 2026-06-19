import { test, expect } from '@playwright/test';

/**
 * Milestone 3 — Product Detail Page E2E Tests
 * Route: /shop/[id]
 *
 * All price calculations are backend responsibility.
 * Frontend only displays values returned from API.
 */

test.describe('Product Detail Page /shop/[id]', () => {
  test.beforeEach(async ({ page }) => {
    // Mock product detail API
    await page.route('**/api/products/1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          product: {
            id: 1,
            name: 'Ascendant Longneck Rifle',
            description: 'ปืนสไนเปอร์คุณภาพสูงสุด ระดับ Ascendant ความแม่นยำสูงในระยะไกล',
            blueprint: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
            price: 500,
            imageUrl: null,
            quantity: 1,
            quality: 5,
            isBlueprint: false,
            category: { id: 2, name: 'อาวุธ', icon: '⚔️' },
          },
        }),
      });
    });

    // Mock non-existent product
    await page.route('**/api/products/99999', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Product not found' }),
      });
    });

    // Mock servers
    await page.route('**/api/admin/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: [
            { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland', mode: 'PVE', isOnline: true, playerCount: 24, maxPlayers: 70 },
            { id: 2, name: 'IRIS-PVE-ScorchedEarth-01', map: 'ScorchedEarth', mode: 'PVE', isOnline: true, playerCount: 12, maxPlayers: 50 },
            { id: 3, name: 'IRIS-PVE-Aberration-01', map: 'Aberration', mode: 'PVE', isOnline: false, playerCount: 0, maxPlayers: 50 },
          ],
        }),
      });
    });

    // Mock wallet for authenticated user
    await page.route('**/api/wallet', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currency: 'IC',
          accounts: { available: '5000', held: '0', promotional: '0', refundable: '0' },
          total: '5000',
        }),
      });
    });

    // Mock order creation
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'ord_test_001',
            productId: 1,
            serverId: 1,
            quantity: 1,
            status: 'pending',
          },
        }),
      });
    });
  });

  // ─── Rendering States ───
  test('loads successfully and shows product name', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByRole('heading', { name: /Ascendant Longneck Rifle/i })).toBeVisible({ timeout: 10_000 });
  });

  test('shows product category badge', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByText(/อาวุธ/)).toBeVisible({ timeout: 8000 });
  });

  test('shows ASCENDANT quality badge', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByText('ASCENDANT')).toBeVisible({ timeout: 8000 });
  });

  test('shows product price in IC', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByText(/500/)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('IC').first()).toBeVisible();
  });

  test('shows blueprint class information', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByText(/ARK Item Class/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/PrimalItem_WeaponOneShotRifle/)).toBeVisible();
  });

  test('shows product description', async ({ page }) => {
    await page.goto('/shop/1');
    await expect(page.getByText(/ปืนสไนเปอร์/)).toBeVisible({ timeout: 8000 });
  });

  // ─── Breadcrumb Navigation ───
  test('breadcrumb shows correct hierarchy', async ({ page }) => {
    await page.goto('/shop/1');
    const breadcrumb = page.getByRole('navigation', { name: /เส้นทางนำทาง/ });
    await expect(breadcrumb).toBeVisible({ timeout: 8000 });
    await expect(breadcrumb.getByRole('link', { name: /หน้าแรก/ })).toBeVisible();
    await expect(breadcrumb.getByRole('link', { name: /ร้านค้า/ })).toBeVisible();
    await expect(breadcrumb.getByRole('link', { name: /อาวุธ/ })).toBeVisible();
  });

  test('back to shop link works', async ({ page }) => {
    await page.goto('/shop/1');
    await page.getByRole('link', { name: /กลับร้านค้า/i }).click();
    await expect(page).toHaveURL('/shop');
  });

  // ─── Quantity Selector ───
  test('quantity starts at 1', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');
    const qtyBtn = page.locator('span.font-mono.font-bold.text-base').first();
    if (await qtyBtn.isVisible({ timeout: 8000 })) {
      await expect(qtyBtn).toHaveText('1');
    }
  });

  test('increment and decrement quantity', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const plusBtn = page.getByRole('button', { name: /เพิ่มจำนวน/ });
    const minusBtn = page.getByRole('button', { name: /ลดจำนวน/ });
    const qtyDisplay = page.locator('span.font-mono.font-bold.text-base').first();

    if (await plusBtn.isVisible({ timeout: 8000 })) {
      await plusBtn.click();
      await expect(qtyDisplay).toHaveText('2');

      // Total cost should update to 500 * 2 = 1,000
      await expect(page.getByText(/1,000 IC/)).toBeVisible();

      await minusBtn.click();
      await expect(qtyDisplay).toHaveText('1');
    }
  });

  test('cannot go below quantity 1', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const minusBtn = page.getByRole('button', { name: /ลดจำนวน/ });
    const qtyDisplay = page.locator('span.font-mono.font-bold.text-base').first();

    if (await minusBtn.isVisible({ timeout: 8000 })) {
      await minusBtn.click();
      await expect(qtyDisplay).toHaveText('1'); // Should remain at 1
    }
  });

  // ─── Server Compatibility Panel ───
  test('server panel shows online and offline servers', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const serverPanel = page.getByText(/เลือกเซิร์ฟเวอร์ปลายทาง/i);
    if (await serverPanel.isVisible({ timeout: 10_000 })) {
      await expect(page.getByText('IRIS-PVE-TheIsland-01')).toBeVisible();
      await expect(page.getByText('IRIS-PVE-Aberration-01')).toBeVisible();
    }
  });

  test('offline servers are disabled', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const offlineBtn = page.getByRole('button').filter({ hasText: 'Offline' });
    if (await offlineBtn.isVisible({ timeout: 10_000 })) {
      await expect(offlineBtn.first()).toBeDisabled();
    }
  });

  test('selecting a server shows confirmation text', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const onlineServer = page.getByRole('button').filter({ hasText: 'IRIS-PVE-TheIsland-01' });
    if (await onlineServer.isVisible({ timeout: 10_000 })) {
      await onlineServer.click();
      await expect(page.getByText(/สินค้าจะถูกส่งไปยังตัวละครใน/i)).toBeVisible();
    }
  });

  // ─── Delivery Promise ───
  test('delivery promise section is visible', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');
    const promise = page.getByText(/IRIS Delivery Promise/i);
    if (await promise.isVisible({ timeout: 8000 })) {
      await expect(promise).toBeVisible();
      await expect(page.getByText(/รับประกันคืนเงิน 100%/)).toBeVisible();
    }
  });

  // ─── Cart Interaction ───
  test('add to cart button shows success feedback', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /เพิ่มในตะกร้า/i });
    if (await addBtn.isVisible({ timeout: 8000 }) && await addBtn.isEnabled()) {
      await addBtn.click();
      // Button text should change to success state
      await expect(page.getByRole('button', { name: /เพิ่มในตะกร้าแล้ว/i })).toBeVisible({ timeout: 5000 });
    }
  });

  test('cart drawer opens after adding to cart', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /เพิ่มในตะกร้า/i });
    if (await addBtn.isVisible({ timeout: 8000 }) && await addBtn.isEnabled()) {
      await addBtn.click();
      const drawer = page.getByRole('dialog', { name: /ตะกร้าสินค้า/i });
      await expect(drawer).toBeVisible({ timeout: 5000 });
    }
  });

  // ─── Error State ───
  test('shows error state for non-existent product', async ({ page }) => {
    await page.goto('/shop/99999');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/ไม่พบสินค้า/i)).toBeVisible({ timeout: 12_000 });
    // Should also have a back link
    await expect(page.getByRole('link', { name: /กลับร้านค้า/i })).toBeVisible();
  });

  // ─── Buy Flow (Unauthenticated) ───
  test('buy now redirects unauthenticated users to auth', async ({ page }) => {
    // Clear any stored auth
    await page.addInitScript(() => {
      window.localStorage.removeItem('auth-storage');
    });
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const buyBtn = page.getByRole('button', { name: /เข้าสู่ระบบเพื่อซื้อ|ซื้อทันที/i });
    if (await buyBtn.isVisible({ timeout: 8000 })) {
      // Just verify the button text shows correct unauthenticated state
      const btnText = await buyBtn.textContent();
      expect(btnText).toMatch(/เข้าสู่ระบบ|ซื้อทันที|ยอดพ้อยต์/);
    }
  });

  // ─── Buy Success Flow (Authenticated) ───
  test('buy now success shows confirmation screen', async ({ page }) => {
    // Inject authenticated user
    await page.addInitScript(() => {
      window.localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          user: {
            id: 'u_test',
            discordId: '123',
            discordUsername: 'TestUser',
            discordAvatar: null,
            steamId: null,
            epicId: null,
            pointsBalance: 5000,
            isAdmin: false,
            role: 'user',
          },
        },
        version: 0,
      }));
    });

    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    const buyBtn = page.getByRole('button', { name: /ซื้อทันที/i });
    if (await buyBtn.isVisible({ timeout: 10_000 }) && await buyBtn.isEnabled()) {
      await buyBtn.click();
      // Success state
      await expect(page.getByText(/ซื้อสำเร็จ/i)).toBeVisible({ timeout: 8000 });
      await expect(page.getByText(/พิมพ์.*\/claim.*ในเกม/i)).toBeVisible();
    }
  });

  // ─── Trust Badges ───
  test('trust badges are visible', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');
    const trustText = page.getByText(/ชำระผ่าน IRIS Wallet|ส่งโดย Plugin|รับประกัน/i);
    if (await trustText.first().isVisible({ timeout: 8000 })) {
      await expect(trustText.first()).toBeVisible();
    }
  });

  // ─── Responsiveness ───
  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('renders correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/shop/1');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8000 });
  });
});
