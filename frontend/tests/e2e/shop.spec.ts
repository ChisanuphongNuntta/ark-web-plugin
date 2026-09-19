import { test, expect } from '@playwright/test';

const products = [
  {
    id: 1,
    name: 'Ascendant Longneck Rifle',
    description: 'Sniper rifle with high durability',
    price: 350,
    categoryId: 2,
    imageUrl: null,
    stock: 50,
  },
  {
    id: 2,
    name: 'Giganotosaurus Saddle Blueprint',
    description: 'High armor saddle blueprint',
    price: 800,
    categoryId: 1,
    imageUrl: null,
    stock: 12,
  },
];

const categories = [
  { id: 1, name: 'สิ่งมีชีวิต & สัตว์เลี้ยง', slug: 'dinos', icon: '🦖', _count: { products: 12 } },
  { id: 2, name: 'อาวุธ & ยุทโธปกรณ์', slug: 'weapons', icon: '⚔️', _count: { products: 45 } },
];

const corsHeaders = {
  'access-control-allow-origin': process.env.E2E_BASE_URL || 'https://localhost',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

test.describe('Contract-aligned shop catalog', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      await route.continue();
    });

    await page.route('**/products/categories*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ categories }),
      });
    });

    await page.route('**/products*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          products,
          pagination: { page: 1, limit: 24, total: 2, totalPages: 1 },
        }),
      });
    });
  });

  test('renders a typed product catalog with accessible product links', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Official Store Database/i })).toBeVisible();
    await expect(page.getByRole('button', { name: `ดูรายละเอียดและซื้อ ${products[0].name}` })).toBeVisible();
    await expect(page.getByText('ราคาต่อหน่วย').first()).toBeVisible();
  });

  test('submits search through URL state and the backend query contract', async ({ page }) => {
    const productRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/products\?/.test(request.url())) productRequests.push(request.url());
    });
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/ค้นหาชื่อสินค้า/i);
    await search.fill('longneck rifle');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();

    await expect(page).toHaveURL(/search=longneck(?:\+|%20)rifle/);
    await expect.poll(() => productRequests.some((url) => new URL(url).searchParams.get('search') === 'longneck rifle')).toBeTruthy();
  });

  test('preserves filters as URL state and sends numeric price/category fields', async ({ page }) => {
    const productRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/products\?/.test(request.url())) productRequests.push(request.url());
    });
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    
    const weaponCatBtn = page.getByRole('button', { name: /อาวุธ/i });
    await weaponCatBtn.scrollIntoViewIfNeeded();
    await expect(weaponCatBtn).toBeVisible({ timeout: 10000 });
    await weaponCatBtn.click();

    await page.getByPlaceholder('Min').fill('100');
    await page.getByPlaceholder('Max').fill('900');
    await page.getByRole('button', { name: 'ใช้ช่วงราคา' }).click();

    await expect(page).toHaveURL(/category=2/);
    await expect(page).toHaveURL(/minPrice=100/);
    await expect(page).toHaveURL(/maxPrice=900/);
    await expect.poll(() => productRequests.some((raw) => {
      const url = new URL(raw);
      return url.searchParams.get('categoryId') === '2' && url.searchParams.get('minPrice') === '100' && url.searchParams.get('maxPrice') === '900';
    })).toBeTruthy();
  });

  test('shows a contract-shaped empty state and can clear all filters', async ({ page }) => {
    await page.route('**/*products*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ products: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } }),
      });
    });

    await page.goto('/shop?search=unknown&minPrice=10', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('ไม่พบสินค้าตรงเงื่อนไขการค้นหา')).toBeVisible();
    await page.getByRole('button', { name: 'ล้างข้อมูลการค้นหาทั้งหมด' }).click();
    await expect(page).toHaveURL(/.*\/shop(\?.*)?$/);
  });
});
