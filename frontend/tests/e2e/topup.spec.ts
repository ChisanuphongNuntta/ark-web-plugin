import { test, expect } from '@playwright/test';

const mockUser = {
  id: 'u_topup_user_1',
  discordId: '1234567890',
  discordUsername: 'TopupTester',
  pointsBalance: 500,
  isAdmin: false,
  role: 'user',
};

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Top-up E2E Flow (/topup)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject authenticated user into localStorage
    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: { user },
          version: 0,
        })
      );
    }, mockUser);

    // Handle OPTIONS preflight requests
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: corsHeaders,
        });
        return;
      }
      await route.continue();
    });

    // Mock auth me endpoint
    await page.route('**/auth/me**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ user: mockUser }),
      });
    });

    // Mock packages endpoint
    await page.route('**/payments/packages**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          packages: [
            { id: 'pkg-1', name: 'Basic Pack 100', priceThb: '35', points: '100', bonusPoints: '0', totalPoints: '100', tier: 'basic', isPopular: false },
            { id: 'pkg-2', name: 'Basic Pack 300', priceThb: '99', points: '300', bonusPoints: '10', totalPoints: '310', tier: 'basic', isPopular: false },
            { id: 'pkg-3', name: 'Standard Pack 500', priceThb: '159', points: '500', bonusPoints: '25', totalPoints: '525', tier: 'standard', isPopular: false },
            { id: 'pkg-4', name: 'Standard Pack 1000', priceThb: '299', points: '1000', bonusPoints: '100', totalPoints: '1100', tier: 'standard', isPopular: true },
            { id: 'pkg-5', name: 'Premium Pack 2500', priceThb: '699', points: '2500', bonusPoints: '350', totalPoints: '2850', tier: 'premium', isPopular: false },
            { id: 'pkg-6', name: 'Premium Pack 5000', priceThb: '1299', points: '5000', bonusPoints: '1000', totalPoints: '6000', tier: 'premium', isPopular: false },
            { id: 'pkg-7', name: 'Legendary Pack 10000', priceThb: '2499', points: '10000', bonusPoints: '2500', totalPoints: '12500', tier: 'legendary', isPopular: false },
          ],
        }),
      });
    });
  });

  test('1. Verify coin package rendering on /topup', async ({ page }) => {
    await page.goto('/topup');
    await page.waitForLoadState('domcontentloaded');

    // Page title check
    await expect(page.getByRole('heading', { name: /เติมเหรียญ/i })).toBeVisible();

    // Verify all coin package cards are rendered with coin values and prices
    await expect(page.getByText('100 IC').first()).toBeVisible();
    await expect(page.getByText('฿35').first()).toBeVisible();

    await expect(page.getByText('310 IC').first()).toBeVisible();
    await expect(page.getByText('฿99').first()).toBeVisible();

    await expect(page.getByText('525 IC').first()).toBeVisible();
    await expect(page.getByText('฿159').first()).toBeVisible();

    await expect(page.getByText('1,100 IC').first()).toBeVisible();
    await expect(page.getByText('฿299').first()).toBeVisible();

    await expect(page.getByText('2,850 IC').first()).toBeVisible();
    await expect(page.getByText('฿699').first()).toBeVisible();

    await expect(page.getByText('6,000 IC').first()).toBeVisible();
    await expect(page.getByText('฿1,299').first()).toBeVisible();

    await expect(page.getByText('12,500 IC').first()).toBeVisible();
    await expect(page.getByText('฿2,499').first()).toBeVisible();

    // Verify POPULAR badge is displayed
    await expect(page.getByText('POPULAR').first()).toBeVisible();
  });

  test('2. Verify Bank Transfer method selection and Slip Upload flow', async ({ page }) => {
    await page.goto('/topup');
    await page.waitForLoadState('domcontentloaded');

    // Verify Bank Transfer option is visible
    await expect(page.getByText(/โอนเงินธนาคาร/i).first()).toBeVisible();
    await expect(page.getByText(/ADMIN APPROVAL/i).first()).toBeVisible();

    // Verify bank account details
    await expect(page.getByText(/ธนาคารกสิกรไทย/i).first()).toBeVisible();
    await expect(page.getByText(/095-2-88219-4/i).first()).toBeVisible();

    // Verify Submit button for Bank Transfer
    const submitBtn = page.getByRole('button', { name: /ส่งสลิปเพื่อขออนุมัติ/i });
    await expect(submitBtn).toBeVisible();
  });

  test('3. Verify Sandbox developer gateway payment flow', async ({ page }) => {
    // Intercept payment intent creation endpoint
    await page.route('**/payments/intents**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          intent: {
            id: 'intent-sandbox-777',
            userId: mockUser.id,
            packageId: 'pkg-4',
            provider: 'sandbox',
            reference: 'IRIS-SANDBOX-TEST-777',
            amountThb: '299',
            pointsAmount: '1100',
            paymentUrl: 'https://sandbox.payment.local/pay',
            status: 'success',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
          replayed: false,
        }),
      });
    });

    await page.goto('/topup');
    await page.waitForLoadState('domcontentloaded');

    // Select Sandbox Gateway
    const sandboxOption = page.getByText(/Sandbox Developer Gateway/i);
    await sandboxOption.scrollIntoViewIfNeeded();
    await sandboxOption.click();

    // Click confirm button
    const confirmBtn = page.getByRole('button', { name: /ยืนยันการเติมเงิน/i });
    await confirmBtn.scrollIntoViewIfNeeded();
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    // Verify Dialog appears with SANDBOX PAYMENT COMPLETED
    await expect(page.getByText(/SANDBOX PAYMENT COMPLETED/i).first()).toBeVisible({ timeout: 10000 });
  });
});
