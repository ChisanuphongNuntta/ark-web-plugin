import { test, expect } from '@playwright/test';

const authUser = {
  id: 'u_challenger_001',
  discordId: '999888777666',
  discordUsername: 'EmpiricalTester',
  discordAvatar: null,
  steamId: '76561198000000999',
  epicId: null,
  pointsBalance: 10000,
  isAdmin: false,
  role: 'user',
};

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Adversarial Interaction QC Suite (Milestone 7)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept CORS options
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      await route.continue();
    });

    // Mock auth/me for authenticated checks
    await page.route(/\/api\/auth\/me(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ user: authUser }),
      });
    });
  });

  test('Check 1: Cart drawer opens, displays items, and calculates totals properly', async ({ page }) => {
    const p1 = {
      id: 101,
      name: 'Adversarial Longneck Rifle',
      price: 500,
      stock: 10,
      categoryId: 2,
      category: { id: 2, name: 'Weapons', icon: '⚔️' },
    };
    const p2 = {
      id: 102,
      name: 'Adversarial Heavy Saddle',
      price: 250,
      stock: 5,
      categoryId: 1,
      category: { id: 1, name: 'Saddles', icon: '🦖' },
    };

    // Route individual product requests
    await page.route(/\/api\/products\/101(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ product: p1 }),
      });
    });
    await page.route(/\/api\/products\/102(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ product: p2 }),
      });
    });

    // Seed cart in local storage with 2 items: 2x 500 + 3x 250 = 1000 + 750 = 1750
    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user }, version: 0 })
      );
      window.localStorage.setItem(
        'iris-cart-v1',
        JSON.stringify({
          state: {
            items: [
              { productId: 101, serverId: 1, quantity: 2 },
              { productId: 102, serverId: 1, quantity: 3 },
            ],
            isDrawerOpen: false,
          },
          version: 2,
        })
      );
    }, authUser);

    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Click cart icon button in navbar
    const cartButton = page.locator('button[aria-label*="ตะกร้า"]').first();
    await expect(cartButton).toBeVisible();
    await cartButton.click();

    // Verify cart drawer is open
    const drawer = page.locator('div[role="dialog"][aria-label="ตะกร้าสินค้าของคุณ"]');
    await expect(drawer).toBeVisible();

    // Verify item count badge shows 5 items (2 + 3)
    await expect(drawer.getByText('5 ชิ้น')).toBeVisible();

    // Verify items are displayed
    await expect(drawer.getByText('Adversarial Longneck Rifle')).toBeVisible();
    await expect(drawer.getByText('Adversarial Heavy Saddle')).toBeVisible();

    // Verify subtotal math: 2*500 + 3*250 = 1,750 IC
    await expect(drawer.getByText('1,750')).toBeVisible();

    // Test quantity modification: increment product 101 from 2 to 3 -> total becomes 3*500 + 3*250 = 2,250 IC
    const plusButtons = drawer.locator('button:has(svg.lucide-plus)');
    await plusButtons.first().click();
    await expect(drawer.getByText('6 ชิ้น')).toBeVisible();
    await expect(drawer.getByText('2,250')).toBeVisible();

    // Test close button
    const closeBtn = drawer.locator('button[aria-label="ปิดตะกร้า"]');
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('Check 2: /orders and /topup navigation links exist and load properly', async ({ page }) => {
    // Seed authenticated user
    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user }, version: 0 })
      );
    }, authUser);

    // Mock /api/orders
    await page.route(/\/api\/orders(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } }),
      });
    });

    // 1. Desktop Check
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Check topup button in desktop navbar
    const topupNav = page.locator('a[href="/topup"]').first();
    await expect(topupNav).toBeVisible();

    // Open "สำรวจ" explore dropdown
    const exploreBtn = page.getByRole('button', { name: 'สำรวจ', exact: true });
    await expect(exploreBtn).toBeVisible();
    await exploreBtn.click();

    // Check /orders link inside explore dropdown
    const ordersLink = page.locator('div[role="menu"] a[href="/orders"]');
    await expect(ordersLink).toBeVisible();
    await expect(ordersLink).toContainText('ประวัติคำสั่งซื้อ');

    // Click /orders link and verify navigation
    await ordersLink.click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByRole('heading', { name: /(?:คำสั่งซื้อของฉัน|ประวัติคำสั่งซื้อ)/ })).toBeVisible();

    // Navigate to /topup and verify packages load
    await page.goto('/topup', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/topup/);
    await expect(page.getByRole('heading', { name: /เติมเงิน/i })).toBeVisible();

    // 2. Mobile Viewport Check (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Open mobile hamburger menu
    const menuBtn = page.locator('button[aria-label="เปิดเมนู"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Verify /topup link in mobile drawer
    const mobileTopup = page.locator('div.lg\\:hidden a[href="/topup"]').first();
    await expect(mobileTopup).toBeVisible();
    await expect(mobileTopup).toContainText('เติมเงิน Iris Coin');

    // Verify /orders link in mobile drawer
    const mobileOrders = page.locator('div.lg\\:hidden a[href="/orders"]');
    await expect(mobileOrders).toBeVisible();
    await expect(mobileOrders).toContainText('ประวัติคำสั่งซื้อ');
  });

  test('Check 3: Notification Bell popover opens and dismisses properly', async ({ page }) => {
    // Seed authenticated user
    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user }, version: 0 })
      );
    }, authUser);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Locate bell button
    const bellBtn = page.locator('button[aria-label="การแจ้งเตือน"]');
    await expect(bellBtn).toBeVisible();
    await expect(bellBtn).toHaveAttribute('aria-expanded', 'false');

    // Click Bell to open popover
    await bellBtn.click();
    await expect(bellBtn).toHaveAttribute('aria-expanded', 'true');

    const popover = page.locator('div[role="region"][aria-label="กล่องข้อความแจ้งเตือน"]');
    await expect(popover).toBeVisible();
    await expect(popover.getByText('ไม่มีการแจ้งเตือนใหม่')).toBeVisible();
    await expect(popover.getByText('ข้อความและอัปเดตระบบจะแสดงที่นี่')).toBeVisible();

    // Click bell again to toggle dismiss
    await bellBtn.click();
    await expect(popover).not.toBeVisible();
    await expect(bellBtn).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test outside click dismiss
    await bellBtn.click();
    await expect(popover).toBeVisible();
    await page.locator('body').click({ position: { x: 50, y: 50 } });
    await expect(popover).not.toBeVisible();
  });

  test('Check 4: Palworld mobile sidebar toggle functions', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Locate mobile sidebar toggle button
    const toggleBtn = page.locator('button[aria-label="เปิดเมนูร้านค้า"]');
    await expect(toggleBtn).toBeVisible();

    // Click toggle button to open mobile sidebar drawer
    await toggleBtn.click();

    // Verify mobile sidebar dialog opens
    const mobileDrawer = page.locator('div[role="dialog"][aria-label="เมนูร้านค้า Palworld"]');
    await expect(mobileDrawer).toBeVisible();

    // Check sidebar elements inside mobile drawer
    await expect(mobileDrawer.getByText('FROZEN DISNEY CLUB')).toBeVisible();
    await expect(mobileDrawer.getByText('ตั๋วกาชา')).toBeVisible();
    await expect(mobileDrawer.getByText('แลก Coupon')).toBeVisible();

    // Check close button visibility
    const closeBtn = page.locator('button[aria-label="ปิดเมนู Palworld"]');
    await expect(closeBtn).toBeVisible();

    // Remediated verification: Drawer is hoisted to z-[60] outside relative z-10 container,
    // so sticky header (z-50) no longer intercepts pointer events on the close button.
    await closeBtn.click();

    // Verify mobile drawer is closed via close button
    await expect(mobileDrawer).not.toBeVisible();
  });

  test('Check 5: Gacha and Coupon dialogs open on /shop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // 1. Gacha Dialog
    const gachaBtn = page.locator('button:has-text("ตั๋วกาชา")').first();
    await expect(gachaBtn).toBeVisible();
    await gachaBtn.click();

    // Check Gacha modal dialog
    const gachaDialog = page.locator('div[role="dialog"]:has-text("ตั๋วกาชา Palworld Frozen Expedition")');
    await expect(gachaDialog).toBeVisible();
    await expect(gachaDialog.getByText('คุณมีตั๋วกาชา 3 ใบ')).toBeVisible();
    await expect(gachaDialog.getByText('ตู้กาชากำลังหมุนเวียนของรางวัลซีซั่น Frozen Disney Club')).toBeVisible();

    // Close Gacha modal
    const closeGacha = gachaDialog.locator('button', { hasText: 'ปิด' });
    await closeGacha.click();
    await expect(gachaDialog).not.toBeVisible();

    // 2. Coupon Dialog
    const couponBtn = page.locator('button:has-text("แลก Coupon")').first();
    await expect(couponBtn).toBeVisible();
    await couponBtn.click();

    // Check Coupon modal dialog
    const couponDialog = page.locator('div[role="dialog"]:has-text("แลกรับสิทธิ์ด้วย Coupon Code")');
    await expect(couponDialog).toBeVisible();
    await expect(couponDialog.getByPlaceholder('ใส่รหัสคูปอง เช่น IRISFROZEN2026')).toBeVisible();

    // Test Coupon input and submission
    const input = couponDialog.getByPlaceholder('ใส่รหัสคูปอง เช่น IRISFROZEN2026');
    await input.fill('DISNEY2026');
    const redeemBtn = couponDialog.locator('button', { hasText: 'ยืนยันการแลก' });
    await redeemBtn.click();

    // Verify feedback message
    await expect(couponDialog.getByText('แลกคูปอง "DISNEY2026" สำเร็จ! ได้รับสิทธิ์เรียบร้อย')).toBeVisible();

    // Test closing Coupon modal
    const cancelBtn = couponDialog.locator('button', { hasText: 'ยกเลิก' });
    await cancelBtn.click();
    await expect(couponDialog).not.toBeVisible();
  });

  test('Check 6: Clicking event card CTA buttons in /event opens registration dialog', async ({ page }) => {
    await page.goto('/event', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Expect event headings
    await expect(page.getByRole('heading', { name: /กิจกรรมที่เชื่อมรางวัล/ })).toBeVisible();

    // Find first event card's CTA button (e.g. เข้าร่วมกิจกรรม or ดูรายละเอียด)
    const ctaButton = page.locator('button', { hasText: /(?:เข้าร่วมกิจกรรม|ดูรายละเอียด)/ }).first();
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();

    // Verify Event registration dialog opens
    const eventDialog = page.locator('div[role="dialog"]');
    await expect(eventDialog).toBeVisible();
    await expect(eventDialog.getByText('ระยะเวลากิจกรรม')).toBeVisible();
    await expect(eventDialog.getByText('รางวัลที่ได้รับ')).toBeVisible();

    // Check confirm button
    const confirmBtn = eventDialog.locator('button', { hasText: /(?:ยืนยันเข้าร่วม|ลงทะเบียนแล้ว|ปิด)/ }).last();
    await expect(confirmBtn).toBeVisible();

    // Click confirm button if active
    const btnText = await confirmBtn.textContent();
    if (btnText?.includes('ยืนยันเข้าร่วม')) {
      await confirmBtn.click();
      await expect(eventDialog.getByText('✓ ลงทะเบียนเข้าร่วมกิจกรรมเรียบร้อยแล้ว')).toBeVisible();
    }

    // Close dialog
    const closeOrCancel = eventDialog.locator('button', { hasText: /(?:ปิด|ยกเลิก)/ }).first();
    await closeOrCancel.click();
    await expect(eventDialog).not.toBeVisible();
  });
});
