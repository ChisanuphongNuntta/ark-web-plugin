import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const LEGACY_ORIGIN = 'https://www.iris-th.cloud';
const PAGES = [
  'Creatures',
  'Creatures/Aberrant',
  'Creatures/aquadino',
  'Creatures/R-Dino',
  'Creatures/Tek-Dino',
  'Creatures/Wyvern',
  'Creatures/X-Dino',
  'Item',
  'Item/Armor',
  'Item/Chibi',
  'Item/skin',
  'Boss-Arenas',
  'unlock-engrams-ปลดเอนแกรม',
];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sourcePath = path.resolve(argument('--source', ''));
if (!sourcePath || sourcePath === path.resolve('')) {
  throw new Error('Usage: npm run catalog:sync-artwork -- --source <legacy ArkShop config.json>');
}

const outputPath = path.resolve(argument('--output', '../backend/data/legacy-catalog-artwork.json'));
const assetsDirectory = path.resolve(argument('--assets', 'public/images/catalog/legacy'));

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalized(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/\([^)]*(?:lv\.?|level|x|iris|bp|blueprint)[^)]*\)/gi, ' ')
    .replace(/\b(?:lv|level)\.?\s*\d+\b/gi, ' ')
    .replace(/[^a-z0-9ก-๙]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function baseProductName(description, sourceKey) {
  const value = cleanText(description || sourceKey)
    .replace(/\s*\([^)]*(?:Lv\.?|Level|\d+x|Iris)[^)]*\)\s*/gi, ' ')
    .replace(/\s*\|\s*\d[\d\s]*\s*Iris.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized(value || sourceKey);
}

function artworkIdentity(candidate) {
  return `${candidate.sourcePage}#image-${candidate.index}`;
}

function pageAffinity(type, pageName) {
  if (type === 'dino') return pageName.startsWith('Creatures') ? 30 : -30;
  if (type === 'item') return pageName.startsWith('Item') ? 24 : 0;
  if (type === 'unlockengram') return pageName.startsWith('unlock-') ? 24 : 0;
  return 0;
}

function scoreArtwork(product, artwork) {
  const description = normalized(product.definition.Description || product.sourceKey);
  const base = baseProductName(product.definition.Description, product.sourceKey);
  const haystack = normalized(artwork.text);
  if (!base || !haystack) return Number.NEGATIVE_INFINITY;

  const productType = String(product.definition.Type ?? '').toLowerCase();
  if (productType === 'dino' && !artwork.page.startsWith('Creatures')) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = pageAffinity(productType, artwork.page);
  if (haystack.includes(description) && description.length >= 4) score += 130;
  if (haystack.includes(base) && base.length >= 3) score += 100;
  if (haystack.startsWith(base)) score += 55;
  const tokens = base.split(' ').filter((token) => token.length >= 3);
  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  score += matchedTokens * 12;
  if (tokens.length > 0 && matchedTokens === tokens.length) score += 25;
  if (artwork.text.length > 5000) score -= 25;
  return score;
}

async function collectArtwork(page, pageName) {
  const url = `${LEGACY_ORIGIN}/${pageName}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const imageLocator = page.locator('img.CENy8b');
  const rows = await imageLocator.evaluateAll((images) => images.map((image, index) => {
    let element = image;
    let text = '';
    for (let depth = 0; element && depth < 14; depth += 1, element = element.parentElement) {
      const candidate = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (candidate.length >= 3) {
        text = candidate;
        break;
      }
    }
    return {
      // Google Sites rewrites currentSrc to a short-lived lh3/sitesv URL that
      // rejects server-side downloads. The authored src is the stable
      // sitesv-images-rt URL and remains traceable to the supplied IRIS page.
      sourceUrl: image.getAttribute('src') || image.currentSrc || image.src,
      text,
      index,
    };
  }));
  const usable = rows.filter((row) => row.sourceUrl && row.text);
  return usable.map((row) => ({ ...row, page: pageName, sourcePage: url }));
}

const renderedFallbacks = new Map();

async function downloadArtwork(candidate, page) {
  const { sourceUrl } = candidate;
  const id = crypto.createHash('sha256').update(artworkIdentity(candidate)).digest('hex').slice(0, 24);
  const filename = `${id}.webp`;
  const destination = path.join(assetsDirectory, filename);
  try {
    await fs.access(destination);
  } catch {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'IRIS-Catalog-Artwork-Sync/1.0' },
    });
    let bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    if (!bytes) {
      bytes = renderedFallbacks.get(sourceUrl) ?? null;
      if (!bytes) {
        if (page.url() !== candidate.sourcePage) {
          await page.goto(candidate.sourcePage, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }
        bytes = await page.locator('img.CENy8b').nth(candidate.index).screenshot({ type: 'png' });
        renderedFallbacks.set(sourceUrl, bytes);
      }
    }
    await sharp(bytes)
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toFile(destination);
  }
  return `/images/catalog/legacy/${filename}`;
}

const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const products = Object.entries(source.ShopItems ?? {}).map(([sourceKey, definition]) => ({
  sourceKey,
  definition,
}));

await fs.mkdir(assetsDirectory, { recursive: true });
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let artwork = [];
for (const pageName of PAGES) {
  artwork.push(...await collectArtwork(page, pageName));
}

// De-duplicate exact Google image URLs while retaining the most focused text block.
artwork = [...new Map(
  artwork
    .sort((left, right) => left.text.length - right.text.length)
    .map((row) => [row.sourceUrl, row]),
).values()];

const matches = {};
const downloaded = new Map();
for (const product of products) {
  const ranked = artwork
    .map((candidate) => ({ candidate, score: scoreArtwork(product, candidate) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 70) continue;

  const identity = artworkIdentity(best.candidate);
  let imageUrl = downloaded.get(identity);
  if (!imageUrl) {
    imageUrl = await downloadArtwork(best.candidate, page);
    downloaded.set(identity, imageUrl);
  }
  matches[product.sourceKey] = {
    imageUrl,
    sourcePage: best.candidate.sourcePage,
    sourceUrl: best.candidate.sourceUrl,
    matchedText: best.candidate.text.slice(0, 500),
    score: best.score,
  };
}

await browser.close();

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: LEGACY_ORIGIN,
  note: 'Artwork migrated from the IRIS site supplied by its owner. ARK Wiki media is intentionally not copied.',
  stats: {
    catalogProducts: products.length,
    discoveredArtwork: artwork.length,
    matchedProducts: Object.keys(matches).length,
    uniqueDownloadedFiles: downloaded.size,
  },
  products: matches,
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, assetsDirectory, ...manifest.stats }, null, 2));
