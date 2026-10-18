#!/usr/bin/env node
/**
 * Item catalog artwork TOP-UP (ark.wiki.gg -> frontend/public/images/catalog/ark/items).
 *
 * The full products sweep is fetch-artwork-products.mjs (it rewrites item-artwork.json);
 * run this one AFTER it to add whatever the item catalog plan still needs (rows it activates
 * or creates, legacy rows left without an image). Same file naming, manifest keys and
 * attribution section as fetch-artwork-products.mjs.
 *
 * Builds the artwork target list from the item catalog plan (default) or, as in the
 * original artwork run, from a read-only products dump (--products):
 *   (a) every row the plan activates or creates (drafts + wiki items), and
 *   (b) legacy/seed rows that stay on sale without an image, or whose image is a legacy
 *       placeholder shared by several different single-item products,
 * then downloads the item's wiki icon for each one, converts it to webp and MERGES the
 * result into backend/prisma/seed-data/item-artwork.json (existing entries whose file is
 * shipped are kept and not re-fetched; nothing is removed; other top-level fields such as
 * productImages are preserved) and rewrites the item section of
 * frontend/public/images/catalog/ark/ATTRIBUTION.md (between the item-artwork markers).
 *
 * The script never touches the database.
 *
 * Usage (from repo root):
 *   node backend/scripts/item-catalog/fetch-artwork.mjs
 *        [--plan backend/prisma/seed-data/item-catalog-plan.json]
 *        [--products <items.json>]   # array of { id, externalKey, name, isActive, imageUrl, deliveryPayload }
 *        [--cache <dir outside repo>] [--dry-run] [--limit N] [--refetch]
 *
 * Files are named after the item class (primalitemarmor_rexsaddle.webp), like the dino
 * artwork; legacy bundles are named after their externalKey.
 *
 * Politeness: descriptive User-Agent, at most one request every 600 ms; on HTTP 429 the
 * Retry-After value becomes the new minimum interval (adaptive throttle, it only slows down),
 * exponential backoff on 5xx/network errors, every API response and image is cached
 * under --cache (default: <os tmp>/iris-item-artwork-cache) so re-runs hit the wiki only
 * for what is missing.
 *
 * Image choice: the item's wiki icon "File:<Page>.png" (256 px, transparent; the same style
 * as the legacy catalog images), then "File:<Shop name>.png", then the first .png the item
 * page uses whose name contains the page name. Legacy bundles (boss tribute "Item Required"
 * rows) use the boss icon when the arena is known, else the first bundled item's icon.
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

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const flag = (name) => process.argv.includes(name);

const planPath = path.resolve(argument('--plan', path.join(repoRoot, 'backend/prisma/seed-data/item-catalog-plan.json')));
const productsPath = argument('--products');
const refetch = flag('--refetch');
const cacheDir = path.resolve(argument('--cache', path.join(os.tmpdir(), 'iris-item-artwork-cache')));
const dryRun = flag('--dry-run');
const limit = Number(argument('--limit', '0')) || 0;
const assetsDir = path.join(frontendRoot, 'public/images/catalog/ark/items');
const publicPrefix = '/images/catalog/ark/items';
const seedPath = path.join(repoRoot, 'backend/prisma/seed-data/item-artwork.json');
const attributionPath = path.join(frontendRoot, 'public/images/catalog/ark/ATTRIBUTION.md');
// Shared with fetch-artwork-products.mjs: the item section of the attribution file.
const SECTION_START = '<!-- item-artwork:start -->';
const SECTION_END = '<!-- item-artwork:end -->';

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let intervalMs = MIN_INTERVAL_MS;
let throttled = 0;
async function politeFetch(url) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    networkRequests += 1;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' } });
      if (response.ok || response.status === 404) return response;
      if (response.status === 429 && attempt < 30) {
        // Honour Retry-After and keep that pace for the rest of the run.
        const retryAfter = (Number(response.headers.get('retry-after')) || 5) * 1000;
        intervalMs = Math.min(15_000, Math.max(intervalMs, retryAfter));
        throttled += 1;
        if (throttled % 25 === 1) console.log(`HTTP 429: pacing at one request every ${intervalMs} ms`);
        await sleep(retryAfter);
        continue;
      }
      if (attempt >= 5 || (response.status < 500 && response.status !== 429)) throw new Error(`HTTP ${response.status} for ${url}`);
      await sleep(2000 * 2 ** attempt);
    } catch (error) {
      if (attempt >= 5 || /HTTP \d+/.test(String(error?.message))) throw error;
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

async function downloadFile(url, title) {
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const file = path.join(cacheDir, 'files', `${cacheKey(url)}${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`download ${title}: HTTP ${response.status}`);
  await fsp.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** "Blueprint'/Game/A/B.B'" -> "/game/a/b" (package key, same as lib.ts packageKey) */
function packageKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const quoted = value.match(/'([^']+)'/);
  const raw = (quoted ? quoted[1] : value).trim().replace(/^"|"$/g, '');
  if (!raw.startsWith('/')) return null;
  const dot = raw.indexOf('.');
  return (dot >= 0 ? raw.slice(0, dot) : raw).toLowerCase();
}
/** "Blueprint'/Game/A/B.B'" | "/Game/A/B.B_C" -> "/game/a/b.b" (full class path: the manifest key, as in fetch-artwork-products.mjs) */
function blueprintKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const quoted = value.match(/'([^']+)'/);
  const raw = (quoted ? quoted[1] : value).trim().replace(/^"|"$/g, '');
  if (!raw.startsWith('/')) return null;
  return raw.toLowerCase().replace(/_c$/, '');
}
const fileTitle = (name) => `File:${name.replace(/_/g, ' ').replace(/[#<>[\]|{}]/g, '').trim()}`;
const pageFromUrl = (url) => (url ? decodeURIComponent(url.replace(WIKI, '')).replace(/_/g, ' ') : null);
const pageUrl = (page) => WIKI + encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/');
const stripQuantity = (name) => String(name ?? '').replace(/\s*\(\s*[\d,]+\s*x\s*\)\s*$/i, '').trim();
/** "/game/a/primalitem_x.primalitem_x" -> "primalitem_x" (same file names as fetch-artwork-products.mjs) */
const classSlug = (key) => ((key.split('/').pop() ?? key).split('.').pop() ?? key).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
const slugOf = (title) => title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';

/** Arena tribute bundles -> boss icon (wiki file base names). */
const ARENA_BOSS = [
  [/broodmother/i, 'Broodmother Lysrix'], [/dragon arena/i, 'Dragon'], [/megapithecus/i, 'Megapithecus'],
  [/manticore/i, 'Manticore'], [/overseer/i, 'Overseer'], [/rockwell/i, 'Rockwell'], [/king titan/i, 'King Titan'],
  [/desert dome/i, 'Desert Titan'], [/snow dome/i, 'Ice Titan'], [/underforest/i, 'Forest Titan'],
  [/crystal wyvern queen/i, 'Crystal Wyvern Queen'],
];

// ---------------------------------------------------------------------------
// 1. Targets from the plan
// ---------------------------------------------------------------------------
/** --products dump -> minimal plan rows (legacy rows as stored, drafts as rows to activate). */
function rowsFromProducts(products) {
  return products.map((product) => {
    const items = Array.isArray(product.deliveryPayload?.definition?.Items) ? product.deliveryPayload.definition.Items : [];
    const blueprint = items[0]?.Blueprint ?? product.itemBlueprint ?? String(product.externalKey ?? '').replace(/^frozen-reference:/, '');
    const draft = String(product.externalKey ?? '').startsWith('frozen-reference:');
    return {
      productId: product.id,
      externalKey: product.externalKey ?? `product-id:${product.id}`,
      name: product.name,
      displayName: stripQuantity(product.name),
      blueprint,
      entries: Math.max(1, new Set(items.map((item) => packageKey(item.Blueprint))).size),
      action: draft ? 'activate' : (product.isActive ? 'keep' : 'leave_inactive'),
      source: draft ? 'draft' : 'legacy',
      wikiPage: product.deliveryPayload?.review?.source ?? null,
      current: { isActive: product.isActive, imageUrl: product.imageUrl ?? null },
    };
  });
}
function readProducts(file) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  return Array.isArray(raw) ? raw : raw.products;
}
const plan = productsPath
  ? { generatedAt: null, rows: rowsFromProducts(readProducts(productsPath)) }
  : JSON.parse(await fsp.readFile(planPath, 'utf8'));

