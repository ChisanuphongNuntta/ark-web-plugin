/**
 * Snapshot ark.wiki.gg Cargo data (Creatures + Entities) used to classify dinos.
 * Network read only; writes a JSON snapshot.
 *
 *   npx tsx scripts/dino-catalog/fetch-wiki.ts [--output scripts/dino-catalog/data/ark-wiki-creatures.json]
 *
 * Facts only (names, blueprint paths, flags). No wiki media is copied here.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { WikiCreature } from './lib.js';

const API = 'https://ark.wiki.gg/api.php';
const USER_AGENT = 'IRIS-Catalog-Audit/1.0 (admin@iris-th.cloud)';

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function cargo(tables: string, fields: string): Promise<Array<Record<string, string>>> {
  const rows: Array<Record<string, string>> = [];
  for (let offset = 0; ; offset += 500) {
    const query = new URLSearchParams({ action: 'cargoquery', format: 'json', tables, fields, limit: '500', offset: String(offset) });
    const response = await fetch(`${API}?${query}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`ark.wiki.gg ${tables} HTTP ${response.status}`);
    const body = await response.json() as { cargoquery?: Array<{ title: Record<string, string> }>; error?: unknown };
    if (body.error) throw new Error(`ark.wiki.gg ${tables} error ${JSON.stringify(body.error).slice(0, 200)}`);
    const batch = (body.cargoquery ?? []).map((row) => row.title);
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

const flag = (value: string | undefined): boolean | null => (value === '1' ? true : value === '0' ? false : null);

async function main() {
  const output = path.resolve(argument('--output', 'scripts/dino-catalog/data/ark-wiki-creatures.json'));
  const creatures = await cargo('Creatures', '_pageName,Name,InGames,InMod,IsVariant,DLCs,TaxonomicGroup,Released,ReleasedASA,Tameable,Aquatic');
  const entities = await cargo('Entities', 'Name,InGames,InMod,Article,VariantOf,IsMobile,Blueprint');
  const byPage = new Map(creatures.map((creature) => [creature._pageName, creature]));

  const joined: WikiCreature[] = [];
  for (const entity of entities) {
    const creature = byPage.get(entity.Article);
    if (!creature || !entity.Blueprint) continue;
    joined.push({
      page: creature._pageName,
      name: creature.Name || creature._pageName,
      entityName: entity.Name || null,
      inGames: entity.InGames || creature.InGames || '',
      inMod: entity.InMod || creature.InMod || '',
      dlcs: (creature.DLCs || '').split(',').map((value) => value.trim()).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index),
      taxonomicGroup: creature.TaxonomicGroup || '',
      tameable: flag(creature.Tameable),
      aquatic: creature.Aquatic === '1',
      isMobile: entity.IsMobile === '1' || creature._pageName.startsWith('Mobile:'),
      variantOf: entity.VariantOf || null,
      blueprint: entity.Blueprint,
    });
  }
  joined.sort((a, b) => a.page.localeCompare(b.page) || a.blueprint.localeCompare(b.blueprint));
  const snapshot = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: `${API} (Cargo: Creatures, Entities)`,
    license: 'ark.wiki.gg content CC BY-NC-SA 4.0; factual fields only',
    counts: { creatures: creatures.length, entities: entities.length, joined: joined.length },
    creatures: joined,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 1)}\n`, 'utf8');
  console.log(JSON.stringify({ output, ...snapshot.counts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
