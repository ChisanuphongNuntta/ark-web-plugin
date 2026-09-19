import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient, ProductType } from '@prisma/client';

type JsonObject = Record<string, unknown>;
type CatalogRow = {
  externalKey: string;
  name: string;
  description: string | null;
  price: number;
  productType: ProductType;
  itemBlueprint: string | null;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  imageUrl: string | null;
  requiredCapabilities: string[];
  categoryName: string;
  sortOrder: number;
  deliveryPayload: Prisma.InputJsonValue;
};

type ArtworkBySourceKey = Map<string, string>;

const CATEGORY_METADATA: Record<string, { icon: string; sortOrder: number; description: string }> = {
  'Dinos': { icon: '🦖', sortOrder: 10, description: 'สัตว์จับได้และส่งเป็นเจ้าของผู้ซื้อผ่าน HeartShop Plugin' },
  'Dinos · Aberrant': { icon: '🧬', sortOrder: 11, description: 'สัตว์สายพันธุ์ Aberrant' },
  'Dinos · X': { icon: '❄️', sortOrder: 12, description: 'สัตว์สายพันธุ์ X' },
  'Dinos · R': { icon: '🩸', sortOrder: 13, description: 'สัตว์สายพันธุ์ R' },
  'Dinos · Tek': { icon: '🤖', sortOrder: 14, description: 'สัตว์จักรกล Tek' },
  'Dinos · Wyvern': { icon: '🐉', sortOrder: 15, description: 'Wyvern และมังกรสายพันธุ์ต่าง ๆ' },
  'Dinos · Aquatic': { icon: '🌊', sortOrder: 16, description: 'สัตว์น้ำและสัตว์สะเทินน้ำสะเทินบก' },
  'Weapons & Ammo': { icon: '🎯', sortOrder: 30, description: 'อาวุธและกระสุน' },
  'Armor': { icon: '🛡️', sortOrder: 31, description: 'ชุดเกราะและอุปกรณ์ป้องกัน' },
  'Saddles': { icon: '🪑', sortOrder: 32, description: 'อานและอานแพลตฟอร์ม' },
  'Resources': { icon: '⛏️', sortOrder: 33, description: 'ทรัพยากรสำหรับสร้างและคราฟต์' },
  'Consumables': { icon: '🧪', sortOrder: 34, description: 'อาหาร ยา และของใช้สิ้นเปลือง' },
  'Structures': { icon: '🏗️', sortOrder: 35, description: 'สิ่งปลูกสร้างและอุปกรณ์ฐาน' },
  'Skins': { icon: '🎭', sortOrder: 36, description: 'สกินตกแต่ง' },
  'Chibi': { icon: '✨', sortOrder: 37, description: 'Chibi และของสะสม' },
  'Items': { icon: '📦', sortOrder: 38, description: 'ไอเทม ARK อื่น ๆ' },
  'Engrams': { icon: '📘', sortOrder: 50, description: 'รายการปลดล็อก Engram' },
  'Kits': { icon: '🎁', sortOrder: 60, description: 'ชุดสินค้าและสิทธิ์เซิร์ฟเวอร์' },
};

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asArray = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isObject) : [];

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const blueprint = (value: unknown): string | null => {
  const valueText = text(value);
  return valueText ? valueText.replace(/^"+|"+$/g, '').trim() || null : null;
};

const integer = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

function parseArguments() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
  if (!source) {
    throw new Error('Usage: npm run catalog:import -- --source <ArkShop config.json> [--apply] [--activate] [--activate-capability <name>]');
  }
  const activationCapabilities = new Set<string>();
  const artworkIndex = args.indexOf('--artwork-manifest');
  const artworkManifest = artworkIndex >= 0 && args[artworkIndex + 1]
    ? path.resolve(args[artworkIndex + 1])
    : null;
  args.forEach((argument, index) => {
    if (argument === '--activate-capability' && args[index + 1]) {
      activationCapabilities.add(args[index + 1]);
    }
  });
  return {
    source: path.resolve(source),
    apply: args.includes('--apply') || args.includes('--activate') || activationCapabilities.size > 0,
    activate: args.includes('--activate'),
    activationCapabilities,
    artworkManifest,
  };
}

function itemCategory(sourceKey: string, definition: JsonObject): string {
  const description = text(definition.Description)?.toLowerCase() ?? '';
  const blueprints = asArray(definition.Items)
    .map((item) => text(item.Blueprint)?.toLowerCase() ?? '')
    .join(' ');
  const searchable = `${sourceKey.toLowerCase()} ${description} ${blueprints}`;
  if (searchable.includes('chibi')) return 'Chibi';
  if (searchable.includes('skin')) return 'Skins';
  if (searchable.includes('saddle')) return 'Saddles';
  if (searchable.includes('/armor/') || searchable.includes('primalitemarmor')) return 'Armor';
  if (searchable.includes('/weapon') || searchable.includes('primalitem_weapon') || searchable.includes('primalitemammo')) return 'Weapons & Ammo';
  if (searchable.includes('primalitemstructure') || searchable.includes('/structures/')) return 'Structures';
  if (searchable.includes('primalitemresource')) return 'Resources';
  if (searchable.includes('primalitemconsumable')) return 'Consumables';
  return 'Items';
}

