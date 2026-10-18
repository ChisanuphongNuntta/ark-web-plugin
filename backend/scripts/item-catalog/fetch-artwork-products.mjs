#!/usr/bin/env node
/**
 * Item catalog artwork fetcher - full products sweep
 * (ark.wiki.gg -> frontend/public/images/catalog/ark/items).
 *
 * Item counterpart of backend/scripts/dino-catalog/fetch-artwork.mjs, driven by a read-only
 * products dump (the plan-driven top-up lives in fetch-artwork.mjs and merges into the same
 * manifest). Builds the target list from
 *   (a) every product_type='item' product (active or draft) whose imageUrl is empty, points
 *       at a missing file, or is a legacy image shared by several different single-item
 *       blueprints (generic placeholder) - every blueprint inside such a product (bundles
 *       included) is a target, and
 *   (b) every ARK: Survival Evolved item in the wiki Cargo "Items" table that is not yet in
 *       the products table (future catalog rows),
 * then downloads the item's wiki icon, converts it to webp and writes
 *   backend/prisma/seed-data/item-artwork.json and the item section of
 *   frontend/public/images/catalog/ark/ATTRIBUTION.md (between marker comments, so the
 *   creature section written by the dino script is preserved).
 *
 * Manifest keys (all understood by scripts/dino-catalog/lib.ts parseArtworkManifest):
 *   entries['/game/.../primalitemx.primalitemx'] - one per item blueprint (lower-cased path);
 *       productIds = products whose own image this is (single-item products).
 *   entries['arkshop:<key>']                     - legacy bundles (several items), keyed by
 *       externalKey; arena tribute bundles use the boss icon, others the lead item's icon.
 *   productImages['<productId>']                 - every in-scope product -> image (also covers
 *       the few rows without blueprint or externalKey, matched by name).
 *
 * The script never touches the database. Feed it a read-only JSON dump of the item
 * products (array of { id, externalKey, name, isActive, imageUrl, category, deliveryPayload }):
 *
 *   C=$(docker compose ps -q backend)
 *   docker cp export.cjs $C:/tmp/export.cjs   # prisma.product.findMany({ where: { productType: 'item' } })
 *   MSYS_NO_PATHCONV=1 docker exec -w /app -e NODE_PATH=/app/node_modules $C node /tmp/export.cjs > items.json
 *
 * Usage (from repo root):
 *   node backend/scripts/item-catalog/fetch-artwork-products.mjs --products <items.json>
 *        [--cache <dir outside repo>] [--no-wiki-extras] [--dry-run] [--limit N] [--image-interval ms]
 *
 * Politeness: descriptive User-Agent, <= 2 API requests/second (one every 600 ms), image
 * downloads one every 5 s (the image CDN answers bursts with 429 / Retry-After 60),
 * exponential backoff on 429/5xx/network errors (logged); every API response and image is
 * cached under --cache (default: <os tmp>/iris-item-artwork-cache) so re-runs only fetch
 * what is missing.
 *
 * Image choice per blueprint: the wiki page that owns the blueprint (Cargo Items table, else
 * an insource: search for the class on pages whose infobox blueprintpath matches, else the
 * draft's review.source page / the product name), then
 *   1. "File:<Variant>.png" for multi-variant pages ("Alpha Broodmother Trophy"),
 *   2. "File:<Page>.png" (the standard 256 px transparent item icon),
 *   3. "File:<product name>.png" (quality prefix / "Set" stripped for blueprint-less rows),
 *   4. the page infobox images (| image = / | image2 = ...).
 * Files are named after the blueprint class: primalitemresource_polymer_organic.webp.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const frontendRoot = path.join(repoRoot, 'frontend');
// sharp lives in the frontend workspace (backend does not depend on it).
const sharp = createRequire(path.join(frontendRoot, 'package.json'))('sharp');

const API = 'https://ark.wiki.gg/api.php';
const WIKI = 'https://ark.wiki.gg/wiki/';
const USER_AGENT = 'IRIS-Catalog-Artwork/1.0 (IRIS Thailand ARK shop catalog artwork sync; admin@iris-th.cloud) node-fetch';
const MIN_INTERVAL_MS = 600;
const MAX_SIDE = 256;
const QUALITY = 85;
const SECTION_START = '<!-- item-artwork:start -->';
const SECTION_END = '<!-- item-artwork:end -->';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const flag = (name) => process.argv.includes(name);

const productsPath = argument('--products');
if (!productsPath) {
  console.error('Usage: node backend/scripts/item-catalog/fetch-artwork-products.mjs --products <items.json> [--cache dir] [--no-wiki-extras] [--dry-run] [--limit N]');
  process.exit(2);
}
const cacheDir = path.resolve(argument('--cache', path.join(os.tmpdir(), 'iris-item-artwork-cache')));
const dryRun = flag('--dry-run');
const wikiExtras = !flag('--no-wiki-extras');
const limit = Number(argument('--limit', '0')) || 0;
const publicRoot = path.join(frontendRoot, 'public');
const assetsDir = path.join(publicRoot, 'images/catalog/ark/items');
const publicPrefix = '/images/catalog/ark/items';
const seedPath = path.join(repoRoot, 'backend/prisma/seed-data/item-artwork.json');
const attributionPath = path.join(publicRoot, 'images/catalog/ark/ATTRIBUTION.md');

if (cacheDir.toLowerCase().startsWith(repoRoot.toLowerCase())) {
  throw new Error(`--cache must be outside the repository (${cacheDir})`);
}
fs.mkdirSync(path.join(cacheDir, 'api'), { recursive: true });
fs.mkdirSync(path.join(cacheDir, 'files'), { recursive: true });

// ---------------------------------------------------------------------------
// Polite HTTP
// ---------------------------------------------------------------------------
let lastRequestAt = 0;
let networkRequests = 0;
let retries = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function politeFetch(url) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    networkRequests += 1;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(30_000) });
      if (response.ok || response.status === 404) return response;
      if (attempt >= 5 || (response.status < 500 && response.status !== 429)) throw new Error(`HTTP ${response.status} for ${url}`);
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      const backoff = Math.max(retryAfter || 0, 2000 * 2 ** attempt);
      retries += 1;
      console.warn(`  HTTP ${response.status}; retry ${attempt + 1} in ${backoff} ms: ${url.slice(0, 110)}`);
      await sleep(backoff);
    } catch (error) {
      if (attempt >= 5 || /HTTP \d+/.test(String(error?.message))) throw error;
      retries += 1;
      console.warn(`  ${error?.message}; retry ${attempt + 1}: ${url.slice(0, 110)}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
}

const cacheKey = (value) => crypto.createHash('sha1').update(value).digest('hex');

async function api(params) {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const url = `${API}?${query}`;
  const file = path.join(cacheDir, 'api', `${cacheKey(url)}.json`);
  if (fs.existsSync(file)) return JSON.parse(await fsp.readFile(file, 'utf8'));
  const response = await politeFetch(url);
  const body = await response.json();
  if (body.error) throw new Error(`Wiki API error: ${JSON.stringify(body.error)}`);
  await fsp.writeFile(file, JSON.stringify(body));
  return body;
}

async function cargo(table, fields, extra = {}) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const body = await api({ action: 'cargoquery', tables: table, fields, limit: '500', offset: String(offset), ...extra });
    const batch = (body.cargoquery ?? []).map((row) => row.title);
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

// The image CDN (ark.wiki.gg/images) rate-limits harder than the API (429 + Retry-After
// ~60 s after short bursts), so image downloads are paced separately.
const IMAGE_INTERVAL_MS = Number(argument('--image-interval', '5000')) || 5000;
let lastImageAt = 0;

async function downloadFile(url, title) {
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const file = path.join(cacheDir, 'files', `${cacheKey(url)}${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const wait = lastImageAt + IMAGE_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastImageAt = Date.now();
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`download ${title}: HTTP ${response.status}`);
  await fsp.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** "Blueprint'/Game/A/B.B'" | "/Game/A/B.B_C" -> "/game/a/b.b" */
function blueprintKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const quoted = value.match(/'([^']+)'/);
  const raw = (quoted ? quoted[1] : value).trim().replace(/^"|"$/g, '');
  if (!raw.startsWith('/')) return null;
  return raw.toLowerCase().replace(/_c$/, '');
}

const slugify = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
const classSlug = (key) => slugify(key.split('.').pop() ?? key.split('/').pop());

function productBlueprints(product) {
  const keys = [];
  for (const item of product.deliveryPayload?.definition?.Items ?? []) {
    const key = blueprintKey(item?.Blueprint);
    if (key && !keys.includes(key)) keys.push(key);
  }
  const frozen = String(product.externalKey ?? '').match(/^frozen-reference:(.+)$/);
  if (!keys.length && frozen) {
    const key = blueprintKey(frozen[1]);
    if (key) keys.push(key);
  }
  return keys;
}

function reviewPage(product) {
  const source = product.deliveryPayload?.review?.source;
  if (typeof source !== 'string' || !source.startsWith(WIKI)) return null;
  return decodeURIComponent(source.slice(WIKI.length)).replace(/_/g, ' ');
}

/** "Metal Ingot (100x)" / "100x Metal Ingot" / "Metal Ingot x100" -> "Metal Ingot" */
function cleanProductName(name) {
  return String(name ?? '')
    .replace(/\(\s*[\d,]+\s*x?\s*\)|\(\s*x\s*[\d,]+\s*\)/gi, ' ')
    .replace(/^\s*[\d,]+\s*x\s+/i, ' ')
    .replace(/\s+x\s*[\d,]+\s*$/i, ' ')
    .replace(/\s*\((?:Lv|Level)\.?\s*\d+\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fileTitle = (name) => `File:${name.replace(/_/g, ' ').replace(/[#<>[\]|{}]/g, '').replace(/\s+/g, ' ').trim()}`;
const pageUrl = (article) => WIKI + encodeURIComponent(article.replace(/ /g, '_')).replace(/%2F/g, '/');
const isTranslation = (page) => /\/[a-z]{2}(?:-[a-z]+)?$/i.test(page);

/** Item quality prefixes used in shop product names ("Ascendant Longneck Rifle"). */
const QUALITY_PREFIX = /^(?:ascendant|mastercraft|journeyman|apprentice|ramshackle|primitive)\s+/i;
/** Blueprint-less shop products with no wiki page of their own -> closest wiki icon. */
const NAME_ALIASES = {
  'starter kit': ['Storage Box'],
};
/** Wiki pages without an icon file of their own -> visually identical sibling icon. */
const PAGE_ALIASES = {
  'Medium Animal Feces': ['Large Animal Feces', 'Small Animal Feces'],
};
/** Arena tribute bundles -> boss icon (wiki file base names). */
const ARENA_BOSS = [
  [/broodmother/i, 'Broodmother Lysrix'], [/dragon/i, 'Dragon'], [/megapithecus/i, 'Megapithecus'],
  [/manticore/i, 'Manticore'], [/overseer/i, 'Overseer'], [/rockwell/i, 'Rockwell'], [/king titan/i, 'King Titan'],
  [/desert (?:dome|titan)/i, 'Desert Titan'], [/(?:snow dome|ice titan)/i, 'Ice Titan'], [/(?:underforest|forest titan)/i, 'Forest Titan'],
  [/crystal wyvern queen/i, 'Crystal Wyvern Queen'],
];

function nameVariants(name) {
  const out = [name];
  const plain = name.replace(QUALITY_PREFIX, '');
  if (plain !== name) out.push(plain);
  for (const value of [...out]) {
    const set = value.match(/^(.*?)\s+(?:Armor\s+)?Set$/i);
    if (set) out.push(`${set[1]} Chestpiece`, `${set[1]} Shirt`);
  }
  out.push(...(NAME_ALIASES[name.toLowerCase()] ?? []));
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// 1. Products and wiki reference data
// ---------------------------------------------------------------------------
const products = JSON.parse(await fsp.readFile(path.resolve(productsPath), 'utf8'));
console.log(`products: ${products.length} item rows`);

const wikiItems = await cargo('Items', '_pageName=Page,Blueprint,Category', { where: 'Items.Blueprint IS NOT NULL' });
const pageByBlueprint = new Map();
const categoryByBlueprint = new Map();
for (const row of wikiItems) {
  const key = blueprintKey(row.Blueprint);
  if (!key || isTranslation(row.Page)) continue;
  const current = pageByBlueprint.get(key);
  // Several pages may claim one blueprint (e.g. "X" and "X (Primitive Plus)") - keep the shortest.
  if (!current || row.Page.length < current.length) pageByBlueprint.set(key, row.Page);
  categoryByBlueprint.set(key, row.Category);
}
console.log(`wiki: ${wikiItems.length} Items rows, ${pageByBlueprint.size} distinct blueprints`);

// ---------------------------------------------------------------------------
// 2. Targets
// ---------------------------------------------------------------------------
const imageExists = (url) => typeof url === 'string' && url.startsWith('/') && fs.existsSync(path.join(publicRoot, url));

// A legacy image is a generic placeholder when single-item products with different
// blueprints share it.
const blueprintsByImage = new Map();
for (const product of products) {
  const keys = productBlueprints(product);
  if (!product.imageUrl || keys.length !== 1) continue;
  if (!blueprintsByImage.has(product.imageUrl)) blueprintsByImage.set(product.imageUrl, new Set());
  blueprintsByImage.get(product.imageUrl).add(keys[0]);
}
const sharedImages = new Set([...blueprintsByImage].filter(([, keys]) => keys.size > 1).map(([url]) => url));
const legacyImageByBlueprint = new Map();
for (const product of products) {
  const keys = productBlueprints(product);
  if (keys.length === 1 && product.imageUrl && !sharedImages.has(product.imageUrl) && imageExists(product.imageUrl)) {
    if (!legacyImageByBlueprint.has(keys[0])) legacyImageByBlueprint.set(keys[0], product.imageUrl);
  }
}

const targets = new Map(); // blueprintKey | "name:<name>" -> target
function addTarget(key, patch) {
  const current = targets.get(key) ?? { key, blueprint: !key.startsWith('name:'), productIds: [], bundleProductIds: [], names: new Set(), pages: new Set(), reasons: new Set(), active: false, categories: new Set() };
  // productIds = single-item products whose own image this is;
  // bundleProductIds = bundles that merely contain the item.
  if (patch.productId) current.productIds.push(patch.productId);
  if (patch.bundleProductId) current.bundleProductIds.push(patch.bundleProductId);
  if (patch.name) current.names.add(patch.name);
  if (patch.page) current.pages.add(patch.page);
  if (patch.reason) current.reasons.add(patch.reason);
  if (patch.category) current.categories.add(patch.category);
  if (patch.active) current.active = true;
  targets.set(key, current);
}

const productKeys = new Set();
const productPrimary = new Map(); // productId -> target key of its lead item
const scopedProducts = [];
const bundles = []; // legacy multi-item products in scope
for (const product of products) {
  const keys = productBlueprints(product);
  keys.forEach((key) => productKeys.add(key));
  const placeholder = Boolean(product.imageUrl) && sharedImages.has(product.imageUrl);
  const brokenLegacy = Boolean(product.imageUrl) && !placeholder && !imageExists(product.imageUrl);
  if (product.imageUrl && !placeholder && !brokenLegacy) continue;
  scopedProducts.push(product);
  const reason = placeholder ? 'shared-legacy-placeholder' : brokenLegacy ? 'legacy-file-missing' : 'missing-image';
  if (!keys.length) {
    const key = `name:${cleanProductName(product.name).toLowerCase()}`;
    addTarget(key, { productId: product.id, name: cleanProductName(product.name), reason, active: product.isActive, category: product.category });
    productPrimary.set(product.id, key);
    continue;
  }
  if (keys.length > 1 && product.externalKey) bundles.push({ product, keys, reason });
  keys.forEach((key) => addTarget(key, {
    productId: keys.length === 1 ? product.id : null,
    bundleProductId: keys.length > 1 ? product.id : null,
    name: keys.length === 1 ? cleanProductName(product.name) : null,
    page: keys.length === 1 ? reviewPage(product) : null,
    reason: keys.length === 1 ? reason : 'bundle-member',
    active: product.isActive,
    category: product.category,
  }));
  productPrimary.set(product.id, keys[0]);
}

/** ASA-only content (Ascended, Abyss, Dragontopia) and mods / event-only packs are not sold in ASE. */
const NON_ASE_PREFIXES = ['/game/asa/', '/game/abyss/', '/game/dragontopia/', '/game/mods/'];
const isAseOfficialPath = (key) => key.startsWith('/game/') && !NON_ASE_PREFIXES.some((prefix) => key.startsWith(prefix));

let wikiExtraCount = 0;
if (wikiExtras) {
  for (const [key, page] of pageByBlueprint) {
    if (productKeys.has(key) || !isAseOfficialPath(key)) continue;
    addTarget(key, { page, name: page, reason: 'wiki-item-not-in-products', category: categoryByBlueprint.get(key) });
    wikiExtraCount += 1;
  }
}

let targetList = [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
if (limit) targetList = targetList.slice(0, limit);
console.log(`targets: ${targetList.length} (products in scope: ${scopedProducts.length}, bundles: ${bundles.length}, wiki extras: ${wikiExtraCount})`);

// ---------------------------------------------------------------------------
// 3. Resolve candidate files
// ---------------------------------------------------------------------------
for (const target of targetList) {
  const page = target.blueprint ? pageByBlueprint.get(target.key) : null;
  target.page = page ?? [...target.pages][0] ?? null;
}

const fileInfo = new Map();
async function lookupFiles(titles) {
  const unique = [...new Set(titles)].filter((title) => !fileInfo.has(title));
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const body = await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(MAX_SIDE), redirects: '1' });
    // Several requested titles may normalize/redirect to the same file: map target -> all sources.
    const aliases = new Map();
    const link = (to, from) => { if (!aliases.has(to)) aliases.set(to, []); aliases.get(to).push(from); };
    for (const r of body.query?.redirects ?? []) link(r.to, r.from);
    for (const n of body.query?.normalized ?? []) link(n.to, n.from);
    const sourcesOf = (title, seen = new Set()) => {
      if (seen.has(title)) return [];
      seen.add(title);
      return [title, ...(aliases.get(title) ?? []).flatMap((from) => sourcesOf(from, seen))];
    };
    for (const title of batch) fileInfo.set(title, null);
    for (const page of body.query?.pages ?? []) {
      const ii = page.imageinfo?.[0];
      const value = page.missing || !ii ? null : { resolvedTitle: page.title, ...ii };
      for (const title of sourcesOf(page.title)) fileInfo.set(title, value);
    }
  }
}
const hasFile = (title) => Boolean(fileInfo.get(title));

/** page title -> { exists, resolved, images[], blueprint, variants } parsed from the page wikitext infobox */
async function pageInfoboxes(pages) {
  const result = new Map();
  const unique = [...new Set(pages)];
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const body = await api({ action: 'query', titles: batch.join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1' });
    const back = new Map();
    for (const r of body.query?.normalized ?? []) back.set(r.to, r.from);
    for (const r of body.query?.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
    for (const page of body.query?.pages ?? []) {
      const value = { exists: !page.missing, resolved: page.title, images: [], blueprint: null, variants: new Map() };
      if (!page.missing) {
        const text = page.revisions?.[0]?.slots?.main?.content ?? '';
        for (const match of text.matchAll(/\|\s*image\d*\s*=\s*([^\n|}]+)/gi)) {
          const image = match[1].replace(/\[\[|\]\]/g, '').replace(/^(?:File|Image):/i, '').trim();
          if (image && !value.images.includes(image)) value.images.push(image);
        }
        const bp = text.match(/\|\s*blueprintpath\s*=\s*([^\n]+)/i);
        value.blueprint = bp ? blueprintKey(bp[1]) : null;
        // Multi-variant pages: "| blueprintpath Alpha Broodmother Trophy = ..."
        for (const match of text.matchAll(/\|\s*blueprintpath\s+([^=\n]+?)\s*=\s*([^\n]+)/gi)) {
          const key = blueprintKey(match[2]);
          if (key) value.variants.set(key, match[1].trim());
        }
      }
      result.set(page.title, value);
      if (back.has(page.title)) result.set(back.get(page.title), value);
    }
  }
  return result;
}

// Blueprints missing from the Cargo Items table (trophies, artifacts, apex drops...):
// find the page whose infobox blueprintpath is that class via an insource: search.
const orphanTargets = targetList.filter((t) => t.blueprint && !pageByBlueprint.has(t.key));
for (const target of orphanTargets) {
  const cls = target.key.split('.').pop();
  const body = await api({ action: 'query', list: 'search', srsearch: `insource:"${cls}"`, srnamespace: '0', srlimit: '20' });
  const hits = (body.query?.search ?? []).map((hit) => hit.title).filter((title) => !isTranslation(title));
  if (!hits.length) continue;
  const boxes = await pageInfoboxes(hits);
  const owner = hits.find((title) => boxes.get(title)?.blueprint === target.key) ??
    hits.find((title) => boxes.get(title)?.variants.has(target.key));
  if (owner) {
    target.page = owner;
    target.variant = boxes.get(owner).variants.get(target.key) ?? null;
  }
}

for (const target of targetList) {
  target.candidates = [];
  if (target.variant) target.candidates.push({ title: fileTitle(`${target.variant}.png`), kind: 'variant-icon' });
  if (target.page) target.candidates.push({ title: fileTitle(`${target.page}.png`), kind: 'page-icon' });
  for (const alias of PAGE_ALIASES[target.page] ?? []) target.candidates.push({ title: fileTitle(`${alias}.png`), kind: 'alias-icon' });
  for (const name of target.names) {
    for (const variant of nameVariants(name)) {
      const alias = (NAME_ALIASES[name.toLowerCase()] ?? []).includes(variant);
      target.candidates.push({ title: fileTitle(`${variant}.png`), kind: alias ? 'alias-icon' : 'name-icon' });
    }
  }
}
const bossTitles = ARENA_BOSS.map(([, boss]) => fileTitle(`${boss}.png`));
await lookupFiles([...targetList.flatMap((t) => t.candidates.map((c) => c.title)), ...bossTitles]);

// Fallback: images listed in the infobox of the owning page (image, image2, ...),
// or of a page named after the product.
const needInfobox = targetList.filter((t) => !t.candidates.some((c) => hasFile(c.title)));
const infoboxPagesFor = (t) => [...new Set([t.page, ...[...t.names].flatMap(nameVariants)].filter(Boolean))];
const infobox = await pageInfoboxes(needInfobox.flatMap(infoboxPagesFor));
for (const target of needInfobox) {
  for (const page of infoboxPagesFor(target)) {
    const box = infobox.get(page);
    if (!box?.exists) continue;
    if (!target.page) target.page = box.resolved;
    for (const image of box.images) target.candidates.push({ title: fileTitle(image), kind: 'infobox-image' });
    if (box.resolved && box.resolved !== page) target.candidates.push({ title: fileTitle(`${box.resolved}.png`), kind: 'redirect-icon' });
  }
}
await lookupFiles(needInfobox.flatMap((t) => t.candidates.map((c) => c.title)));
console.log(`file lookups: ${[...fileInfo.values()].filter(Boolean).length} hits; insource search for ${orphanTargets.length} orphan blueprints; infobox fallback for ${needInfobox.length} targets`);

// ---------------------------------------------------------------------------
// 4. Download + convert
// ---------------------------------------------------------------------------
fs.mkdirSync(assetsDir, { recursive: true });
const usedSlugs = new Map();
const entries = {};
const failures = [];
const stats = { downloaded: 0, reusedLegacy: 0, byKind: {} };
const written = new Set();

async function convert(info, slug) {
  if (dryRun) return;
  const outFile = path.join(assetsDir, `${slug}.webp`);
  const sourceUrl = info.thumburl && info.width > MAX_SIDE ? info.thumburl : info.url;
  const local = await downloadFile(sourceUrl, info.resolvedTitle);
  await sharp(local)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
    .toFile(outFile);
  written.add(`${slug}.webp`);
}

function claimSlug(slug, owner) {
  let value = slug;
  if (usedSlugs.has(value) && usedSlugs.get(value) !== owner) value = `${value}_${cacheKey(owner).slice(0, 6)}`;
  usedSlugs.set(value, owner);
  return value;
}

let processed = 0;
for (const target of targetList) {
  processed += 1;
  if (processed % 100 === 0) console.log(`  ${processed}/${targetList.length} (downloaded ${stats.downloaded}, requests ${networkRequests}, retries ${retries})`);
  const displayName = target.variant ?? target.page ?? [...target.names][0] ?? target.key;
  const base = {
    name: displayName,
    category: categoryByBlueprint.get(target.key) ?? [...target.categories][0] ?? null,
    sourcePage: target.page ? pageUrl(target.page) : null,
    reasons: [...target.reasons],
    productIds: target.productIds,
    ...(target.bundleProductIds.length ? { bundleProductIds: target.bundleProductIds } : {}),
    inProducts: target.productIds.length + target.bundleProductIds.length > 0,
    active: target.active,
  };

  const legacy = legacyImageByBlueprint.get(target.key);
  if (legacy) {
    entries[target.key] = { imageUrl: legacy, ...base, file: null, reused: 'legacy' };
    stats.reusedLegacy += 1;
    continue;
  }

  const chosen = target.candidates.find((candidate) => hasFile(candidate.title));
  if (!chosen) {
    failures.push({
      key: target.key,
      name: displayName,
      productIds: target.productIds,
      active: target.active,
      reason: target.page ? `no icon file found for wiki page ${target.page}` : target.blueprint ? 'blueprint not on ark.wiki.gg (mod/removed?) and no file for product name' : 'product has no blueprint; no wiki file for product name',
      tried: target.candidates.map((c) => c.title),
    });
    continue;
  }
  const info = fileInfo.get(chosen.title);
  const slug = claimSlug(target.blueprint ? classSlug(target.key) : `name_${slugify(target.key.slice(5))}`, target.key);
  try {
    await convert(info, slug);
  } catch (error) {
    failures.push({ key: target.key, name: displayName, productIds: target.productIds, active: target.active, reason: `download/convert failed: ${error.message}` });
    continue;
  }
  entries[target.key] = {
    imageUrl: `${publicPrefix}/${slug}.webp`,
    ...base,
    sourcePage: base.sourcePage ?? info.descriptionurl,
    file: info.resolvedTitle.replace(/^File:/, ''),
    fileUrl: info.descriptionurl,
    kind: chosen.kind,
  };
  if (!dryRun) stats.downloaded += 1;
  stats.byKind[chosen.kind] = (stats.byKind[chosen.kind] ?? 0) + 1;
}

// Legacy bundles keyed by externalKey: boss icon for arena tributes, else the lead item.
for (const { product, keys, reason } of bundles) {
  const boss = ARENA_BOSS.find(([pattern]) => pattern.test(product.name));
  const bossInfo = boss ? fileInfo.get(fileTitle(`${boss[1]}.png`)) : null;
  const common = { name: product.name, reasons: [reason, 'bundle'], productIds: [product.id], inProducts: true, active: product.isActive, members: keys };
  if (bossInfo) {
    const slug = claimSlug(`boss_${slugify(boss[1])}`, `boss:${boss[1]}`);
    try {
      if (!written.has(`${slug}.webp`)) await convert(bossInfo, slug);
      entries[product.externalKey] = {
        imageUrl: `${publicPrefix}/${slug}.webp`, ...common,
        sourcePage: pageUrl(boss[1]), file: bossInfo.resolvedTitle.replace(/^File:/, ''), fileUrl: bossInfo.descriptionurl, kind: 'boss-icon',
      };
      stats.byKind['boss-icon'] = (stats.byKind['boss-icon'] ?? 0) + 1;
      continue;
    } catch (error) {
      console.warn(`  boss icon for ${product.name} failed: ${error.message}`);
    }
  }
  const lead = keys.map((key) => entries[key]).find(Boolean);
  if (lead) {
    entries[product.externalKey] = { imageUrl: lead.imageUrl, ...common, sourcePage: lead.sourcePage, file: lead.file, fileUrl: lead.fileUrl, kind: 'bundle-lead-item' };
    stats.byKind['bundle-lead-item'] = (stats.byKind['bundle-lead-item'] ?? 0) + 1;
  } else {
    failures.push({ key: product.externalKey, name: product.name, productIds: [product.id], active: product.isActive, reason: 'no member of the bundle has an icon' });
  }
}

// Product -> image for every in-scope product.
const productImages = {};
for (const product of scopedProducts) {
  const entry = (product.externalKey && entries[product.externalKey]) ??
    entries[productPrimary.get(product.id)] ??
    productBlueprints(product).map((key) => entries[key]).find(Boolean);
  if (entry) productImages[product.id] = { imageUrl: entry.imageUrl, name: product.name, active: product.isActive };
}

// ---------------------------------------------------------------------------
// 5. Outputs
// ---------------------------------------------------------------------------
const sortedEntries = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
const productStats = (filter) => {
  const rows = scopedProducts.filter(filter);
  return { total: rows.length, withImage: rows.filter((p) => productImages[p.id]).length };
};
const seed = {
  source: 'ark.wiki.gg',
  license: 'CC BY-NC-SA 4.0 (wiki) / game art © Studio Wildcard',
  generatedAt: new Date().toISOString(),
  generator: 'backend/scripts/item-catalog/fetch-artwork-products.mjs',
  imagePolicy: `wiki item icon (variant / File:<Page>.png / product name / infobox image); arena bundles use the boss icon; webp q${QUALITY}, max ${MAX_SIDE}px, alpha kept; legacy image reused when the same blueprint already has a unique one`,
  stats: {
    targets: targetList.length,
    withImage: Object.keys(entries).length,
    downloaded: stats.downloaded,
    reusedLegacy: stats.reusedLegacy,
    bundles: bundles.length,
    byKind: stats.byKind,
    failed: failures.length,
    products: {
      inScope: productStats(() => true),
      active: productStats((p) => p.isActive),
      drafts: productStats((p) => !p.isActive),
    },
    wikiExtras: wikiExtraCount,
  },
  entries: sortedEntries,
  productImages,
  failures,
};

if (dryRun) {
  console.log(JSON.stringify({ ...seed.stats, networkRequests, failures: failures.map((f) => `${f.name} (${f.key})${f.active ? ' [ACTIVE]' : ''}: ${f.reason}`) }, null, 2));
  process.exit(0);
}

await fsp.mkdir(path.dirname(seedPath), { recursive: true });
await fsp.writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

const esc = (value) => String(value).replace(/\|/g, '\\|');
const rowsByFile = new Map();
for (const entry of Object.values(sortedEntries)) {
  if (!entry.file || rowsByFile.has(entry.imageUrl)) continue;
  const source = entry.sourcePage.startsWith(WIKI) ? decodeURIComponent(entry.sourcePage.slice(WIKI.length)) : entry.sourcePage;
  rowsByFile.set(entry.imageUrl, `| \`${path.basename(entry.imageUrl)}\` | ${esc(entry.name)} | [${esc(entry.file)}](${entry.fileUrl ?? entry.sourcePage}) | [${esc(source)}](${entry.sourcePage}) |`);
}
const attributionRows = [...rowsByFile.values()].sort();
const section = `${SECTION_START}
# ARK item artwork attribution

Files in \`items/\` were downloaded from the [ARK Official Community Wiki](https://ark.wiki.gg/)
by \`backend/scripts/item-catalog/fetch-artwork-products.mjs\` and converted to WebP (max ${MAX_SIDE}px, quality ${QUALITY}, transparency kept).

- Wiki content is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) unless noted on the file page.
- ARK: Survival Evolved item, resource, structure, skin and chibi icons are © Studio Wildcard; used here to identify in-game items.
- Each file was converted (resized / re-encoded) from the original listed below; no other changes.

Generated: ${seed.generatedAt} · ${attributionRows.length} files

| File | Item | Wiki file | Source page |
| --- | --- | --- | --- |
${attributionRows.join('\n')}
${SECTION_END}
`;
let attribution = fs.existsSync(attributionPath) ? await fsp.readFile(attributionPath, 'utf8') : '';
const start = attribution.indexOf(SECTION_START);
const end = attribution.indexOf(SECTION_END);
if (start >= 0 && end > start) {
  attribution = attribution.slice(0, start) + section + attribution.slice(end + SECTION_END.length).replace(/^\n/, '');
} else {
  attribution = `${attribution.replace(/\s*$/, '')}\n\n${section}`;
}
await fsp.writeFile(attributionPath, attribution, 'utf8');

let totalBytes = 0;
const assetFiles = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.webp'));
for (const name of assetFiles) totalBytes += fs.statSync(path.join(assetsDir, name)).size;
const referenced = new Set(Object.values(sortedEntries).map((entry) => path.basename(entry.imageUrl)));
console.log(JSON.stringify({
  ...seed.stats,
  networkRequests,
  retries,
  assetFiles: assetFiles.length,
  unreferencedFiles: assetFiles.filter((name) => !referenced.has(name)),
  assetsMB: +(totalBytes / 1024 / 1024).toFixed(2),
  seedPath,
  attributionPath,
  failures: failures.map((f) => `${f.name} (${f.key})${f.active ? ' [ACTIVE]' : ''}: ${f.reason}`),
}, null, 2));
