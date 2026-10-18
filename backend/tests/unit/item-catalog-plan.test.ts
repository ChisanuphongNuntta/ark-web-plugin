/**
 * Checks the COMMITTED item catalog plan (prisma/seed-data/item-catalog-plan.json) and
 * artwork manifest (prisma/seed-data/item-artwork.json) against the real delivery path:
 *
 *   plan row -> apply-core targetSellableState/computeChange (what apply-plan.ts writes)
 *            -> src/services/itemCatalogDelivery.resolveItemDelivery
 *               (the builder checkout.controller and game-shop.controller call)
 *            -> HeartShop.cpp "order" guards (pluginRejectsItemPayload)
 *
 * Legacy "keep" rows are never rewritten by the plan; their stored payloads were run
 * through the same builder when the plan was built (plan.errors / report.legacyFlagged)
 * and are re-checked against production by `apply-plan.ts --dry-run`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_DELIVERY_CAPABILITY, pluginRejectsItemPayload, resolveItemDelivery } from '../../src/services/itemCatalogDelivery.js';
import { ITEM_CATEGORIES, packageKey, parseArtworkManifest } from '../../scripts/item-catalog/lib.js';
import { computeChange, projectedProduct, sharedLegacyPlaceholders, verifyDeliverable, type ApplyContext, type DbProduct } from '../../scripts/item-catalog/apply-core.js';
import type { Plan, PlanRow } from '../../scripts/item-catalog/plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'prisma/seed-data/item-catalog-plan.json'), 'utf8')) as Plan;
const artworkPath = path.join(root, 'prisma/seed-data/item-artwork.json');
const artwork = fs.existsSync(artworkPath) ? parseArtworkManifest(JSON.parse(fs.readFileSync(artworkPath, 'utf8'))) : null;
const publicDir = path.resolve(root, '../frontend/public');

const SELLABLE = new Set(['keep', 'activate', 'create']);
const sellable = plan.rows.filter((row) => SELLABLE.has(row.action));
const fresh = sellable.filter((row) => row.source !== 'legacy' && row.source !== 'seed');
const owner = sellable.filter((row) => row.source === 'legacy' || row.source === 'seed');
const categoryIds = Object.fromEntries([...ITEM_CATEGORIES, 'Weapons', 'Kits'].map((name, index) => [name, 100 + index]));
const ctx: ApplyContext = { planGeneratedAt: plan.generatedAt, categoryIds, artwork, reviewedAt: '2026-10-18T00:00:00.000Z' };

/** A DB row as it exists before apply (drafts: prepare-frozen-drafts shape; legacy: ArkShop import shape). */
function currentRow(row: PlanRow): DbProduct | null {
  if (row.action === 'create') return null;
  const legacy = row.source === 'legacy' || row.source === 'seed';
  return {
    id: row.productId!,
    name: row.current?.name ?? row.name,
    description: legacy ? row.description : 'ร่างรอตรวจราคาและการส่งของ',
    price: row.current?.price ?? 0,
    productType: 'item',
    externalKey: row.source === 'seed' ? null : row.externalKey,
    deliveryPayload: { type: 'item', source: legacy ? 'arkshop' : 'ark-wiki-reference', definition: { Type: 'item', Items: [{ Blueprint: row.blueprint, Amount: legacy ? row.quantity : 1, Quality: 0, ForceBlueprint: false }] } },
    requiredCapabilities: [ITEM_DELIVERY_CAPABILITY],
    itemBlueprint: row.blueprint,
    quantity: legacy ? row.quantity! : 1,
    quality: 0,
    isBlueprint: false,
    imageUrl: row.current?.imageUrl ?? null,
    isActive: row.current?.isActive ?? false,
    sortOrder: row.sortOrder ?? 0,
    categoryId: row.categoryName ? categoryIds[row.categoryName] ?? null : null,
  };
}

const beforeApply = plan.rows.map(currentRow).filter((row): row is DbProduct => row !== null);
ctx.placeholderImages = sharedLegacyPlaceholders(beforeApply);

const projected = sellable.map((row) => {
  const current = currentRow(row);
  const change = computeChange(row, current, ctx);
  return { row, current, change, after: projectedProduct(current, change) };
});