function dinoCategory(definition: JsonObject): string {
  const description = text(definition.Description)?.toLowerCase() ?? '';
  const blueprint = text(definition.Blueprint)?.toLowerCase() ?? '';
  if (description.startsWith('aberrant ') || blueprint.includes('_aberrant')) return 'Dinos · Aberrant';
  if (description.startsWith('x-') || blueprint.includes('lunar')) return 'Dinos · X';
  if (description.startsWith('r-') || blueprint.includes('_ed')) return 'Dinos · R';
  if (description.startsWith('tek ') || description.startsWith('tek-') || blueprint.includes('bionic')) return 'Dinos · Tek';
  if (description.includes('wyvern') || blueprint.includes('/wyvern/')) return 'Dinos · Wyvern';
  if (blueprint.includes('ocean') || blueprint.includes('water') || blueprint.includes('fish')) return 'Dinos · Aquatic';
  return 'Dinos';
}

function parseArtworkManifest(manifestPath: string | null): ArtworkBySourceKey {
  const result: ArtworkBySourceKey = new Map();
  if (!manifestPath) return result;
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  if (!isObject(parsed) || !isObject(parsed.products)) {
    throw new Error('Artwork manifest must contain a products object');
  }
  for (const [sourceKey, entry] of Object.entries(parsed.products)) {
    if (!isObject(entry)) continue;
    const imageUrl = text(entry.imageUrl);
    if (imageUrl) result.set(sourceKey, imageUrl);
  }
  return result;
}

function parseCatalog(config: JsonObject, artwork: ArtworkBySourceKey): { rows: CatalogRow[]; errors: string[] } {
  const rows: CatalogRow[] = [];
  const errors: string[] = [];
  const shopItems = isObject(config.ShopItems) ? config.ShopItems : {};
  const kits = isObject(config.Kits) ? config.Kits : {};
  let sortOrder = 0;

  for (const [sourceKey, definition] of Object.entries(shopItems)) {
    if (!isObject(definition)) {
      errors.push(`ShopItems.${sourceKey}: definition must be an object`);
      continue;
    }
    const sourceType = text(definition.Type)?.toLowerCase();
    const price = integer(definition.Price, -1);
    if (price < 0) {
      errors.push(`ShopItems.${sourceKey}: Price must be a non-negative integer`);
      continue;
    }

    let productType: ProductType;
    let categoryName: string;
    let capability: string;
    let itemBlueprint: string | null = null;
    let quantity = 1;
    let quality = 0;
    let isBlueprint = false;

    if (sourceType === 'item') {
      productType = ProductType.item;
      categoryName = itemCategory(sourceKey, definition);
      capability = 'delivery.item.v1';
      const itemDefinitions = asArray(definition.Items);
      const first = itemDefinitions[0];
      itemBlueprint = first ? blueprint(first.Blueprint) : null;
      quantity = first ? Math.max(1, integer(first.Amount, 1)) : 1;
      quality = first ? Math.max(0, integer(first.Quality, 0)) : 0;
      isBlueprint = first?.ForceBlueprint === true;
      if (!itemBlueprint) {
        errors.push(`ShopItems.${sourceKey}: item has no valid Items[0].Blueprint`);
        continue;
      }
      if (itemDefinitions.length > 1) capability = 'delivery.item.bundle.v1';
    } else if (sourceType === 'dino') {
      productType = ProductType.dino;
      categoryName = dinoCategory(definition);
      // Catalog dinos are newly spawned shop goods, not player-owned native
      // marketplace snapshots. Keep the capability distinct from
      // delivery.dino.v2 so exact-state claims can never be confused with a
      // configured catalog spawn.
      capability = 'delivery.dino.catalog.v1';
      itemBlueprint = blueprint(definition.Blueprint);
      if (!itemBlueprint) {
        errors.push(`ShopItems.${sourceKey}: dino has no Blueprint`);
        continue;
      }
    } else if (sourceType === 'unlockengram') {
      productType = ProductType.engram;
      categoryName = 'Engrams';
      capability = 'delivery.engram.v1';
      if (asArray(definition.Items).length === 0) {
        errors.push(`ShopItems.${sourceKey}: unlockengram has no Items`);
        continue;
      }
    } else {
      errors.push(`ShopItems.${sourceKey}: unsupported Type "${sourceType ?? ''}"`);
      continue;
    }

    rows.push({
      externalKey: `arkshop:${sourceKey}`,
      name: text(definition.Description) ?? sourceKey,
      description: text(definition.Description),
      price,
      productType,
      itemBlueprint,
      quantity,
      quality,
      isBlueprint,
      imageUrl: artwork.get(sourceKey) ?? null,
      requiredCapabilities: [capability],
      categoryName,
      sortOrder: sortOrder++,
      deliveryPayload: productType === ProductType.dino
        ? {
            schemaVersion: 1,
            source: 'arkshop',
            sourceKey,
            type: productType,
            definition: definition as Prisma.InputJsonObject,
            spawn: {
              blueprint: itemBlueprint!,
              level: Math.max(1, integer(definition.Level, 1)),
              forceTame: true,
              neutered: definition.Neutered === true,
              command: `admincheat SpawnDino "${itemBlueprint!}" 500 0 0 ${Math.max(1, integer(definition.Level, 1))}`,
            },
          }
        : {
            schemaVersion: 1,
            source: 'arkshop',
            sourceKey,
            type: productType,
            definition: definition as Prisma.InputJsonObject,
          },
    });
  }

  for (const [sourceKey, definition] of Object.entries(kits)) {
    if (!isObject(definition)) {
      errors.push(`Kits.${sourceKey}: definition must be an object`);
      continue;
    }
    const price = integer(definition.Price, -1);
    if (price < 0) {
      errors.push(`Kits.${sourceKey}: Price must be a non-negative integer`);
      continue;
    }
    rows.push({
      externalKey: `arkshop:kit:${sourceKey}`,
      name: text(definition.Description) ?? sourceKey,
      description: text(definition.Description),
      price,
      productType: ProductType.kit,
      itemBlueprint: null,
      quantity: 1,
      quality: 0,
      isBlueprint: false,
      imageUrl: artwork.get(`kit:${sourceKey}`) ?? null,
      requiredCapabilities: ['delivery.kit.v1'],
      categoryName: 'Kits',
      sortOrder: sortOrder++,
      deliveryPayload: {
        schemaVersion: 1,
        source: 'arkshop',
        sourceKey,
        type: ProductType.kit,
        definition: definition as Prisma.InputJsonObject,
      },
    });
  }

  return { rows, errors };
}