// Existing manifest (an earlier run): entries whose file is shipped are kept as they are.
const existingSeed = fs.existsSync(seedPath) ? JSON.parse(await fsp.readFile(seedPath, 'utf8')) : null;
const existingEntries = existingSeed?.entries && typeof existingSeed.entries === 'object' && !Array.isArray(existingSeed.entries) ? existingSeed.entries : {};
const shipped = (url) => typeof url === 'string' && url.startsWith('/') && fs.existsSync(path.join(frontendRoot, 'public', ...url.split('/').filter(Boolean)));
const existingByPackage = new Map(Object.keys(existingEntries).filter((key) => key.startsWith('/')).map((key) => [packageKey(key), key]));
const existingKeyFor = (key) => (key.startsWith('/') ? existingByPackage.get(packageKey(key)) ?? null : (existingEntries[key] ? key : null));
const SELLABLE = new Set(['keep', 'activate', 'create']);
const ownerRows = plan.rows.filter((row) => (row.source === 'legacy' || row.source === 'seed') && row.action === 'keep' && row.current?.isActive);

// Legacy images shared by several different single-item products are placeholders.
const singleKeysByImage = new Map();
for (const row of ownerRows) {
  if (!row.current?.imageUrl || row.entries > 1) continue;
  if (!singleKeysByImage.has(row.current.imageUrl)) singleKeysByImage.set(row.current.imageUrl, new Set());
  singleKeysByImage.get(row.current.imageUrl).add(packageKey(row.blueprint));
}
const placeholders = new Set([...singleKeysByImage].filter(([, keys]) => keys.size > 1).map(([url]) => url));

const targets = new Map(); // manifest key -> target
function addTarget(key, patch) {
  const current = targets.get(key) ?? { key, productIds: [], names: [], pages: [], reasons: new Set(), extraTitles: [] };
  if (patch.productId != null && !current.productIds.includes(patch.productId)) current.productIds.push(patch.productId);
  if (patch.name && !current.names.includes(patch.name)) current.names.push(patch.name);
  if (patch.page && !current.pages.includes(patch.page)) current.pages.push(patch.page);
  for (const title of patch.extraTitles ?? []) if (!current.extraTitles.includes(title)) current.extraTitles.push(title);
  if (patch.reason) current.reasons.add(patch.reason);
  targets.set(key, current);
}

for (const row of plan.rows) {
  if (!SELLABLE.has(row.action)) continue;
  const page = pageFromUrl(row.wikiPage);
  if (row.source === 'legacy' || row.source === 'seed') {
    if (row.action !== 'keep' || !row.current?.isActive) continue;
    const placeholder = row.current.imageUrl && placeholders.has(row.current.imageUrl);
    if (row.current.imageUrl && !placeholder) continue;
    const reason = placeholder ? 'shared-legacy-placeholder' : 'missing-image';
    if (row.entries > 1) {
      // A bundle: keyed by its externalKey, boss icon first.
      const boss = ARENA_BOSS.find(([pattern]) => pattern.test(row.name));
      addTarget(row.externalKey, { productId: row.productId, name: row.displayName, page, reason, extraTitles: boss ? [fileTitle(`${boss[1]}.png`)] : [] });
    } else {
      addTarget(blueprintKey(row.blueprint) ?? packageKey(row.blueprint), { productId: row.productId, name: row.displayName, page, reason });
    }
    continue;
  }
  addTarget(blueprintKey(row.blueprint) ?? packageKey(row.blueprint), { name: stripQuantity(row.displayName), page, reason: row.action === 'create' ? 'new-catalog-item' : 'activated-draft' });
}

let reused = 0;
for (const [key, target] of [...targets]) {
  const existingKey = refetch ? null : existingKeyFor(key);
  if (!existingKey || !shipped(existingEntries[existingKey]?.imageUrl)) continue;
  // Keep the earlier entry; only widen its productIds so legacy placeholders stay targeted.
  const entry = existingEntries[existingKey];
  if (target.productIds.length) entry.productIds = [...new Set([...(Array.isArray(entry.productIds) ? entry.productIds : []), ...target.productIds])];
  targets.delete(key);
  reused += 1;
}
let targetList = [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
if (limit) targetList = targetList.slice(0, limit);
console.log(`targets: ${targetList.length} to fetch, ${reused} already in ${path.basename(seedPath)} (placeholder legacy images: ${placeholders.size})`);

// ---------------------------------------------------------------------------
// 2. Candidate files
// ---------------------------------------------------------------------------
function candidatesFor(target) {
  const titles = [...target.extraTitles];
  for (const page of target.pages) {
    titles.push(fileTitle(`${page}.png`));
    const bare = page.replace(/\s*\([^)]*\)\s*$/, '');
    if (bare !== page) titles.push(fileTitle(`${bare}.png`));
  }
  for (const name of target.names) {
    titles.push(fileTitle(`${name}.png`));
    const bare = name.replace(/\s*\([^)]*\)\s*$/, '');
    if (bare !== name) titles.push(fileTitle(`${bare}.png`));
  }
  return [...new Set(titles)];
}

