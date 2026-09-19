import fs from 'node:fs';
import path from 'node:path';

type WikiCreature = {
  _pageName: string;
  Name: string;
  EntityId: string;
  TaxonomicGroup: string;
  IsVariant: string;
  DLCs: string;
  Released: string;
  ReleasedASA: string;
  Blueprint: string;
  DynamicIcon: string;
};

const fields = [
  'Creatures._pageName', 'Creatures.Name', 'Creatures.EntityId',
  'Creatures.TaxonomicGroup', 'Creatures.IsVariant', 'Creatures.DLCs',
  'Creatures.Released', 'Creatures.ReleasedASA', 'Entities.Blueprint',
  'Entities.DynamicIcon',
].join(',');

function argument(name: string, fallback: string | null = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function entityIdFromBlueprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^"|"$/g, '');
  const match = cleaned.match(/\.([^.'"]+)'?$/);
  return match ? `${match[1]}_C`.toLowerCase() : null;
}

function loadLegacyIndex(sourcePath: string | null) {
  const index = new Map<string, string[]>();
  if (!sourcePath) return index;
  const source = JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8'));
  for (const [sourceKey, definition] of Object.entries<any>(source.ShopItems ?? {})) {
    if (String(definition?.Type).toLowerCase() !== 'dino') continue;
    const entityId = entityIdFromBlueprint(definition?.Blueprint);
    if (!entityId) continue;
    index.set(entityId, [...(index.get(entityId) ?? []), sourceKey]);
  }
  return index;
}

async function fetchBatch(offset: number): Promise<WikiCreature[]> {
  const query = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: 'Creatures,Entities',
    fields,
    where: 'Creatures.Tameable=1 AND Creatures.EntityId IS NOT NULL',
    join_on: 'Creatures._pageName=Entities.Article',
    limit: '500',
    offset: String(offset),
  });
  const response = await fetch(`https://ark.wiki.gg/api.php?${query}`, {
    headers: { 'User-Agent': 'IRIS-Catalog-Audit/1.0 (admin@iris-th.cloud)' },
  });
  if (!response.ok) throw new Error(`ARK Wiki Cargo request failed: ${response.status}`);
  const body = await response.json() as { cargoquery?: Array<{ title: WikiCreature }> };
  return (body.cargoquery ?? []).map((row) => row.title);
}

const sourcePath = argument('--source');
const outputPath = path.resolve(argument('--output', 'data/ark-wiki-tameable-audit.json')!);
const legacy = loadLegacyIndex(sourcePath);
const rows: WikiCreature[] = [];
for (let offset = 0; ; offset += 500) {
  const batch = await fetchBatch(offset);
  rows.push(...batch);
  if (batch.length < 500) break;
}

const excludedModPattern = /Aquatica|Additional Creatures|Prehistoric|Chasm|Mobile/i;
const officialAse = rows
  .filter((row) => row.Released && row.Blueprint && !row.Blueprint.startsWith('/Game/ASA/'))
  .filter((row) => !excludedModPattern.test(row.DLCs ?? ''))
  .map((row) => {
    const shopKeys = legacy.get(row.EntityId.toLowerCase()) ?? [];
    const special = /Bosses|Event Creatures/i.test(row.TaxonomicGroup ?? '') ||
      /Titan|DodoRex|Zombie|Mega Mek/i.test(row.Name ?? '');
    return {
      name: row.Name || row._pageName,
      article: row._pageName,
      entityId: row.EntityId,
      blueprint: `Blueprint'${row.Blueprint}'`,
      taxonomicGroup: row.TaxonomicGroup || null,
      dlcs: row.DLCs ? row.DLCs.split(',').map((value) => value.trim()).filter(Boolean) : [],
      isVariant: row.IsVariant === '1',
      spawnCommand: `admincheat SpawnDino "Blueprint'${row.Blueprint}'" 500 0 0 <level>`,
      legacyShopKeys: shopKeys,
      shopStatus: shopKeys.length > 0 ? 'configured' : special ? 'manual-review-special' : 'manual-review-unpriced',
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const configured = officialAse.filter((row) => row.shopStatus === 'configured').length;
const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'https://ark.wiki.gg/wiki/Creature',
  sourceApi: 'https://ark.wiki.gg/api.php',
  sourceLicense: 'CC BY-NC-SA 4.0; factual blueprint audit only, no Wiki media copied into the commercial catalog',
  policy: 'Legacy IRIS ArkShop config remains authoritative for price and activation. Wiki-only rows require manual economic/safety review.',
  stats: {
    wikiTameableRows: rows.length,
    officialAseRows: officialAse.length,
    configured,
    manualReview: officialAse.length - configured,
  },
  creatures: officialAse,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...audit.stats }, null, 2));
