import { expect, test } from '@playwright/test';

test.describe('Enterprise shell layout', () => {
  test('renders clean Thai navigation and footer labels', async ({ page }) => {
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' })).toBeVisible();
    await expect(page.getByRole('link', { name: /ร้านค้า/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /ตลาดผู้เล่น/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /ศูนย์ช่วยเหลือ/ }).last()).toBeVisible();
    await expect(page.getByText('โลกของผู้เล่น เชื่อมถึงกันโดยไม่สะดุด')).toBeVisible();
  });

  test('renders redesigned event chronicle without broken image fallbacks', async ({ page }) => {
    await page.goto('/event', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /กิจกรรมที่เชื่อมรางวัล/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'กำลังดำเนินการ' })).toBeVisible();
    const bannerImg = page.locator('img[src="/images/event_banner.png"]');
    await expect(bannerImg).toHaveAttribute('src', '/images/event_banner.png');
    await expect(page.getByRole('button', { name: 'เข้าร่วมกิจกรรม' }).first()).toBeVisible();
  });
});