const GENERIC_WORDS = new Set(['style', 'skin', 'saddle', 'recipes', 'costume', 'trophy', 'flag', 'seed', 'egg', 'armor', 'hat', 'head', 'hair', 'facial']);
const normalize = (value) => value.toLowerCase().replace(/^file:/, '').replace(/\.png$/, '').replace(/[^a-z0-9]/g, '');

/** Looser guesses for items whose page has no "<Page>.png" icon (second pass only). */
function fallbackTitles(target) {
  const titles = [];
  for (const raw of [...target.names, ...target.pages]) {
    const name = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    // "Ascendant Flak Armor Set" -> "Flak Armor"; "Dino Easter Chick Hat Skin" -> "Dino Easter Chick Hat"
    const cleaned = name.replace(/^(Ascendant|Mastercraft|Journeyman|Apprentice|Ramshackle|Primitive)\s+/i, '').replace(/\s+(Set|Skin)$/i, '');
    if (cleaned !== name) titles.push(fileTitle(`${cleaned}.png`));
    // "Plant Species R-4 Seed" -> "Plant Species R Seed"
    const unnumbered = name.replace(/-\d+\b/g, '');
    if (unnumbered !== name) titles.push(fileTitle(`${unnumbered}.png`));
    // "Chibi-Fire Wyvern" -> "Chibi-Wyvern": drop one inner word at a time.
    const parts = name.split(/([\s-])/);
    for (let index = 2; index < parts.length - 1; index += 2) {
      titles.push(fileTitle(`${[...parts.slice(0, index), ...parts.slice(index + 2)].join('')}.png`));
    }
    if (/hair ?style$/i.test(name)) titles.push('File:Hairstyle.png');
    // "Small Animal Feces" -> "Feces" (never a generic last word).
    const last = name.split(/\s+/).pop() ?? '';
    if (last.length >= 5 && !GENERIC_WORDS.has(last.toLowerCase()) && last !== name) titles.push(fileTitle(`${last}.png`));
  }
  return [...new Set(titles)];
}

const fileInfo = new Map();
async function lookupFiles(titles) {
  const missing = [...new Set(titles)].filter((title) => !fileInfo.has(title));
  for (let index = 0; index < missing.length; index += 50) {
    const batch = missing.slice(index, index + 50);
    const body = await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(MAX_SIDE), redirects: '1' });
    const redirects = new Map((body.query?.redirects ?? []).map((r) => [r.to, r.from]));
    const normalized = new Map((body.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const title of batch) if (!fileInfo.has(title)) fileInfo.set(title, null);
    for (const page of body.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      let requested = page.title;
      if (redirects.has(requested)) requested = redirects.get(requested);
      if (normalized.has(requested)) requested = normalized.get(requested);
      const value = page.missing || !info ? null : { resolvedTitle: page.title, ...info };
      fileInfo.set(requested, value);
      fileInfo.set(page.title, value);
    }
  }
}

const plans = targetList.map((target) => ({ target, candidates: candidatesFor(target) }));
await lookupFiles(plans.flatMap((row) => row.candidates));

