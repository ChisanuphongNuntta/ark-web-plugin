# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wallet-profile.spec.ts >> Wallet and Account Settings (Milestone 2) >> profile page shows sign-in prompt when unauthenticated
- Location: tests\e2e\wallet-profile.spec.ts:5:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=กรุณาเข้าสู่ระบบก่อนทำรายการ')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=กรุณาเข้าสู่ระบบก่อนทำรายการ')
    - waiting for" https://localhost/login" navigation to finish...
    - navigated to "https://localhost/login"

```

```yaml
- navigation:
  - link "💎 IRIS TH MARKETPLACE":
    - /url: /
  - link "HOME":
    - /url: /
    - img
    - text: HOME
  - link "STORE":
    - /url: /shop
    - img
    - text: STORE
  - link "TOP UP":
    - /url: /topup
    - img
    - text: TOP UP
  - link "EVENT":
    - /url: /event
    - img
    - text: EVENT
  - link "MARKET":
    - /url: /market
    - img
    - text: MARKET
  - link "RANKING":
    - /url: /ranking
    - img
    - text: RANKING
  - link "SUPPORT":
    - /url: /support
    - img
    - text: SUPPORT
  - textbox "ค้นหาไอเทม..."
  - button:
    - img
  - link "AUTHENTICATE":
    - /url: https://localhost/api/auth/discord
    - img
    - text: AUTHENTICATE
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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Wallet and Account Settings (Milestone 2)', () => {
  4   | 
  5   |   test('profile page shows sign-in prompt when unauthenticated', async ({ page }) => {
  6   |     await page.goto('/profile');
  7   |     await page.waitForLoadState('domcontentloaded');
  8   | 
  9   |     // Should render empty state for unauthenticated users
> 10  |     await expect(page.locator('text=กรุณาเข้าสู่ระบบก่อนทำรายการ')).toBeVisible();
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  11  |     await expect(page.getByRole('button', { name: 'เข้าสู่ระบบทันที' })).toBeVisible();
  12  |   });
  13  | 
  14  |   test.describe('Authenticated User Session Tests', () => {
  15  |     test.beforeEach(async ({ page }) => {
  16  |       // Inject logged-in auth store state into localStorage before loading page
  17  |       await page.addInitScript(() => {
  18  |         window.localStorage.setItem('auth-storage', JSON.stringify({
  19  |           state: {
  20  |             user: {
  21  |               id: 'u_test_999',
  22  |               discordId: '5566778899',
  23  |               discordUsername: 'PhoenixSurvivor',
  24  |               discordAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
  25  |               steamId: '76561198000000000',
  26  |               epicId: null,
  27  |               pointsBalance: 1250,
  28  |               isAdmin: false,
  29  |               role: 'user'
  30  |             }
  31  |           },
  32  |           version: 0
  33  |         }));
  34  |       });
  35  | 
  36  |       // Mock API responses for Wallet & Ledger
  37  |       await page.route('**/api/wallet', async (route) => {
  38  |         await route.fulfill({
  39  |           status: 200,
  40  |           contentType: 'application/json',
  41  |           body: JSON.stringify({
  42  |             currency: 'IC',
  43  |             accounts: {
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
```