import { test, expect } from '@playwright/test';
import { expandBlueprintPath, extractShortBlueprint } from '../../src/lib/blueprintHelper';

test.describe('Admin Short Blueprint Notation & Auto-Expansion', () => {
  test('unit: expandBlueprintPath correctly handles all shorthand formats', () => {
    // 1. Shorthand dictionary keyword
    expect(expandBlueprintPath('polymer')).toBe(
      "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'"
    );
    expect(expandBlueprintPath('rex')).toBe(
      "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'"
    );
    expect(expandBlueprintPath('longneck')).toBe(
      "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'"
    );

    // 2. Class name directly
    expect(expandBlueprintPath('PrimalItemResource_Polymer')).toBe(
      "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'"
    );
    expect(expandBlueprintPath('Rex_Character_BP')).toBe(
      "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'"
    );
    expect(expandBlueprintPath('PrimalItem_WeaponOneShotRifle')).toBe(
      "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'"
    );

    // 3. Mod / Subdirectory path (user screenshot example)
    expect(expandBlueprintPath('PopOutCake/PrimalItemStructure_BirthdayCake')).toBe(
      "Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'"
    );

    // 4. Raw path starting with /Game/
    expect(expandBlueprintPath('/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake')).toBe(
      "Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'"
    );

    // 5. Already full Blueprint path (preserved)
    const full = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'";
    expect(expandBlueprintPath(full)).toBe(full);

    // 6. extractShortBlueprint
    expect(extractShortBlueprint(full)).toBe('PrimalItemResource_Polymer');
    expect(
      extractShortBlueprint("Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'")
    ).toBe('PopOutCake/PrimalItemStructure_BirthdayCake');
  });

  test('ui: admin product modal supports short blueprint input and auto-expansion', async ({ page }) => {
    // Inject admin session
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 1,
              discordId: 'admin_123',
              discordUsername: 'IRIS Admin',
              role: 'admin',
              isAdmin: true,
              pointsBalance: 9999,
            },
          },
          version: 0,
        })
      );
    });

    // Mock auth me endpoint
    await page.route('**/auth/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '1',
            discordId: 'admin_123',
            discordUsername: 'IRIS Admin',
            role: 'admin',
            isAdmin: true,
            pointsBalance: '9999.00',
          },
        }),
      });
    });

    // Mock /api/admin/products
    await page.route(/\/api\/admin\/products(?:\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            products: [
              {
                id: 1,
                name: 'Birthday Cake PopOut',
                description: 'ร่างรอตรวจราคาและการส่งของ',
                price: 2,
                itemBlueprint: 'Blueprint\'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake\'',
                quantity: 1,
                quality: 0,
                isBlueprint: false,
                isActive: false,
                isFeatured: false,
                categoryId: null,
                category: { id: 1, name: 'Structures' },
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock /api/products/categories
    await page.route(/\/api\/products\/categories(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ categories: [{ id: 1, name: 'Structures' }] }),
      });
    });

    await page.goto('/admin/products', { waitUntil: 'networkidle' });

    // Click to edit first product
    const editBtn = page.locator('button[aria-label^="แก้ไข"]').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Verify modal opens
    const modal = page.locator('div[role="dialog"], div.fixed');
    await expect(modal.getByText('แก้ไขสินค้า')).toBeVisible();

    // Switch to "ข้อมูลเกม (Blueprint)" tab
    const gameTab = modal.getByText('ข้อมูลเกม (Blueprint)');
    await gameTab.click();

    // Verify Short blueprint input exists
    const bpInput = modal.locator('input[placeholder*="Polymer"]');
    await expect(bpInput).toBeVisible();

    // Test typing a short blueprint like "PopOutCake/PrimalItemStructure_BirthdayCake"
    await bpInput.fill('PopOutCake/PrimalItemStructure_BirthdayCake');

    // Verify live auto-expansion preview
    await expect(modal.getByText('ระบบแปลงเป็น Path เต็มของ Unreal Engine ให้อัตโนมัติ:')).toBeVisible();
    await expect(
      modal.getByText("Blueprint'/Game/PrimalEarth/Structures/PopOutCake/PrimalItemStructure_BirthdayCake.PrimalItemStructure_BirthdayCake'")
    ).toBeVisible();

    // Save screenshot showing shorthand input and auto-expansion preview
    await page.screenshot({
      path: 'C:/Users/Heart_admin/.gemini/antigravity/brain/ef8a294f-fcd9-4033-b1eb-39b023b83346/admin_short_blueprint_shorthand_live.png',
    });

    // Test Quick Preset click
    const presetBtn = modal.getByRole('button', { name: /Polymer/i });
    await expect(presetBtn).toBeVisible();
    await presetBtn.click();

    // Verify input changed to short preset and expanded
    await expect(bpInput).toHaveValue('PrimalItemResource_Polymer');
    await expect(
      modal.getByText("Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'")
    ).toBeVisible();

    // Click "ขยายเป็น Path เต็ม" button
    const expandBtn = modal.getByRole('button', { name: /ขยายเป็น Path เต็ม/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    await expect(bpInput).toHaveValue(
      "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'"
    );

    // Save screenshot for user review
    await page.screenshot({
      path: 'C:/Users/Heart_admin/.gemini/antigravity/brain/ef8a294f-fcd9-4033-b1eb-39b023b83346/admin_short_blueprint_live.png',
    });
  });
});