// Second pass for misses: .png files used on the item page whose name contains the page name.
const misses = plans.filter((row) => !row.candidates.some((title) => fileInfo.get(title)));
const pagesForMisses = [...new Set(misses.flatMap((row) => row.target.pages))];
const pageImages = new Map();
for (let index = 0; index < pagesForMisses.length; index += 50) {
  const batch = pagesForMisses.slice(index, index + 50);
  // imlimit is shared by the whole batch: follow imcontinue until every page is complete.
  let imcontinue;
  do {
    const body = await api({ action: 'query', titles: batch.join('|'), prop: 'images', imlimit: 'max', ...(imcontinue ? { imcontinue } : {}) });
    for (const page of body.query?.pages ?? []) {
      pageImages.set(page.title, [...(pageImages.get(page.title) ?? []), ...(page.images ?? []).map((image) => image.title)]);
    }
    imcontinue = body.continue?.imcontinue;
  } while (imcontinue);
}
for (const row of misses) {
  const extra = [];
  // "Atlantis Recipes (Broth of Atlan)": the page shows every variant's icon; pick the one
  // whose name is the variant label.
  for (const name of row.target.names) {
    const variant = name.match(/\(([^)]+)\)\s*$/)?.[1];
    if (!variant) continue;
    for (const page of row.target.pages) {
      for (const title of pageImages.get(page) ?? []) if (normalize(title) === normalize(variant)) extra.push(title);
    }
  }
  for (const page of row.target.pages) {
    const words = page.toLowerCase().replace(/\([^)]*\)/g, '').split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
    for (const title of pageImages.get(page) ?? []) {
      const lower = title.toLowerCase();
      if (!/\.png$/.test(lower) || /dossier|map|screenshot|location|patch|spawn/.test(lower)) continue;
      if (words.length && words.every((word) => lower.includes(word))) extra.push(title);
    }
  }
  row.candidates.push(...extra, ...fallbackTitles(row.target));
}
await lookupFiles(misses.flatMap((row) => row.candidates));
console.log(`file lookups: ${fileInfo.size} titles, ${[...fileInfo.values()].filter(Boolean).length} hits`);

// ---------------------------------------------------------------------------
// 3. Download + convert (one webp per wiki file)
// ---------------------------------------------------------------------------
fs.mkdirSync(assetsDir, { recursive: true });
const outputByFile = new Map(); // resolvedTitle -> { imageUrl, file, fileUrl }
const usedSlugs = new Map();
const entries = {};
const failures = [];
let converted = 0;

for (const { target, candidates } of plans) {
  const chosenTitle = candidates.find((title) => fileInfo.get(title));
  const name = target.names[0] ?? target.key;
  if (!chosenTitle) {
    failures.push({ key: target.key, name, productIds: target.productIds, reason: 'no wiki icon found', tried: candidates });
    continue;
  }
  const info = fileInfo.get(chosenTitle);
  // One file per item class (like the dino artwork); bundles are named after their key.
  const outputKey = `${target.key}|${info.resolvedTitle}`;
  let output = outputByFile.get(outputKey);
  if (!output) {
    let slug = target.key.startsWith('/') ? classSlug(target.key) : slugOf(target.key);
    if (usedSlugs.has(slug) && usedSlugs.get(slug) !== outputKey) slug = `${slug}_${cacheKey(outputKey).slice(0, 6)}`;
    usedSlugs.set(slug, outputKey);
    output = { imageUrl: `${publicPrefix}/${slug}.webp`, file: info.resolvedTitle.replace(/^File:/, ''), fileUrl: info.descriptionurl, outFile: path.join(assetsDir, `${slug}.webp`) };
    if (!dryRun) {
      try {
        const sourceUrl = info.thumburl && info.width > MAX_SIDE ? info.thumburl : info.url;
        const local = await downloadFile(sourceUrl, info.resolvedTitle);
        await sharp(local)
          .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85, alphaQuality: 90, effort: 6 })
          .toFile(output.outFile);
        converted += 1;
      } catch (error) {
        failures.push({ key: target.key, name, productIds: target.productIds, reason: `download/convert failed: ${error.message}` });
        continue;
      }
    }
    outputByFile.set(outputKey, output);
  }
  const page = target.pages[0] ?? null;
  entries[target.key] = {
    imageUrl: output.imageUrl,
    name,
    sourcePage: page ? pageUrl(page) : output.fileUrl,
    file: output.file,
    fileUrl: output.fileUrl,
    reasons: [...target.reasons],
    ...(target.productIds.length ? { productIds: target.productIds } : {}),
  };
}