describe('item catalog plan (committed JSON)', () => {
  it('has the expected shape and no build errors', () => {
    expect(plan.schemaVersion).toBe(1);
    expect(plan.errors ?? []).toEqual([]);
    expect(sellable.length).toBe(plan.counts.sellableAfterApply);
    expect(new Set(sellable.map((row) => row.externalKey)).size).toBe(sellable.length);
    expect(plan.rows.every((row) => row.status === 'SELLABLE' || row.reason.length > 0)).toBe(true);
  });

  it('every activated/created row passes the real backend item delivery builder + plugin guards', () => {
    const failures: string[] = [];
    for (const { row, change, after } of projected.filter(({ row: candidate }) => candidate.action !== 'keep')) {
      if (change.kind === 'skip') { failures.push(`${row.externalKey}: skipped`); continue; }
      if (!after.isActive) failures.push(`${row.externalKey}: not active after apply`);
      const error = verifyDeliverable(after);
      if (error) failures.push(`${row.externalKey}: ${error}`);
      for (const units of [1, 3]) {
        const { deliveryType, payload } = resolveItemDelivery(after, 'order-test', units);
        if (deliveryType !== 'order') failures.push(`${row.externalKey}: deliveryType ${deliveryType}`);
        const rejected = pluginRejectsItemPayload(payload);
        if (rejected) failures.push(`${row.externalKey}: plugin rejects (${rejected})`);
        const expected = { blueprint: row.blueprint, quantity: row.quantity! * units, quality: row.quality ?? 0, isBlueprint: false };
        if (JSON.stringify(payload.items) !== JSON.stringify([expected])) failures.push(`${row.externalKey}: items ${JSON.stringify(payload.items)} != ${JSON.stringify([expected])}`);
        if (payload.productName !== row.name) failures.push(`${row.externalKey}: productName mismatch`);
      }
      if (JSON.stringify(after.requiredCapabilities) !== JSON.stringify([ITEM_DELIVERY_CAPABILITY])) failures.push(`${row.externalKey}: capabilities`);
      if (after.itemBlueprint !== row.blueprint || after.quantity !== row.quantity || after.isBlueprint !== false) failures.push(`${row.externalKey}: projection columns`);
    }
    expect(failures).toEqual([]);
    expect(projected.filter(({ row }) => row.action !== 'keep').length).toBe(plan.counts.byAction.activate + plan.counts.byAction.create);
  });

  it('legacy and seed rows keep price, quantity, quality, name and payload (only description/image may be added)', () => {
    for (const { row, change } of projected.filter(({ row: candidate }) => owner.includes(candidate))) {
      expect(row.priceBasis, row.externalKey).toMatch(/price \(unchanged\)$/);
      expect(row.price, row.externalKey).toBe(row.current!.price);
      expect(row.name, row.externalKey).toBe(row.current!.name);
      const keys = Object.keys(change.data).filter((key) => key !== 'description' && key !== 'imageUrl');
      expect(keys, row.externalKey).toEqual([]);
    }
  });

  it('only sells canonical vanilla ASE blueprints, one per blueprint + quantity + quality', () => {
    const bad = fresh.filter((row) => {
      const blueprint = row.blueprint;
      if (!/^Blueprint'\/Game\/[^'.]+\.[^'.]+'$/.test(blueprint)) return true;
      if (/\/Game\/(ASA|Packs|LostColony|Dragontopia|Water|Mobile)\//i.test(blueprint)) return true;
      if (/\/Game\/Mods\//i.test(blueprint) && !/\/Game\/Mods\/Ragnarok\//i.test(blueprint)) return true;
      return /Admin|Debug|Cheat|_Fertilized|StartingNote|\/Missions?\//i.test(blueprint);
    });
    expect(bad.map((row) => `${row.name}: ${row.blueprint}`)).toEqual([]);
    // New rows never duplicate each other or a legacy row (legacy duplicates among themselves
    // are only reported: report.legacyReview duplicate_delivery).
    const identity = (row: PlanRow) => `${packageKey(row.blueprint)}|${row.quantity}|${row.quality}`;
    const freshIdentities = fresh.map(identity);
    expect(new Set(freshIdentities).size).toBe(freshIdentities.length);
    const ownerIdentities = new Set(owner.filter((row) => row.entries === 1).map(identity));
    expect(freshIdentities.filter((value) => ownerIdentities.has(value))).toEqual([]);
    // ...and never sell standalone a blueprint a single-item legacy row already sells.
    const legacyBlueprints = new Set(owner.filter((row) => row.source === 'legacy' && row.entries === 1).map((row) => packageKey(row.blueprint)));
    expect(fresh.filter((row) => legacyBlueprints.has(packageKey(row.blueprint))).map((row) => row.name)).toEqual([]);  });

  it('new rows: sensible quantity, price and the Thai description', () => {
    for (const row of fresh) {
      expect(Number.isSafeInteger(row.quantity) && row.quantity! >= 1, row.externalKey).toBe(true);
      if (row.stackSize != null) expect(row.quantity! <= Math.max(1, row.stackSize), row.externalKey).toBe(true);
      expect(Number.isSafeInteger(row.price) && row.price! >= 1, row.externalKey).toBe(true);
      expect(row.priceBasis.length > 0 && row.quantityBasis.length > 0, row.externalKey).toBe(true);
      expect(row.description, row.externalKey).toBe(`${row.displayName} x${row.quantity!.toLocaleString('en-US')}`);
      expect(row.name, row.externalKey).toBe(`${row.displayName} (${row.quantity!.toLocaleString('en-US')}x)`);
      expect(ITEM_CATEGORIES as readonly string[], row.externalKey).toContain(row.categoryName);
    }
    expect(new Set(fresh.map((row) => row.name)).size).toBe(fresh.length);
  });

  it('every row carries a fingerprinted snapshot of the product it targets (drift detection)', () => {
    for (const row of plan.rows.filter((candidate) => candidate.productId != null)) {
      expect(row.current?.fingerprint, row.externalKey).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('boss drops, single-use tools and ammo get sensible packs and prices', () => {
    const byId = new Map(plan.rows.map((row) => [row.productId, row]));
    // 2658 delivers the Exo Helmet blueprint; the wiki "Gauntlets" page is an alias of it.
    expect(byId.get(2658)).toMatchObject({ name: 'Federation Exo Helmet (1x)', action: 'activate' });
    for (const id of [2742, 3032, 2586, 3297, 3298, 3299]) expect(byId.get(id)?.action, String(id)).toBe('leave_inactive');
    expect(byId.get(2907)?.quantity).toBeGreaterThan(1); // Metal Arrow stacks
    expect(byId.get(2632)).toMatchObject({ name: 'Electronic Binoculars (1x)', quantity: 1 });
    for (const row of fresh.filter((candidate) => /^(alpha_apex|apex|trophy|artifact)$/.test(candidate.subType ?? ''))) {
      expect(row.quantity! <= 20, row.name).toBe(true);
      expect(row.price! >= 2, row.name).toBe(true);
    }
    const nonTekArmor = fresh.filter((row) => row.categoryName === 'Armor' && row.subType === 'standard').map((row) => row.price!);
    const tekArmor = fresh.filter((row) => row.categoryName === 'Armor' && row.subType === 'tek').map((row) => row.price!);
    expect(Math.min(...tekArmor)).toBeGreaterThanOrEqual(Math.max(...nonTekArmor));
    expect(fresh.filter((row) => /\(Survival (Evolved|Ascended)\)/.test(row.name)).map((row) => row.name)).toEqual([]);
  });

  it.skipIf(!artwork)('an owner image is only replaced when it is a placeholder shared by different items', () => {
    const replaced = projected
      .filter(({ row, current, after }) => owner.includes(row) && current?.imageUrl && after.imageUrl !== current.imageUrl)
      .map(({ row, current }) => ({ key: row.externalKey, placeholder: ctx.placeholderImages!.has(current!.imageUrl!) }));
    expect(replaced.filter(({ placeholder }) => !placeholder)).toEqual([]);
  });

  it.skipIf(!artwork)('every sellable row has an image after apply (except owner rows held for a name fix), and every image file exists', () => {
    const withoutImage = projected.filter(({ row, after }) => !after.imageUrl && !row.imageHold).map(({ row }) => `${row.externalKey} ${row.name}`);
    expect(withoutImage).toEqual([]);
    // Held rows are owner rows whose name does not match what they deliver (listed in legacyReview).
    const held = projected.filter(({ row }) => row.imageHold);
    for (const { row, after } of held) {
      expect(row.source, row.externalKey).toBe('legacy');
      expect(after.imageUrl, row.externalKey).toBeNull();
      expect(plan.report.legacyReview.some((flag) => flag.productId === row.productId && flag.code === 'name_mismatch'), row.externalKey).toBe(true);
    }
    for (const { row, after } of projected.filter(({ row: candidate }) => candidate.action !== 'keep')) {
      expect(after.imageUrl, row.name).toMatch(/^\/images\/catalog\/(ark|legacy)\//);
    }
    if (fs.existsSync(publicDir)) {
      const missing = [...new Set(projected.map(({ after }) => after.imageUrl).filter((url): url is string => Boolean(url)))]
        .filter((url) => !fs.existsSync(path.join(publicDir, ...url.split('/').filter(Boolean))));
      expect(missing).toEqual([]);
    }
  });
});
