import { test, expect } from '@playwright/test';

test.describe('Dino Marketplace', () => {
  test('market page loads', async ({ page }) => {
    await page.goto('/market');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/market/);
    // Market page renders "Dino Market" heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('sell listing page requires authentication', async ({ page }) => {
    await page.goto('/market/my-listings');
    await page.waitForURL(/\/login|\/market/, { timeout: 5000 });
    const isOnLogin = page.url().includes('/login');
    const hasAuthMsg = await page.locator('text=/login|เข้าสู่ระบบ/i').isVisible().catch(() => false);
    expect(isOnLogin || hasAuthMsg).toBe(true);
  });
});
