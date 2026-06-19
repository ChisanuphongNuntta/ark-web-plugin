import { test, expect } from '@playwright/test';

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
      // Inject logged-in auth store state into localStorage before loading page
      await page.addInitScript(() => {
        window.localStorage.setItem('auth-storage', JSON.stringify({
          state: {
            user: {
              id: 'u_test_999',
              discordId: '5566778899',
              discordUsername: 'PhoenixSurvivor',
              discordAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
              steamId: '76561198000000000',
              epicId: null,
              pointsBalance: 1250,
              isAdmin: false,
              role: 'user'
            }
          },
          version: 0
        }));
      });

      // Mock API responses for Wallet & Ledger
      await page.route('**/api/wallet', async (route) => {
        await route.fulfill({
          status: 200,
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

      await page.route('**/api/wallet/transactions*', async (route) => {
        await route.fulfill({
          status: 200,
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

      await page.route('**/api/users/profile', async (route) => {
        await route.fulfill({
          status: 200,
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
      await expect(page.locator('text=PhoenixSurvivor')).toBeVisible();
      await expect(page.locator('text=Discord ID: 5566778899')).toBeVisible();
      await expect(page.locator('text=Steam ID: 76561198000000000')).toBeVisible();
      
      // Spent amount and progression check (1500 Spent -> Level 2 Survivor)
      await expect(page.locator('text=฿1,500')).toBeVisible();
      await expect(page.locator('text=Level 2 Survivor')).toBeVisible();
    });

    test('renders multi-account wallet balances and grand total', async ({ page }) => {
      // Switch to Wallet & Ledger tab
      const walletTab = page.getByRole('tab', { name: 'กระเป๋าเงินและบัญชีแยกประเภท' });
      await walletTab.click();

      // Verify specific ledger account balances
      await expect(page.locator('text=1,250').first()).toBeVisible(); // Available
      await expect(page.locator('text=300')).toBeVisible(); // Held
      await expect(page.locator('text=50')).toBeVisible(); // Promotional
      await expect(page.locator('text=0').first()).toBeVisible(); // Refundable

      // Grand total check
      await expect(page.locator('text=1,600 IRIS COINS')).toBeVisible();
    });

    test('renders transaction history timeline and double-entry details', async ({ page }) => {
      const walletTab = page.getByRole('tab', { name: 'กระเป๋าเงินและบัญชีแยกประเภท' });
      await walletTab.click();

      // Check transaction logs are visible
      await expect(page.locator('text=เติมเงินสำเร็จ ผ่าน PromptPay QR')).toBeVisible();
      await expect(page.locator('text=ซื้อ Chibi Raptor Companion')).toBeVisible();

      // Verify credit and debit colorized indicators
      await expect(page.locator('text=+1,000')).toBeVisible();
      await expect(page.locator('text=-200')).toBeVisible();

      // Expand a transaction to view double-entry entries
      const expandBtn = page.getByRole('button', { name: 'แสดงบัญชีแยกประเภทร่วม' }).first();
      await expandBtn.click();

      // Entries table should be visible
      await expect(page.locator('text=ตรวจสอบโครงสร้างบัญชีสองด้าน (Ledger Entries)')).toBeVisible();
      await expect(page.locator('text=user:u_test_999:available:IC')).toBeVisible();
      await expect(page.locator('text=system:issuance:IC')).toBeVisible();
    });

    test('connected identities management and Epic Games mock linking', async ({ page }) => {
      // Switch to Identities tab
      const identityTab = page.getByRole('tab', { name: 'บัญชีเชื่อมต่อ' });
      await identityTab.click();

      // Verify Discord is connected, Steam is connected, Epic is disconnected
      await expect(page.locator('div:has-text("Discord Link") >> text=Connected')).toBeVisible();
      await expect(page.locator('div:has-text("Steam Neural Link") >> text=Connected')).toBeVisible();
      await expect(page.locator('div:has-text("Epic Games ID") >> text=Disconnected')).toBeVisible();

      // Mock Link Epic Games Account
      const epicInput = page.getByPlaceholder('กรอกชื่อ Epic ID');
      await epicInput.fill('EpicMaster_99');
      
      const submitBtn = page.getByRole('button', { name: 'ผูกมัด' });
      await submitBtn.click();

      // Expect connection status changes to Connected
      await expect(page.locator('div:has-text("Epic Games ID") >> text=Connected')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=EpicMaster_99')).toBeVisible();
    });
  });
});
