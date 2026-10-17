/**
 * Apply backend/prisma/seed-data/dino-catalog-plan.json to the products table.
 *
 *   npx tsx scripts/dino-catalog/apply-plan.ts                 # dry run (default, read-only)
 *   npx tsx scripts/dino-catalog/apply-plan.ts --apply         # write, one transaction
 *     [--plan prisma/seed-data/dino-catalog-plan.json]
 *     [--artwork prisma/seed-data/dino-artwork.json]          # optional; missing file is fine
 *     [--public-dir ../frontend/public]                       # checks every imageUrl file exists (default when present)
 *     [--image-list <file>]                                   # alternative: newline list of shipped "/images/..." URLs
 *     [--skip-image-file-check]                               # --apply without any image file check (not recommended)
 *     [--allow-drift]                                         # --apply even though target rows changed since the plan
 *     [--actor "admin@example"]                               # AuditLog userEmail
 *     [--json]                                                # machine-readable summary
 *
 * Running against production (Postgres is only reachable from the backend container).
 * lib.ts imports ../../src/services/dinoCatalogDelivery.ts, and the prod image ships
 * dist/ only, so stage the sources with the same layout and run tsx from there:
 *   <stage>/scripts/dino-catalog/*.ts
 *   <stage>/src/services/dinoCatalogDelivery.ts
 *   <stage>/prisma/seed-data/{dino-catalog-plan,dino-artwork}.json
 *   docker cp <stage>/. $C:/tmp/dino-catalog-v2/
 *   docker exec $C sh -c 'cd /tmp/dino-catalog-v2 && ln -sf /app/node_modules node_modules \
 *     && /app/node_modules/.bin/tsx scripts/dino-catalog/apply-plan.ts --dry-run --image-list image-files.txt'
 * The container has no frontend/public, so stage image-files.txt (one "/images/catalog/..."
 * URL per shipped file, e.g. from `find frontend/public/images/catalog -type f`).
 *
 * Guarantees:
 *  - dry run unless --apply is given; the dry run only issues SELECTs;
 *  - only product_type='dino' rows are read or written (every update is guarded by
 *    productType='dino'; a plan row pointing at anything else aborts the run);
 *  - never deletes; "deactivate" only sets isActive=false;
 *  - idempotent: rows already in the planned state are no-ops, so a second run writes nothing;
 *  - all writes + one AuditLog row per changed product + one summary AuditLog row
 *    commit in a single transaction (all or nothing);
 *  - every product that is active after the run must pass the real backend dino
 *    delivery builder (src/services/dinoCatalogDelivery.ts, used by checkout and the
 *    game shop) and the HeartShop.cpp payload guards, otherwise nothing is written;
 *  - activated/created rows take their image from the artwork manifest; legacy rows
 *    only when they have none or the manifest targets their product id. The summary
 *    lists every product that will be active without an image;
 *  - --apply refuses (summary.applyBlockers, also shown by the dry run) when: a target
 *    row changed since the plan was built (unless --allow-drift); an activated/created
 *    row would have no image; an imageUrl points at a missing file; or the image files
 *    could not be checked at all (unless --skip-image-file-check);
 *  - every update is guarded by the snapshot it was computed from (isActive, price,
 *    updatedAt), so a concurrent admin edit rolls the whole transaction back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { GROUP_CATEGORY, parseArtworkManifest, type ArtworkIndex } from './lib.js';
import type { Plan, PlanRow } from './plan.js';
import { computeChange, projectedProduct, verifyDeliverable, type Change, type DbProduct } from './apply-core.js';

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[index + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(name);

const PRODUCT_SELECT = {
  id: true, name: true, description: true, price: true, productType: true, externalKey: true,
  deliveryPayload: true, requiredCapabilities: true, itemBlueprint: true, imageUrl: true,
  isActive: true, sortOrder: true, categoryId: true, updatedAt: true,
} as const;

function loadArtwork(file: string): { index: ArtworkIndex | null; note: string } {
  if (!fs.existsSync(file)) return { index: null, note: `artwork manifest not found (${file}); imageUrl left unchanged` };
  try {
    const index = parseArtworkManifest(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
    return { index, note: `artwork manifest ${file}: ${index.byPackage.size} blueprints, ${index.byExternalKey.size} external keys` };
  } catch (error) {
    return { index: null, note: `artwork manifest unreadable (${error instanceof Error ? error.message : error}); imageUrl left unchanged` };
  }
}

type ImageFileCheck = { checked: boolean; source: string | null; missing: string[]; note?: string };

/**
 * Check every "/images/..." URL against a public dir or a staged list of shipped URLs.
 * checked=false when neither is available (the backend container has no frontend/public).
 */
