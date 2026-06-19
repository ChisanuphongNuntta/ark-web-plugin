import { test, expect } from '@playwright/test';

test.describe('Shop Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads shop page with products or empty state', async ({ page }) => {
    await expect(page).toHaveURL(/\/shop/);
    // Shop page renders "ร้านค้า" h1 heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('search box is present', async ({ page }) => {
    // Shop has input with placeholder "ค้นหาสินค้า..."
    const search = page.locator('input[placeholder*="ค้นหา"]');
    await expect(search.first()).toBeVisible({ timeout: 8000 });
  });

  test('category filter exists', async ({ page }) => {
    // Shop has a <select> dropdown for category filtering
    await expect(page.locator('select').first()).toBeVisible({ timeout: 8000 });
  });

  test('clicking product shows detail or login prompt', async ({ page }) => {
    const productCard = page.locator('[class*="product"], [class*="card"]').first();
    const hasProduct = await productCard.isVisible().catch(() => false);
    if (!hasProduct) {
      test.skip(true, 'No products in database');
      return;
    }
    await productCard.click();
    // Should show either product modal or redirect to login
    await expect(
      page.locator('[class*="modal"], [class*="popup"], dialog, [role="dialog"]').first()
        .or(page.locator('text=/login|เข้าสู่ระบบ/i').first())
    ).toBeVisible({ timeout: 5000 });
  });
});
