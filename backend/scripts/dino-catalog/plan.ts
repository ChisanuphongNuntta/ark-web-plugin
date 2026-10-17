/**
 * Pure plan builder for the IRIS dino catalog (no DB, no network).
 *
 * Inputs : every product_type='dino' row (read-only export) + ark.wiki.gg snapshot.
 * Output : the plan written to backend/prisma/seed-data/dino-catalog-plan.json and
 *          consumed by apply-plan.ts.
 *
 * Rules (see lib.ts for the primitives):
 *  - legacy 'arkshop:*' rows: keep (price/level/category untouched). Only an aquatic
 *    note is appended to the description and artwork is filled by apply-plan. A legacy
 *    row that is clearly undeliverable is planned as 'deactivate' and listed in
 *    report.legacyFlagged (never silently).
 *  - 'frozen-reference:*' drafts: activate when sellable and not a duplicate of a
 *    legacy blueprint; otherwise leave_inactive with the reason.
 *  - tameable ASE creatures on ark.wiki.gg that are not in the products table: create.
 *  - one sellable product per blueprint + displayed level.
 */
import {
  AQUATIC_NOTE_TH,
  CREATED_KEY_PREFIX,
  GROUP_CATEGORY,
  type Classification,
  type LegacyModel,
  type LegacyRow,
  type MultipliedGroup,
  type SellStatus,
  type VariantGroup,
  type WikiCreature,
  baseSpeciesName,
  buildLegacyModel,
  canonicalBlueprint,
  classifyCreature,
  displayLevelFromName,
  displayNameFor,
  isAquaticOnly,
  median,
  MULTIPLIED_GROUPS,
  niceRound,
  offersFor,
  packageKey,
  productDescription,
  productName,
  speciesKey,
  stripBlueprintRef,
  stripLevelSuffix,
  TEK_LEVEL_BONUS,
  variantGroupOf,
} from './lib.js';

export const PLAN_SCHEMA_VERSION = 1;
export const LEGACY_KEY_PREFIX = 'arkshop:';
export const DRAFT_KEY_PREFIX = 'frozen-reference:';
/** New rows are listed after every legacy row (legacy sortOrder max is 959). */
export const NEW_ROW_SORT_BASE = 1000;

export type PlanAction = 'keep' | 'activate' | 'create' | 'deactivate' | 'leave_inactive';
export const PLAN_ACTIONS: PlanAction[] = ['keep', 'activate', 'create', 'deactivate', 'leave_inactive'];

export type ExportedProduct = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  productType: string;
  externalKey: string | null;
  deliveryPayload: any;
  requiredCapabilities?: string[];
  itemBlueprint: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder?: number;
  category?: { id: number; name: string } | null;
};

export type PlanRow = {
  productId: number | null;
  externalKey: string;
  name: string;
  displayName: string;
  blueprint: string;
  action: PlanAction;
  status: SellStatus;
  code: string;
  /** Spawn level sent to the plugin (Tek rows: displayLevel / 1.2 like legacy). */
  level: number | null;
  /** Level shown in the product name. */
  displayLevel: number | null;
  price: number | null;
  priceBasis: string;
  levelBasis: string;
  categoryName: string | null;
  description: string | null;
  reason: string;
  aquatic: boolean;
  group: VariantGroup | null;
  source: 'legacy' | 'draft' | 'wiki' | 'catalog';
  wikiPage: string | null;
  sortOrder: number | null;
  current: { isActive: boolean; price: number; name: string; categoryName: string | null; imageUrl: string | null } | null;
};

export type WikiSkip = { name: string; blueprint: string; code: string; reason: string };

