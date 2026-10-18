import { describe, expect, it } from 'vitest';
import {
  DINO_CATALOG_CAPABILITY,
  DINO_CRYOPOD_CAPABILITY,
  pluginRejectsDinoPayload,
  resolveDinoCatalogDelivery,
  serverSupportsDinoCryopod,
} from '../../src/services/dinoCatalogDelivery.js';

const blueprint = "Blueprint'/Game/PrimalOceanDinos/Megalodon/Megalodon_Character_BP.Megalodon_Character_BP'";
const product = {
  name: 'Megalodon (Lv.150)',
  itemBlueprint: blueprint,
  deliveryPayload: { spawn: { blueprint, level: 150, neutered: false, forceTame: true } },
};

describe('dino catalog delivery: cryopod opt-in by server capability', () => {
  it('uses the capability name the plugin advertises', () => {
    expect(DINO_CRYOPOD_CAPABILITY).toBe('delivery.dino.cryopod.v1');
  });

  it('leaves the legacy payload untouched for a server without the cryopod capability', () => {
    const withoutArg = resolveDinoCatalogDelivery(product, 'order-1');
    const legacyServer = resolveDinoCatalogDelivery(product, 'order-1', [DINO_CATALOG_CAPABILITY]);
    const nullCaps = resolveDinoCatalogDelivery(product, 'order-1', null);
    for (const result of [withoutArg, legacyServer, nullCaps]) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.payload.dino).toEqual({ blueprint, level: 150, forceTame: true, neutered: false });
      expect(result.payload.dino).not.toHaveProperty('cryopod');
      expect(pluginRejectsDinoPayload(result.payload)).toBeNull();
    }
    // Byte-identical to the pre-cryopod payload, so payload hashes do not drift for old plugins.
    expect(JSON.stringify(legacyServer)).toBe(JSON.stringify(withoutArg));
  });

  it('sets dino.cryopod = true when the target server advertises delivery.dino.cryopod.v1', () => {
    const result = resolveDinoCatalogDelivery(product, 'order-2', [DINO_CATALOG_CAPABILITY, DINO_CRYOPOD_CAPABILITY]);
    expect(result).toEqual({
      ok: true,
      deliveryType: 'dino_catalog',
      payload: {
        schemaVersion: 1,
        orderId: 'order-2',
        productType: 'dino',
        productName: 'Megalodon (Lv.150)',
        dino: { blueprint, level: 150, forceTame: true, neutered: false, cryopod: true },
      },
    });
    if (result.ok) expect(pluginRejectsDinoPayload(result.payload)).toBeNull();
  });

  it('does not let the cryopod capability bypass the level/blueprint guards', () => {
    const caps = [DINO_CRYOPOD_CAPABILITY];
    expect(resolveDinoCatalogDelivery({ ...product, deliveryPayload: { spawn: { blueprint, level: 0 } } }, 'o', caps))
      .toEqual({ ok: false, reason: 'level' });
    expect(resolveDinoCatalogDelivery({ ...product, itemBlueprint: 'other' }, 'o', caps))
      .toEqual({ ok: false, reason: 'blueprint' });
  });

  it('serverSupportsDinoCryopod only accepts an array containing the exact capability', () => {
    expect(serverSupportsDinoCryopod([DINO_CRYOPOD_CAPABILITY])).toBe(true);
    expect(serverSupportsDinoCryopod(['delivery.dino.cryopod.v2'])).toBe(false);
    expect(serverSupportsDinoCryopod([])).toBe(false);
    expect(serverSupportsDinoCryopod(undefined)).toBe(false);
    expect(serverSupportsDinoCryopod(null)).toBe(false);
  });

  it('mirrors the plugin guard for the cryopod flag type', () => {
    const base = { schemaVersion: 1, productType: 'dino', dino: { blueprint, level: 150, forceTame: true, neutered: false } };
    expect(pluginRejectsDinoPayload({ ...base, dino: { ...base.dino, cryopod: true } })).toBeNull();
    expect(pluginRejectsDinoPayload({ ...base, dino: { ...base.dino, cryopod: false } })).toBeNull();
    expect(pluginRejectsDinoPayload({ ...base, dino: { ...base.dino, cryopod: 'yes' } })).toBe('dino.cryopod must be boolean');
  });
});
