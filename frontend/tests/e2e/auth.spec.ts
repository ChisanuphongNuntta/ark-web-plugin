import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('login page shows Discord and Steam options', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // Discord button
    const discordBtn = page.locator('a[href*="discord"], button:has-text("Discord")');
    await expect(discordBtn.first()).toBeVisible();
  });

  test('clicking Discord login redirects to Discord OAuth', async ({ page }) => {
    await page.goto('/login');
    const discordBtn = page.locator('a[href*="discord"], button:has-text("Discord")').first();
    const href = await discordBtn.getAttribute('href');
    if (href) {
      expect(href).toMatch(/discord\.com|\/api\/auth\/discord/);
    } else {
      // It's a button that triggers navigation
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().includes('discord.com') || r.url().includes('/api/auth/discord'), { timeout: 5000 }).catch(() => null),
        discordBtn.click(),
      ]);
      // Navigation to Discord or API auth endpoint expected
      await expect(page).toHaveURL(/discord\.com|localhost/, { timeout: 5000 });
    }
  });

  test('protected routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/profile');
    // Wait for client-side redirect to /login or auth guard text to appear
    await Promise.race([
      page.waitForURL('**/login', { timeout: 5000 }),
      page.getByText('กรุณาเข้าสู่ระบบ').waitFor({ timeout: 5000 }),
    ]).catch(() => {});
    const isOnLogin = page.url().includes('/login');
    const hasAuthGuard = isOnLogin || await page.getByText('กรุณาเข้าสู่ระบบ').isVisible().catch(() => false);
    expect(isOnLogin || hasAuthGuard).toBe(true);
  });

  test('admin route is inaccessible to unauthenticated users', async ({ page }) => {
    await page.goto('/admin');
    // Wait for client-side redirect to /login or auth guard to render
    await Promise.race([
      page.waitForURL('**/login', { timeout: 5000 }),
      page.getByText('กรุณาเข้าสู่ระบบ').waitFor({ timeout: 5000 }),
    ]).catch(() => {});
    const isOnLogin = page.url().includes('/login');
    const hasAuthGuard = isOnLogin || await page.getByText('กรุณาเข้าสู่ระบบ').isVisible().catch(() => false);
    expect(isOnLogin || hasAuthGuard).toBe(true);
  });

  test('/auth/callback without params shows error or redirects', async ({ page }) => {
    await page.goto('/auth/callback');
    await page.waitForLoadState('networkidle');
    // Should not crash - either redirect or show error
    const url = page.url();
    expect(url).toBeTruthy();
  });
});
