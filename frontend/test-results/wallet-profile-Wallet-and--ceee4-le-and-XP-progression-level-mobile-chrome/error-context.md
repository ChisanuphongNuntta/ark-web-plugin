# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wallet-profile.spec.ts >> Wallet and Account Settings (Milestone 2) >> Authenticated User Session Tests >> renders user identity profile and XP progression level
- Location: tests\e2e\wallet-profile.spec.ts:142:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=PhoenixSurvivor')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=PhoenixSurvivor')
    - waiting for" https://localhost/login" navigation to finish...
    - navigated to "https://localhost/login"

```

```yaml
- navigation:
  - link "💎 IRIS TH MARKETPLACE":
    - /url: /
  - button:
    - img
- main:
  - text: 🔐
  - heading "เข้าสู่ระบบ" [level=1]
  - paragraph: เข้าสู่ระบบด้วย Discord เพื่อซื้อสินค้าและรับไอเทมในเกม
  - link "เข้าสู่ระบบด้วย Discord":
    - /url: https://localhost/api/auth/discord
    - img
    - text: เข้าสู่ระบบด้วย Discord
  - paragraph: หลังจาก Login แล้ว คุณจะต้องเชื่อม Steam ID
  - paragraph: เพื่อรับไอเทมในเกม ARK
- contentinfo:
  - link "💎 IRIS THAILAND":
    - /url: /
  - paragraph: The ultimate high-fidelity commerce platform for elite ARK Survival Evolved server networks. Experience immediate, automated real-time dinosaur and resource deliveries.
  - link "Discord":
    - /url: https://discord.gg
    - img
  - link "YouTube":
    - /url: https://youtube.com
    - img
  - link "Facebook":
    - /url: https://facebook.com
    - img
  - link "Twitch":
    - /url: https://twitch.tv
    - img
  - heading "NAVIGATION" [level=3]
  - list:
    - listitem:
      - link "STORE DATABASE":
        - /url: /shop
    - listitem:
      - link "DINO MARKETPLACE":
        - /url: /market
    - listitem:
      - link "LEADERBOARDS":
        - /url: /ranking
    - listitem:
      - link "SUPPORT DESK":
        - /url: /support
  - heading "REGULATORY & TERMS" [level=3]
  - list:
    - listitem:
      - link "PRIVACY POLICY":
        - /url: /privacy
        - img
        - text: PRIVACY POLICY
    - listitem:
      - link "TERMS OF SERVICE":
        - /url: /terms
        - img
        - text: TERMS OF SERVICE
    - listitem:
      - link "PDPA CONSENT CONTROL":
        - /url: /profile/data
        - img
        - text: PDPA CONSENT CONTROL
  - paragraph: © 2026 IRIS THAILAND. ALL OPERATIONS PROTECTED & AUTOMATED.
  - text: ISO 9001 QUALITY CERTIFIED ISO 27001 SECURITIES SECURED PDPA COMPLIANT
- img
- heading "เราใช้คุกกี้" [level=3]
- paragraph:
  - text: เว็บไซต์นี้ใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งานของคุณ คุกกี้ที่จำเป็นจะถูกใช้เสมอเพื่อให้บริการทำงานได้ คุณสามารถจัดการการตั้งค่าคุกกี้ได้
  - link "อ่านเพิ่มเติม":
    - /url: /privacy
- button "ตั้งค่า":
  - img
  - text: ตั้งค่า
- button "เฉพาะที่จำเป็น"
- button "ยอมรับทั้งหมด"
- button "Open Chat":
  - img
