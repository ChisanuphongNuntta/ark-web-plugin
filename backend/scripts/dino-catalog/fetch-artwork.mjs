#!/usr/bin/env node
/**
 * Dino catalog artwork fetcher (ark.wiki.gg -> frontend/public/images/catalog/ark/dinos).
 *
 * Builds the artwork target list from
 *   (a) dino products whose imageUrl is empty or a legacy image shared by several
 *       different creatures (generic/mismatched placeholder), and
 *   (b) every tameable, released, official ARK: Survival Evolved creature on ark.wiki.gg
 *       that is not yet in the products table,
 * then downloads the best wiki image for each one, converts it to webp and writes
 *   backend/prisma/seed-data/dino-artwork.json and
 *   frontend/public/images/catalog/ark/ATTRIBUTION.md.
 *
 * The script never touches the database. Feed it a read-only JSON dump of the dino
 * products (array of { id, externalKey, name, isActive, imageUrl, deliveryPayload }):
 *
 *   C=$(docker compose ps -q backend)
 *   docker cp export.cjs $C:/tmp/export.cjs   # prisma.product.findMany({ where: { productType: 'dino' } })
 *   MSYS_NO_PATHCONV=1 docker exec -w /app -e NODE_PATH=/app/node_modules $C node /tmp/export.cjs > dinos.json
 *
 * Usage (from repo root):
 *   node backend/scripts/dino-catalog/fetch-artwork.mjs --products <dinos.json>
 *        [--cache <dir outside repo>] [--prefer icon|dossier] [--dry-run] [--limit N]
 *
 * Politeness: descriptive User-Agent, <= 2 requests/second (one request every 600 ms),
 * exponential backoff on 429/5xx/network errors, every API response and image is cached
 * under --cache (default: <os tmp>/iris-dino-artwork-cache) so re-runs hit the wiki only
 * for what is missing.
 *
 * Image choice (default --prefer icon): the creature's own wiki icon "File:<Name>.png"
 * (256 px, transparent, variant-specific; the same style as the 339 legacy catalog
 * images), then "File:Dossier <Name>.png", then the base creature's icon / dossier from
 * the Cargo DynamicIcon field. --prefer dossier swaps the first two.
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
const dossierSet = process.argv.includes('--dossier-set');
// --dossier-set: parchment dossier art for EVERY dino product (owner request 2026-10-18),
// written to a separate folder/manifest so the icon set stays intact.
const MAX_SIDE = dossierSet ? 900 : 512;
const ASE = 'ARK: Survival Evolved';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
const flag = (name) => process.argv.includes(name);

const productsPath = argument('--products');
if (!productsPath) {
  console.error('Usage: node backend/scripts/dino-catalog/fetch-artwork.mjs --products <dinos.json> [--cache dir] [--prefer icon|dossier] [--dry-run]');
  process.exit(2);
}
const cacheDir = path.resolve(argument('--cache', path.join(os.tmpdir(), 'iris-dino-artwork-cache')));
const prefer = dossierSet ? 'dossier' : argument('--prefer', 'icon');
const dryRun = flag('--dry-run');
const limit = Number(argument('--limit', '0')) || 0;
const assetsDir = path.join(frontendRoot, dossierSet ? 'public/images/catalog/ark/dossiers' : 'public/images/catalog/ark/dinos');
const publicPrefix = dossierSet ? '/images/catalog/ark/dossiers' : '/images/catalog/ark/dinos';
const seedPath = path.join(repoRoot, dossierSet ? 'backend/prisma/seed-data/dino-dossier-artwork.json' : 'backend/prisma/seed-data/dino-artwork.json');
const attributionPath = path.join(frontendRoot, dossierSet ? 'public/images/catalog/ark/ATTRIBUTION-dossiers.md' : 'public/images/catalog/ark/ATTRIBUTION.md');

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

async function politeFetch(url) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    networkRequests += 1;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' } });
      if (response.ok) return response;
      if (response.status === 404) return response;
      if (attempt >= 5 || (response.status < 500 && response.status !== 429)) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      await sleep(Math.max(retryAfter || 0, 2000 * 2 ** attempt));
    } catch (error) {
      if (attempt >= 5 || /HTTP \d+/.test(String(error?.message))) throw error;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

function cacheKey(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

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

async function downloadFile(url, fileTitle) {
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const file = path.join(cacheDir, 'files', `${cacheKey(url)}${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`download ${fileTitle}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(file, bytes);
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

function classSlug(key) {
  const cls = key.split('.').pop() ?? key.split('/').pop();
  return cls.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function productBlueprint(product) {
  const payload = product.deliveryPayload ?? {};
  return blueprintKey(payload.spawn?.blueprint) ?? blueprintKey(payload.definition?.Blueprint) ??
    blueprintKey(String(product.externalKey ?? '').replace(/^frozen-reference:/, ''));
}

function cleanProductName(name) {
  return String(name ?? '').replace(/\s*\((?:Lv|Level)\.?\s*\d+\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
}

const list = (value) => String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
const fileTitle = (name) => `File:${name.replace(/_/g, ' ').trim()}`;
const pageUrl = (article) => WIKI + encodeURIComponent(article.replace(/ /g, '_')).replace(/%2F/g, '/');

// ---------------------------------------------------------------------------
// 1. Load products and wiki reference data
// ---------------------------------------------------------------------------
const products = JSON.parse(await fsp.readFile(path.resolve(productsPath), 'utf8'));
console.log(`products: ${products.length} dino rows`);

const entities = await cargo('Entities', 'Name,Article,VariantOf,Blueprint,DynamicIcon,InGames,InMod,Groups',
  { where: 'Entities.Blueprint IS NOT NULL' });
const creatures = await cargo('Creatures',
  '_pageName=Page,Name,IsVariant,Tameable,Released,ReleasedASA,InGames,InMod,TaxonomicGroup,Aquatic,EntityId');
console.log(`wiki: ${entities.length} entities, ${creatures.length} creatures`);

const creatureByPage = new Map(creatures.map((row) => [row.Page, row]));
const entityByBlueprint = new Map();
for (const entity of entities) {
  const key = blueprintKey(entity.Blueprint);
  if (!key) continue;
  const current = entityByBlueprint.get(key);
  // Prefer the canonical English article over translations such as "Rex/hr".
  if (!current || (current.Article.includes('/') && !entity.Article.includes('/'))) entityByBlueprint.set(key, entity);
}

// ---------------------------------------------------------------------------
// 2. Target list
// ---------------------------------------------------------------------------
const legacyImageByBlueprint = new Map();
const blueprintsByImage = new Map();
for (const product of products) {
  const key = productBlueprint(product);
  if (!key || !product.imageUrl) continue;
  if (!blueprintsByImage.has(product.imageUrl)) blueprintsByImage.set(product.imageUrl, new Set());
  blueprintsByImage.get(product.imageUrl).add(key);
}
const sharedImages = new Set([...blueprintsByImage].filter(([, keys]) => keys.size > 1).map(([url]) => url));
for (const product of products) {
  const key = productBlueprint(product);
  if (key && product.imageUrl && !sharedImages.has(product.imageUrl)) legacyImageByBlueprint.set(key, product.imageUrl);
}

const targets = new Map(); // blueprintKey -> target
function addTarget(key, patch) {
  const current = targets.get(key) ?? { key, productIds: [], names: new Set(), reasons: new Set(), active: false };
  if (patch.productId) current.productIds.push(patch.productId);
  if (patch.name) current.names.add(patch.name);
  if (patch.reason) current.reasons.add(patch.reason);
  if (patch.active) current.active = true;
  targets.set(key, current);
}

const productKeys = new Set();
for (const product of products) {
  const key = productBlueprint(product);
  if (!key) continue;
  productKeys.add(key);
  const placeholder = product.imageUrl && sharedImages.has(product.imageUrl);
  if (!dossierSet && product.imageUrl && !placeholder) continue;
  addTarget(key, {
    productId: product.id,
    name: cleanProductName(product.name),
    reason: placeholder ? 'shared-legacy-placeholder' : 'missing-image',
    active: product.isActive,
  });
}

const tameableAse = [];
for (const entity of entities) {
  const creature = creatureByPage.get(entity.Article);
  if (!creature || entity.Article.includes('/')) continue;
  if (creature.Tameable !== true && creature.Tameable !== '1' && creature.Tameable !== 1) continue;
  if (!creature.Released || creature.InMod || entity.InMod) continue;
  const games = list(entity.InGames || creature.InGames);
  if (!games.includes(ASE)) continue;
  const key = blueprintKey(entity.Blueprint);
  if (!key || key.startsWith('/game/asa/')) continue;
  tameableAse.push(key);
  if (!productKeys.has(key)) addTarget(key, { name: entity.Name, reason: 'wiki-tameable-not-in-products' });
}

let targetList = [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
if (limit) targetList = targetList.slice(0, limit);
console.log(`targets: ${targetList.length} (tameable ASE creatures on wiki: ${new Set(tameableAse).size})`);

// ---------------------------------------------------------------------------
// 3. Candidate files per target
// ---------------------------------------------------------------------------
function candidatesFor(target, entity) {
  const names = [];
  if (entity) names.push(entity.Name);
  for (const name of target.names) if (!names.includes(name)) names.push(name);
  const base = entity ? (entity.DynamicIcon?.split(';').pop()?.trim() || entity.VariantOf || null) : null;
  const own = [];
  for (const name of names) {
    const icon = { title: fileTitle(`${name}.png`), kind: 'icon' };
    const dossier = { title: fileTitle(`Dossier ${name}.png`), kind: 'dossier' };
    own.push(...(prefer === 'dossier' ? [dossier, icon] : [icon, dossier]));
  }
  const fallback = [];
  for (const name of [base, entity?.VariantOf, entity?.Article].filter(Boolean)) {
    if (names.includes(name)) continue;
    fallback.push({ title: fileTitle(`${name}.png`), kind: 'base-icon' });
    fallback.push({ title: fileTitle(`Dossier ${name}.png`), kind: 'base-dossier' });
  }
  const seen = new Set();
  if (prefer === 'dossier' && dossierSet) {
    // Variants (Aberrant/X/R/Tek/Abyssal) have no dossier of their own: use the base
    // creature's dossier before falling back to any icon, so the set stays uniform.
    const stripped = names.map((name) => name.replace(/^(Aberrant|Abyssal|Tek)\s+|^(X|R)-/i, '').trim());
    const baseNames = [...new Set([base, entity?.VariantOf, ...stripped].filter(Boolean))].filter((name) => !names.includes(name));
    const baseDossiers = baseNames.map((name) => ({ title: fileTitle(`Dossier ${name}.png`), kind: 'base-dossier' }));
    const ordered = [
      ...own.filter((c) => c.kind === 'dossier'),
      ...baseDossiers,
      ...own.filter((c) => c.kind !== 'dossier'),
      ...fallback.filter((c) => c.kind === 'base-icon'),
    ];
    return ordered.filter((candidate) => !seen.has(candidate.title) && seen.add(candidate.title));
  }
  return [...own, ...fallback].filter((candidate) => !seen.has(candidate.title) && seen.add(candidate.title));
}

const plan = targetList.map((target) => {
  const entity = entityByBlueprint.get(target.key) ?? null;
  return { target, entity, candidates: candidatesFor(target, entity) };
});

const allTitles = [...new Set(plan.flatMap((row) => row.candidates.map((c) => c.title)))];
const fileInfo = new Map();
for (let index = 0; index < allTitles.length; index += 50) {
  const batch = allTitles.slice(index, index + 50);
  const body = await api({
    action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime',
    iiurlwidth: String(MAX_SIDE), redirects: '1',
  });
  const redirects = new Map((body.query?.redirects ?? []).map((r) => [r.to, r.from]));
  const normalized = new Map((body.query?.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of body.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    if (page.missing || !info) continue;
    let requested = page.title;
    if (redirects.has(requested)) requested = redirects.get(requested);
    if (normalized.has(requested)) requested = normalized.get(requested);
    const value = { resolvedTitle: page.title, ...info };
    fileInfo.set(requested, value);
    fileInfo.set(page.title, value);
  }
}
console.log(`file lookups: ${allTitles.length} titles, ${fileInfo.size} hits (incl. aliases)`);

// ---------------------------------------------------------------------------
// 4. Download + convert
// ---------------------------------------------------------------------------
fs.mkdirSync(assetsDir, { recursive: true });
const usedSlugs = new Map();
const entries = {};
const failures = [];
const stats = { downloaded: 0, reusedLegacy: 0, byKind: {} };

for (const { target, entity, candidates } of plan) {
  const sourcePage = entity ? pageUrl(entity.Article) : null;
  const displayName = entity?.Name ?? [...target.names][0] ?? target.key;
  const base = {
    name: displayName,
    sourcePage,
    reasons: [...target.reasons],
    productIds: target.productIds,
    inProducts: target.productIds.length > 0,
  };

  const legacy = dossierSet ? null : legacyImageByBlueprint.get(target.key);
  if (legacy) {
    entries[target.key] = { imageUrl: legacy, ...base, file: null, reused: 'legacy' };
    stats.reusedLegacy += 1;
    continue;
  }

  const chosen = candidates.find((candidate) => fileInfo.has(candidate.title));
  if (!chosen) {
    failures.push({ key: target.key, name: displayName, reason: entity ? 'no wiki icon/dossier file found' : 'blueprint not found on ark.wiki.gg (mod/renamed?) and no file for product name', tried: candidates.map((c) => c.title) });
    continue;
  }
  const info = fileInfo.get(chosen.title);
  let slug = classSlug(target.key);
  if (usedSlugs.has(slug) && usedSlugs.get(slug) !== target.key) slug = `${slug}_${cacheKey(target.key).slice(0, 6)}`;
  usedSlugs.set(slug, target.key);
  const outFile = path.join(assetsDir, `${slug}.webp`);
  const entry = {
    imageUrl: `${publicPrefix}/${slug}.webp`,
    ...base,
    sourcePage: sourcePage ?? `${WIKI}${encodeURIComponent(info.resolvedTitle.replace(/ /g, '_'))}`,
    file: info.resolvedTitle.replace(/^File:/, ''),
    fileUrl: info.descriptionurl,
    kind: chosen.kind,
  };
  if (dryRun) {
    entries[target.key] = entry;
    stats.byKind[chosen.kind] = (stats.byKind[chosen.kind] ?? 0) + 1;
    continue;
  }
  try {
    const sourceUrl = info.thumburl && info.width > MAX_SIDE ? info.thumburl : info.url;
    const local = await downloadFile(sourceUrl, chosen.title);
    await sharp(local)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90, effort: 6 })
      .toFile(outFile);
    entries[target.key] = entry;
    stats.downloaded += 1;
    stats.byKind[chosen.kind] = (stats.byKind[chosen.kind] ?? 0) + 1;
  } catch (error) {
    failures.push({ key: target.key, name: displayName, reason: `download/convert failed: ${error.message}` });
  }
}

// ---------------------------------------------------------------------------
// 5. Outputs
// ---------------------------------------------------------------------------
const sortedEntries = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
const seed = {
  source: 'ark.wiki.gg',
  license: 'CC BY-NC-SA (wiki) / game art © Studio Wildcard',
  generatedAt: new Date().toISOString(),
  generator: 'backend/scripts/dino-catalog/fetch-artwork.mjs',
  imagePolicy: `prefer=${prefer}; webp q80, max ${MAX_SIDE}px long side, alpha kept; legacy image reused when the same blueprint already has a unique one`,
  stats: {
    targets: plan.length,
    withImage: Object.keys(entries).length,
    downloaded: stats.downloaded,
    reusedLegacy: stats.reusedLegacy,
    byKind: stats.byKind,
    failed: failures.length,
  },
  entries: sortedEntries,
  failures,
};

if (dryRun) {
  const reasons = {};
  for (const entry of Object.values(sortedEntries)) for (const reason of entry.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  const fallbacks = Object.values(sortedEntries).filter((entry) => entry.kind?.startsWith('base-')).map((entry) => `${entry.name} -> ${entry.file}`);
  console.log(JSON.stringify({ ...seed.stats, reasons, fallbacks, failures }, null, 2));
  process.exit(0);
}

await fsp.mkdir(path.dirname(seedPath), { recursive: true });
await fsp.writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

const attributionRows = Object.entries(sortedEntries)
  .filter(([, entry]) => entry.file)
  .map(([, entry]) => `| \`${path.basename(entry.imageUrl)}\` | ${entry.name} | [${entry.file}](${entry.fileUrl ?? entry.sourcePage}) | [${decodeURIComponent(entry.sourcePage.replace(WIKI, ''))}](${entry.sourcePage}) |`)
  .sort();
const attribution = `# ARK creature artwork attribution

Files in \`${path.basename(assetsDir)}/\` were downloaded from the [ARK Official Community Wiki](https://ark.wiki.gg/)
by \`backend/scripts/dino-catalog/fetch-artwork.mjs\` and converted to WebP (max ${MAX_SIDE}px, quality 80).

- Wiki content is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) unless noted on the file page.
- ARK: Survival Evolved creature art and icons are © Studio Wildcard; used here to identify in-game creatures.
- Each file was converted (resized / re-encoded) from the original listed below; no other changes.

Generated: ${seed.generatedAt} · ${attributionRows.length} files

| File | Creature | Wiki file | Source page |
| --- | --- | --- | --- |
${attributionRows.join('\n')}
`;
await fsp.writeFile(attributionPath, attribution, 'utf8');

let totalBytes = 0;
for (const name of fs.readdirSync(assetsDir)) totalBytes += fs.statSync(path.join(assetsDir, name)).size;
console.log(JSON.stringify({
  ...seed.stats,
  networkRequests,
  assetsDir,
  assetsMB: +(totalBytes / 1024 / 1024).toFixed(2),
  seedPath,
  attributionPath,
  failures: failures.map((f) => `${f.name} (${f.key}): ${f.reason}`),
}, null, 2));
