/**
 * Checks the COMMITTED dino catalog plan (prisma/seed-data/dino-catalog-plan.json)
 * and artwork manifest (prisma/seed-data/dino-artwork.json) against the real
 * delivery path:
 *
 *   plan row -> apply-core targetSellableState/computeChange (what apply-plan.ts writes)
 *            -> src/services/dinoCatalogDelivery.resolveDinoCatalogDelivery
 *               (the builder checkout.controller and game-shop.controller call)
 *            -> HeartShop.cpp SpawnCatalogDinoForPlayer guards (pluginRejectsDinoPayload)
 *
 * Legacy "keep" rows are not rewritten by the plan; their stored payloads are checked
 * against production by `apply-plan.ts --dry-run` (verifyDeliverable over every row
 * that will be active). Here they are checked with the legacy ArkShop payload shape
 * built from the plan's blueprint + spawn level.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DINO_CATALOG_CAPABILITY,
  pluginRejectsDinoPayload,
  resolveDinoCatalogDelivery,
} from '../../src/services/dinoCatalogDelivery.js';
import { GROUP_CATEGORY, parseArtworkManifest, simulateBackendDinoDelivery } from '../../scripts/dino-catalog/lib.js';
import { chooseImage, computeChange, projectedProduct, verifyDeliverable, type DbProduct } from '../../scripts/dino-catalog/apply-core.js';
import type { Plan, PlanRow } from '../../scripts/dino-catalog/plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'prisma/seed-data/dino-catalog-plan.json'), 'utf8')) as Plan;
const artworkPath = path.join(root, 'prisma/seed-data/dino-artwork.json');
const artwork = fs.existsSync(artworkPath) ? parseArtworkManifest(JSON.parse(fs.readFileSync(artworkPath, 'utf8'))) : null;
const publicDir = path.resolve(root, '../frontend/public');

const SELLABLE = new Set(['keep', 'activate', 'create']);
const sellable = plan.rows.filter((row) => SELLABLE.has(row.action));
const categoryIds = Object.fromEntries(Object.values(GROUP_CATEGORY).map((name, index) => [name, 100 + index]));
const ctx = { planGeneratedAt: plan.generatedAt, categoryIds, artwork, reviewedAt: '2026-10-18T00:00:00.000Z' };

/** A DB row as it exists before apply (legacy rows: ArkShop import shape). */
function currentRow(row: PlanRow, index: number): DbProduct | null {
  if (row.action === 'create') return null;
  const legacy = row.source === 'legacy';
  return {
    id: row.productId ?? -(index + 1),
    name: row.current?.name ?? row.name,
    description: row.description,
    price: row.current?.price ?? row.price ?? 0,
    productType: 'dino',
    externalKey: row.externalKey,
    deliveryPayload: legacy
      ? {
          type: 'dino',
          schemaVersion: 1,
          source: 'arkshop',
          spawn: { blueprint: row.blueprint, level: row.level, forceTame: true, neutered: false, command: `admincheat SpawnDino "${row.blueprint}" 500 0 0 ${row.level}` },
          definition: { Type: 'dino', Blueprint: row.blueprint, Level: row.level, Price: row.price, Neutered: false, Description: row.name },
        }
      : { source: 'ark-wiki-reference', definition: { Type: 'dino', Blueprint: row.blueprint, Level: 150, Price: row.current?.price ?? 0 } },
    requiredCapabilities: legacy ? [DINO_CATALOG_CAPABILITY] : [],
    itemBlueprint: legacy ? row.blueprint : null,
    imageUrl: row.current?.imageUrl ?? null,
    isActive: row.current?.isActive ?? false,
    sortOrder: row.sortOrder ?? 0,
    categoryId: row.categoryName ? categoryIds[row.categoryName] ?? null : null,
  };
}

const projected = sellable.map((row, index) => {
  const current = currentRow(row, index);
  const change = computeChange(row, current, ctx);
  return { row, current, change, after: projectedProduct(current, change) };
});

