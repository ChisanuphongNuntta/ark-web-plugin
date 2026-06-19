import { test, expect } from '@playwright/test';

test.describe('IRIS Cart', () => {
  test('shows an actionable empty state', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'ตะกร้ายังว่างอยู่' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'สำรวจร้านค้า' })).toHaveAttribute('href', '/shop');
  });
});
