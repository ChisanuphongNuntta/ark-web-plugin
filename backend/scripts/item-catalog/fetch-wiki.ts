/**
 * Snapshot ark.wiki.gg item data used to classify shop items.
 * Network read only; writes a JSON snapshot.
 *
 *   npx tsx scripts/item-catalog/fetch-wiki.ts [--output scripts/item-catalog/data/ark-wiki-items.json]
 *
 * Sources:
 *  - Cargo table Items (_pageName, ID, Blueprint, Category, stackSize);
 *  - page categories of every item page (games / DLC / map / mod / event signals:
 *    "ARK: Survival Ascended", "Originating from Mods", "Aberration", "Ragnarok", ...).
 * The Items table has no "InGames" column, so ASA-only content is recognised by its
 * /Game/ASA/ blueprint path or the "ARK: Survival Ascended" page category.
 *
 * Facts only (names, blueprint paths, stack sizes, category names). No wiki media is copied here.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { WikiItem } from './lib.js';

const API = 'https://ark.wiki.gg/api.php';
const USER_AGENT = 'IRIS-Catalog-Audit/1.0 (admin@iris-th.cloud)';
const MIN_INTERVAL_MS = 400;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

let lastRequestAt = 0;
async function politeJson(params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({ format: 'json', ...params });
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(`${API}?${query}`, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) {
      const body = await response.json() as { error?: unknown };
      if (body.error) throw new Error(`ark.wiki.gg error ${JSON.stringify(body.error).slice(0, 200)}`);
      return body;
    }
    if (attempt >= 4 || (response.status < 500 && response.status !== 429)) throw new Error(`ark.wiki.gg HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
}

async function cargo(tables: string, fields: string): Promise<Array<Record<string, string>>> {
  const rows: Array<Record<string, string>> = [];
  for (let offset = 0; ; offset += 500) {
    const body = await politeJson({ action: 'cargoquery', tables, fields, limit: '500', offset: String(offset) });
    const batch = (body.cargoquery ?? []).map((row: { title: Record<string, string> }) => row.title);
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

/** Wiki maintenance categories that carry no catalog signal. */
const NOISE_CATEGORY = /^(Missing .* translation|Pages (using|with) |Crafted (in|with) |Articles |Stubs?$|Templates?)/;

async function pageCategories(titles: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (let index = 0; index < titles.length; index += 50) {
    const batch = titles.slice(index, index + 50);
    let clcontinue: string | undefined;
    do {
      const body = await politeJson({
        action: 'query', formatversion: '2', titles: batch.join('|'), prop: 'categories', cllimit: 'max',
        ...(clcontinue ? { clcontinue } : {}),
      });
      const normalized = new Map<string, string>((body.query?.normalized ?? []).map((entry: { from: string; to: string }) => [entry.to, entry.from]));
      for (const page of body.query?.pages ?? []) {
        const title = normalized.get(page.title) ?? page.title;
        const categories = (page.categories ?? [])
          .map((category: { title: string }) => category.title.replace(/^Category:/, ''))
          .filter((category: string) => !NOISE_CATEGORY.test(category));
        result.set(title, [...(result.get(title) ?? []), ...categories]);
      }
      clcontinue = body.continue?.clcontinue;
    } while (clcontinue);
  }
  return result;
}

async function main() {
  const output = path.resolve(argument('--output', 'scripts/item-catalog/data/ark-wiki-items.json'));
  const items = await cargo('Items', '_pageName,ID,Blueprint,Category,stackSize');
  const pages = [...new Set(items.map((item) => item._pageName).filter(Boolean))].sort();
  const categories = await pageCategories(pages);

  const rows: WikiItem[] = items.map((item) => {
    const stack = Number(item.stackSize);
    return {
      page: item._pageName,
      name: item._pageName.replace(/^Mobile:/, ''),
      id: item.ID || null,
      blueprint: (item.Blueprint || '').replace(/^"+|"+$/g, ''),
      category: item.Category || '',
      stackSize: Number.isFinite(stack) && stack > 0 ? stack : null,
      isMobile: item._pageName.startsWith('Mobile:'),
      pageCategories: [...new Set(categories.get(item._pageName) ?? [])].sort(),
    };
  });
  rows.sort((a, b) => a.page.localeCompare(b.page) || a.blueprint.localeCompare(b.blueprint));
  const snapshot = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: `${API} (Cargo: Items; page categories)`,
    license: 'ark.wiki.gg content CC BY-NC-SA 4.0; factual fields only',
    counts: { items: items.length, pages: pages.length, withBlueprint: rows.filter((row) => row.blueprint).length },
    items: rows,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({ output, ...snapshot.counts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