function missingImageFiles(source: { publicDir?: string; imageList?: string }, urls: string[]): ImageFileCheck {
  const unique = [...new Set(urls)].filter((url) => url.startsWith('/'));
  if (source.imageList) {
    if (!fs.existsSync(source.imageList)) throw new Error(`--image-list ${source.imageList} not found`);
    const shipped = new Set(fs.readFileSync(source.imageList, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .map((line) => (line.startsWith('/') ? line : `/${line}`)));
    return { checked: true, source: `list ${source.imageList} (${shipped.size} files)`, missing: unique.filter((url) => !shipped.has(url)) };
  }
  if (!source.publicDir || !fs.existsSync(source.publicDir)) {
    return { checked: false, source: null, missing: [], note: `public dir ${source.publicDir ?? '(none)'} not found; pass --public-dir or --image-list` };
  }
  const missing = unique.filter((url) => !fs.existsSync(path.join(source.publicDir!, ...url.split('/').filter(Boolean))));
  return { checked: true, source: `dir ${source.publicDir}`, missing };
}

async function main() {
  const apply = flag('--apply');
  if (apply && flag('--dry-run')) throw new Error('pass either --apply or --dry-run, not both');
  const planPath = path.resolve(argument('--plan', 'prisma/seed-data/dino-catalog-plan.json')!);
  const artworkPath = path.resolve(argument('--artwork', 'prisma/seed-data/dino-artwork.json')!);
  const actor = argument('--actor', 'system:dino-catalog-apply')!;
  const publicDirArg = argument('--public-dir');
  const publicDir = publicDirArg ? path.resolve(publicDirArg) : path.resolve('../frontend/public');
  if (publicDirArg && !fs.existsSync(publicDir)) throw new Error(`--public-dir ${publicDir} not found`);
  const imageListArg = argument('--image-list');
  const imageList = imageListArg ? path.resolve(imageListArg) : undefined;
  const allowDrift = flag('--allow-drift');
  const skipImageFileCheck = flag('--skip-image-file-check');

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
  if (plan.schemaVersion !== 1 || !Array.isArray(plan.rows)) throw new Error(`unsupported plan file ${planPath}`);
  if (plan.errors?.length) throw new Error(`plan has ${plan.errors.length} errors; rebuild it first`);
  const artwork = loadArtwork(artworkPath);

  const prisma = new PrismaClient();
  try {
    const categories = await prisma.category.findMany({ where: { name: { in: Object.values(GROUP_CATEGORY) } }, select: { id: true, name: true } });
    const categoryIds = Object.fromEntries(categories.map((category) => [category.name, category.id]));
    const missingCategories = Object.values(GROUP_CATEGORY).filter((name) => !categoryIds[name]);
    const neededCategories = new Set(plan.rows.filter((row) => row.action === 'activate' || row.action === 'create').map((row) => row.categoryName));
    const blocking = missingCategories.filter((name) => neededCategories.has(name));
    if (blocking.length) throw new Error(`missing categories: ${blocking.join(', ')}`);

    const products = (await prisma.product.findMany({ where: { productType: 'dino' }, select: PRODUCT_SELECT })) as DbProduct[];
    const byId = new Map(products.map((product) => [product.id, product]));
    const byKey = new Map(products.filter((product) => product.externalKey).map((product) => [product.externalKey!, product]));
    // A create row's key must not belong to a non-dino product.
    const createKeys = plan.rows.filter((row) => row.action === 'create' && !byKey.has(row.externalKey)).map((row) => row.externalKey);
    if (createKeys.length) {
      const clash = await prisma.product.findMany({ where: { externalKey: { in: createKeys } }, select: { id: true, externalKey: true, productType: true } });
      if (clash.length) throw new Error(`externalKey already used by non-dino products: ${clash.map((row) => `${row.id}:${row.externalKey}`).join(', ')}`);
    }

    const ctx = { planGeneratedAt: plan.generatedAt, categoryIds, artwork: artwork.index, reviewedAt: new Date().toISOString() };
    const changes: Array<{ row: PlanRow; change: Change; current: DbProduct | null }> = [];
    const drift: string[] = [];
    for (const row of plan.rows) {
      const current = (row.productId != null ? byId.get(row.productId) : undefined) ?? byKey.get(row.externalKey) ?? null;
      const change = computeChange(row, current, ctx);
      // A row already in its planned state (e.g. a re-run after apply) is not drift.
      if (current && row.current && change.kind !== 'noop'
        && (current.price !== row.current.price || current.isActive !== row.current.isActive || current.name !== row.current.name)) {
        const renamed = current.name !== row.current.name ? `, name "${row.current.name}"->"${current.name}"` : '';
        drift.push(`${row.externalKey} (#${current.id}): changed since plan (price ${row.current.price}->${current.price}, active ${row.current.isActive}->${current.isActive}${renamed})`);
      }
      changes.push({ row, change, current });
    }

    // Post-apply deliverability check over every dino product that will be active.
    const projected = new Map<number | string, DbProduct>(products.map((product) => [product.id, product]));
    for (const { change, current } of changes) {
      if (change.kind === 'skip') continue;
      projected.set(current?.id ?? change.externalKey, projectedProduct(current, change));
    }
    const undeliverable: string[] = [];
    for (const product of projected.values()) {
      const error = verifyDeliverable(product);
      if (error) undeliverable.push(`${product.externalKey ?? product.id} "${product.name}": ${error}`);
    }

    const activeAfter = [...projected.values()].filter((product) => product.isActive);
    const activeWithoutImage = activeAfter.filter((product) => !product.imageUrl).map((product) => `${product.externalKey ?? product.id} "${product.name}"`);
    const imageCheck = missingImageFiles({ publicDir, imageList }, activeAfter.map((product) => product.imageUrl).filter((url): url is string => Boolean(url)));
    const imageNotes = changes.flatMap(({ change }) => change.notes.filter((note) => note.startsWith('kept existing image')));
    const newRowsWithoutImage = changes
      .filter(({ change }) => (change.action === 'activate' || change.action === 'create') && change.kind !== 'skip')
      .filter(({ change, current }) => !projectedProduct(current, change).imageUrl)
      .map(({ change }) => change.externalKey);

    const summary = {
      mode: apply ? 'apply' : 'dry-run',
      plan: { path: planPath, generatedAt: plan.generatedAt, rows: plan.rows.length, counts: plan.counts.byAction },
      artwork: artwork.note,
      db: { dinoProducts: products.length, activeBefore: products.filter((product) => product.isActive).length },
      writes: {} as Record<string, number>,
      byActionAndKind: {} as Record<string, number>,
      imageUrlUpdates: 0,
      images: {
        activeAfterWithImage: activeAfter.length - activeWithoutImage.length,
        activeAfterWithoutImage: activeWithoutImage,
        activatedOrCreatedWithoutImage: newRowsWithoutImage,
        legacyImagesKept: imageNotes.length,
        files: imageCheck.checked
          ? { checkedIn: imageCheck.source, missing: imageCheck.missing }
          : { checkedIn: null, note: imageCheck.note },
      },
      activeAfter: activeAfter.length,
      deliveryChecked: activeAfter.length,
      undeliverable,
      drift,
      applyBlockers: [] as string[],
      notes: changes.flatMap(({ change }) => change.notes.map((note) => `${change.externalKey}: ${note}`)),
    };
    for (const { change } of changes) {
      summary.writes[change.kind] = (summary.writes[change.kind] ?? 0) + 1;
      const key = `${change.action}:${change.kind}`;
      summary.byActionAndKind[key] = (summary.byActionAndKind[key] ?? 0) + 1;
      if (change.kind !== 'noop' && change.kind !== 'skip' && change.data.imageUrl) summary.imageUrlUpdates += 1;
    }

    if (drift.length && !allowDrift) summary.applyBlockers.push(`${drift.length} target rows changed since the plan was built (see drift); rebuild the plan or pass --allow-drift`);
    if (newRowsWithoutImage.length) summary.applyBlockers.push(`${newRowsWithoutImage.length} activated/created rows would have no image`);
    if (imageCheck.missing.length) summary.applyBlockers.push(`${imageCheck.missing.length} imageUrls point at files that are not shipped`);
    if (!imageCheck.checked && !skipImageFileCheck) summary.applyBlockers.push('image files were not checked; pass --public-dir or --image-list (or --skip-image-file-check)');

    if (undeliverable.length) {
      console.log(JSON.stringify(summary, null, 2));
      throw new Error(`${undeliverable.length} products would be active but undeliverable; nothing written`);
    }

    const pending = changes.filter(({ change }) => change.kind === 'update' || change.kind === 'create');
    if (!apply) {
      console.log(JSON.stringify({ ...summary, pendingWrites: pending.length, hint: pending.length ? 'run with --apply to write' : 'nothing to do' }, null, 2));
      return;
    }
    if (pending.length === 0) {
      console.log(JSON.stringify({ ...summary, pendingWrites: 0, result: 'already applied, nothing written' }, null, 2));
      return;
    }
    if (summary.applyBlockers.length) {
      console.log(JSON.stringify({ ...summary, pendingWrites: pending.length }, null, 2));
      throw new Error(`refusing to apply: ${summary.applyBlockers.join('; ')}; nothing written`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const audit: Array<Record<string, unknown>> = [];
      let created = 0;
      let updated = 0;
      for (const { change, current } of pending) {
        let productId = change.productId;
        if (change.kind === 'create') {
          const row = await tx.product.create({ data: change.data as any, select: { id: true } });
          productId = row.id;
          created += 1;
        } else {
          // Optimistic guard: the row must still be exactly the snapshot this change was computed from.
          if (!current) throw new Error(`update of product ${change.productId} has no snapshot`);
          const { count } = await tx.product.updateMany({
            where: {
              id: change.productId!, productType: 'dino', isActive: current.isActive, price: current.price,
              ...(current.updatedAt ? { updatedAt: current.updatedAt } : {}),
            },
            data: change.data as any,
          });
          if (count !== 1) throw new Error(`product ${change.productId} changed during apply (matched ${count} rows); transaction rolled back, nothing written`);
          updated += 1;
        }
        audit.push({
          userEmail: actor,
          action: `catalog.dino.${change.action}`,
          resource: 'product',
          resourceId: String(productId),
          oldValue: change.kind === 'create' ? null : JSON.stringify(change.before),
          newValue: JSON.stringify(change.after),
          metadata: JSON.stringify({ externalKey: change.externalKey, plan: plan.generatedAt, script: 'scripts/dino-catalog/apply-plan.ts' }),
          status: 'success',
        });
      }
      audit.push({
        userEmail: actor,
        action: 'catalog.dino.plan_applied',
        resource: 'product',
        resourceId: null,
        newValue: JSON.stringify({ created, updated, byActionAndKind: summary.byActionAndKind }),
        metadata: JSON.stringify({ plan: planPath, generatedAt: plan.generatedAt, artwork: artwork.note }),
        status: 'success',
      });
      await tx.auditLog.createMany({ data: audit as any });
      return { created, updated, auditRows: audit.length };
    }, { timeout: 120_000, maxWait: 10_000 });

    console.log(JSON.stringify({ ...summary, result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
