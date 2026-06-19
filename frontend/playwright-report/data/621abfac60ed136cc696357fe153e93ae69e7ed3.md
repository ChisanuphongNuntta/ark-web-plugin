# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wallet-profile.spec.ts >> Wallet and Account Settings (Milestone 2) >> Authenticated User Session Tests >> renders transaction history timeline and double-entry details
- Location: tests\e2e\wallet-profile.spec.ts:168:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('tab', { name: 'กระเป๋าเงินและบัญชีแยกประเภท' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e5]:
      - link "💎 IRIS TH MARKETPLACE" [ref=e6] [cursor=pointer]:
        - /url: /
        - generic [ref=e8]: 💎
        - generic [ref=e10]:
          - generic [ref=e11]:
            - text: IRIS
            - generic [ref=e12]: TH
          - generic [ref=e13]: MARKETPLACE
      - generic [ref=e14]:
        - link "HOME" [ref=e15] [cursor=pointer]:
          - /url: /
          - img [ref=e16]
          - generic [ref=e19]: HOME
        - link "STORE" [ref=e20] [cursor=pointer]:
          - /url: /shop
          - img [ref=e21]
          - generic [ref=e24]: STORE
        - link "TOP UP" [ref=e25] [cursor=pointer]:
          - /url: /topup
          - img [ref=e26]
          - generic [ref=e28]: TOP UP
        - link "EVENT" [ref=e29] [cursor=pointer]:
          - /url: /event
          - img [ref=e30]
          - generic [ref=e32]: EVENT
        - link "MARKET" [ref=e33] [cursor=pointer]:
          - /url: /market
          - img [ref=e34]
          - generic [ref=e39]: MARKET
        - link "RANKING" [ref=e40] [cursor=pointer]:
          - /url: /ranking
          - img [ref=e41]
          - generic [ref=e47]: RANKING
        - link "SUPPORT" [ref=e48] [cursor=pointer]:
          - /url: /support
          - img [ref=e49]
          - generic [ref=e52]: SUPPORT
      - generic [ref=e54]:
        - textbox "ค้นหาไอเทม..." [ref=e55]
        - button [ref=e56] [cursor=pointer]:
          - img [ref=e57]
      - link "AUTHENTICATE" [ref=e61] [cursor=pointer]:
        - /url: https://localhost/api/auth/discord
        - generic [ref=e63]:
          - img [ref=e64]
          - text: AUTHENTICATE
  - main [ref=e67]:
    - generic [ref=e74]:
      - generic [ref=e77]: 🔐
      - heading "เข้าสู่ระบบ" [level=1] [ref=e78]
      - paragraph [ref=e79]: เข้าสู่ระบบด้วย Discord เพื่อซื้อสินค้าและรับไอเทมในเกม
      - link "เข้าสู่ระบบด้วย Discord" [ref=e80] [cursor=pointer]:
        - /url: https://localhost/api/auth/discord
        - img [ref=e81]
        - text: เข้าสู่ระบบด้วย Discord
      - generic [ref=e83]:
        - paragraph [ref=e84]: หลังจาก Login แล้ว คุณจะต้องเชื่อม Steam ID
        - paragraph [ref=e85]: เพื่อรับไอเทมในเกม ARK
  - contentinfo [ref=e88]:
    - generic [ref=e89]:
      - generic [ref=e90]:
        - generic [ref=e91]:
          - link "💎 IRIS THAILAND" [ref=e92] [cursor=pointer]:
            - /url: /
            - generic [ref=e93]: 💎
            - generic [ref=e94]: IRIS THAILAND
          - paragraph [ref=e95]: The ultimate high-fidelity commerce platform for elite ARK Survival Evolved server networks. Experience immediate, automated real-time dinosaur and resource deliveries.
          - generic [ref=e96]:
            - link "Discord" [ref=e97] [cursor=pointer]:
              - /url: https://discord.gg
              - img [ref=e98]
            - link "YouTube" [ref=e100] [cursor=pointer]:
              - /url: https://youtube.com
              - img [ref=e101]
            - link "Facebook" [ref=e104] [cursor=pointer]:
              - /url: https://facebook.com
              - img [ref=e105]
            - link "Twitch" [ref=e107] [cursor=pointer]:
              - /url: https://twitch.tv
              - img [ref=e108]
        - generic [ref=e110]:
          - heading "NAVIGATION" [level=3] [ref=e111]
          - list [ref=e112]:
            - listitem [ref=e113]:
              - link "STORE DATABASE" [ref=e114] [cursor=pointer]:
                - /url: /shop
            - listitem [ref=e115]:
              - link "DINO MARKETPLACE" [ref=e116] [cursor=pointer]:
                - /url: /market
            - listitem [ref=e117]:
              - link "LEADERBOARDS" [ref=e118] [cursor=pointer]:
                - /url: /ranking
            - listitem [ref=e119]:
              - link "SUPPORT DESK" [ref=e120] [cursor=pointer]:
                - /url: /support
        - generic [ref=e121]:
          - heading "REGULATORY & TERMS" [level=3] [ref=e122]
          - list [ref=e123]:
            - listitem [ref=e124]:
              - link "PRIVACY POLICY" [ref=e125] [cursor=pointer]:
                - /url: /privacy
                - img [ref=e126]
                - generic [ref=e128]: PRIVACY POLICY
            - listitem [ref=e129]:
              - link "TERMS OF SERVICE" [ref=e130] [cursor=pointer]:
                - /url: /terms
                - img [ref=e131]
                - generic [ref=e134]: TERMS OF SERVICE
            - listitem [ref=e135]:
              - link "PDPA CONSENT CONTROL" [ref=e136] [cursor=pointer]:
                - /url: /profile/data
                - img [ref=e137]
                - generic [ref=e139]: PDPA CONSENT CONTROL
      - generic [ref=e140]:
        - paragraph [ref=e141]: © 2026 IRIS THAILAND. ALL OPERATIONS PROTECTED & AUTOMATED.
        - generic [ref=e142]:
          - generic [ref=e143]: ISO 9001 QUALITY CERTIFIED
          - generic [ref=e145]: ISO 27001 SECURITIES SECURED
          - generic [ref=e147]: PDPA COMPLIANT
  - generic [ref=e150]:
    - generic [ref=e151]:
      - img [ref=e152]
      - generic [ref=e154]:
        - heading "เราใช้คุกกี้" [level=3] [ref=e155]
        - paragraph [ref=e156]:
          - text: เว็บไซต์นี้ใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งานของคุณ คุกกี้ที่จำเป็นจะถูกใช้เสมอเพื่อให้บริการทำงานได้ คุณสามารถจัดการการตั้งค่าคุกกี้ได้
          - link "อ่านเพิ่มเติม" [ref=e157] [cursor=pointer]:
            - /url: /privacy
    - generic [ref=e158]:
      - button "ตั้งค่า" [ref=e159] [cursor=pointer]:
        - img [ref=e160]
        - text: ตั้งค่า
      - button "เฉพาะที่จำเป็น" [ref=e163] [cursor=pointer]
      - button "ยอมรับทั้งหมด" [ref=e164] [cursor=pointer]
  - button "Open Chat" [ref=e165] [cursor=pointer]:
    - img [ref=e166]
  - alert [ref=e168]
```

# Test source

```ts
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
  144 |       await expect(page.locator('text=PhoenixSurvivor')).toBeVisible();
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
> 170 |       await walletTab.click();
      |                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
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