import { test, expect } from '@playwright/test';

test.describe('E-Commerce Core Flow (Milestone 3)', () => {
  
  test.beforeEach(async ({ page }) => {
    // Inject mock authenticated session
    await page.addInitScript(() => {
      window.localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          user: {
            id: 'u_user_777',
            discordId: '9988776655',
            discordUsername: 'ApexSurvivor',
            discordAvatar: 'https://cdn.discordapp.com/embed/avatars/2.png',
            steamId: '76561198000000111',
            epicId: null,
            pointsBalance: 5000,
            isAdmin: false,
            role: 'user'
          }
        },
        version: 0
      }));
    });

    // Mock API requests
    await page.route('**/api/products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          products: [
            {
              id: 101,
              name: 'Journeyman Tek Rifle',
              description: 'ปืนเลเซอร์คุณภาพระดับ Journeyman ยิงเร็วแรงสูง',
              blueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Weapons/TekRifle\'',
              price: 1500,
              imageUrl: null,
              quantity: 1,
              quality: 3,
              isFeatured: true,
              isActive: true,
              category: { id: 1, name: 'Weapons', icon: '🔫' }
            },
            {
              id: 102,
              name: 'Ascendant Rex Saddle',
              description: 'อานสำหรับขี่ทีเร็กซ์ เกราะป้องกันขีดสุด',
              blueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Items/Armor/RexSaddle\'',
              price: 2500,
              imageUrl: null,
              quantity: 1,
              quality: 5,
              isFeatured: true,
              isActive: true,
              category: { id: 2, name: 'Armor', icon: '🛡️' }
            }
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
        }),
      });
    });

    await page.route('**/api/products/categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: 1, name: 'Weapons', icon: '🔫', _count: { products: 1 } },
            { id: 2, name: 'Armor', icon: '🛡️', _count: { products: 1 } }
          ]
        }),
      });
    });

    await page.route('**/api/products/101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          product: {
            id: 101,
            name: 'Journeyman Tek Rifle',
            description: 'ปืนเลเซอร์คุณภาพระดับ Journeyman ยิงเร็วแรงสูง',
            blueprint: 'Blueprint\'/Game/PrimalEarth/CoreBlueprints/Weapons/TekRifle\'',
            price: 1500,
            imageUrl: null,
            quantity: 1,
            quality: 3,
            category: { id: 1, name: 'Weapons', icon: '🔫' }
          }
        }),
      });
    });

    await page.route('**/api/admin/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: [
            { id: 1, name: 'IRIS PVP main', map: 'The Island', isActive: true },
            { id: 2, name: 'IRIS PVE modded', map: 'Ragnarok', isActive: true }
          ]
        }),
      });
    });

    await page.route('**/api/wallet', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currency: 'IC',
          accounts: { available: '5000', held: '0', promotional: '0', refundable: '0' },
          total: '5000'
        }),
      });
    });

    // Mock order placement
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'ord_902',
            productId: 101,
            serverId: 1,
            quantity: 2,
            totalPrice: 3000,
            status: 'pending',
            product: { name: 'Journeyman Tek Rifle' },
            server: { name: 'IRIS PVP main' }
          },
          newBalance: 2000
        }),
      });
    });
  });

  test('happy path: filter shop -> inspect -> add to cart -> apply voucher -> checkout', async ({ page }) => {
    // 1. Visit Shop page
    await page.goto('/shop');
    await page.waitForLoadState('domcontentloaded');

    // Verify catalog list is loaded
    await expect(page.locator('text=Journeyman Tek Rifle')).toBeVisible();
    await expect(page.locator('text=Ascendant Rex Saddle')).toBeVisible();

    // 2. Click product to inspect
    const itemCard = page.locator('button:has-text("Journeyman Tek Rifle")').first();
    await itemCard.click();

    // Verify modal detail loaded
    await expect(page.locator('h2#popup-title')).toContainText('Journeyman Tek Rifle');
    await expect(page.locator('text=ราคาต่อชิ้น: >> text=1,500 IC')).toBeVisible();

    // 3. Increment quantity to x2
    const plusBtn = page.getByLabel('เพิ่มจำนวนขึ้น 1 ชิ้น');
    await plusBtn.click();
    await expect(page.locator('text=ราคารวมที้งสิ้น: >> text=3,000 IC')).toBeVisible();

    // Select server in modal
    const serverSelect = page.locator('select');
    await serverSelect.selectOption({ label: 'IRIS PVP main (The Island)' });

    // 4. Add to cart
    const addToCartBtn = page.getByRole('button', { name: 'ใส่ตะกร้า' });
    await addToCartBtn.click();

    // Drawer should open and display the item
    const cartDrawer = page.locator('role=dialog[name="ตะกร้าสินค้าของคุณ"]');
    await expect(cartDrawer).toBeVisible();
    await expect(cartDrawer.locator('text=Journeyman Tek Rifle')).toBeVisible();
    await expect(cartDrawer.locator('text=3,000 IC')).toBeVisible();

    // 5. Go to Cart Page
    const checkoutLink = page.getByRole('button', { name: 'ไปที่หน้าตะกร้าและชำระเงิน' });
    await checkoutLink.click();
    await page.waitForURL('**/cart');

    // Verify cart page loaded
    await expect(page.locator('h1')).toContainText('ตระกร้าสินค้าและทำรายการ');
    await expect(page.locator('text=ยอดรวมสินค้า (Subtotal): >> text=3,000 IC')).toBeVisible();

    // 6. Enter coupon code
    const voucherInput = page.getByPlaceholder('ระบุรหัสโปรโมชั่น...');
    await voucherInput.fill('IRIS50');
    
    const applyVoucherBtn = page.getByRole('button', { name: 'ประยุกต์ใช้' });
    await applyVoucherBtn.click();

    // Verify voucher discount is applied (20% of 3000 = 600)
    await expect(page.locator('text=ส่วนลดคูปอง (IRIS50): >> text=-600 IC')).toBeVisible();
    await expect(page.locator('text=ราคาสุทธิ (Final Price): >> text=2,400 IC')).toBeVisible();

    // Input recipient character name
    const characterInput = page.getByPlaceholder('เช่น Survivor123');
    await characterInput.fill('IronTribe_Leader');

    // 7. Place Order
    const placeOrderBtn = page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' });
    await placeOrderBtn.click();

    // Verify success screen transitions
    await expect(page.locator('text=ทำรายการจัดสั่งของขวัญเรียบร้อย!')).toBeVisible();
    await expect(page.locator('text=Ready for Claim in Game')).toBeVisible();
  });
});
