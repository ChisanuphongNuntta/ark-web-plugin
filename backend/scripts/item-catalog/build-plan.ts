/**
 * Offline item catalog plan builder. Reads a READ-ONLY product export and the
 * ark.wiki.gg snapshot, writes backend/prisma/seed-data/item-catalog-plan.json.
 * Never touches the database or the network.
 *
 *   npx tsx scripts/item-catalog/build-plan.ts \
 *     --products <export-products.ts output> \
 *     [--wiki scripts/item-catalog/data/ark-wiki-items.json] \
 *     [--output prisma/seed-data/item-catalog-plan.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildPlan, type ExportedProduct } from './plan.js';
import type { WikiItem } from './lib.js';

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function main() {
  const productsPath = argument('--products');
  if (!productsPath) throw new Error('--products <export.json> is required (see export-products.ts)');
  const wikiPath = path.resolve(argument('--wiki', 'scripts/item-catalog/data/ark-wiki-items.json')!);
  const output = path.resolve(argument('--output', 'prisma/seed-data/item-catalog-plan.json')!);

  const exported = JSON.parse(fs.readFileSync(path.resolve(productsPath), 'utf8').replace(/^﻿/, ''));
  const products: ExportedProduct[] = Array.isArray(exported) ? exported : exported.products;
  const wiki = JSON.parse(fs.readFileSync(wikiPath, 'utf8')) as { fetchedAt: string; items: WikiItem[] };

  const plan = buildPlan({
    products,
    wiki: wiki.items,
    sources: {
      productsExportedAt: Array.isArray(exported) ? null : exported.exportedAt ?? null,
      wikiFetchedAt: wiki.fetchedAt,
    },
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({
    output,
    counts: plan.counts,
    report: Object.fromEntries(Object.entries(plan.report).map(([key, value]) => [key, value.length])),
    warnings: plan.warnings.length,
    errors: plan.errors.slice(0, 20),
  }, null, 2));
}

main();