export type Plan = {
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  sources: Record<string, unknown>;
  rules: Record<string, string>;
  counts: {
    byAction: Record<PlanAction, number>;
    byStatus: Record<SellStatus, number>;
    bySource: Record<string, number>;
    sellableAfterApply: number;
    newSpeciesOrVariants: number;
    wikiSkipped: Record<string, number>;
    inputs: { products: number; legacyActive: number; drafts: number; wikiCreatures: number };
  };
  priceDistribution: Record<string, unknown>;
  groups: Record<string, unknown>;
  report: {
    legacyFlagged: Array<{ productId: number; externalKey: string; name: string; code: string; reason: string }>;
    legacyLevelAnomalies: Array<{ productId: number; name: string; displayLevel: number; spawnLevel: number; note: string }>;
    /** Legacy prices that look off; reported for the owner, never changed by the plan. */
    legacyPriceAnomalies: Array<{ productId: number; name: string; price: number; note: string; suggestedPrice: number | null }>;
    legacyAquatic: string[];
  };
  warnings: string[];
  errors: string[];
  rows: PlanRow[];
  wikiSkipped: WikiSkip[];
};

// ---------------------------------------------------------------------------

const payloadBlueprint = (product: ExportedProduct): string => stripBlueprintRef(
  product.itemBlueprint
  ?? product.deliveryPayload?.spawn?.blueprint
  ?? product.deliveryPayload?.definition?.Blueprint
  ?? String(product.externalKey ?? '').replace(DRAFT_KEY_PREFIX, ''),
);

/** One wiki row per package; prefer the entity whose name is the page name. */
export function indexWiki(creatures: WikiCreature[]): Map<string, WikiCreature> {
  const index = new Map<string, WikiCreature>();
  for (const creature of creatures) {
    const key = packageKey(creature.blueprint);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing) { index.set(key, creature); continue; }
    const score = (value: WikiCreature) => (value.entityName === value.page ? 2 : 0) + (value.isMobile ? -5 : 0) + (/Evolved/.test(value.inGames) ? 1 : 0);
    if (score(creature) > score(existing)) index.set(key, creature);
  }
  return index;
}

export function createdExternalKey(blueprint: string, displayLevel: number): string {
  return `${CREATED_KEY_PREFIX}${packageKey(blueprint)}@${displayLevel}`;
}

export function legacyRowFromProduct(product: ExportedProduct): LegacyRow {
  const spawnLevel = Number(product.deliveryPayload?.spawn?.level ?? product.deliveryPayload?.definition?.Level ?? 0);
  return {
    id: product.id,
    externalKey: product.externalKey ?? '',
    name: product.name,
    price: product.price,
    level: spawnLevel,
    displayLevel: displayLevelFromName(product.name) ?? spawnLevel,
    blueprint: payloadBlueprint(product),
    categoryName: product.category?.name ?? '',
    isActive: product.isActive,
  };
}

