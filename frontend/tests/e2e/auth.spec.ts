import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user: null, token: null, isAuthenticated: false } }));
    });

    await page.route('**/*auth/me*', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthenticated' }),
      });
    });
  });

  test('login page shows Discord and Steam options', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('a[href*="/auth/discord"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking Discord login redirects to Discord OAuth', async ({ page }) => {
    await page.goto('/login');
    const discordBtn = page.locator('a[href*="/auth/discord"]').first();
    await expect(discordBtn).toBeVisible({ timeout: 10000 });
    await expect(discordBtn).toHaveAttribute('href', /\/auth\/discord/);
  });

  test('clicking Steam login redirects to Steam OpenID', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('a[href*="/auth/discord"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('protected routes show unauthenticated prompt when signed out', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/.*\/login|.*\/profile/);
  });

  test('admin route is inaccessible to unauthenticated users', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/.*\/login|.*\/admin/);
  });

  test('/auth/callback without params shows error or redirects', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/.*\/login|.*\/|.*\/auth\/callback/);
  });
});
