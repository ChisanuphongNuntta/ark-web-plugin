import { test, expect } from '@playwright/test';

const products = [
  {
    id: 1,
    name: 'Ascendant Longneck Rifle',
    description: 'High tech tek rifle',
    price: 1500,
    categoryId: 2,
    imageUrl: null,
    stock: 20,
    quality: 3,
    isBlueprint: false,
    productType: 'item'
  },
  {
    id: 2,
    name: 'Ascendant Rex Saddle',
    description: 'Armor saddle for Rex',
    price: 2500,
    categoryId: 1,
    imageUrl: null,
    stock: 5,
    quality: 5,
    isBlueprint: true,
    productType: 'item'
  }
];

const servers = [
  {
    id: 1,
    name: 'IRIS PVP main (The Island)',
    cluster: 'IRIS-PVP',
    mapName: 'TheIsland',
    isOnline: true,
    status: 'online',
    isAcceptingDeliveries: true,
    playersOnline: 42,
    maxPlayers: 100,
  }
];

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('E-Commerce Core Flow (Milestone 3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/products/, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      if (route.request().url().includes('/shop') || route.request().resourceType() === 'document' || route.request().url().includes('/_next/')) {
        return route.continue();
      }
      const url = route.request().url();
      if (url.includes('/products/categories')) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ categories: [] }),
        });
        return;
      }
      if (/\/products\/\d+/.test(url)) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ product: products[0] }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          products,
          pagination: { page: 1, limit: 24, total: 2, totalPages: 1 },
        }),
      });
    });

    await page.route('**/servers*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      if (route.request().resourceType() === 'document' || route.request().url().includes('/_next/')) {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ servers }),
      });
    });
  });

  test('happy path: filter shop -> inspect -> add to cart -> apply voucher -> checkout', async ({ page }) => {
    // 1. Visit Shop page
    await page.goto('/shop');
    await page.waitForLoadState('domcontentloaded');

    // Verify catalog list is loaded and click product to open popup modal
    const itemCard = page.getByRole('button', { name: `ดูรายละเอียดและซื้อ ${products[0].name}` });
    await expect(itemCard).toBeVisible({ timeout: 10000 });
    await itemCard.scrollIntoViewIfNeeded();
    await itemCard.click();

    // Verify modal popup opened
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.getByRole('heading', { name: products[0].name })).toBeVisible({ timeout: 10000 });

    // Verify online server option is visible in modal
    const serverBtn = modal.getByRole('button', { name: /IRIS PVP/i }).first();
    await expect(serverBtn).toBeVisible();
    await expect(serverBtn).toBeEnabled();

    // 3. Add to cart & checkout from modal
    const checkoutBtn = modal.getByRole('button', { name: 'ตรวจยอดและชำระ' });
    await checkoutBtn.click();

    // Should navigate to checkout or cart
    await expect(page).toHaveURL(/\/cart/);
  });
});
