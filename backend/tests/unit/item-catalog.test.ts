/**
 * Rules of the item catalog tooling (scripts/item-catalog) and the shared item delivery
 * builder (src/services/itemCatalogDelivery.ts, used by checkout and the game shop).
 * Synthetic data only; the committed plan is checked in item-catalog-plan.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  ITEM_BUNDLE_DELIVERY_CAPABILITY,
  ITEM_DELIVERY_CAPABILITY,
  pluginRejectsItemPayload,
  resolveItemDelivery,
} from '../../src/services/itemCatalogDelivery.js';
import {
  blueprintCategoryOverride,
  bossDropKind,
  buildItemDeliveryPayload,
  buildPriceModel,
  classifyItem,
  cleanDisplayName,
  effectiveStackSize,
  indexWikiItems,
  productFingerprint,
  isUnlockItem,
  itemCategoryFor,
  nicePack,
  offerFor,
  roundPrice,
  simulateBackendItemDelivery,
  stackClassOf,
  subTypeOf,
  type LegacyItemRow,
  type WikiItem,
} from '../../scripts/item-catalog/lib.js';
import { buildPlan, nameMismatch, snapshotOf, spellingVariant, variantLabel, type ExportedProduct } from '../../scripts/item-catalog/plan.js';
import { chooseImage, computeChange, driftOf, projectedProduct, sharedLegacyPlaceholders, verifyDeliverable, type DbProduct } from '../../scripts/item-catalog/apply-core.js';
import { lookupItemArtworkMatch, parseArtworkManifest } from '../../scripts/item-catalog/lib.js';

const bp = (path: string) => `Blueprint'${path}.${path.split('/').pop()}'`;
const INGOT = bp('/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot');
const STONE = bp('/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Stone');

const wikiItem = (name: string, blueprint: string, extra: Partial<WikiItem> = {}): WikiItem => ({
  page: name, name, id: null, blueprint, category: 'Resources', stackSize: 100, isMobile: false, pageCategories: ['Items', 'Resources'], ...extra,
});

describe('item delivery builder (src/services/itemCatalogDelivery.ts)', () => {
  const product = (items: unknown[] | null, extra: Record<string, unknown> = {}) => ({
    name: 'Metal Ingot (100x)', itemBlueprint: INGOT, quantity: 100, quality: 0, isBlueprint: false,
    deliveryPayload: items ? { definition: { Type: 'item', Items: items } } : null, ...extra,
  });

  it('multiplies definition amounts by the units bought', () => {
    const { deliveryType, payload } = resolveItemDelivery(product([{ Blueprint: INGOT, Amount: 100, Quality: 0, ForceBlueprint: false }]), 'o1', 3);
    expect(deliveryType).toBe('order');
    expect(payload).toEqual({
      schemaVersion: 1, orderId: 'o1', productType: 'item', productName: 'Metal Ingot (100x)',
      item: { blueprint: INGOT, quantity: 300, quality: 0, isBlueprint: false },
      items: [{ blueprint: INGOT, quantity: 300, quality: 0, isBlueprint: false }],
    });
    expect(pluginRejectsItemPayload(payload)).toBeNull();
  });

  it('keeps every bundle entry, strips quotes, and keeps fractional quality', () => {
    const { payload } = resolveItemDelivery(product([
      { Blueprint: `"${INGOT}"`, Amount: 300, Quality: 2.5, ForceBlueprint: true },
      { Blueprint: STONE, Amount: 100 },
    ]), 'o2', 1);
    expect(payload.items).toEqual([
      { blueprint: INGOT, quantity: 300, quality: 2.5, isBlueprint: true },
      { blueprint: STONE, quantity: 100, quality: 0, isBlueprint: false },
    ]);
  });

  it('falls back to the single-item projection without a definition', () => {
    const { payload } = resolveItemDelivery(product(null, { quantity: 1000, quality: 5 }), 'o3', 2);
    expect(payload.items).toEqual([{ blueprint: INGOT, quantity: 2000, quality: 5, isBlueprint: false }]);
  });

  it('drops entries the plugin could not deliver (empty blueprint, non-integer amount)', () => {
    const { payload } = resolveItemDelivery(product([{ Blueprint: '', Amount: 1 }, { Blueprint: STONE, Amount: 1.5 }, { Blueprint: INGOT, Amount: 5 }]), 'o4', 1);
    expect(payload.items).toEqual([{ blueprint: INGOT, quantity: 5, quality: 0, isBlueprint: false }]);
  });

  it('mirrors the HeartShop "order" guards', () => {
    const ok = { items: [{ blueprint: INGOT, quantity: 1, quality: 0, isBlueprint: false }] };
    expect(pluginRejectsItemPayload(ok)).toBeNull();
    expect(pluginRejectsItemPayload({ item: { blueprint: INGOT, quantity: 2 } })).toBeNull();
    expect(pluginRejectsItemPayload({ items: [] })).toMatch(/no items/);
    expect(pluginRejectsItemPayload({ items: [{ blueprint: '', quantity: 1 }] })).toMatch(/blueprint/);
    expect(pluginRejectsItemPayload({ items: [{ blueprint: INGOT, quantity: 0 }] })).toMatch(/quantity/);
    expect(pluginRejectsItemPayload({ items: [{ blueprint: INGOT, quantity: 1.5 }] })).toMatch(/quantity/);
    expect(pluginRejectsItemPayload({ items: [{ blueprint: INGOT, quantity: 1, quality: '2' }] })).toMatch(/quality/);
    expect(pluginRejectsItemPayload({ items: [{ blueprint: INGOT, quantity: 1, isBlueprint: 1 }] })).toMatch(/isBlueprint/);
  });

  it('simulateBackendItemDelivery: strict catalog rows vs. legacy bundles', () => {
    const payload = buildItemDeliveryPayload({
      externalKey: 'item-catalog:x', blueprint: INGOT, quantity: 100, quality: 0, price: 2, name: 'Metal Ingot (100x)',
      priceBasis: 'p', quantityBasis: 'q', qualityBasis: 'Primitive (0)', wikiPage: null, plannedAt: '2026-10-18T00:00:00.000Z',
    });
    const strictProduct = { productType: 'item', itemBlueprint: INGOT, requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], deliveryPayload: payload, name: 'Metal Ingot (100x)', quantity: 100, quality: 0, isBlueprint: false };
    expect(simulateBackendItemDelivery(strictProduct, { strict: true })).toMatchObject({ ok: true, payload: { items: [{ blueprint: INGOT, quantity: 100 }] } });
    expect(simulateBackendItemDelivery({ ...strictProduct, quantity: 50 }, { strict: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Amount/) });
    expect(simulateBackendItemDelivery({ ...strictProduct, requiredCapabilities: [] }, { strict: true }).ok).toBe(false);
    expect(simulateBackendItemDelivery({ ...strictProduct, itemBlueprint: null }).ok).toBe(false);
    expect(simulateBackendItemDelivery({ ...strictProduct, requiredCapabilities: ['delivery.item.v9'] })).toMatchObject({ ok: false, error: expect.stringMatching(/advertise/) });

    const bundle = { ...strictProduct, requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], deliveryPayload: { definition: { Items: [{ Blueprint: INGOT, Amount: 1 }, { Blueprint: STONE, Amount: 1 }] } } };
    expect(simulateBackendItemDelivery(bundle)).toMatchObject({ ok: false, error: expect.stringMatching(/bundle/) });
    expect(simulateBackendItemDelivery({ ...bundle, requiredCapabilities: [ITEM_BUNDLE_DELIVERY_CAPABILITY] }).ok).toBe(true);
    const dropped = { ...bundle, requiredCapabilities: [ITEM_BUNDLE_DELIVERY_CAPABILITY], deliveryPayload: { definition: { Items: [{ Blueprint: INGOT, Amount: 1 }, { Blueprint: '', Amount: 1 }] } } };
    expect(simulateBackendItemDelivery(dropped)).toMatchObject({ ok: false, error: expect.stringMatching(/dropped/) });
  });
});

describe('item classification', () => {
  const sellable = (name: string, blueprint: string, wiki: Partial<WikiItem> = {}) => classifyItem({ name, blueprint, wiki: wikiItem(name, blueprint, wiki) });

  it('sells vanilla ASE items', () => {
    expect(sellable('Metal Ingot', INGOT)).toMatchObject({ status: 'SELLABLE', code: 'sellable' });
    expect(sellable('Tek Rifle', bp('/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_TekRifle'))).toMatchObject({ status: 'SELLABLE' });
  });

  it('rejects ASA, mod, mobile, platform-exclusive and malformed content', () => {
    expect(sellable('Gigantoraptor Saddle', bp('/Game/ASA/Dinos/Gigantoraptor/PrimalItemArmor_GigantoraptorSaddle')).code).toBe('asa_only');
    expect(sellable('Coffin', bp('/Game/Packs/Frontier/Structures/Coffin/PrimalItemStructure_Coffin')).code).toBe('asa_only');
    expect(sellable('Train Engine', bp('/Game/PrimalEarth/Vehicles/Train/PrimalItemTrainEngine'), { pageCategories: ["Bob's Tall Tales", 'Base game vehicles'] }).code).toBe('asa_only');
    expect(sellable('Veilwyn Ghost Costume', bp('/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemCostume_GhostVeilwyn'), { pageCategories: ['Fear Evolved', 'Lost Colony'] }).code).toBe('asa_only');
    expect(sellable('Mail (Primitive Plus)', bp('/Game/Mods/APS/Blueprints/PrimalItem_Mail')).code).toBe('mod_path');
    expect(sellable('Kibble (Rex Egg)', bp('/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_RexEgg'), { pageCategories: ['Unavailable on Steam'] }).code).toBe('platform_exclusive');
    expect(sellable('Mobile Thing', bp('/Game/Mobile/Items/PrimalItem_Thing')).code).toBe('mobile_only');
    expect(classifyItem({ name: 'Note', blueprint: '' }).code).toBe('no_blueprint');
    expect(classifyItem({ name: 'Ecto', blueprint: "Blueprint'FearEvolved/Weapons/X.X'" }).code).toBe('invalid_path');
  });

  it('keeps ASE items the wiki also lists for ASA maps', () => {
    // Manticore artifacts / ghost costumes carry "Astraeos" or "Lost Colony" but exist in ASE.
    expect(sellable('Mantis Ghost Costume', bp('/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemCostume_GhostMantis'), { pageCategories: ['Astraeos', 'Scorched Earth', 'Fear Evolved'] }).status).toBe('SELLABLE');
    expect(classifyItem({ name: 'Tek Crop Plot', blueprint: bp('/Game/Genesis2/Structures/CropPlotTek/PrimalItemStructure_CropPlot_Tek'), legacyProven: true, wiki: wikiItem('Tek Crop Plot', '', { pageCategories: ['Lost Colony'] }) }).status).toBe('SELLABLE');
  });

  it('rejects admin, mission, unobtainable, non-items and fertilized eggs', () => {
    expect(sellable('Admin Blink Rifle', bp('/Game/Extinction/Weapon_AdminBlinkRifle/PrimalItem_WeaponAdminBlinkRifle')).code).toBe('admin_debug');
    expect(sellable('Mini-HLNA Skin', bp('/Game/Genesis/CoreBlueprints/Items/PrimalItemSkin_MiniHLNA')).code).toBe('mission_only');
    expect(sellable('Maze Key', bp('/Game/Genesis2/Missions/Items/PrimalItem_MazeKey')).code).toBe('mission_only');
    expect(sellable('WIP Thing', bp('/Game/PrimalEarth/CoreBlueprints/Items/PrimalItem_Wip'), { pageCategories: ['Work-in-progress'] }).code).toBe('unobtainable');
    expect(sellable('Specimen Implant', bp('/Game/PrimalEarth/CoreBlueprints/Items/Notes/PrimalItem_StartingNote')).code).toBe('non_item');
    expect(sellable('Deinonychus Egg', bp('/Game/Valguero/Dinos/Deinonychus/PrimalItemConsumable_Egg_Deinonychus_Fertilized'), {}).code).toBe('fertilized_egg');
    expect(sellable('Dermis', bp('/Game/Extinction/CoreBlueprints/Items/PrimalItem_TaxidermyDermis')).code).toBe('non_item');
    expect(sellable('Phoenix Egg', bp('/Game/PrimalEarth/Test/PrimalItemConsumable_Egg_Phoenix'), { pageCategories: ['Consumables', 'Eggs', 'Items'] }).code).toBe('unobtainable');
    expect(sellable('Tier 3 Lootcrate', bp('/Game/Genesis/CoreBlueprints/Items/PrimalItemConsumable_Lootcrate_lvl3'), { pageCategories: ['Exchangeables', 'Genesis: Part 1'] }).code).toBe('exchange_reward');
    // a legacy (owner) row is not re-classified by the unobtainable / exchange lists
    expect(classifyItem({ name: 'Tier 1 Lootcrate', blueprint: bp('/Game/Genesis/CoreBlueprints/Items/PrimalItemConsumable_Lootcrate_lvl1'), legacyProven: true }).status).toBe('SELLABLE');
  });

  it('rejects a PC item without a map whose same-name wiki page is mobile/console only', () => {
    const egg = bp('/Game/PrimalEarth/Test/PrimalItemConsumable_Egg_Griffin');
    const pc = wikiItem('Griffin Egg', egg, { category: 'Eggs', pageCategories: ['Consumables', 'Eggs', 'Items', 'Large eggs'] });
    const mobile = wikiItem('Griffin Egg', '', { page: 'Mobile:Griffin Egg', isMobile: true, pageCategories: ['Legacy Mobile exclusives', 'Unavailable on Steam'] });
    expect(classifyItem({ name: 'Griffin Egg', blueprint: egg, wiki: pc, sameName: [pc, mobile] }).code).toBe('platform_exclusive');
    // ...but not when the PC page lists an ASE map or base-game category (Energy Brew)
    const brew = wikiItem('Energy Brew', bp('/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_StaminaSoup'), { pageCategories: ['Base game consumables', 'Items'] });
    expect(classifyItem({ name: 'Energy Brew', blueprint: brew.blueprint, wiki: brew, sameName: [brew, { ...mobile, name: 'Energy Brew' }] }).status).toBe('SELLABLE');
  });

  it('marks unproven official-map roots and unknown items as unverified', () => {
    expect(sellable('Runestone', bp('/Game/Mods/FjordurOfficial/Assets/CoreBlueprints/Items/PrimalItemResource_ApexDrop_Runestone')).code).toBe('unverified');
    expect(classifyItem({ name: 'X', blueprint: INGOT, wiki: null }).code).toBe('unverified');
    expect(sellable('Saddle', bp('/Game/LostIsland/Dinos/Amargasaurus/PrimalItemArmor_AmargaSaddle')).code).toBe('unverified');
    expect(classifyItem({ name: 'Saddle', blueprint: bp('/Game/LostIsland/Dinos/Amargasaurus/PrimalItemArmor_AmargaSaddle'), wiki: wikiItem('Saddle', ''), provenRoots: new Set(['/game/lostisland/']) }).status).toBe('SELLABLE');
    // Aquatica follows the owner opt-in given for Aquatica creatures.
    expect(sellable('Fish Scale', bp('/Game/Abyss/CoreBlueprints/Resources/PrimalItemResource_FishScale'))).toMatchObject({ status: 'SELLABLE', code: 'sellable_opt_in' });
  });
});

describe('item categories, sub-types, packs and prices', () => {
  it('prefers the wiki category and keeps the draft rule otherwise', () => {
    expect(itemCategoryFor({ wikiCategory: 'Resources', page: 'Sarcosuchus Skin', blueprint: bp('/Game/X/PrimalItemResource_ApexDrop_Sarco') })).toBe('Resources');
    expect(itemCategoryFor({ wikiCategory: 'Tek', page: 'Tek Wall', blueprint: bp('/Game/X/PrimalItemStructure_TekWall') })).toBe('Structures');
    expect(itemCategoryFor({ wikiCategory: 'Guns', page: 'Tek Rifle', blueprint: bp('/Game/X/PrimalItem_TekRifle') })).toBe('Weapons & Ammo');
  });

  it('fixes keyword categories from the blueprint class', () => {
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Waterskin', blueprint: bp('/Game/X/PrimalItemConsumable_WaterskinCraftable') })).toBe('Consumables');
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Seafin Glider Suit', blueprint: bp('/Game/Abyss/X/PrimalItemArmor_SeafinGlider') })).toBe('Armor');
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Piranha Fishing Trophy', blueprint: bp('/Game/X/PrimalItemStructure_FishMount_Piranha') })).toBe('Structures');
    expect(blueprintCategoryOverride({ category: 'Structures', name: 'Manticore Trophy', blueprint: bp('/Game/X/PrimalItemTrophy_Manticore') })).toBe('Items');
    // real skins stay skins
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Hunter Hat Skin', blueprint: bp('/Game/X/PrimalItemArmor_HideHelmetAlt') })).toBeNull();
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Rex Stomped Glasses Saddle Skin', blueprint: bp('/Game/X/PrimalItemArmor_RexSaddle_StompedGlasses') })).toBeNull();
    expect(blueprintCategoryOverride({ category: 'Skins', name: 'Boot Weights', blueprint: bp('/Game/Abyss/X/PrimalItemSkin_BootWeights') })).toBeNull();
    expect(blueprintCategoryOverride({ category: 'Saddles', name: 'Shield Projector Rig', blueprint: bp('/Game/Genesis2/X/PrimalItemArmor_TekStriderOnesidedShield') })).toBeNull();
  });

  it('detects boss drops (apex, alpha apex, trophy, artifact)', () => {
    expect(bossDropKind(bp('/Game/Abyss/X/PrimalItemResource_ApexDrop_AlphaWaterWyvern'))).toBe('alpha_apex');
    expect(bossDropKind(bp('/Game/Abyss/X/PrimalItemResource_ApexDrop_Monodon'))).toBe('apex');
    expect(bossDropKind(bp('/Game/X/PrimalItemTrophy_Dragon'))).toBe('trophy');
    expect(bossDropKind(bp('/Game/Abyss/X/PrimalItemArtifactAbyss_Fallen'))).toBe('artifact');
    expect(bossDropKind(bp('/Game/X/PrimalItemResource_KeratinSpike'))).toBeNull();
    expect(subTypeOf({ category: 'Resources', name: 'Water Talon', blueprint: bp('/Game/Abyss/X/PrimalItemResource_ApexDrop_WaterWyvern') })).toBe('apex');
  });

  it('stack size: ammo defaults to a stack, single-use weapon tools sell one', () => {
    const arrow = bp('/Game/X/PrimalItemAmmo_CompoundBowArrow');
    expect(effectiveStackSize(wikiItem('Metal Arrow', arrow, { category: 'Arrows', stackSize: null, pageCategories: ['Ammunition', 'Arrows'] }), arrow).stackSize).toBe(100);
    const binoculars = bp('/Game/ScorchedEarth/X/PrimalItem_WeaponElectronicBinoculars');
    expect(effectiveStackSize(wikiItem('Electronic Binoculars', binoculars, { category: 'Tools', stackSize: 100 }), binoculars).stackSize).toBe(1);
    const soap = bp('/Game/X/PrimalItemConsumableSoap');
    expect(effectiveStackSize(wikiItem('Soap', soap, { category: 'Tools', stackSize: 100 }), soap).stackSize).toBe(100);
    expect(cleanDisplayName('Electronic Binoculars (Survival Evolved)')).toBe('Electronic Binoculars');
    expect(cleanDisplayName('Tek Binoculars (Survival Ascended)')).toBe('Tek Binoculars');
  });

  it('indexes one wiki page per blueprint, preferring the page that matches the asset name', () => {
    const helmet = bp('/Game/Genesis2/X/PrimalItemArmor_TekHelmet_Gen2');
    const index = indexWikiItems([
      wikiItem('Federation Exo Gauntlets', helmet, { stackSize: 1 }),
      wikiItem('Federation Exo Helmet', helmet, { stackSize: 1 }),
    ]);
    expect([...index.values()].map((item) => item.name)).toEqual(['Federation Exo Helmet']);
  });

  it('detects Tek / platform / costume sub-types only where they mean a tier', () => {
    expect(subTypeOf({ category: 'Armor', name: 'Tek Helmet', blueprint: bp('/Game/X/PrimalItemArmor_TekHelmet') })).toBe('tek');
    expect(subTypeOf({ category: 'Weapons & Ammo', name: 'Tek Bow', blueprint: bp('/Game/X/PrimalItem_WeaponTekBow') })).toBe('tek');
    expect(subTypeOf({ category: 'Consumables', name: 'Shadow Steak Saute', blueprint: bp('/Game/X/PrimalItemConsumable_Soup_ShadowSteak') })).toBe('standard');
    expect(subTypeOf({ category: 'Chibi', name: 'Chibi-Tek Raptor', blueprint: bp('/Game/X/PrimalItemSkin_ChibiDino_TekRaptor') })).toBe('standard');
    expect(subTypeOf({ category: 'Saddles', name: 'Quetz Platform Saddle', blueprint: bp('/Game/X/PrimalItemArmor_QuetzSaddle_Platform') })).toBe('platform');
    expect(subTypeOf({ category: 'Saddles', name: 'Rex Ghost Costume', blueprint: bp('/Game/X/PrimalItemCostume_GhostRex') })).toBe('costume');
  });

  it('rounds packs and prices', () => {
    expect(stackClassOf(100)).toBe('stack');
    expect(stackClassOf(1)).toBe('single');
    expect(stackClassOf(null)).toBe('single');
    expect(nicePack(1000, 100)).toBe(100);
    expect(nicePack(55, 100)).toBe(50);
    expect(nicePack(6.5, 100)).toBe(5);
    expect(nicePack(50, 30)).toBe(25);
    expect(roundPrice(0.2)).toBe(1);
    expect(roundPrice(54)).toBe(55);
    expect(roundPrice(7.5)).toBe(8);
    expect(roundPrice(62.3)).toBe(60);
    expect(roundPrice(437)).toBe(440);
    expect(isUnlockItem(bp('/Game/X/PrimalItemConsumable_UnlockEmote_Dance'))).toBe(true);
    expect(isUnlockItem(bp('/Game/X/PrimalItemConsumable_UnlockHair_Head_Afro'))).toBe(true);
  });

  const legacy = (id: number, category: string, name: string, price: number, amount: number, stackSize: number | null, extra: Partial<LegacyItemRow> = {}): LegacyItemRow => ({
    id, externalKey: `arkshop:${id}`, name, price, categoryName: category, blueprints: [bp(`/Game/X/PrimalItem_${id}`)], amounts: [amount], qualities: [0],
    totalQuantity: amount, isActive: true, singleBlueprint: true, stackSize, subType: 'standard', ...extra,
  });

  it('prices new rows from the legacy per-unit median of the narrowest group with enough samples', () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((id) => legacy(id, 'Resources', `R${id}`, 2, 1000, 100)),
      ...[6, 7, 8, 9, 10].map((id) => legacy(id, 'Saddles', `S${id}`, 1, 1, 1, { qualities: [2.5] })),
      legacy(11, 'Weapons & Ammo', 'Tek Bow', 10, 1, 1, { subType: 'tek' }),
      legacy(12, 'Weapons & Ammo', 'Tek Phase Pistol', 5, 1, 1, { subType: 'tek' }),
      ...[13, 14, 15, 16, 17].map((id) => legacy(id, 'Weapons & Ammo', `W${id}`, 1, 1, 1)),
    ];
    const model = buildPriceModel(rows);
    expect(offerFor(model, { category: 'Resources', subType: 'standard', stackSize: 100 })).toMatchObject({ quantity: 100, price: 1, quality: 0, priceGroup: 'Resources|standard|stack' });
    expect(offerFor(model, { category: 'Saddles', subType: 'standard', stackSize: 1 })).toMatchObject({ quantity: 1, price: 1, quality: 2.5 });
    expect(offerFor(model, { category: 'Weapons & Ammo', subType: 'tek', stackSize: 1 })).toMatchObject({ quantity: 1, price: 8, priceGroup: 'Weapons & Ammo|tek|single' });
    expect(offerFor(model, { category: 'Resources', subType: 'standard', stackSize: 100, blueprint: bp('/Game/X/PrimalItemConsumable_UnlockEmote_Dance') })).toMatchObject({ quantity: 1 });
    expect(offerFor(buildPriceModel([]), { category: 'Resources', subType: 'standard', stackSize: 100 })).toHaveProperty('error');
    // A median that is an owner-set legacy price is copied 1:1 (no re-rounding to 55).
    const chibis = buildPriceModel([6, 54, 54, 390, 690].map((price, index) => legacy(100 + index, 'Chibi', `C${index}`, price, 1, 1)));
    expect(offerFor(chibis, { category: 'Chibi', subType: 'standard', stackSize: 1 })).toMatchObject({ price: 54 });
  });
});

describe('item catalog plan builder', () => {
  const product = (id: number, patch: Partial<ExportedProduct>): ExportedProduct => ({
    id, name: `P${id}`, price: 1, productType: 'item', externalKey: null, deliveryPayload: null, itemBlueprint: null, isActive: true, ...patch,
  });
  const legacyProduct = (id: number, name: string, category: string, price: number, blueprint: string, amount: number, extra: Partial<ExportedProduct> = {}) => product(id, {
    name, price, externalKey: `arkshop:${id}`, category: { id: 1, name: category }, itemBlueprint: blueprint, quantity: amount, quality: 0,
    requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], imageUrl: `/images/catalog/legacy/${id}.webp`,
    deliveryPayload: { type: 'item', source: 'arkshop', definition: { Type: 'item', Items: [{ Blueprint: blueprint, Amount: amount, Quality: 0, ForceBlueprint: false }], Price: price } },
    ...extra,
  });
  const resource = (n: number) => bp(`/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_R${n}`);
  const wiki: WikiItem[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => wikiItem(`Resource ${n}`, resource(n))),
    wikiItem('Gigantoraptor Saddle', bp('/Game/ASA/Dinos/Gigantoraptor/PrimalItemArmor_GigantoraptorSaddle'), { category: 'Saddles', stackSize: 1 }),
    wikiItem('Resource 7', resource(7)),
  ];
  const products: ExportedProduct[] = [
    ...[1, 2, 3, 4, 5].map((n) => legacyProduct(n, `Resource ${n} (1,000x)`, 'Resources', 2, resource(n), 1000)),
    product(50, { name: 'Resource 6', price: 1, isActive: false, externalKey: `frozen-reference:${resource(6).toLowerCase()}`, itemBlueprint: resource(6), category: { id: 1, name: 'Resources' }, deliveryPayload: { definition: { Type: 'item', Items: [{ Blueprint: resource(6), Amount: 1 }] }, review: { status: 'pending' } } }),
    product(51, { name: 'Resource 1', price: 1, isActive: false, externalKey: `frozen-reference:dup`, itemBlueprint: resource(1), category: { id: 1, name: 'Resources' }, deliveryPayload: { definition: { Type: 'item', Items: [{ Blueprint: resource(1), Amount: 1 }] } } }),
    product(52, { name: 'Gigantoraptor Saddle', isActive: false, externalKey: 'frozen-reference:asa', itemBlueprint: wiki[6].blueprint, category: { id: 2, name: 'Saddles' }, deliveryPayload: { definition: { Type: 'item', Items: [{ Blueprint: wiki[6].blueprint, Amount: 1 }] } } }),
    product(60, { name: 'Starter Kit', price: 50, itemBlueprint: resource(2), quantity: 1, quality: 0, category: { id: 3, name: 'Kits' } }),
  ];
  const plan = buildPlan({ products, wiki, now: new Date('2026-10-18T00:00:00.000Z') });
  const byKey = new Map(plan.rows.map((row) => [row.externalKey, row]));

  it('keeps legacy rows exactly and never plans an error', () => {
    expect(plan.errors).toEqual([]);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(byKey.get(`arkshop:${n}`)).toMatchObject({ action: 'keep', price: 2, quantity: 1000, priceBasis: 'legacy ArkShop price (unchanged)' });
    }
  });

  it('activates a sellable draft as a legacy-style pack, skips duplicates and ASA drafts', () => {
    const draft = plan.rows.find((row) => row.productId === 50)!;
    expect(draft).toMatchObject({ action: 'activate', quantity: 100, price: 1, name: 'Resource 6 (100x)', description: 'Resource 6 x100', categoryName: 'Resources' });
    expect(plan.rows.find((row) => row.productId === 51)).toMatchObject({ action: 'leave_inactive', code: 'duplicate', reason: 'duplicate of arkshop:1' });
    expect(plan.rows.find((row) => row.productId === 52)).toMatchObject({ action: 'leave_inactive', code: 'asa_only' });
  });

  it('creates ASE wiki items that no product sells', () => {
    const created = plan.rows.filter((row) => row.action === 'create');
    expect(created.map((row) => row.externalKey)).toEqual([`item-catalog:${resource(7).replace(/^Blueprint'|\..*$/g, '').toLowerCase()}@100`]);
    // The ASA saddle is a draft (left inactive), so it is not a wiki candidate as well.
    expect(plan.wikiSkipped).toEqual([]);
  });

  it('reports seed rows whose name does not match what they deliver', () => {
    const seed = plan.rows.find((row) => row.productId === 60)!;
    expect(seed).toMatchObject({ action: 'keep', source: 'seed', externalKey: 'product-id:60' });
    expect(plan.report.legacyReview.map((flag) => flag.code)).toContain('seed_misleading');
  });

  it('flags legacy names that do not match the delivered item', () => {
    expect(nameMismatch('Stego Saddle (1x)', 'Tapejara Tek Saddle')).toBe(true);
    expect(nameMismatch('Rex Saddle (1x)', 'Rex Saddle')).toBe(false);
    expect(nameMismatch('oil (10,000x)', 'Oil')).toBe(false);
    expect(spellingVariant('HemoDeus Helmet Skin (1x)', 'HomoDeus Helmet Skin')).toBe(true);
    expect(spellingVariant('Blubdog Ghost Costume (1x)', 'Bulbdog Ghost Costume')).toBe(true);
    expect(spellingVariant('Stego Saddle (1x)', 'Tapejara Tek Saddle')).toBe(false);
  });

  it('names apart blueprints that share one wiki page', () => {
    const a = bp('/Game/X/PrimalItem_RecipeNote_BattleTartare');
    const b = bp('/Game/X/PrimalItem_RecipeNote_ShadowSteak');
    expect(variantLabel(a, [a, b])).toBe('Battle Tartare');
  });
});

describe('item catalog apply-core', () => {
  const ctx = { planGeneratedAt: '2026-10-18T00:00:00.000Z', categoryIds: { Resources: 3 }, artwork: parseArtworkManifest({ entries: { [INGOT.slice(10, -1).toLowerCase()]: { imageUrl: '/images/catalog/ark/items/ingot.webp' } } }), reviewedAt: 'now' };
  const row = {
    productId: 9, externalKey: 'frozen-reference:ingot', name: 'Metal Ingot (100x)', displayName: 'Metal Ingot', blueprint: INGOT, entries: 1,
    action: 'activate', status: 'SELLABLE', code: 'sellable', quantity: 100, quality: 0, price: 1, priceBasis: 'p', quantityBasis: 'q', qualityBasis: 'Primitive (0)',
    categoryName: 'Resources', description: 'Metal Ingot x100', reason: 'r', subType: 'standard', stackSize: 100, source: 'draft', wikiPage: null, sortOrder: 2000,
    current: { isActive: false, price: 1, name: 'Metal Ingot', categoryName: 'Resources', imageUrl: null },
  } as const;
  const current: DbProduct = {
    id: 9, name: 'Metal Ingot', description: 'draft', price: 1, productType: 'item', externalKey: 'frozen-reference:ingot', deliveryPayload: { review: { status: 'pending' } },
    requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], itemBlueprint: INGOT, quantity: 1, quality: 0, isBlueprint: false, imageUrl: null, isActive: false, sortOrder: 0, categoryId: 3,
  };

  it('activates a draft into the exact legacy item shape and is idempotent', () => {
    const change = computeChange({ ...row }, current, ctx);
    expect(change.kind).toBe('update');
    const after = projectedProduct(current, change);
    expect(after).toMatchObject({ isActive: true, quantity: 100, quality: 0, isBlueprint: false, itemBlueprint: INGOT, requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], imageUrl: '/images/catalog/ark/items/ingot.webp' });
    expect(after.deliveryPayload.definition.Items).toEqual([{ Blueprint: INGOT, Amount: 100, Quality: 0, ForceBlueprint: false }]);
    expect(verifyDeliverable(after)).toBeNull();
    expect(resolveItemDelivery(after, 'o', 2).payload.items).toEqual([{ blueprint: INGOT, quantity: 200, quality: 0, isBlueprint: false }]);
    expect(computeChange({ ...row }, after, ctx).kind).toBe('noop');
  });

  it('never rewrites a legacy row: only a missing description and image', () => {
    const legacyCurrent: DbProduct = { ...current, externalKey: 'arkshop:metalingot', isActive: true, description: null, price: 2, quantity: 300, deliveryPayload: { definition: { Items: [{ Blueprint: INGOT, Amount: 300 }] } } };
    const legacyRow = { ...row, externalKey: 'arkshop:metalingot', action: 'keep', source: 'legacy', price: 2, quantity: 1000, description: 'Metal Ingot x1000' } as const;
    const change = computeChange(legacyRow, legacyCurrent, ctx);
    expect(Object.keys(change.data).sort()).toEqual(['description', 'imageUrl']);
    const withImage = computeChange(legacyRow, { ...legacyCurrent, imageUrl: '/images/catalog/legacy/own.webp', description: 'x' }, ctx);
    expect(withImage.kind).toBe('noop');
  });

  it('refuses to touch non-item products and stamps skipped drafts', () => {
    expect(() => computeChange({ ...row }, { ...current, productType: 'dino' }, ctx)).toThrow(/non-item/);
    const skipped = computeChange({ ...row, action: 'leave_inactive', status: 'NOT_SELLABLE', code: 'asa_only', reason: 'ASA' }, current, ctx);
    expect(skipped.data.deliveryPayload.review).toMatchObject({ status: 'not_sellable', code: 'asa_only', reason: 'ASA' });
    expect(Object.keys(skipped.data)).toEqual(['deliveryPayload']);
  });

  it('chooseImage keeps a legacy image unless it is a shared placeholder the manifest targets', () => {
    const keepRow = { ...row, action: 'keep' } as any;
    const placeholders = new Set(['/shared.webp']);
    expect(chooseImage(keepRow, { ...current, imageUrl: '/own.webp' }, { imageUrl: '/n.webp', productIds: null }, [], placeholders)).toBeUndefined();
    // targeted, but the owner's own picture (not a placeholder): kept
    expect(chooseImage(keepRow, { ...current, imageUrl: '/own.webp' }, { imageUrl: '/n.webp', productIds: [9] }, [], placeholders)).toBeUndefined();
    expect(chooseImage(keepRow, { ...current, imageUrl: '/shared.webp' }, { imageUrl: '/n.webp', productIds: [9] }, [])).toBeUndefined();
    expect(chooseImage(keepRow, { ...current, imageUrl: '/shared.webp' }, { imageUrl: '/n.webp', productIds: null }, [], placeholders)).toBeUndefined();
    expect(chooseImage(keepRow, { ...current, imageUrl: '/shared.webp' }, { imageUrl: '/n.webp', productIds: [9] }, [], placeholders)).toBe('/n.webp');
    expect(chooseImage(keepRow, { ...current, imageUrl: null }, { imageUrl: '/n.webp', productIds: null }, [])).toBe('/n.webp');
    // drafts being activated always take the manifest image
    expect(chooseImage({ ...row }, { ...current, imageUrl: '/own.webp' }, { imageUrl: '/n.webp', productIds: null }, [])).toBe('/n.webp');
  });

  it('sharedLegacyPlaceholders: one owner image on rows that deliver different items', () => {
    const owner = (id: number, blueprint: string, imageUrl: string | null, extra: Partial<DbProduct> = {}): DbProduct =>
      ({ ...current, id, externalKey: `arkshop:p${id}`, itemBlueprint: blueprint, imageUrl, isActive: true, ...extra });
    const placeholders = sharedLegacyPlaceholders([
      owner(1, INGOT, '/seed.webp'), owner(2, STONE, '/seed.webp'),
      owner(3, INGOT, '/ingot.webp'), owner(4, INGOT, '/ingot.webp'), // same item twice: owner picture
      owner(5, INGOT, '/chibi.webp'), owner(6, STONE, '/chibi.webp', { externalKey: 'frozen-reference:x', isActive: false }), // shared with a draft only
      owner(7, INGOT, '/off.webp', { isActive: false }), owner(8, STONE, '/off.webp'),
    ]);
    expect([...placeholders]).toEqual(['/seed.webp']);
  });

  it('item artwork: productImages (per product id) win over the blueprint entry', () => {
    const index = parseArtworkManifest({
      entries: { [INGOT.slice(10, -1).toLowerCase()]: { imageUrl: '/bp.webp' }, 'arkshop:kit': { imageUrl: '/kit.webp', productIds: [4] } },
      productImages: { 9: { imageUrl: '/p9.webp' }, x: { imageUrl: '/bad.webp' }, 10: { imageUrl: '' } },
    });
    expect(index.byProductId?.size).toBe(1);
    expect(lookupItemArtworkMatch(index, { externalKey: 'frozen-reference:ingot', blueprint: INGOT, productId: 9 })).toEqual({ imageUrl: '/p9.webp', productIds: [9] });
    expect(lookupItemArtworkMatch(index, { externalKey: 'item-catalog:ingot', blueprint: INGOT, productId: null })).toEqual({ imageUrl: '/bp.webp', productIds: null });
    expect(lookupItemArtworkMatch(index, { externalKey: 'arkshop:kit', blueprint: INGOT, productId: 4 })).toEqual({ imageUrl: '/kit.webp', productIds: [4] });
    const change = computeChange({ ...row }, current, { ...ctx, artwork: index });
    expect(change.data.imageUrl).toBe('/p9.webp');
  });
});

describe('item catalog review fixes (boss drops, armor tiers, image hold, drift)', () => {
  const product = (id: number, patch: Partial<ExportedProduct>): ExportedProduct => ({
    id, name: `P${id}`, price: 1, productType: 'item', externalKey: null, deliveryPayload: null, itemBlueprint: null, isActive: true, ...patch,
  });
  const item = (blueprint: string, amount: number) => ({ Blueprint: blueprint, Amount: amount, Quality: 0, ForceBlueprint: false });
  const legacy = (id: number, name: string, category: string, price: number, items: Array<ReturnType<typeof item>>, extra: Partial<ExportedProduct> = {}) => product(id, {
    name, price, externalKey: `arkshop:${id}`, category: { id: 1, name: category }, itemBlueprint: items[0].Blueprint, quantity: items[0].Amount, quality: 0,
    requiredCapabilities: [items.length > 1 ? ITEM_BUNDLE_DELIVERY_CAPABILITY : ITEM_DELIVERY_CAPABILITY], imageUrl: `/images/catalog/legacy/${id}.webp`,
    deliveryPayload: { type: 'item', source: 'arkshop', definition: { Type: 'item', Items: items, Price: price } }, ...extra,
  });
  const draft = (id: number, name: string, category: string, blueprint: string) => product(id, {
    name, isActive: false, externalKey: `frozen-reference:${blueprint.toLowerCase()}`, itemBlueprint: blueprint, category: { id: 2, name: category },
    deliveryPayload: { definition: { Type: 'item', Items: [item(blueprint, 1)] }, review: { status: 'pending' } },
  });
  const res = (n: number) => bp(`/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_R${n}`);
  const apex = (n: string) => bp(`/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_${n}`);
  const trophy = (n: string) => bp(`/Game/PrimalEarth/CoreBlueprints/Items/Trophies/PrimalItemTrophy_${n}`);
  const armor = (n: string) => bp(`/Game/PrimalEarth/CoreBlueprints/Items/Armor/PrimalItemArmor_${n}`);
  const gadget = (n: number) => bp(`/Game/PrimalEarth/CoreBlueprints/Items/PrimalItem_Gadget${n}`);
  const tapejara = bp('/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemArmor_Tapejara_Tek');
  const wiki: WikiItem[] = [
    ...[1, 2, 3, 4, 5].map((n) => wikiItem(`Resource ${n}`, res(n))),
    ...['Rex', 'Spino', 'Giga', 'Boa', 'WaterWyvern'].map((n) => wikiItem(`${n} Drop`, apex(n))),
    ...['Dragon_Alpha', 'Gorilla_Alpha', 'Broodmother_Alpha', 'Dragon'].map((n) => wikiItem(`${n} Trophy`, trophy(n), { category: 'Trophies', stackSize: 1, pageCategories: ['Items', 'Trophies'] })),
    ...['MetalHelmet', 'MetalShirt', 'RiotHelmet', 'RiotShirt', 'FurHelmet', 'FurShirt', 'ChitinHelmet'].map((n) => wikiItem(n, armor(n), { category: 'Armor', stackSize: 1, pageCategories: ['Armor', 'Items'] })),
    ...[1, 2, 3, 4, 5].map((n) => wikiItem(`Gadget ${n}`, gadget(n), { category: 'Items', stackSize: 1, pageCategories: ['Items'] })),
    wikiItem('Tapejara Tek Saddle', tapejara, { category: 'Saddles', stackSize: 1 }),
  ];
  const products: ExportedProduct[] = [
    ...[1, 2, 3, 4, 5].map((n) => legacy(n, `Resource ${n} (1,000x)`, 'Resources', 2, [item(res(n), 1000)])),
    ...[1, 2, 3, 4, 5].map((n) => legacy(30 + n, `Gadget ${n} (1x)`, 'Items', 2, [item(gadget(n), 1)])),
    // one arena bundle: 4 apex drops x10 + 3 alpha trophies
    legacy(10, 'Arena Alpha', 'Resources', 400, [item(apex('Rex'), 10), item(apex('Spino'), 10), item(apex('Giga'), 10), item(apex('Boa'), 10), item(trophy('Dragon_Alpha'), 1), item(trophy('Gorilla_Alpha'), 1), item(trophy('Broodmother_Alpha'), 1)]),
    legacy(11, 'Flak Armor', 'Armor', 1, [item(armor('MetalHelmet'), 1), item(armor('MetalShirt'), 1)]),
    legacy(12, 'Riot Armor', 'Armor', 1, [item(armor('RiotHelmet'), 1), item(armor('RiotShirt'), 1)]),
    legacy(13, 'Fur Armor', 'Armor', 1, [item(armor('FurHelmet'), 1), item(armor('FurShirt'), 1)]),
    legacy(14, 'Stego Saddle (1x)', 'Saddles', 35, [item(tapejara, 1)], { imageUrl: null }),
    draft(20, 'Water Talon', 'Resources', apex('WaterWyvern')),
    draft(21, 'Dragon Trophy', 'Items', trophy('Dragon')),
    draft(22, 'Chitin Helmet', 'Armor', armor('ChitinHelmet')),
  ];
  const plan = buildPlan({ products, wiki, now: new Date('2026-10-18T00:00:00.000Z') });
  const byId = new Map(plan.rows.map((row) => [row.productId, row]));

  it('prices boss drops no bundle contains from their kind in the arena bundles, in a small pack', () => {
    expect(plan.errors).toEqual([]);
    // bundle share: 400 IC / 7 items / 10 = 5.71 IC per apex unit; 57.1 IC per trophy
    expect(byId.get(20)).toMatchObject({ action: 'activate', quantity: 10, subType: 'apex', price: 55 });
    expect(byId.get(21)).toMatchObject({ action: 'activate', quantity: 1, subType: 'trophy', price: 55 });
    expect(plan.report.newPriceFlags.filter((flag) => flag.code === 'boss_drop_pool').map((flag) => flag.productId).sort()).toEqual([20, 21]);
  });

  it('prices armor pieces without an Armor group like the owner armor-set pieces (monotonic tiers)', () => {
    expect(byId.get(22)).toMatchObject({ action: 'activate', price: 1 });
    expect(byId.get(22)!.priceBasis).toMatch(/armor-set bundle pieces/);
  });

  it('holds the image of a legacy row whose name does not match what it delivers', () => {
    const stego = byId.get(14)!;
    expect(stego.imageHold).toMatch(/Tapejara Tek Saddle/);
    const ctx = {
      planGeneratedAt: plan.generatedAt, categoryIds: { Saddles: 1 }, reviewedAt: 'now',
      artwork: parseArtworkManifest({ entries: {}, productImages: { 14: { imageUrl: '/images/catalog/ark/items/tapejara.webp' } } }),
    };
    const current: DbProduct = {
      id: 14, name: stego.name, description: 'x', price: 35, productType: 'item', externalKey: 'arkshop:14', deliveryPayload: products.find((p) => p.id === 14)!.deliveryPayload,
      requiredCapabilities: [ITEM_DELIVERY_CAPABILITY], itemBlueprint: stego.blueprint, quantity: 1, quality: 0, isBlueprint: false, imageUrl: null, isActive: true, sortOrder: 0, categoryId: 1,
    };
    const change = computeChange(stego, current, ctx);
    expect(change.kind).toBe('noop');
    expect(change.notes.join(' ')).toMatch(/image held for owner review/);
  });

  it('drift: any owner edit to a writable column; owner-deactivated catalog rows are never re-activated', () => {
    const row = byId.get(20)!;
    const source = products.find((p) => p.id === 20)!;
    const current: DbProduct = {
      id: 20, name: source.name, description: null, price: source.price, productType: 'item', externalKey: source.externalKey, deliveryPayload: source.deliveryPayload,
      requiredCapabilities: [], itemBlueprint: source.itemBlueprint, quantity: 1, quality: 0, isBlueprint: false, imageUrl: null, isActive: false, sortOrder: 0, categoryId: 2,
    };
    expect(row.current?.fingerprint).toBe(snapshotOf(source).fingerprint);
    expect(productFingerprint(current)).toBe(row.current!.fingerprint);
    const ctx = { planGeneratedAt: plan.generatedAt, categoryIds: { Resources: 2 }, artwork: null, reviewedAt: 'now' };
    const change = computeChange(row, current, ctx);
    expect(change.kind).toBe('update');
    expect(driftOf(row, current, change)).toBeNull();
    // the owner edits the draft's blueprint/quantity after the plan: drift although price/active/name are unchanged
    const edited = { ...current, quantity: 5, itemBlueprint: res(1) };
    expect(driftOf(row, edited, computeChange(row, edited, ctx))).toMatch(/edited/);
    // after apply the owner switches the row off: a re-run skips it instead of re-activating it
    const off = { ...projectedProduct(current, change), isActive: false };
    const rerun = computeChange(row, off, ctx);
    expect(rerun.kind).toBe('skip');
    expect(rerun.notes[0]).toMatch(/^owner-deactivated/);
    expect(driftOf(row, off, rerun)).toBeNull();
    // ...while a draft that was never activated by the catalog is still activated
    expect(computeChange(row, current, ctx).data.isActive).toBe(true);
  });
});
