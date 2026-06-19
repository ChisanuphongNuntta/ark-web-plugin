import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('loads with correct title and hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/IRIS Thailand/i);
    // Main content area should be visible
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('navbar shows login button when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
    const loginLink = page.getByRole('link', { name: 'เข้าสู่ระบบ' });
    await expect(loginLink.first()).toBeVisible();
  });

  test('featured products section visible', async ({ page }) => {
    await page.goto('/');
    // Wait for data to load
    await page.waitForLoadState('domcontentloaded');
    const productsOrLoader = page.locator('[class*="product"], [class*="card"], [class*="loader"], [class*="loading"]');
    await expect(productsOrLoader.first()).toBeVisible({ timeout: 10000 });
  });

  test('footer is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
  });

  test('exposes keyboard skip link and connected ecosystem journeys', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'ข้ามไปยังเนื้อหาหลัก' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'เลือกเส้นทางของคุณ' })).toBeVisible();
  });
});
