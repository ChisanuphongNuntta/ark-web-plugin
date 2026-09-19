import { test, expect } from '@playwright/test';

const mockProduct = {
  id: 1,
  name: 'Ascendant Longneck Rifle',
  description: 'ปืนไรเฟิลคอมแบทพลังทำลายล้างสูง สำหรับการล่าไดโนเสาร์ระดับบอส',
  price: 1500,
  quality: 5,
  productType: 'item',
  category: { id: 1, name: 'อาวุธ', slug: 'weapons' },
  stock: 10,
  images: [],
};

const mockServers = [
  { id: 1, name: 'IRIS PVE Main (Ragnarok)', region: 'TH', isOnline: true, map: 'Ragnarok' },
  { id: 2, name: 'IRIS PVP Season 3 (The Island)', region: 'TH', isOnline: true, map: 'The Island' },
  { id: 3, name: 'IRIS Event Server (Maintenance)', region: 'TH', isOnline: false, map: 'Extinction' },
];

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Contract-aligned product detail via popup modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      await route.continue();
    });

    // Mock category list
    await page.route('**/api/products/categories*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [{ id: 1, name: 'อาวุธ', _count: { products: 1 } }],
        }),
      });
    });

    // Mock single product fetch
    await page.route(/\/api\/products\/\d+/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ product: mockProduct }),
      });
    });

    // Mock product list
    await page.route(/\/api\/products(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          products: [mockProduct],
          pagination: { total: 1, page: 1, limit: 24, totalPages: 1 },
        }),
      });
    });

    // Mock servers
    await page.route('**/api/servers*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ servers: mockServers }),
      });
    });
  });

  test('navigating to /shop/1 redirects to /shop?buy=1 and opens modal popup', async ({ page }) => {
    await page.goto('/shop/1');
    await page.waitForLoadState('networkidle');

    // Should redirect to shop with buy param
    await expect(page).toHaveURL(/\/shop\?buy=1/);

    // Modal popup should be visible with product name and quality
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(modal.getByRole('heading', { name: mockProduct.name })).toBeVisible();
    await expect(modal.getByText('ASCENDANT', { exact: true })).toBeVisible();

    await page.screenshot({
      path: 'C:/Users/Heart_admin/.gemini/antigravity/brain/ef8a294f-fcd9-4033-b1eb-39b023b83346/shop_redirect_modal_live.png',
    });
  });

  test('clicking product card in shop opens popup modal directly', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    // Click on the product card directly
    const card = page.locator('article.frozen-product').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    // Verify modal popup opens without navigating to /shop/1
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.getByRole('heading', { name: mockProduct.name })).toBeVisible();

    await page.screenshot({
      path: 'C:/Users/Heart_admin/.gemini/antigravity/brain/ef8a294f-fcd9-4033-b1eb-39b023b83346/shop_card_popup_live.png',
    });
  });

  test('labels the catalog unit price and updates quantity in popup modal', async ({ page }) => {
    await page.goto('/shop?buy=1');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.getByText(/ราคาต่อหน่วย/i)).toBeVisible({ timeout: 10000 });

    const plusBtn = modal.getByRole('button', { name: 'เพิ่มจำนวน' });
    await expect(plusBtn).toBeVisible({ timeout: 10000 });
    await plusBtn.click();
    await expect(modal.getByLabel('จำนวนสินค้า')).toHaveText('2');
  });

  test('uses the public server directory and disables offline targets in modal', async ({ page }) => {
    await page.goto('/shop?buy=1');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.getByText(/เลือกเซิร์ฟเวอร์ปลายทาง/i)).toBeVisible({ timeout: 10000 });
    await expect(modal.getByRole('button', { name: /IRIS Event Server/i })).toBeDisabled();
  });

  test('adds the selected product line and exposes accessible success feedback', async ({ page }) => {
    await page.goto('/shop?buy=1');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const mainServerBtn = modal.getByRole('button', { name: /IRIS PVE Main/i });
    await expect(mainServerBtn).toBeVisible({ timeout: 10000 });
    await mainServerBtn.click();

    await modal.getByRole('button', { name: 'เพิ่มในตะกร้า' }).click();
    await expect(modal.getByText(/เพิ่มสินค้าลงในตะกร้าเรียบร้อย/i)).toBeVisible();
  });

  test('buy action adds to cart then navigates to backend-priced checkout', async ({ page }) => {
    await page.goto('/shop?buy=1');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const mainServerBtn = modal.getByRole('button', { name: /IRIS PVE Main/i });
    await expect(mainServerBtn).toBeVisible({ timeout: 10000 });
    await mainServerBtn.click();

    await modal.getByRole('button', { name: 'ตรวจยอดและชำระ' }).click();
    await expect(page).toHaveURL(/\/cart/);
  });

  test('rejects an invalid route parameter by redirecting to /shop', async ({ page }) => {
    await page.goto('/shop/missing');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/shop/);
  });

  test('has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/shop?buy=1');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
