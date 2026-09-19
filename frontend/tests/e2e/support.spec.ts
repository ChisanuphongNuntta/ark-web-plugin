import { expect, test } from '@playwright/test';

test.describe('Support command center', () => {
  test('renders enterprise support layout and category evidence states', async ({ page }) => {
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /ศูนย์ช่วยเหลือที่เชื่อมเว็บ/ })).toBeVisible();
    await expect(page.getByText('IRIS Support Command Center')).toBeVisible();
    await expect(page.getByText('Wallet และ Auto Top-up')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ส่งคำร้องให้ Operator' })).toBeVisible();

    const p2pBtn = page.locator('#submit-ticket').getByRole('button', { name: /P2P/ });
    await p2pBtn.scrollIntoViewIfNeeded();
    await expect(async () => {
      await p2pBtn.click();
      await expect(page.getByText(/หลักฐานที่ควรแนบสำหรับ P2P/)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByText('Listing ID / Trade ID')).toBeVisible();
  });

  test('filters FAQ and submits a mock ticket successfully', async ({ page }) => {
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('ค้นหา เติมเงิน, order, plugin...').fill('P2P');
    await expect(page.locator('#faq').getByRole('button', { name: /P2P Marketplace/ })).toBeVisible();

    await page.locator('#submit-ticket').scrollIntoViewIfNeeded();
    await page.getByPlaceholder('Survivor#1234').fill('Tester#0001');
    await page.getByPlaceholder('order-iris-0001 หรือ ref promptpay').fill('trade-iris-001');
    await page.getByPlaceholder(/อธิบายปัญหาแบบเป็นลำดับ/).fill('รายการซื้อขาย P2P ถูก lock หลังจากผู้ขายยืนยันแล้ว ต้องการให้ทีมงานตรวจ escrow และสถานะ trade');
    
    const submitBtn = page.getByRole('button', { name: /ส่ง Ticket ให้ Operator/ });
    await submitBtn.scrollIntoViewIfNeeded();
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await expect(page.getByRole('status')).toContainText('สร้าง Ticket mock สำเร็จ', { timeout: 10000 });
  });
});
