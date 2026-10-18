import { describe, expect, it } from 'vitest';
import {
  DINO_CATALOG_CAPABILITY,
  DINO_CRYOPOD_CAPABILITY,
  DINO_EXTRAS_CAPABILITY,
  pluginRejectsDinoPayload,
  resolveDinoCatalogDelivery,
} from '../../src/services/dinoCatalogDelivery.js';
import {
  ITEM_STATS_CAPABILITY,
  pluginRejectsItemPayload,
  resolveItemDelivery,
} from '../../src/services/itemCatalogDelivery.js';

const FLAK = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Metal/PrimalItemArmor_MetalShirt.PrimalItemArmor_MetalShirt'";
const INGOT = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'";
const REX = "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'";
const STRYDER = "Blueprint'/Game/Genesis2/Dinos/TekStrider/TekStrider_Character_BP.TekStrider_Character_BP'";
const REX_SADDLE = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemArmor_RexSaddle.PrimalItemArmor_RexSaddle'";

const itemProduct = (items: any[]) => ({
  name: 'Flak kit',
  itemBlueprint: FLAK,
  deliveryPayload: { definition: { Items: items } },
  quantity: 1,
  quality: 0,
  isBlueprint: false,
});

describe('item delivery: ArkShop Armor/Durability/Damage overrides', () => {
  const definition = [
    { Blueprint: FLAK, Amount: 2, Quality: 0, ForceBlueprint: false, Armor: 250, Durability: 1200, Damage: 0 },
    { Blueprint: INGOT, Amount: 100 },
  ];

  it('omits stats for a server without the capability (legacy payload unchanged)', () => {
    const legacy = resolveItemDelivery(itemProduct(definition), 'o1', 1);
    const legacyServer = resolveItemDelivery(itemProduct(definition), 'o1', 1, ['delivery.item.v1']);
    expect(legacy.payload.items).toEqual([
      { blueprint: FLAK, quantity: 2, quality: 0, isBlueprint: false },
      { blueprint: INGOT, quantity: 100, quality: 0, isBlueprint: false },
    ]);
    expect(JSON.stringify(legacyServer)).toBe(JSON.stringify(legacy));
  });

  it('sends only positive stats when the server advertises delivery.item.stats.v1', () => {
    expect(ITEM_STATS_CAPABILITY).toBe('delivery.item.stats.v1');
    const { payload } = resolveItemDelivery(itemProduct(definition), 'o2', 3, [ITEM_STATS_CAPABILITY]);
    expect(payload.items).toEqual([
      { blueprint: FLAK, quantity: 6, quality: 0, isBlueprint: false, armor: 250, durability: 1200 },
      { blueprint: INGOT, quantity: 300, quality: 0, isBlueprint: false },
    ]);
    expect(pluginRejectsItemPayload(payload)).toBeNull();
  });

  it('drops out-of-range or fractional stats instead of failing the order', () => {
    const { payload } = resolveItemDelivery(
      itemProduct([{ Blueprint: FLAK, Amount: 1, Armor: 70000, Durability: 12.5, Damage: 180 }]),
      'o3', 1, [ITEM_STATS_CAPABILITY],
    );
    expect(payload.items[0]).toEqual({ blueprint: FLAK, quantity: 1, quality: 0, isBlueprint: false, damage: 180 });
  });

  it('mirrors the plugin guards for the optional stat fields', () => {
    const base = { blueprint: FLAK, quantity: 1 };
    expect(pluginRejectsItemPayload({ items: [{ ...base, armor: 10 }] })).toBeNull();
    expect(pluginRejectsItemPayload({ items: [{ ...base, armor: -1 }] })).toMatch(/armor/);
    expect(pluginRejectsItemPayload({ items: [{ ...base, durability: 65536 }] })).toMatch(/durability/);
    expect(pluginRejectsItemPayload({ items: [{ ...base, damage: '5' }] })).toMatch(/damage/);
  });
});

const dinoProduct = (blueprint: string, definition: Record<string, unknown>) => ({
  name: 'Dino',
  itemBlueprint: blueprint,
  // Imported ArkShop rows keep the spawn row and the raw definition side by side.
  deliveryPayload: { spawn: { blueprint, level: 150, neutered: false, forceTame: true }, definition: { Blueprint: blueprint, Level: 150, ...definition } },
});

describe('dino catalog delivery: ArkShop GiveDino extras', () => {
  const all = [DINO_CATALOG_CAPABILITY, DINO_CRYOPOD_CAPABILITY, DINO_EXTRAS_CAPABILITY];

  it('omits extras for a server without delivery.dino.extras.v1', () => {
    const result = resolveDinoCatalogDelivery(
      dinoProduct(REX, { Gender: 'female', SaddleBlueprint: REX_SADDLE }), 'o1', [DINO_CATALOG_CAPABILITY, DINO_CRYOPOD_CAPABILITY],
    );
    expect(result.ok && result.payload.dino).toEqual({ blueprint: REX, level: 150, forceTame: true, neutered: false, cryopod: true });
  });

  it('passes gender and saddle from the ArkShop definition', () => {
    expect(DINO_EXTRAS_CAPABILITY).toBe('delivery.dino.extras.v1');
    const result = resolveDinoCatalogDelivery(dinoProduct(REX, { Gender: 'Female', SaddleBlueprint: REX_SADDLE }), 'o2', all);
    expect(result.ok && result.payload.dino).toEqual({
      blueprint: REX, level: 150, forceTame: true, neutered: false, cryopod: true, gender: 'female', saddleBlueprint: REX_SADDLE,
    });
    if (result.ok) expect(pluginRejectsDinoPayload(result.payload)).toBeNull();
  });

  it('omits random gender, empty saddle and out-of-range stryder indexes', () => {
    const result = resolveDinoCatalogDelivery(
      dinoProduct(STRYDER, { Gender: 'random', SaddleBlueprint: '', StryderHead: 3, StryderChest: 3 }), 'o3', all,
    );
    expect(result.ok && result.payload.dino).toEqual({
      blueprint: STRYDER, level: 150, forceTame: true, neutered: false, cryopod: true, stryderChest: 3,
    });
  });

  it('honours PreventCryo by never asking for a cryopod', () => {
    const result = resolveDinoCatalogDelivery(dinoProduct(REX, { PreventCryo: true }), 'o4', all);
    expect(result.ok && result.payload.dino).toEqual({ blueprint: REX, level: 150, forceTame: true, neutered: false });
  });

  it('mirrors the plugin guards for the optional dino fields', () => {
    const payload = (dino: Record<string, unknown>) => ({
      schemaVersion: 1, productType: 'dino', dino: { blueprint: REX, level: 1, forceTame: true, ...dino },
    });
    expect(pluginRejectsDinoPayload(payload({ gender: 'male', saddleBlueprint: REX_SADDLE, stryderHead: 2, stryderChest: -1 }))).toBeNull();
    expect(pluginRejectsDinoPayload(payload({ gender: 'yes' }))).toMatch(/gender/);
    expect(pluginRejectsDinoPayload(payload({ saddleBlueprint: 4 }))).toMatch(/saddle/);
    expect(pluginRejectsDinoPayload(payload({ stryderHead: 3 }))).toMatch(/stryderHead/);
    expect(pluginRejectsDinoPayload(payload({ stryderChest: 4 }))).toMatch(/stryderChest/);
  });
});
