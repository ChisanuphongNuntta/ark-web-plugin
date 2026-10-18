/**
 * Item artwork manifest (prisma/seed-data/item-artwork.json) produced by
 * scripts/item-catalog/fetch-artwork.mjs: shape, deterministic file names, every
 * referenced image exists on disk, attribution covers every downloaded file, and the
 * asset folder stays within its size budget.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'prisma/seed-data/item-artwork.json');
const publicDir = path.resolve(root, '../frontend/public');
const assetsDir = path.join(publicDir, 'images/catalog/ark/items');
const attributionPath = path.join(publicDir, 'images/catalog/ark/ATTRIBUTION.md');

type Entry = { imageUrl: string; sourcePage: string | null; file: string | null; reused?: string; productIds: number[]; kind?: string };
type Manifest = {
  source: string;
  license: string;
  generatedAt: string;
  entries: Record<string, Entry>;
  productImages: Record<string, { imageUrl: string }>;
  failures: unknown[];
  stats: { products: { inScope: { total: number; withImage: number } } };
};

const manifest: Manifest | null = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const fileOf = (url: string) => path.join(publicDir, ...url.split('/').filter(Boolean));

describe.skipIf(!manifest)('item artwork manifest', () => {
  const m = manifest as Manifest;

  it('has source/license/generatedAt and blueprint-keyed entries', () => {
    expect(m.source).toBe('ark.wiki.gg');
    expect(m.license).toMatch(/CC BY-NC-SA/);
    expect(Number.isNaN(Date.parse(m.generatedAt))).toBe(false);
    const keys = Object.keys(m.entries);
    expect(keys.length).toBeGreaterThan(1000);
    for (const key of keys) {
      expect(key === key.toLowerCase(), key).toBe(true);
      // blueprint path, blueprint-less product name, or a legacy bundle's externalKey
      expect(key.startsWith('/game/') || key.startsWith('name:') || key.startsWith('arkshop:'), key).toBe(true);
    }
  });

  it('names downloaded files after the blueprint class', () => {
    for (const [key, entry] of Object.entries(m.entries)) {
      if (entry.reused) continue;
      expect(entry.imageUrl.startsWith('/images/catalog/ark/items/'), key).toBe(true);
      expect(entry.file, key).toBeTruthy();
      expect(entry.sourcePage, key).toMatch(/^https:\/\/ark\.wiki\.gg\/wiki\//);
      if (key.startsWith('/game/')) {
        const cls = key.split('.').pop() as string;
        expect(path.basename(entry.imageUrl).startsWith(cls.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')), key).toBe(true);
      }
    }
  });

  it('every referenced image exists on disk', () => {
    const urls = new Set([...Object.values(m.entries), ...Object.values(m.productImages)].map((e) => e.imageUrl));
    const missing = [...urls].filter((url) => !fs.existsSync(fileOf(url)));
    expect(missing).toEqual([]);
  });

  it('covers every in-scope item product (no failures)', () => {
    expect(m.failures).toEqual([]);
    expect(m.stats.products.inScope.withImage).toBe(m.stats.products.inScope.total);
    expect(Object.keys(m.productImages).length).toBe(m.stats.products.inScope.total);
  });

  it('keeps the asset folder small and only webp', () => {
    const files = fs.readdirSync(assetsDir);
    expect(files.every((f) => f.endsWith('.webp'))).toBe(true);
    const bytes = files.reduce((sum, f) => sum + fs.statSync(path.join(assetsDir, f)).size, 0);
    expect(bytes).toBeLessThan(40 * 1024 * 1024);
  });

  it('attributes every downloaded file', () => {
    const attribution = fs.readFileSync(attributionPath, 'utf8');
    expect(attribution).toContain('# ARK creature artwork attribution');
    expect(attribution).toContain('<!-- item-artwork:start -->');
    for (const entry of Object.values(m.entries)) {
      if (!entry.reused) expect(attribution, entry.imageUrl).toContain(`\`${path.basename(entry.imageUrl)}\``);
    }
  });
});