- alert
```

# Test source

```ts
  44  |               available: '1250',
  45  |               held: '300',
  46  |               promotional: '50',
  47  |               refundable: '0'
  48  |             },
  49  |             total: '1600'
  50  |           }),
  51  |         });
  52  |       });
  53  | 
  54  |       await page.route('**/api/wallet/transactions*', async (route) => {
  55  |         await route.fulfill({
  56  |           status: 200,
  57  |           contentType: 'application/json',
  58  |           body: JSON.stringify({
  59  |             transactions: [
  60  |               {
  61  |                 id: 'tx_recharge_01',
  62  |                 idempotencyKey: 'idem_key_topup_55',
  63  |                 type: 'recharge_promptpay',
  64  |                 referenceType: 'external',
  65  |                 referenceId: 'ref_promptpay_112',
  66  |                 description: 'เติมเงินสำเร็จ ผ่าน PromptPay QR',
  67  |                 createdAt: '2026-06-20T02:22:19Z',
  68  |                 entries: [
  69  |                   {
  70  |                     id: 'entry_topup_avail',
  71  |                     amount: '1000',
  72  |                     balanceAfter: '1250',
  73  |                     account: {
  74  |                       key: 'user:u_test_999:available:IC',
  75  |                       type: 'available',
  76  |                       currency: 'IC'
  77  |                     }
  78  |                   },
  79  |                   {
  80  |                     id: 'entry_topup_sys',
  81  |                     amount: '-1000',
  82  |                     balanceAfter: '50000',
  83  |                     account: {
  84  |                       key: 'system:issuance:IC',
  85  |                       type: 'system_issuance',
  86  |                       currency: 'IC'
  87  |                     }
  88  |                   }
  89  |                 ]
  90  |               },
  91  |               {
  92  |                 id: 'tx_buy_02',
  93  |                 idempotencyKey: 'idem_key_buy_77',
  94  |                 type: 'purchase_store',
  95  |                 referenceType: 'checkout',
  96  |                 referenceId: 'order_552',
  97  |                 description: 'ซื้อ Chibi Raptor Companion',
  98  |                 createdAt: '2026-06-19T18:10:00Z',
  99  |                 entries: [
  100 |                   {
  101 |                     id: 'entry_buy_avail',
  102 |                     amount: '-200',
  103 |                     balanceAfter: '250',
  104 |                     account: {
  105 |                       key: 'user:u_test_999:available:IC',
  106 |                       type: 'available',
  107 |                       currency: 'IC'
  108 |                     }
  109 |                   }
  110 |                 ]
  111 |               }
  112 |             ],
  113 |             pagination: {
  114 |               page: 1,
  115 |               limit: 10,
  116 |               total: 2,
  117 |               totalPages: 1
  118 |             }
  119 |           }),
  120 |         });
  121 |       });
  122 | 
  123 |       await page.route('**/api/users/profile', async (route) => {
  124 |         await route.fulfill({
  125 |           status: 200,
  126 |           contentType: 'application/json',
  127 |           body: JSON.stringify({
  128 |             success: true,
  129 |             user: {
  130 |               id: 'u_test_999',
  131 |               totalSpent: 1500
  132 |             }
  133 |           }),
  134 |         });
  135 |       });
  136 | 
  137 |       // Go to profile page
  138 |       await page.goto('/profile');
  139 |       await page.waitForLoadState('domcontentloaded');
  140 |     });
  141 | 
  142 |     test('renders user identity profile and XP progression level', async ({ page }) => {
  143 |       // Validate character metadata displays correctly
> 144 |       await expect(page.locator('text=PhoenixSurvivor')).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  145 |       await expect(page.locator('text=Discord ID: 5566778899')).toBeVisible();
  146 |       await expect(page.locator('text=Steam ID: 76561198000000000')).toBeVisible();
  147 |       
  148 |       // Spent amount and progression check (1500 Spent -> Level 2 Survivor)
  149 |       await expect(page.locator('text=฿1,500')).toBeVisible();
  150 |       await expect(page.locator('text=Level 2 Survivor')).toBeVisible();
  151 |     });
  152 | 
  153 |     test('renders multi-account wallet balances and grand total', async ({ page }) => {
  154 |       // Switch to Wallet & Ledger tab
  155 |       const walletTab = page.getByRole('tab', { name: 'กระเป๋าเงินและบัญชีแยกประเภท' });
  156 |       await walletTab.click();
  157 | 
  158 |       // Verify specific ledger account balances
  159 |       await expect(page.locator('text=1,250').first()).toBeVisible(); // Available
  160 |       await expect(page.locator('text=300')).toBeVisible(); // Held
  161 |       await expect(page.locator('text=50')).toBeVisible(); // Promotional
  162 |       await expect(page.locator('text=0').first()).toBeVisible(); // Refundable
  163 | 
  164 |       // Grand total check
  165 |       await expect(page.locator('text=1,600 IRIS COINS')).toBeVisible();
  166 |     });
  167 | 
  168 |     test('renders transaction history timeline and double-entry details', async ({ page }) => {
  169 |       const walletTab = page.getByRole('tab', { name: 'กระเป๋าเงินและบัญชีแยกประเภท' });
  170 |       await walletTab.click();
  171 | 
  172 |       // Check transaction logs are visible
  173 |       await expect(page.locator('text=เติมเงินสำเร็จ ผ่าน PromptPay QR')).toBeVisible();
  174 |       await expect(page.locator('text=ซื้อ Chibi Raptor Companion')).toBeVisible();
  175 | 
  176 |       // Verify credit and debit colorized indicators
  177 |       await expect(page.locator('text=+1,000')).toBeVisible();
  178 |       await expect(page.locator('text=-200')).toBeVisible();
  179 | 
  180 |       // Expand a transaction to view double-entry entries
  181 |       const expandBtn = page.getByRole('button', { name: 'แสดงบัญชีแยกประเภทร่วม' }).first();
  182 |       await expandBtn.click();
  183 | 
  184 |       // Entries table should be visible
  185 |       await expect(page.locator('text=ตรวจสอบโครงสร้างบัญชีสองด้าน (Ledger Entries)')).toBeVisible();
  186 |       await expect(page.locator('text=user:u_test_999:available:IC')).toBeVisible();
  187 |       await expect(page.locator('text=system:issuance:IC')).toBeVisible();
  188 |     });
  189 | 
  190 |     test('connected identities management and Epic Games mock linking', async ({ page }) => {
  191 |       // Switch to Identities tab
  192 |       const identityTab = page.getByRole('tab', { name: 'บัญชีเชื่อมต่อ' });
  193 |       await identityTab.click();
  194 | 
  195 |       // Verify Discord is connected, Steam is connected, Epic is disconnected
  196 |       await expect(page.locator('div:has-text("Discord Link") >> text=Connected')).toBeVisible();
  197 |       await expect(page.locator('div:has-text("Steam Neural Link") >> text=Connected')).toBeVisible();
  198 |       await expect(page.locator('div:has-text("Epic Games ID") >> text=Disconnected')).toBeVisible();
  199 | 
  200 |       // Mock Link Epic Games Account
  201 |       const epicInput = page.getByPlaceholder('กรอกชื่อ Epic ID');
  202 |       await epicInput.fill('EpicMaster_99');
  203 |       
  204 |       const submitBtn = page.getByRole('button', { name: 'ผูกมัด' });
  205 |       await submitBtn.click();
  206 | 
  207 |       // Expect connection status changes to Connected
  208 |       await expect(page.locator('div:has-text("Epic Games ID") >> text=Connected')).toBeVisible({ timeout: 5000 });
  209 |       await expect(page.locator('text=EpicMaster_99')).toBeVisible();
  210 |     });
  211 |   });
  212 | });
  213 | 
```