describe('dino catalog plan (committed JSON)', () => {
  it('has the expected shape and no build errors', () => {
    expect(plan.schemaVersion).toBe(1);
    expect(plan.errors ?? []).toEqual([]);
    expect(sellable.length).toBe(plan.counts.sellableAfterApply);
    expect(new Set(sellable.map((row) => row.externalKey)).size).toBe(sellable.length);
  });

  it('every sellable row ends up active and passes the real backend delivery builder + plugin guards', () => {
    const failures: string[] = [];
    for (const { row, change, after } of projected) {
      if (row.action !== 'keep') expect(change.kind, row.externalKey).not.toBe('skip');
      const product = { ...after, isActive: true };
      const delivery = resolveDinoCatalogDelivery(product, 'order-test');
      if (!delivery.ok) { failures.push(`${row.externalKey}: backend rejects (${delivery.reason})`); continue; }
      const rejected = pluginRejectsDinoPayload(delivery.payload);
      if (rejected) failures.push(`${row.externalKey}: plugin rejects (${rejected})`);
      if (verifyDeliverable(product)) failures.push(`${row.externalKey}: ${verifyDeliverable(product)}`);
      if (delivery.payload.dino.level !== row.level) failures.push(`${row.externalKey}: level ${delivery.payload.dino.level} != plan ${row.level}`);
      if (delivery.payload.dino.blueprint !== row.blueprint) failures.push(`${row.externalKey}: blueprint ${delivery.payload.dino.blueprint} != plan ${row.blueprint}`);
      if (delivery.payload.dino.neutered !== false) failures.push(`${row.externalKey}: sold neutered`);
      if (delivery.payload.productName !== product.name) failures.push(`${row.externalKey}: productName mismatch`);
      if (!product.requiredCapabilities.includes(DINO_CATALOG_CAPABILITY)) failures.push(`${row.externalKey}: missing capability`);
    }
    expect(failures).toEqual([]);
  });

  it('activated/created rows get exactly the plugin payload shape, written by apply', () => {
    const fresh = projected.filter(({ row }) => row.action !== 'keep');
    expect(fresh.length).toBe(plan.counts.byAction.activate + plan.counts.byAction.create);
    for (const { row, after } of fresh) {
      expect(after.isActive, row.externalKey).toBe(true);
      expect(after.itemBlueprint).toBe(row.blueprint);
      expect(after.requiredCapabilities).toEqual([DINO_CATALOG_CAPABILITY]);
      expect(after.deliveryPayload.spawn).toEqual({
        blueprint: row.blueprint, level: row.level, forceTame: true, neutered: false,
        command: `admincheat SpawnDino "${row.blueprint}" 500 0 0 ${row.level}`,
      });
      const delivery = resolveDinoCatalogDelivery(after, 'order-1');
      expect(delivery).toEqual({
        ok: true,
        deliveryType: 'dino_catalog',
        payload: { schemaVersion: 1, orderId: 'order-1', productType: 'dino', productName: row.name, dino: { blueprint: row.blueprint, level: row.level, forceTame: true, neutered: false } },
      });
    }
  });

  it('only sells canonical vanilla ASE blueprints of tameable creatures', () => {
    const bad = sellable.filter((row) => {
      const bp = row.blueprint;
      if (!/^Blueprint'\/Game\/[^'.]+\.[^'.]+'$/.test(bp)) return true;
      if (/\/Game\/ASA\//i.test(bp)) return true; // ASA-only
      if (/\/Game\/Mods\//i.test(bp) && !/\/Game\/Mods\/Ragnarok\//i.test(bp)) return true; // only the official Ragnarok map ships as /Mods/
      return /\/Boss(es)?\/|Corrupt|_Minion|Malfunction|_Hunt|Mission|Kaiju|ForestTitan|Brute_|_VR|Gauntlet|Arena/i.test(bp);
    });
    expect(bad.map((row) => `${row.name}: ${row.blueprint}`)).toEqual([]);
    // Titanosaur is a temporary tame (starves, cannot be cryopodded or leveled): never sold.
    expect(sellable.filter((row) => /\/Titanosaur_Character_BP\./i.test(row.blueprint)).map((row) => row.name)).toEqual([]);
    for (const row of sellable) {
      expect(row.level! >= 1 && row.level! <= 10_000, row.externalKey).toBe(true);
      expect(row.price! > 0, row.externalKey).toBe(true);
    }
  });

  it('water-only creatures carry the Thai in-water note', () => {
    for (const row of sellable.filter((candidate) => candidate.aquatic)) {
      expect(row.description, row.name).toContain('ต้องอยู่ในน้ำ');
    }
  });

  it.skipIf(!artwork)('every sellable row has an image after apply, and every image file exists', () => {
    const withoutImage = projected.filter(({ after }) => !after.imageUrl).map(({ row }) => row.name);
    expect(withoutImage).toEqual([]);
    const fresh = projected.filter(({ row }) => row.action !== 'keep');
    for (const { row, after } of fresh) expect(after.imageUrl, row.name).toMatch(/^\/images\/catalog\/(ark|legacy)\//);
    if (fs.existsSync(publicDir)) {
      const missing = [...new Set(projected.map(({ after }) => after.imageUrl!))]
        .filter((url) => !fs.existsSync(path.join(publicDir, ...url.split('/').filter(Boolean))));
      expect(missing).toEqual([]);
    }
  });
});

describe('dino catalog image choice', () => {
  const row = (action: PlanRow['action']) => ({ action } as PlanRow);
  const product = (imageUrl: string | null) => ({ id: 42, imageUrl } as DbProduct);

  it('fills activated/created rows and empty legacy rows', () => {
    expect(chooseImage(row('create'), null, { imageUrl: '/n.webp', productIds: null }, [])).toBe('/n.webp');
    expect(chooseImage(row('activate'), product('/old.webp'), { imageUrl: '/n.webp', productIds: null }, [])).toBe('/n.webp');
    expect(chooseImage(row('keep'), product(null), { imageUrl: '/n.webp', productIds: null }, [])).toBe('/n.webp');
  });

  it('replaces a legacy image only when the manifest targets that product', () => {
    const notes: string[] = [];
    expect(chooseImage(row('keep'), product('/own.webp'), { imageUrl: '/n.webp', productIds: [7] }, notes)).toBeUndefined();
    expect(chooseImage(row('keep'), product('/own.webp'), { imageUrl: '/n.webp', productIds: null }, notes)).toBeUndefined();
    expect(notes).toHaveLength(2);
    expect(chooseImage(row('keep'), product('/shared.webp'), { imageUrl: '/n.webp', productIds: [42] }, [])).toBe('/n.webp');
    expect(chooseImage(row('keep'), product('/n.webp'), { imageUrl: '/n.webp', productIds: [42] }, [])).toBeUndefined();
  });
});

describe('dino catalog delivery builder (src/services/dinoCatalogDelivery.ts)', () => {
  const blueprint = "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'";
  const product = (spawn: Record<string, unknown>, itemBlueprint: string | null = blueprint) => ({ name: 'Rex (Lv.400)', itemBlueprint, deliveryPayload: { spawn } });

  it('builds the payload HeartShop parses', () => {
    const result = resolveDinoCatalogDelivery(product({ blueprint, level: 400, forceTame: true, neutered: false }), 'o1');
    expect(result).toEqual({
      ok: true, deliveryType: 'dino_catalog',
      payload: { schemaVersion: 1, orderId: 'o1', productType: 'dino', productName: 'Rex (Lv.400)', dino: { blueprint, level: 400, forceTame: true, neutered: false } },
    });
    expect(pluginRejectsDinoPayload(result.ok && result.payload)).toBeNull();
  });

  it('falls back to the ArkShop definition block', () => {
    const result = resolveDinoCatalogDelivery({ name: 'Rex', itemBlueprint: blueprint, deliveryPayload: { definition: { Blueprint: `"${blueprint}"`, Level: 200, Neutered: true } } }, 'o2');
    expect(result.ok && result.payload.dino).toEqual({ blueprint, level: 200, forceTame: true, neutered: true });
  });

  it('rejects out-of-range levels and blueprint mismatches', () => {
    expect(resolveDinoCatalogDelivery(product({ blueprint, level: 0 }), 'o')).toEqual({ ok: false, reason: 'level' });
    expect(resolveDinoCatalogDelivery(product({ blueprint, level: 10_001 }), 'o')).toEqual({ ok: false, reason: 'level' });
    expect(resolveDinoCatalogDelivery(product({ blueprint, level: 1.5 }), 'o')).toEqual({ ok: false, reason: 'level' });
    expect(resolveDinoCatalogDelivery(product({ blueprint: 'Blueprint\'/Game/Other.Other\'', level: 10 }), 'o')).toEqual({ ok: false, reason: 'blueprint' });
    expect(resolveDinoCatalogDelivery(product({ blueprint, level: 10 }, null), 'o')).toEqual({ ok: false, reason: 'blueprint' });
  });

  it('mirrors the plugin guards', () => {
    const ok = { schemaVersion: 1, productType: 'dino', dino: { blueprint, level: 1, forceTame: true, neutered: false } };
    expect(pluginRejectsDinoPayload(ok)).toBeNull();
    expect(pluginRejectsDinoPayload({ ...ok, schemaVersion: 2 })).toMatch(/schemaVersion/);
    expect(pluginRejectsDinoPayload({ ...ok, productType: 'item' })).toMatch(/productType/);
    expect(pluginRejectsDinoPayload({ ...ok, dino: { ...ok.dino, blueprint: '' } })).toMatch(/blueprint/);
    expect(pluginRejectsDinoPayload({ ...ok, dino: { ...ok.dino, level: 10_001 } })).toMatch(/level/);
    expect(pluginRejectsDinoPayload({ ...ok, dino: { ...ok.dino, forceTame: false } })).toMatch(/forceTame/);
  });

  it('simulateBackendDinoDelivery (used by apply-plan) goes through the same builder', () => {
    const result = simulateBackendDinoDelivery({
      productType: 'dino', itemBlueprint: blueprint, requiredCapabilities: [DINO_CATALOG_CAPABILITY],
      deliveryPayload: { spawn: { blueprint, level: 400, forceTame: true, neutered: false } }, name: 'Rex (Lv.400)',
    });
    expect(result).toEqual({ ok: true, payload: { schemaVersion: 1, productType: 'dino', productName: 'Rex (Lv.400)', dino: { blueprint, level: 400, forceTame: true, neutered: false } } });
    expect(simulateBackendDinoDelivery({
      productType: 'dino', itemBlueprint: blueprint, requiredCapabilities: [], deliveryPayload: { spawn: { blueprint, level: 400, forceTame: true } }, name: 'x',
    }).ok).toBe(false);
  });
});
