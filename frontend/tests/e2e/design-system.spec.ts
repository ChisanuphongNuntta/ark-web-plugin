import { test, expect } from '@playwright/test';

test.describe('Design System Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to design system showcase page
    await page.goto('/design-system');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays correct title and branding tokens', async ({ page }) => {
    await expect(page).toHaveTitle(/IRIS Thailand/i);
    
    // Verify hero header
    const mainHeading = page.getByRole('heading', { name: 'IRIS PRISM PALACE' });
    await expect(mainHeading).toBeVisible();

    // Verify token color values exist
    await expect(page.locator('text=#05070D')).toBeVisible();
    await expect(page.locator('text=#071A24')).toBeVisible();
    await expect(page.locator('text=#37E5D2')).toBeVisible();
    await expect(page.locator('text=#A77BFF')).toBeVisible();
    await expect(page.locator('text=#DDBB72')).toBeVisible();
  });

  test('interactive button state transitions (loading -> success)', async ({ page }) => {
    // Locate the simulation trigger and target primary button
    const successSimBtn = page.getByRole('button', { name: 'จำลองโหลด → สำเร็จ' });
    const targetButton = page.getByRole('button', { name: 'ชำระเงินทันที' });

    await expect(successSimBtn).toBeVisible();
    await expect(targetButton).toBeVisible();

    // Click the simulation button
    await successSimBtn.click();

    // The target button should become disabled and show loading state
    await expect(targetButton).toBeDisabled();
    await expect(targetButton).toHaveAttribute('aria-busy', 'true');

    // Wait for the success state transition (takes ~2 seconds in mockup)
    await page.waitForTimeout(2200);

    // The button should now show success status text and not be busy
    await expect(targetButton).toContainText('ทำรายการเสร็จสิ้น!');
    await expect(targetButton).not.toHaveAttribute('aria-busy', 'true');
  });

  test('interactive button state transitions (loading -> error)', async ({ page }) => {
    const errorSimBtn = page.getByRole('button', { name: 'จำลองโหลด → ล้มเหลว' });
    const targetButton = page.getByRole('button', { name: 'ชำระเงินทันที' });

    // Click the error simulation button
    await errorSimBtn.click();

    // Wait for error state transition (takes ~1.5 seconds in mockup)
    await page.waitForTimeout(1700);

    // The button should now show error status text
    await expect(targetButton).toContainText('ล้มเหลว กรุณาลองใหม่');
  });

  test('input field validation and states', async ({ page }) => {
    const usernameInput = page.getByLabel('ชื่อผู้ใช้ Steam / Discord');
    await expect(usernameInput).toBeVisible();

    // Default state: no error
    await expect(page.locator('text=กรุณากรอกข้อความ')).not.toBeVisible();

    // Type empty value (or short value)
    await usernameInput.fill('ab');
    await expect(page.locator('text=ข้อความต้องยาวอย่างน้อย 3 ตัวอักษร')).toBeVisible();

    // Fill valid value
    await usernameInput.fill('iris_warrior');
    await expect(page.locator('text=ข้อความต้องยาวอย่างน้อย 3 ตัวอักษร')).not.toBeVisible();
    await expect(page.locator('text=ผ่านเกณฑ์การตรวจสอบแล้ว')).toBeVisible();
  });

  test('reduced motion interactive toggle', async ({ page }) => {
    const motionToggleBtn = page.getByLabel('ปิดเอฟเฟกต์การเคลื่อนไหว');
    await expect(motionToggleBtn).toBeVisible();
    
    // Toggle on (Reduced Motion)
    await motionToggleBtn.click();
    await expect(page.locator('text=เปิดเอฟเฟกต์ (Motion ON)')).toBeVisible();

    // Toggle back off (Motion ON)
    const motionEnableBtn = page.getByLabel('เปิดใช้งานเอฟเฟกต์การเคลื่อนไหว');
    await motionEnableBtn.click();
    await expect(page.locator('text=ปิดเอฟเฟกต์ (Reduced Motion)')).toBeVisible();
  });

  test('conforms to keyboard navigation and focus indicators', async ({ page }) => {
    // Trigger skip link focus on first Tab
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'ข้ามไปยังเนื้อหาหลัก' });
    await expect(skipLink).toBeFocused();
  });
});
