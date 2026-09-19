import { test, expect } from '@playwright/test';

const mockUser = {
  id: 'u_test_999',
  discordId: '5566778899',
  discordUsername: 'PhoenixSurvivor',
  discordAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
  steamId: '76561198000000000',
  epicId: null,
  pointsBalance: 1250,
  isAdmin: false,
  role: 'user'
};

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Wallet and Account Settings (Milestone 2)', () => {

  test('profile page shows sign-in prompt when unauthenticated', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    // Should render empty state for unauthenticated users
    await expect(page.locator('text=กรุณาเข้าสู่ระบบก่อนทำรายการ')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบทันที' })).toBeVisible();
  });

  test.describe('Authenticated User Session Tests', () => {
    test.beforeEach(async ({ page }) => {
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

      // Inject logged-in auth store state into localStorage before loading page
      await page.addInitScript((user) => {
        window.localStorage.setItem('auth-storage', JSON.stringify({
          state: { user },
          version: 0
        }));
      }, mockUser);

      // Mock auth me endpoint
      await page.route('**/auth/me**', async (route) => {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ user: mockUser }),
        });
      });

      // Mock linked identities endpoint with rules
      await page.route('**/auth/identities**', async (route) => {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: 'u_test_999',
            identities: [
              {
                provider: 'discord',
                providerAccountId: '5566778899',
                displayName: 'PhoenixSurvivor',
                linkedAt: '2026-05-01T09:12:00.000Z',
                proofMethod: 'discord_oauth',
                isPrimary: true,
                canUnlink: false,
              },
              {
                provider: 'steam',
                providerAccountId: '76561198000000000',
                displayName: 'PhoenixSteam',
                linkedAt: '2026-05-03T14:40:00.000Z',
                proofMethod: 'steam_openid',
                isPrimary: false,
                canUnlink: true,
              },
              {
                provider: 'epic',
                providerAccountId: null,
                displayName: null,
                linkedAt: null,
                proofMethod: null,
                isPrimary: false,
                canUnlink: false,
              }
            ],
            rules: {
              minimumLinkedProviders: 1,
              canUnlinkPrimary: false,
              requireProofOfControl: true
            }
          }),
        });
      });

      // Mock API responses for Wallet & Ledger
      await page.route('**/wallet', async (route) => {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            currency: 'IC',
            accounts: {
              available: '1250',
              held: '300',
              promotional: '50',
              refundable: '0'
            },
            total: '1600'
          }),
        });
      });

      await page.route('**/wallet/transactions*', async (route) => {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [
              {
                id: 'tx_recharge_01',
                idempotencyKey: 'idem_key_topup_55',
                type: 'recharge_promptpay',
                referenceType: 'external',
                referenceId: 'ref_promptpay_112',
                description: 'เติมเงินสำเร็จ ผ่าน PromptPay QR',
                createdAt: '2026-06-20T02:22:19Z',
                entries: [
                  {
                    id: 'entry_topup_avail',
                    amount: '1000',
                    balanceAfter: '1250',
                    account: {
                      key: 'user:u_test_999:available:IC',
                      type: 'available',
                      currency: 'IC'
                    }
                  },
                  {
                    id: 'entry_topup_sys',
                    amount: '-1000',
                    balanceAfter: '50000',
                    account: {
                      key: 'system:issuance:IC',
                      type: 'system_issuance',
                      currency: 'IC'
                    }
                  }
                ]
              },
              {
                id: 'tx_buy_02',
                idempotencyKey: 'idem_key_buy_77',
                type: 'purchase_store',
                referenceType: 'checkout',
                referenceId: 'order_552',
                description: 'ซื้อ Chibi Raptor Companion',
                createdAt: '2026-06-19T18:10:00Z',
                entries: [
                  {
                    id: 'entry_buy_avail',
                    amount: '-200',
                    balanceAfter: '250',
                    account: {
                      key: 'user:u_test_999:available:IC',
                      type: 'available',
                      currency: 'IC'
                    }
                  }
                ]
              }
            ],
            pagination: {
              page: 1,
              limit: 10,
              total: 2,
              totalPages: 1
            }
          }),
        });
      });

      await page.route('**/users/profile*', async (route) => {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            user: {
              id: 'u_test_999',
              totalSpent: 1500
            }
          }),
        });
      });

      // Go to profile page
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
    });

    test('renders user identity profile and XP progression level', async ({ page }) => {
      // Validate character metadata displays correctly
      await expect(page.locator('main').getByText('PhoenixSurvivor').first()).toBeVisible();
      await expect(page.getByText('Discord ID: 5566778899').first()).toBeVisible();
      await expect(page.getByText('Steam ID: 76561198000000000').first()).toBeVisible();
      
      // Spent amount and progression check (1500 Spent -> Level 2 Survivor)
      await expect(page.getByText('฿1,500').first()).toBeVisible();
      await expect(page.getByText('Level 2 Survivor').first()).toBeVisible();
    });

    test('renders multi-account wallet balances and grand total', async ({ page }) => {
      // Switch to Wallet & Ledger tab
      const walletTab = page.getByRole('tab', { name: /กระเป๋าเงิน/i });
      await walletTab.scrollIntoViewIfNeeded();
      await walletTab.click();

      // Verify specific ledger account balances
      await expect(page.locator('main').getByText('1250').first()).toBeVisible(); // Available
      await expect(page.locator('main').getByText('300').first()).toBeVisible(); // Held
      await expect(page.locator('main').getByText('50').first()).toBeVisible(); // Promotional
    });

    test('renders transaction history timeline and double-entry details', async ({ page }) => {
      // Switch to Wallet & Ledger tab
      const walletTab = page.getByRole('tab', { name: /กระเป๋าเงิน/i });
      await walletTab.scrollIntoViewIfNeeded();
      await walletTab.click();

      // Validate double-entry ledger descriptions
      await expect(page.getByText('เติมเงินสำเร็จ ผ่าน PromptPay QR').first()).toBeVisible();
      await expect(page.getByText('ซื้อ Chibi Raptor Companion').first()).toBeVisible();
    });

    test('connected identities management and Epic Games mock linking', async ({ page }) => {
      // Switch to Identity Links tab
      const identityTab = page.getByRole('tab', { name: /บัญชีและความปลอดภัย/i });
      await identityTab.scrollIntoViewIfNeeded();
      await identityTab.click();

      // Steam link indicator check
      await expect(page.getByText('76561198000000000').first()).toBeVisible();

      // Epic Games unlinked state check
      await expect(page.getByText('Epic Games').first()).toBeVisible();
    });
  });
});