async function main() {
  const options = parseArguments();
  const raw = fs.readFileSync(options.source, 'utf8');
  const config = JSON.parse(raw) as unknown;
  if (!isObject(config)) throw new Error('ARK Shop config root must be a JSON object');

  const artwork = parseArtworkManifest(options.artworkManifest);
  const { rows, errors } = parseCatalog(config, artwork);
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.productType] = (result[row.productType] ?? 0) + 1;
    return result;
  }, {});

  if (errors.length > 0) {
    console.error(JSON.stringify({ valid: false, counts, errorCount: errors.length, errors: errors.slice(0, 50) }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!options.apply) {
    console.log(JSON.stringify({ valid: true, mode: 'dry-run', total: rows.length, counts }, null, 2));
    return;
  }

  const prisma = new PrismaClient();
  try {
    // Historical seeds inserted explicit integer IDs, which can leave PostgreSQL
    // sequences behind the table maximum. Repair only the two sequences this
    // importer owns before creating catalog rows.
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('categories', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM categories), 0) + 1, 1),
        false
      )
    `);
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('products', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM products), 0) + 1, 1),
        false
      )
    `);

    const categoryIds = new Map<string, number>();
    for (const categoryName of [...new Set(rows.map((row) => row.categoryName))]) {
      const existing = await prisma.category.findFirst({ where: { name: categoryName } });
      const metadata = CATEGORY_METADATA[categoryName];
      const categoryData = metadata
        ? { name: categoryName, ...metadata }
        : { name: categoryName };
      const category = existing
        ? await prisma.category.update({ where: { id: existing.id }, data: categoryData })
        : await prisma.category.create({ data: categoryData });
      categoryIds.set(categoryName, category.id);
    }

    let imported = 0;
    let activated = 0;
    for (const row of rows) {
      const shouldActivate = options.activate || row.requiredCapabilities.every(
        (capability) => options.activationCapabilities.has(capability),
      );
      const data = {
        categoryId: categoryIds.get(row.categoryName)!,
        name: row.name,
        description: row.description,
        price: row.price,
        productType: row.productType,
        itemBlueprint: row.itemBlueprint,
        quantity: row.quantity,
        quality: row.quality,
        isBlueprint: row.isBlueprint,
        imageUrl: row.imageUrl,
        deliveryPayload: row.deliveryPayload,
        requiredCapabilities: row.requiredCapabilities,
        sortOrder: row.sortOrder,
      };
      await prisma.product.upsert({
        where: { externalKey: row.externalKey },
        create: { ...data, externalKey: row.externalKey, isActive: shouldActivate },
        update: { ...data, isActive: shouldActivate },
      });
      imported += 1;
      if (shouldActivate) activated += 1;
    }
    console.log(JSON.stringify({
      valid: true,
      mode: options.activate ? 'active' : activated > 0 ? 'selective' : 'inactive',
      imported,
      activated,
      counts,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Catalog import failed');
  process.exitCode = 1;
});
