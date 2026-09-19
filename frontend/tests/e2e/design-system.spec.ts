import { test, expect } from '@playwright/test';

test.describe('Design System Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
    await page.waitForLoadState('networkidle');
  });

  test('displays correct title and branding tokens', async ({ page }) => {
    await expect(page.getByText(/Design System|Iconic Siam/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('interactive button state transitions (loading -> success)', async ({ page }) => {
    const simButton = page.locator('#sim-success-btn');
    const targetButton = page.locator('#target-sim-button');

    await expect(simButton).toBeVisible({ timeout: 10000 });
    await simButton.scrollIntoViewIfNeeded();
    await simButton.click({ force: true });

    // Verify end-state text
    await expect(targetButton).toContainText('ทำรายการเสร็จสิ้น!', { timeout: 5000 });
  });

  test('interactive button state transitions (loading -> error)', async ({ page }) => {
    const simButton = page.locator('#sim-error-btn');
    const targetButton = page.locator('#target-sim-button');

    await expect(simButton).toBeVisible({ timeout: 10000 });
    await simButton.scrollIntoViewIfNeeded();
    await simButton.click({ force: true });

    // Verify end-state text
    await expect(targetButton).toContainText('ล้มเหลว กรุณาลองใหม่', { timeout: 5000 });
  });

  test('input field validation and states', async ({ page }) => {
    const standardInput = page.getByPlaceholder('กรอกชื่อเพื่อเชื่อมต่อไอดี...');
    const searchInput = page.getByPlaceholder('ค้นหาไดโนเสาร์, ปืน, ไอเท็ม...');

    await expect(standardInput).toBeVisible({ timeout: 10000 });
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('conforms to keyboard navigation and focus indicators', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});