function wikiPageUrl(wiki: WikiCreature | null | undefined): string | null {
  return wiki ? `https://ark.wiki.gg/wiki/${encodeURIComponent(wiki.page.replace(/ /g, '_'))}` : null;
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export function buildPlan(input: {
  products: ExportedProduct[];
  wiki: WikiCreature[];
  sources?: Record<string, unknown>;
  now?: Date;
}): Plan {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const products = input.products.filter((product) => product.productType === 'dino');
  const wikiByPackage = indexWiki(input.wiki);
  const warnings: string[] = [];
  const errors: string[] = [];
  const rows: PlanRow[] = [];
  const wikiSkipped: WikiSkip[] = [];
  const report: Plan['report'] = { legacyFlagged: [], legacyLevelAnomalies: [], legacyPriceAnomalies: [], legacyAquatic: [] };

  const legacyProducts = products.filter((product) => product.externalKey?.startsWith(LEGACY_KEY_PREFIX));
  const draftProducts = products.filter((product) => product.externalKey?.startsWith(DRAFT_KEY_PREFIX));
  const catalogProducts = products.filter((product) => product.externalKey?.startsWith(CREATED_KEY_PREFIX));
  const otherProducts = products.filter((product) => !legacyProducts.includes(product) && !draftProducts.includes(product) && !catalogProducts.includes(product));
  for (const product of otherProducts) {
    warnings.push(`product ${product.id} "${product.name}" (${product.externalKey ?? 'no externalKey'}) is not legacy/draft/catalog; left untouched`);
  }

  const legacyRows = legacyProducts.map(legacyRowFromProduct);
  const model = buildLegacyModel(legacyRows);

  // packageKey -> legacy externalKey (any legacy row, active or not, owns the blueprint)
  const legacyOwner = new Map<string, string>();
  for (const row of legacyRows) if (!legacyOwner.has(packageKey(row.blueprint))) legacyOwner.set(packageKey(row.blueprint), row.externalKey);
  // packageKey@displayLevel -> externalKey of the sellable row that owns it
  const sellableSlots = new Map<string, string>();
  const slot = (blueprint: string, displayLevel: number) => `${packageKey(blueprint)}@${displayLevel}`;
  const seenPackages = new Set<string>(products.map((product) => packageKey(payloadBlueprint(product))));

  // ------------------------------------------------------------------ legacy
  for (const product of legacyProducts) {
    const legacy = legacyRowFromProduct(product);
    const wiki = wikiByPackage.get(packageKey(legacy.blueprint)) ?? null;
    const classification = classifyCreature({ name: product.name, blueprint: legacy.blueprint, wiki, legacyProven: true });
    const aquatic = isAquaticOnly(legacy.blueprint);
    const group = variantGroupOf({ name: product.name, blueprint: legacy.blueprint, categoryName: legacy.categoryName });
    const displayName = stripLevelSuffix(product.name);
    const currentDescription = product.description ?? product.name;
    const description = aquatic && !currentDescription.includes(AQUATIC_NOTE_TH) ? `${currentDescription} · ${AQUATIC_NOTE_TH}` : currentDescription;
    if (aquatic) report.legacyAquatic.push(product.name);

    const expectedSpawn = group === 'tek' ? Math.ceil(legacy.displayLevel / TEK_LEVEL_BONUS) : legacy.displayLevel;
    if (legacy.level !== expectedSpawn) {
      report.legacyLevelAnomalies.push({
        productId: product.id, name: product.name, displayLevel: legacy.displayLevel, spawnLevel: legacy.level,
        note: `name says Lv.${legacy.displayLevel} but the plugin spawns level ${legacy.level}${group === 'tek' ? ` (Tek convention would be ${expectedSpawn})` : ''}; kept as-is, owner to confirm`,
      });
    }

    let action: PlanAction = product.isActive ? 'keep' : 'leave_inactive';
    let reason = product.isActive ? `legacy row kept; ${classification.reason}` : 'legacy row is inactive (owner decision); untouched';
    if (classification.status === 'NOT_SELLABLE') {
      if (product.isActive) {
        action = 'deactivate';
        reason = `legacy row is undeliverable: ${classification.reason}`;
        report.legacyFlagged.push({ productId: product.id, externalKey: legacy.externalKey, name: product.name, code: classification.code, reason: classification.reason });
      } else {
        reason = `legacy row inactive; ${classification.reason}`;
      }
    }
    if (action === 'keep') {
      const key = slot(legacy.blueprint, legacy.displayLevel);
      const owner = sellableSlots.get(key);
      if (owner) warnings.push(`legacy ${legacy.externalKey} duplicates ${owner} (same blueprint + level); both kept, owner to choose`);
      else sellableSlots.set(key, legacy.externalKey);
    }

    rows.push({
      productId: product.id,
      externalKey: legacy.externalKey,
      name: product.name,
      displayName,
      blueprint: canonicalBlueprint(legacy.blueprint),
      action,
      status: classification.status,
      code: classification.code,
      level: legacy.level,
      displayLevel: legacy.displayLevel,
      price: product.price,
      priceBasis: 'legacy ArkShop price (unchanged)',
      levelBasis: 'legacy ArkShop level (unchanged)',
      categoryName: legacy.categoryName || null,
      description,
      reason,
      aquatic,
      group,
      source: 'legacy',
      wikiPage: wikiPageUrl(wiki),
      sortOrder: product.sortOrder ?? null,
      current: { isActive: product.isActive, price: product.price, name: product.name, categoryName: legacy.categoryName || null, imageUrl: product.imageUrl ?? null },
    });
  }

  report.legacyPriceAnomalies.push(...legacyPriceAnomalies(legacyRows, model));

  // ------------------------------------------------- planner for a sellable creature
  const newRows: PlanRow[] = [];
  const planOffers = (args: {
    product: ExportedProduct | null;
    displayName: string;
    blueprint: string;
    wiki: WikiCreature | null;
    classification: Classification;
    source: 'draft' | 'wiki';
  }): { ok: true } | { ok: false; code: string; reason: string } => {
    const aquatic = args.classification.status === 'SELLABLE_AQUATIC';
    const group = variantGroupOf({ name: args.displayName, blueprint: args.blueprint, aquatic });
    const baseSpecies = args.wiki?.variantOf && args.wiki.variantOf !== args.wiki.page ? args.wiki.variantOf : baseSpeciesName(args.displayName);
    const offers = offersFor(model, { name: args.displayName, group, baseSpecies });
    if ('error' in offers) return { ok: false, code: 'unverified', reason: `unverified: ${offers.error}` };

    const free = offers.filter((offer) => !sellableSlots.has(slot(args.blueprint, offer.displayLevel)));
    if (free.length === 0) {
      const owner = sellableSlots.get(slot(args.blueprint, offers[0].displayLevel));
      return { ok: false, code: 'duplicate', reason: `duplicate of ${owner}` };
    }
    // The draft row itself carries the top (main) offer; lower ladder levels become new rows.
    const ordered = [...free].sort((a, b) => b.displayLevel - a.displayLevel);
    ordered.forEach((offer, index) => {
      const useDraft = Boolean(args.product) && index === 0;
      const externalKey = useDraft ? args.product!.externalKey! : createdExternalKey(args.blueprint, offer.displayLevel);
      sellableSlots.set(slot(args.blueprint, offer.displayLevel), externalKey);
      // Abyssal variants are priced like Aberrant ones but are not Aberrant creatures.
      const abyssal = group === 'aberrant' && /^Abyssal\s/i.test(args.displayName);
      const categoryName = abyssal ? GROUP_CATEGORY.base : GROUP_CATEGORY[group];
      newRows.push({
        productId: useDraft ? args.product!.id : null,
        externalKey,
        name: productName(args.displayName, offer.displayLevel),
        displayName: args.displayName,
        blueprint: canonicalBlueprint(args.blueprint),
        action: useDraft ? (args.product!.isActive ? 'keep' : 'activate') : 'create',
        status: args.classification.status,
        code: args.classification.code,
        level: offer.spawnLevel,
        displayLevel: offer.displayLevel,
        price: offer.price,
        priceBasis: offer.priceBasis,
        levelBasis: offer.levelBasis,
        categoryName,
        description: productDescription(args.displayName, offer.displayLevel, aquatic),
        reason: useDraft ? `draft activated: ${args.classification.reason}` : `${args.source === 'draft' ? 'extra ladder level for draft' : 'missing from shop'}: ${args.classification.reason}`,
        aquatic,
        group,
        source: useDraft ? 'draft' : args.source,
        wikiPage: wikiPageUrl(args.wiki),
        sortOrder: null,
        current: useDraft ? {
          isActive: args.product!.isActive, price: args.product!.price, name: args.product!.name,
          categoryName: args.product!.category?.name ?? null, imageUrl: args.product!.imageUrl ?? null,
        } : null,
      });
    });
    return { ok: true };
  };

  const skippedRow = (product: ExportedProduct, blueprint: string, wiki: WikiCreature | null, classification: { status: SellStatus; code: string; reason: string }): PlanRow => ({
    productId: product.id,
    externalKey: product.externalKey!,
    name: product.name,
    displayName: stripLevelSuffix(product.name),
    blueprint: canonicalBlueprint(blueprint),
    action: product.isActive ? 'deactivate' : 'leave_inactive',
    status: 'NOT_SELLABLE',
    code: classification.code,
    level: null,
    displayLevel: null,
    price: null,
    priceBasis: '',
    levelBasis: '',
    categoryName: product.category?.name ?? null,
    description: null,
    reason: classification.reason,
    aquatic: isAquaticOnly(blueprint),
    group: null,
    source: 'draft',
    wikiPage: wikiPageUrl(wiki),
    sortOrder: null,
    current: { isActive: product.isActive, price: product.price, name: product.name, categoryName: product.category?.name ?? null, imageUrl: product.imageUrl ?? null },
  });

  // ------------------------------------------------------------------ drafts
  const sortedDrafts = [...draftProducts].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  for (const product of sortedDrafts) {
    const blueprint = payloadBlueprint(product);
    const wiki = wikiByPackage.get(packageKey(blueprint)) ?? null;
    const displayName = displayNameFor(blueprint, product.name);
    const owner = legacyOwner.get(packageKey(blueprint));
    if (owner) {
      rows.push(skippedRow(product, blueprint, wiki, { status: 'NOT_SELLABLE', code: 'duplicate', reason: `duplicate of ${owner}` }));
      continue;
    }
    const classification = classifyCreature({ name: displayName, blueprint, wiki });
    if (classification.status === 'NOT_SELLABLE') {
      rows.push(skippedRow(product, blueprint, wiki, classification));
      continue;
    }
    const result = planOffers({ product, displayName, blueprint, wiki, classification, source: 'draft' });
    if (!result.ok) rows.push(skippedRow(product, blueprint, wiki, { status: 'NOT_SELLABLE', code: result.code, reason: result.reason }));
  }

  // --------------------------------------------- wiki creatures not in products
  const wikiCandidates = [...wikiByPackage.entries()]
    .filter(([key]) => !seenPackages.has(key))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name) || a.blueprint.localeCompare(b.blueprint));
  for (const [, wiki] of wikiCandidates) {
    const displayName = displayNameFor(wiki.blueprint, wiki.entityName || wiki.name);
    const classification = classifyCreature({ name: displayName, blueprint: wiki.blueprint, wiki });
    if (classification.status === 'NOT_SELLABLE') {
      wikiSkipped.push({ name: displayName, blueprint: canonicalBlueprint(wiki.blueprint), code: classification.code, reason: classification.reason });
      continue;
    }
    const result = planOffers({ product: null, displayName, blueprint: wiki.blueprint, wiki, classification, source: 'wiki' });
    if (!result.ok) wikiSkipped.push({ name: displayName, blueprint: canonicalBlueprint(wiki.blueprint), code: result.code, reason: result.reason });
  }

  // Existing 'dino-catalog:' rows from an earlier apply: re-attach their ids (idempotent re-plan).
  const catalogByKey = new Map(catalogProducts.map((product) => [product.externalKey!, product]));
  for (const row of newRows) {
    const existing = catalogByKey.get(row.externalKey);
    if (!existing) continue;
    row.productId = existing.id;
    row.current = { isActive: existing.isActive, price: existing.price, name: existing.name, categoryName: existing.category?.name ?? null, imageUrl: existing.imageUrl ?? null };
    catalogByKey.delete(row.externalKey);
  }
  for (const product of catalogByKey.values()) {
    warnings.push(`catalog row ${product.id} ${product.externalKey} is no longer planned; left untouched for review`);
  }

  // Stable sort order for new rows: alphabetical after every legacy row.
  newRows.sort((a, b) => a.displayName.localeCompare(b.displayName) || (a.displayLevel ?? 0) - (b.displayLevel ?? 0));
  newRows.forEach((row, index) => { row.sortOrder = NEW_ROW_SORT_BASE + index; });
  rows.push(...newRows);

  // ------------------------------------------------------------------ checks
  for (const row of rows) {
    if (row.action === 'keep' || row.action === 'activate' || row.action === 'create') {
      if (!row.level || row.level < 1 || row.level > 10_000) errors.push(`${row.externalKey}: spawn level ${row.level} outside 1..10000`);
      if (row.price == null || row.price < 1) errors.push(`${row.externalKey}: price missing`);
      if (row.action !== 'keep' && (row.price ?? 0) < 10) errors.push(`${row.externalKey}: new dino price below 10`);
      if (!row.blueprint.startsWith("Blueprint'/Game/")) errors.push(`${row.externalKey}: blueprint not canonical`);
    }
  }

  // ------------------------------------------------------------------ counts
  const byAction = emptyCounts(PLAN_ACTIONS);
  const byStatus = emptyCounts<SellStatus>(['SELLABLE', 'SELLABLE_AQUATIC', 'NOT_SELLABLE']);
  const bySource: Record<string, number> = {};
  for (const row of rows) {
    byAction[row.action] += 1;
    byStatus[row.status] += 1;
    bySource[`${row.source}:${row.action}`] = (bySource[`${row.source}:${row.action}`] ?? 0) + 1;
  }
  const wikiSkippedCounts: Record<string, number> = {};
  for (const skip of wikiSkipped) wikiSkippedCounts[skip.code] = (wikiSkippedCounts[skip.code] ?? 0) + 1;

  const sellable = rows.filter((row) => row.action === 'keep' || row.action === 'activate' || row.action === 'create');
  const priceStats = (values: number[]) => values.length === 0 ? null : {
    count: values.length,
    min: Math.min(...values),
    p25: quantile(values, 0.25),
    median: median(values),
    p75: quantile(values, 0.75),
    max: Math.max(...values),
  };
  const buckets: Array<[string, number, number]> = [['<10', 0, 9], ['10-49', 10, 49], ['50-99', 50, 99], ['100-199', 100, 199], ['200-399', 200, 399], ['400-599', 400, 599], ['600+', 600, Number.POSITIVE_INFINITY]];
  const histogram = (values: number[]) => Object.fromEntries(buckets.map(([label, low, high]) => [label, values.filter((value) => value >= low && value <= high).length]));
  const priceDistribution = {
    allSellable: { ...priceStats(sellable.map((row) => row.price!)), histogram: histogram(sellable.map((row) => row.price!)) },
    legacyKept: priceStats(sellable.filter((row) => row.source === 'legacy').map((row) => row.price!)),
    newRows: { ...priceStats(sellable.filter((row) => row.source !== 'legacy').map((row) => row.price!)), histogram: histogram(sellable.filter((row) => row.source !== 'legacy').map((row) => row.price!)) },
    newByCategory: Object.fromEntries(Object.values(GROUP_CATEGORY).map((category) => [category, priceStats(sellable.filter((row) => row.source !== 'legacy' && row.categoryName === category).map((row) => row.price!))])),
    newPriceBasisKinds: countBy(sellable.filter((row) => row.source !== 'legacy'), (row) => (
      /multiplier/.test(row.priceBasis) ? (/^tier/.test(row.priceBasis) ? 'tier x variant multiplier' : 'legacy species x variant multiplier')
        : /^tier/.test(row.priceBasis) ? 'tier table' : 'legacy species price'
    )),
  };

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    generatedAt,
    generator: 'backend/scripts/dino-catalog/build-plan.ts',
    sources: input.sources ?? {},
    rules: {
      delivery: 'productType=dino, itemBlueprint = spawn.blueprint, requiredCapabilities=["delivery.dino.catalog.v1"], spawn{blueprint,level,neutered:false,forceTame:true,command} -> plugin dino{blueprint,level,forceTame:true}',
      levels: 'legacy rows unchanged; a non-variant creature sells the same level ladder as its legacy species (else the modal ladder of its tier); a variant (Aberrant/X/R/Tek) sells one row at the top level of its legacy base species; Tek spawn level = ceil(level/1.2)',
      prices: 'legacy prices unchanged; variants = legacy base species price at that level x median variant ratio learned from legacy pairs; species without legacy anchor = explicit priceAs legacy species, else tier table (median legacy price of the tier members selling exactly the tier ladder); a variant without a legacy base takes the tier price without multiplier; computed prices rounded to 5 (10 when >= 200), legacy prices copied 1:1 are not re-rounded; minimum 10 IC',
      aquatic: `water-only creatures get "${AQUATIC_NOTE_TH}" (they spawn where the buyer stands)`,
      sellability: 'boss/titan/alpha/corrupted/enraged/brute/malfunctioned/mission/VR/event/minion/non-creature/untameable/temporary-tame (Titanosaur)/ASA/mod/mobile -> NOT_SELLABLE; unknown -> NOT_SELLABLE "unverified"',
      dedupe: 'one sellable product per blueprint + displayed level; a draft whose blueprint is already sold by a legacy row stays inactive',
    },
    counts: {
      byAction,
      byStatus,
      bySource,
      sellableAfterApply: sellable.length,
      newSpeciesOrVariants: new Set(sellable.filter((row) => row.source !== 'legacy').map((row) => packageKey(row.blueprint))).size,
      wikiSkipped: wikiSkippedCounts,
      inputs: {
        products: products.length,
        legacyActive: legacyProducts.filter((product) => product.isActive).length,
        drafts: draftProducts.length,
        wikiCreatures: wikiByPackage.size,
      },
    },
    priceDistribution,
    groups: {
      levelHistogramLegacyActive: model.levelHistogram,
      modalLadderByGroup: model.groupLadders,
      variantMultipliers: Object.fromEntries(Object.entries(model.variantMultipliers).map(([group, value]) => [group, { multiplier: value.multiplier, samples: value.samples }])),
      tierTable: Object.fromEntries(Object.entries(model.tierTable).map(([tier, value]) => [tier, { ladder: value.ladder, prices: value.prices, samples: value.samples }])),
    },
    report,
    warnings,
    errors,
    rows,
    wikiSkipped,
  };
}