// ---------------------------------------------------------------------------
// 4. Outputs
// ---------------------------------------------------------------------------
const sortedEntries = Object.fromEntries(Object.entries({ ...existingEntries, ...entries }).sort(([a], [b]) => a.localeCompare(b)));
const stats = {
  targets: plans.length,
  fetchedNow: Object.keys(entries).length,
  keptFromEarlierRun: reused,
  manifestEntries: Object.keys(sortedEntries).length,
  files: outputByFile.size,
  converted,
  failed: failures.length,
  byReason: Object.values(sortedEntries).reduce((counts, entry) => {
    for (const reason of entry.reasons ?? []) counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {}),
};
const topUp = {
  at: new Date().toISOString(),
  generator: 'backend/scripts/item-catalog/fetch-artwork.mjs',
  plan: productsPath ? { products: path.basename(productsPath) } : { path: path.relative(repoRoot, planPath).replace(/\\/g, '/'), generatedAt: plan.generatedAt },
  imagePolicy: `wiki icon File:<Page>.png (else shop name, else a matching .png on the item page; arena bundles use the boss icon); webp q85, max ${MAX_SIDE}px, alpha kept`,
  stats,
};
const seed = {
  source: 'ark.wiki.gg',
  license: 'CC BY-NC-SA 4.0 (wiki) / game art © Studio Wildcard',
  ...(existingSeed && typeof existingSeed === 'object' ? existingSeed : {}),
  generatedAt: existingSeed?.generatedAt ?? topUp.at,
  generator: existingSeed?.generator ?? topUp.generator,
  topUps: [...(Array.isArray(existingSeed?.topUps) ? existingSeed.topUps : []), topUp],
  entries: sortedEntries,
  failures: [...(Array.isArray(existingSeed?.failures) ? existingSeed.failures.filter((failure) => !sortedEntries[failure.key]) : []), ...failures]
    .filter((failure, index, all) => all.findIndex((other) => other.key === failure.key) === index),
};

if (dryRun) {
  console.log(JSON.stringify({ ...stats, networkRequests, failures: failures.map((f) => `${f.name} (${f.key})`) }, null, 2));
  process.exit(0);
}

await fsp.mkdir(path.dirname(seedPath), { recursive: true });
await fsp.writeFile(seedPath, `${JSON.stringify(seed, null, 1)}\n`, 'utf8');

// Same row format as fetch-artwork-products.mjs, rebuilt from the merged manifest.
const esc = (value) => String(value).replace(/\|/g, '\\|');
const rowsByFile = new Map();
for (const entry of Object.values(sortedEntries)) {
  if (!entry?.imageUrl || !entry.file || rowsByFile.has(entry.imageUrl)) continue;
  const sourcePage = entry.sourcePage ?? entry.fileUrl ?? '';
  const source = sourcePage.startsWith(WIKI) ? decodeURIComponent(sourcePage.slice(WIKI.length)) : sourcePage;
  rowsByFile.set(entry.imageUrl, `| \`${path.basename(entry.imageUrl)}\` | ${esc(entry.name ?? '')} | [${esc(entry.file)}](${entry.fileUrl ?? sourcePage}) | [${esc(source)}](${sourcePage}) |`);
}
const attributionRows = [...rowsByFile.values()].sort();
const section = `${SECTION_START}
# ARK item artwork attribution

Files in \`items/\` were downloaded from the [ARK Official Community Wiki](https://ark.wiki.gg/)
by \`backend/scripts/item-catalog/fetch-artwork-products.mjs\` and the plan top-up \`fetch-artwork.mjs\`, and converted to WebP (max ${MAX_SIDE}px, transparency kept).

- Wiki content is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) unless noted on the file page.
- ARK: Survival Evolved item, resource, structure, skin and chibi icons are © Studio Wildcard; used here to identify in-game items.
- Each file was converted (resized / re-encoded) from the original listed below; no other changes.

Generated: ${topUp.at} · ${attributionRows.length} files

| File | Item | Wiki file | Source page |
| --- | --- | --- | --- |
${attributionRows.join('\n')}
${SECTION_END}
`;
let attribution = fs.existsSync(attributionPath) ? await fsp.readFile(attributionPath, 'utf8') : '';
const sectionStart = attribution.indexOf(SECTION_START);
const sectionEnd = attribution.indexOf(SECTION_END);
attribution = sectionStart >= 0 && sectionEnd > sectionStart
  ? attribution.slice(0, sectionStart) + section + attribution.slice(sectionEnd + SECTION_END.length).replace(/^\n/, '')
  : `${attribution.replace(/\s*$/, '')}\n\n${section}`;
await fsp.writeFile(attributionPath, attribution, 'utf8');

let totalBytes = 0;
for (const name of fs.readdirSync(assetsDir)) totalBytes += fs.statSync(path.join(assetsDir, name)).size;
console.log(JSON.stringify({
  ...stats,
  networkRequests,
  assetsDir,
  assetsMB: +(totalBytes / 1024 / 1024).toFixed(2),
  seedPath,
  attributionPath,
  failures: failures.map((f) => `${f.name} (${f.key}): ${f.reason}`),
}, null, 2));