/** A step whose price grows this much faster than its level is reported (e.g. Lv.75 -> Lv.150 at 3.8x). */
export const LADDER_STEP_ANOMALY = 1.5;

/**
 * Report-only checks on legacy prices: a variant (Aberrant/X/R/Tek) cheaper than its
 * base species at the same level, and a ladder step whose price jump is far larger
 * than its level jump.
 */
export function legacyPriceAnomalies(legacyRows: LegacyRow[], model: LegacyModel): Plan['report']['legacyPriceAnomalies'] {
  const anomalies: Plan['report']['legacyPriceAnomalies'] = [];
  const active = legacyRows.filter((row) => row.isActive);
  for (const row of active) {
    const group = variantGroupOf({ name: row.name, blueprint: row.blueprint, categoryName: row.categoryName });
    if (!(MULTIPLIED_GROUPS as VariantGroup[]).includes(group)) continue;
    const base = model.species[speciesKey(row.name)];
    const basePrice = base?.priceByDisplay[row.displayLevel];
    if (!base || !basePrice || row.price >= basePrice) continue;
    const multiplier = model.variantMultipliers[group as MultipliedGroup].multiplier;
    anomalies.push({
      productId: row.id, name: row.name, price: row.price,
      note: `${group} variant priced below its base species (legacy ${base.name} Lv.${row.displayLevel} = ${basePrice} IC, ratio ${Math.round((row.price / basePrice) * 100) / 100}; learned ${group} multiplier ${multiplier}); kept as-is, owner to confirm`,
      suggestedPrice: niceRound(basePrice * multiplier),
    });
  }
  const byBlueprint = new Map<string, LegacyRow[]>();
  for (const row of active) byBlueprint.set(packageKey(row.blueprint), [...(byBlueprint.get(packageKey(row.blueprint)) ?? []), row]);
  for (const rows of byBlueprint.values()) {
    const ladder = [...rows].sort((a, b) => a.displayLevel - b.displayLevel);
    for (let index = 1; index < ladder.length; index += 1) {
      const low = ladder[index - 1];
      const high = ladder[index];
      if (!low.price || !low.displayLevel) continue;
      const priceStep = high.price / low.price;
      const levelStep = high.displayLevel / low.displayLevel;
      if (priceStep / levelStep <= LADDER_STEP_ANOMALY) continue;
      const levelNote = low.level !== low.displayLevel ? ` (name says Lv.${low.displayLevel} but it spawns Lv.${low.level})` : '';
      anomalies.push({
        productId: low.id, name: low.name, price: low.price,
        note: `price step to ${high.name} is ${Math.round(priceStep * 10) / 10}x for a ${Math.round(levelStep * 10) / 10}x level step${levelNote}; kept as-is, owner to confirm`,
        suggestedPrice: niceRound(high.price / levelStep),
      });
    }
  }
  return anomalies;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return Math.round((sorted[low] + (sorted[high] - sorted[low]) * (position - low)) * 100) / 100;
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[key(value)] = (counts[key(value)] ?? 0) + 1;
  return counts;
}
