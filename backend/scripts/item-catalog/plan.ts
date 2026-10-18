/**
 * Pure plan builder for the IRIS item catalog (no DB, no network).
 *
 * Inputs : every product_type='item' row (read-only export) + ark.wiki.gg Items snapshot.
 * Output : the plan written to backend/prisma/seed-data/item-catalog-plan.json and
 *          consumed by apply-plan.ts.
 *
 * Rules (see lib.ts for the primitives):
 *  - legacy 'arkshop:*' rows: keep price, quantity, quality and payload exactly. Only a
 *    missing description is filled; artwork is filled by apply-plan. A legacy row that is
 *    clearly undeliverable is planned as 'deactivate' and listed in report.legacyFlagged
 *    (never silently); softer problems are only reported.
 *  - rows without an externalKey (early seed/demo products) are kept untouched apart from
 *    a missing image, and reported when their name does not match what they deliver.
 *  - 'frozen-reference:*' drafts: activate when sellable and not a duplicate of a legacy
 *    row; otherwise leave_inactive with the reason.
 *  - ASE items on ark.wiki.gg that no product sells standalone: create.
 *  - one sellable product per blueprint + quantity + quality + isBlueprint.
 */
import {
  assetName,
  BOSS_DROP_KINDS,
  BOSS_DROP_MAX_PACK,
  CREATED_KEY_PREFIX,
  ITEM_CATEGORIES,
  MIN_ITEM_PRICE,
  UNDELIVERABLE_CODES,
  blueprintCategoryOverride,
  bossDropKind,
  buildItemDeliveryPayload,
  buildPriceModel,
  canonicalBlueprint,
  classifyItem,
  cleanDisplayName,
  effectiveStackSize,
  indexWikiItems,
  itemCategoryFor,
  median,
  nicePack,
  offerFor,
  packageKey,
  productDescription,
  productFingerprint,
  productName,
  qualityColumn,
  rootOf,
  roundPrice,
  simulateBackendItemDelivery,
  stackClassOf,
  stripBlueprintRef,
  stripQuantitySuffix,
  subTypeOf,
  wikiAliasesByPackage,
  wikiItemsByName,
  wikiPackageKey,
  wikiPageUrl,
  ITEM_DELIVERY_CAPABILITY,
  type BossDropKind,
  type Classification,
  type LegacyItemRow,
  type Offer,
  type PriceModel,
  type SellStatus,
  type SubType,
  type WikiItem,
} from './lib.js';

export const PLAN_SCHEMA_VERSION = 1;
export const LEGACY_KEY_PREFIX = 'arkshop:';
export const DRAFT_KEY_PREFIX = 'frozen-reference:';
/** Plan key for products without an externalKey (matched by productId only). */
export const SEED_KEY_PREFIX = 'product-id:';
/** New item rows are listed after every legacy row and after the dino catalog's 1000+ rows. */
export const NEW_ROW_SORT_BASE = 2000;
/** A new row priced this many times above/below its category's legacy median price is reported. */
export const OUTLIER_FACTOR = 5;

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
  quantity?: number;
  quality?: number;
  isBlueprint?: boolean;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder?: number;
  categoryId?: number | null;
  updatedAt?: string | null;
  category?: { id: number; name: string } | null;
};

/** What a row looked like when the plan was built; apply-plan.ts treats any difference as drift. */
export type RowSnapshot = {
  isActive: boolean;
  price: number;
  name: string;
  categoryName: string | null;
  imageUrl: string | null;
  updatedAt?: string | null;
  /** productFingerprint() of the writable columns (blueprint, quantity, quality, price, payload, ...). */
  fingerprint?: string;
};

export function snapshotOf(product: ExportedProduct): RowSnapshot {
  return {
    isActive: product.isActive,
    price: product.price,
    name: product.name,
    categoryName: product.category?.name ?? null,
    imageUrl: product.imageUrl ?? null,
    updatedAt: product.updatedAt ?? null,
    fingerprint: productFingerprint({
      ...product,
      categoryId: product.categoryId !== undefined ? product.categoryId : product.category?.id ?? null,
      requiredCapabilities: product.requiredCapabilities ?? [],
      quantity: product.quantity ?? 1,
      quality: product.quality ?? 0,
      isBlueprint: product.isBlueprint ?? false,
      sortOrder: product.sortOrder ?? 0,
    }),
  };
}

export type PlanRow = {
  productId: number | null;
  externalKey: string;
  name: string;
  displayName: string;
  /** Canonical Blueprint'/Game/...' of the (first) delivered item. */
  blueprint: string;
  /** Number of definition entries (legacy bundles > 1). */
  entries: number;
  action: PlanAction;
  status: SellStatus;
  code: string;
  /** Units delivered per purchase (legacy: sum of all entries). */
  quantity: number | null;
  quality: number | null;
  price: number | null;
  priceBasis: string;
  quantityBasis: string;
  qualityBasis: string;
  categoryName: string | null;
  description: string | null;
  reason: string;
  subType: SubType | null;
  stackSize: number | null;
  source: 'legacy' | 'seed' | 'draft' | 'wiki' | 'catalog';
  wikiPage: string | null;
  sortOrder: number | null;
  current: RowSnapshot | null;
  /**
   * Set on owner rows whose name does not match what they deliver: the manifest image (a
   * picture of the delivered item) is held back until the owner fixes the name or blueprint.
   */
  imageHold?: string | null;
};

export type WikiSkip = { name: string; blueprint: string; code: string; reason: string };
export type Flag = { productId: number | null; externalKey: string; name: string; code: string; note: string; suggestedPrice?: number | null };

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
    byCategoryAfterApply: Record<string, number>;
    notSellableByCode: Record<string, number>;
    sellableAfterApply: number;
    newSellable: number;
    wikiSkipped: Record<string, number>;
    inputs: { products: number; legacyActive: number; seed: number; drafts: number; wikiItems: number; wikiPackages: number };
  };
  priceDistribution: Record<string, unknown>;
  groups: Record<string, unknown>;
  report: {
    /** Legacy rows planned as 'deactivate' (clearly undeliverable). */
    legacyFlagged: Flag[];
    /** Legacy/seed rows kept as they are but worth an owner look (name/payload mismatch, odd classification). */
    legacyReview: Flag[];
    /** Legacy prices far off their group; reported only, never changed. */
    legacyPriceAnomalies: Flag[];
    /** New rows whose price needs an owner look (outliers, fallback groups, bundle-derived). */
    newPriceFlags: Flag[];
  };
  warnings: string[];
  errors: string[];
  rows: PlanRow[];
  wikiSkipped: WikiSkip[];
};

// ---------------------------------------------------------------------------

const definitionItems = (product: ExportedProduct): Array<{ Blueprint: string; Amount: number; Quality: number; ForceBlueprint?: boolean }> =>
  (Array.isArray(product.deliveryPayload?.definition?.Items) ? product.deliveryPayload.definition.Items : [])
    .map((item: any) => ({ Blueprint: String(item?.Blueprint ?? ''), Amount: Number(item?.Amount ?? 1), Quality: Number(item?.Quality ?? 0), ForceBlueprint: Boolean(item?.ForceBlueprint) }));

/** Primary blueprint (stripped) of a product: definition.Items[0], else itemBlueprint, else the draft key. */
export function primaryBlueprint(product: ExportedProduct): string {
  return stripBlueprintRef(
    definitionItems(product)[0]?.Blueprint
    || product.itemBlueprint
    || String(product.externalKey ?? '').replace(DRAFT_KEY_PREFIX, ''),
  );
}

export function createdExternalKey(blueprint: string, quantity: number): string {
  return `${CREATED_KEY_PREFIX}${packageKey(blueprint)}@${quantity}`;
}

export function identityKey(blueprint: string, quantity: number, quality: number, isBlueprint = false): string {
  return `${packageKey(blueprint)}|${quantity}|${quality}|${isBlueprint}`;
}

/** Words that do not identify an item (so "Stego Saddle" vs "Tapejara Tek Saddle" does not match on "saddle"). */
const GENERIC_WORDS = new Set(['saddle', 'skin', 'chibi', 'armor', 'tek', 'the', 'of', 'and', 'with', 'set', 'kit', 'item', 'items', 'required', 'arena', 'alpha', 'beta', 'gamma', 'platform', 'costume', 'ghost', 'swim', 'top', 'bottom', 'hat', 'shirt', 'pants', 'helmet', 'boots', 'gloves']);
const words = (value: string) => value.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word));

/** True when a product name shares no identifying word with the wiki name of what it delivers. */
export function nameMismatch(productNameValue: string, wikiName: string): boolean {
  const own = words(stripQuantitySuffix(productNameValue));
  const wiki = new Set(words(wikiName));
  if (own.length === 0 || wiki.size === 0) return false;
  return !own.some((word) => wiki.has(word) || [...wiki].some((other) => other.startsWith(word) || word.startsWith(other)));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

/**
 * True when a mismatching name is only a misspelling of the delivered item ("HemoDeus" for
 * "HomoDeus", "Blubdog" for "Bulbdog"): every identifying word is within 2 edits of a wiki word.
 */
export function spellingVariant(productNameValue: string, wikiName: string): boolean {
  const own = words(stripQuantitySuffix(productNameValue));
  const wiki = words(wikiName);
  return own.length > 0 && wiki.length > 0
    && own.every((word) => wiki.some((other) => Math.min(word.length, other.length) >= 5 && editDistance(word, other) <= 2));
}

export function legacyRowFromProduct(product: ExportedProduct, wikiByPackage: Map<string, WikiItem>): LegacyItemRow {
  const entries = definitionItems(product);
  const blueprints = entries.map((entry) => canonicalBlueprint(entry.Blueprint));
  if (blueprints.length === 0 && product.itemBlueprint) blueprints.push(canonicalBlueprint(product.itemBlueprint));
  const amounts = entries.length ? entries.map((entry) => entry.Amount) : [product.quantity ?? 1];
  const qualities = entries.length ? entries.map((entry) => entry.Quality) : [product.quality ?? 0];
  const packages = new Set(blueprints.map((blueprint) => packageKey(blueprint)));
  const wiki = wikiByPackage.get(packageKey(blueprints[0] ?? '')) ?? null;
  const categoryName = product.category?.name ?? '';
  return {
    id: product.id,
    externalKey: product.externalKey ?? `${SEED_KEY_PREFIX}${product.id}`,
    name: product.name,
    price: product.price,
    categoryName,
    blueprints,
    amounts,
    qualities,
    totalQuantity: amounts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
    isActive: product.isActive,
    singleBlueprint: packages.size === 1,
    stackSize: wiki?.stackSize ?? null,
    subType: subTypeOf({ category: categoryName, name: product.name, blueprint: blueprints[0] ?? '' }),
  };
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

const worst = (classifications: Classification[]): Classification =>
  classifications.find((value) => value.status === 'NOT_SELLABLE') ?? classifications[0];

export function buildPlan(input: {
  products: ExportedProduct[];
  wiki: WikiItem[];
  sources?: Record<string, unknown>;
  now?: Date;
}): Plan {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const products = input.products.filter((product) => product.productType === 'item');
  const wikiByPackage = indexWikiItems(input.wiki);
  const wikiAliases = wikiAliasesByPackage(input.wiki);
  const wikiByName = wikiItemsByName(input.wiki);
  const sameNameOf = (name: string) => wikiByName.get(name.trim().toLowerCase()) ?? null;
  const warnings: string[] = [];
  const errors: string[] = [];
  const rows: PlanRow[] = [];
  const wikiSkipped: WikiSkip[] = [];
  const report: Plan['report'] = { legacyFlagged: [], legacyReview: [], legacyPriceAnomalies: [], newPriceFlags: [] };

  const legacyProducts = products.filter((product) => product.externalKey?.startsWith(LEGACY_KEY_PREFIX));
  const draftProducts = products.filter((product) => product.externalKey?.startsWith(DRAFT_KEY_PREFIX));
  const catalogProducts = products.filter((product) => product.externalKey?.startsWith(CREATED_KEY_PREFIX));
  const seedProducts = products.filter((product) => !product.externalKey);
  const otherProducts = products.filter((product) => product.externalKey
    && !legacyProducts.includes(product) && !draftProducts.includes(product) && !catalogProducts.includes(product));
  for (const product of otherProducts) {
    warnings.push(`product ${product.id} "${product.name}" (${product.externalKey}) is not legacy/draft/catalog; left untouched`);
  }

  // Roots proven by legacy rows (every legacy entry has delivery history on IRIS).
  const provenRoots = new Set<string>();
  for (const product of legacyProducts) {
    for (const entry of definitionItems(product)) {
      const root = rootOf(stripBlueprintRef(entry.Blueprint));
      if (root) provenRoots.add(root);
    }
  }

  const legacyRows = [...legacyProducts, ...seedProducts].map((product) => legacyRowFromProduct(product, wikiByPackage));
  const legacyById = new Map(legacyRows.map((row) => [row.id, row]));

  // Legacy rows excluded from the price model: name/delivery mismatch or undeliverable.
  const modelExclusions = new Set<number>(seedProducts.map((product) => product.id));
  const legacyClassification = new Map<number, Classification>();
  for (const product of legacyProducts) {
    const legacy = legacyById.get(product.id)!;
    const classifications = (legacy.blueprints.length ? legacy.blueprints : ['']).map((blueprint) => classifyItem({
      name: product.name, blueprint, wiki: wikiByPackage.get(packageKey(blueprint)) ?? null, legacyProven: true, provenRoots,
    }));
    const classification = worst(classifications);
    legacyClassification.set(product.id, classification);
    const wiki = wikiByPackage.get(packageKey(legacy.blueprints[0] ?? '')) ?? null;
    if (classification.status === 'NOT_SELLABLE') modelExclusions.add(product.id);
    if (legacy.singleBlueprint && wiki && nameMismatch(product.name, wiki.name)) modelExclusions.add(product.id);
  }
  const model = buildPriceModel(legacyRows, { exclude: modelExclusions });

  // Standalone legacy owners (single-blueprint rows) and bundle membership.
  const legacyOwner = new Map<string, string>();
  const bundlesByPackage = new Map<string, LegacyItemRow[]>();
  for (const legacy of legacyRows) {
    if (!legacy.externalKey.startsWith(LEGACY_KEY_PREFIX)) continue;
    if (legacy.singleBlueprint) {
      const key = packageKey(legacy.blueprints[0]);
      if (!legacyOwner.has(key)) legacyOwner.set(key, legacy.externalKey);
    } else if (legacy.isActive) {
      for (const key of new Set(legacy.blueprints.map((blueprint) => packageKey(blueprint)))) {
        bundlesByPackage.set(key, [...(bundlesByPackage.get(key) ?? []), legacy]);
      }
    }
  }
  /** One item's share of every legacy bundle it is in: bundle price / distinct items / amount. */
  const bundleShares = (pkg: string) => (bundlesByPackage.get(pkg) ?? []).map((bundle) => {
    const amount = bundle.blueprints.reduce((sum, blueprint, index) => sum + (packageKey(blueprint) === pkg ? bundle.amounts[index] : 0), 0);
    const entries = new Set(bundle.blueprints.map((blueprint) => packageKey(blueprint))).size;
    return { key: bundle.externalKey.replace(LEGACY_KEY_PREFIX, ''), category: bundle.categoryName, amount, perUnit: bundle.price / entries / Math.max(1, amount) };
  });

  // Boss drops (apex drops, trophies, artifacts) that no legacy bundle contains are priced from
  // the bundles that contain items of the same kind (median of each item's median share), so a
  // standalone Dragon Trophy or Alpha Water Talon never costs less than the arena inputs it matches.
  type Pool = { perUnit: number; amount: number; items: number };
  const bossPools = new Map<BossDropKind, Pool>();
  for (const kind of BOSS_DROP_KINDS) {
    const members = [...bundlesByPackage.keys()].filter((pkg) => bossDropKind(pkg) === kind).map(bundleShares);
    if (members.length < 3) continue;
    bossPools.set(kind, {
      perUnit: median(members.map((shares) => median(shares.map((share) => share.perUnit)))),
      amount: median(members.map((shares) => median(shares.map((share) => share.amount)))),
      items: members.length,
    });
  }
  // Armor pieces without a legacy Armor group are priced like the pieces of the owner's armor-set
  // bundles (Flak/Riot/Ghillie/... sets), so Chitin or Pearl never cost more than Flak or Riot.
  const armorSetMembers = [...bundlesByPackage.keys()]
    .map((pkg) => bundleShares(pkg).filter((share) => share.category === 'Armor'))
    .filter((shares) => shares.length > 0);
  const armorSetPool: Pool | null = armorSetMembers.length >= 5
    ? { perUnit: median(armorSetMembers.map((shares) => median(shares.map((share) => share.perUnit)))), amount: 1, items: armorSetMembers.length }
    : null;
  const sellableIdentities = new Map<string, string>();
  const seenPackages = new Set<string>();

  // ------------------------------------------------------------------ legacy + seed
  const categoryMedianPrice: Record<string, number> = {};
  for (const category of new Set(legacyRows.map((row) => row.categoryName))) {
    // Single-blueprint rows only: boss tribute bundles (30-620 IC) are not comparable to one item.
    categoryMedianPrice[category] = median(legacyRows.filter((row) => row.isActive && row.singleBlueprint && row.categoryName === category && !modelExclusions.has(row.id)).map((row) => row.price));
  }

  for (const product of [...legacyProducts, ...seedProducts]) {
    const legacy = legacyById.get(product.id)!;
    const isSeed = !product.externalKey;
    const primary = legacy.blueprints[0] ?? '';
    const wiki = wikiByPackage.get(packageKey(primary)) ?? null;
    if (legacy.singleBlueprint) seenPackages.add(packageKey(primary));
    const classification = isSeed
      ? classifyItem({ name: product.name, blueprint: primary, wiki, legacyProven: true, provenRoots })
      : legacyClassification.get(product.id)!;
    const displayName = stripQuantitySuffix(product.name);
    const description = product.description?.trim() ? product.description : productDescription(displayName, legacy.totalQuantity);

    let action: PlanAction = product.isActive ? 'keep' : 'leave_inactive';
    let reason = product.isActive
      ? `${isSeed ? 'seed row (no externalKey) kept as is' : 'legacy row kept'}; ${classification.reason}`
      : `${isSeed ? 'seed' : 'legacy'} row is inactive (owner decision); untouched`;
    const flag = (code: string, note: string, list: Flag[] = report.legacyReview, suggestedPrice?: number | null) =>
      list.push({ productId: product.id, externalKey: legacy.externalKey, name: product.name, code, note, ...(suggestedPrice !== undefined ? { suggestedPrice } : {}) });

    if (classification.status === 'NOT_SELLABLE' && product.isActive) {
      if (UNDELIVERABLE_CODES.has(classification.code)) {
        action = 'deactivate';
        reason = `legacy row is undeliverable: ${classification.reason}`;
        flag(classification.code, classification.reason, report.legacyFlagged);
      } else {
        flag(classification.code, `${classification.reason}; kept active (legacy rows are only deactivated when clearly undeliverable), owner to confirm`);
      }
    }
    // The stored payload must pass the real builder (as it is, nothing rewritten).
    const simulated = simulateBackendItemDelivery({
      productType: 'item', itemBlueprint: product.itemBlueprint, requiredCapabilities: product.requiredCapabilities ?? [],
      deliveryPayload: product.deliveryPayload, name: product.name, quantity: product.quantity ?? 1, quality: product.quality ?? 0,
      isBlueprint: product.isBlueprint ?? false,
    });
    if (!simulated.ok && product.isActive && action === 'keep') {
      action = 'deactivate';
      reason = `stored payload fails the backend item delivery builder: ${simulated.error}`;
      flag('undeliverable_payload', simulated.error, report.legacyFlagged);
    }
    let imageHold: string | null = null;
    if (legacy.singleBlueprint && wiki && nameMismatch(product.name, wiki.name)) {
      const misspelt = spellingVariant(product.name, wiki.name);
      // A picture of the delivered item under a different item's name would mislead buyers
      // (e.g. "Stego Saddle" that delivers a Tapejara Tek Saddle): hold it until the owner fixes the row.
      if (!isSeed && !misspelt && !product.imageUrl) imageHold = `name "${product.name}" does not match the delivered item ("${wiki.name}"); image held until the owner fixes the name or blueprint`;
      flag('name_mismatch', `name does not match the delivered item (ark.wiki.gg: "${wiki.name}", ${legacy.totalQuantity}x)${misspelt ? ' (spelling only)' : ''}; excluded from the price model; kept as is${imageHold ? ', no image added until fixed' : ''}, owner to confirm`);
    }
    if (isSeed) {
      const delivered = `${legacy.totalQuantity}x ${wiki?.name ?? primary}${legacy.qualities[0] ? ` (quality ${legacy.qualities[0]})` : ''}`;
      if (/\b(set|kit)\b/i.test(product.name) && legacy.singleBlueprint) {
        flag('seed_misleading', `seed/demo row without externalKey: name promises a ${/\bkit\b/i.test(product.name) ? 'kit' : 'set'} but it delivers ${delivered}; active and purchasable, owner should fix or deactivate`);
      } else {
        flag('seed_row', `seed/demo row without externalKey (delivers ${delivered} for ${product.price} IC); kept as is, owner to confirm it should be on sale`);
      }
    }
    if (!legacy.blueprints.every((blueprint) => wikiByPackage.has(packageKey(blueprint))) && classification.status === 'SELLABLE') {
      const missing = legacy.blueprints.filter((blueprint) => !wikiByPackage.has(packageKey(blueprint))).map((blueprint) => stripBlueprintRef(blueprint).split('/').pop());
      flag('not_on_wiki', `blueprint(s) not found in ark.wiki.gg Items (${missing.join(', ')}); kept (proven legacy config)`);
    }

    if (action === 'keep' && legacy.singleBlueprint) {
      const identity = identityKey(primary, legacy.totalQuantity, legacy.qualities[0] ?? 0);
      const owner = sellableIdentities.get(identity);
      if (owner) {
        warnings.push(`${legacy.externalKey} duplicates ${owner} (same blueprint + quantity + quality); both kept, owner to choose`);
        flag('duplicate_delivery', `delivers exactly the same item as ${owner} (${legacy.totalQuantity}x ${wiki?.name ?? primary}); kept, owner to choose or fix the blueprint`);
      }
      else sellableIdentities.set(identity, legacy.externalKey);
    }

    rows.push({
      productId: product.id,
      externalKey: legacy.externalKey,
      name: product.name,
      displayName,
      blueprint: canonicalBlueprint(primary),
      entries: legacy.blueprints.length,
      action,
      status: classification.status,
      code: classification.code,
      quantity: legacy.totalQuantity,
      quality: legacy.qualities[0] ?? 0,
      price: product.price,
      priceBasis: `${isSeed ? 'seed' : 'legacy ArkShop'} price (unchanged)`,
      quantityBasis: `${isSeed ? 'seed' : 'legacy ArkShop'} quantity (unchanged)`,
      qualityBasis: `${isSeed ? 'seed' : 'legacy ArkShop'} quality (unchanged)`,
      categoryName: legacy.categoryName || null,
      description,
      reason,
      subType: legacy.subType,
      stackSize: legacy.stackSize,
      source: isSeed ? 'seed' : 'legacy',
      wikiPage: wikiPageUrl(wiki),
      sortOrder: product.sortOrder ?? null,
      current: snapshotOf(product),
      ...(imageHold ? { imageHold } : {}),
    });
  }
  report.legacyPriceAnomalies.push(...legacyPriceAnomalies(legacyRows.filter((row) => !modelExclusions.has(row.id)), model));

  // ------------------------------------------------- planner for a sellable item
  const newRows: PlanRow[] = [];
  const pricing = new Map<PlanRow, { pricedBy: 'bundle' | 'boss_pool' | 'armor_set_pool' | 'group'; perUnit: number; genericBasis: string; priceGroup: string }>();
  const planOffer = (args: {
    product: ExportedProduct | null;
    displayName: string;
    blueprint: string;
    wiki: WikiItem | null;
    categoryName: string;
    classification: Classification;
    source: 'draft' | 'wiki';
  }): { ok: true } | { ok: false; code: string; reason: string } => {
    const subType = subTypeOf({ category: args.categoryName, name: args.displayName, blueprint: args.blueprint });
    const effective = effectiveStackSize(args.wiki, args.blueprint);
    const stackSize = effective.stackSize;
    let offer = offerFor(model, { category: args.categoryName, subType, stackSize, blueprint: args.blueprint });
    if ('error' in offer) return { ok: false, code: 'unverified', reason: `unverified: ${offer.error}` };
    if (effective.note) offer = { ...offer, quantityBasis: `${effective.note}; ${offer.quantityBasis}` };
    const genericBasis = offer.priceBasis;
    let pricedBy: 'bundle' | 'boss_pool' | 'armor_set_pool' | 'group' = 'group';

    // An item the owner sells only inside legacy bundles (boss tributes, dyes) is sold in the
    // amount those bundles contain and priced at its share of the bundle price, so a
    // standalone row never undercuts e.g. a boss tribute bundle.
    const shares = bundleShares(packageKey(args.blueprint));
    const bossKind = bossDropKind(args.blueprint);
    const bossPool = bossKind ? bossPools.get(bossKind) ?? null : null;
    if (shares.length > 0) {
      pricedBy = 'bundle';
      const amount = Math.max(1, Math.round(median(shares.map((share) => share.amount))));
      const quantity = stackClassOf(stackSize) === 'stack' ? Math.min(amount, stackSize!) : 1;
      const perUnit = median(shares.map((share) => share.perUnit));
      const raw = perUnit * quantity;
      const price = roundPrice(raw);
      offer = {
        ...offer,
        quantity,
        quantityBasis: `amount in the owner's legacy bundle(s) (median ${amount})${quantity !== amount ? `, capped to ${quantity}` : ''}`,
        price,
        perUnit,
        priceGroup: `bundle:${shares.map((share) => share.key).join(',')}`,
        groupSamples: shares.length,
        priceBasis: `share of legacy bundle(s) ${shares.map((share) => share.key).join(', ')} (bundle price / distinct items / amount): median ${round4(perUnit)} IC x ${quantity}${price !== raw ? `; ${round4(raw)} rounded -> ${price}` : ''}`,
      } satisfies Offer;
    } else if (bossKind && bossPool) {
      // Apex drops / trophies / artifacts no bundle contains: the median bundle share of their kind,
      // in a small pack (never the 100x bulk-resource pack).
      pricedBy = 'boss_pool';
      const cap = Math.min(BOSS_DROP_MAX_PACK, stackSize ?? 1);
      const quantity = stackClassOf(stackSize) === 'stack' ? nicePack(Math.max(1, Math.round(bossPool.amount)), cap) : 1;
      const raw = bossPool.perUnit * quantity;
      const price = roundPrice(raw);
      offer = {
        ...offer,
        quantity,
        quantityBasis: `${bossKind.replace('_', ' ')} drop: median amount in the owner's arena bundles (${bossPool.amount}) as a small pack (max ${BOSS_DROP_MAX_PACK}${stackSize ? `, stack ${stackSize}` : ''}) -> ${quantity}`,
        price,
        perUnit: bossPool.perUnit,
        priceGroup: `boss:${bossKind}`,
        groupSamples: bossPool.items,
        priceBasis: `${bossKind.replace('_', ' ')} drop in no legacy bundle: median bundle share of the ${bossPool.items} ${bossKind.replace('_', ' ')} items in the owner's arena bundles = ${round4(bossPool.perUnit)} IC x ${quantity}${price !== raw ? `; ${round4(raw)} rounded -> ${price}` : ''}`,
      } satisfies Offer;
    } else if (args.categoryName === 'Armor' && subType === 'standard' && armorSetPool && offer.priceGroup.startsWith('*|*|')) {
      pricedBy = 'armor_set_pool';
      const raw = armorSetPool.perUnit * offer.quantity;
      const price = roundPrice(raw);
      offer = {
        ...offer,
        price,
        perUnit: armorSetPool.perUnit,
        priceGroup: 'armor-set-pieces',
        groupSamples: armorSetPool.items,
        priceBasis: `armor piece without a legacy Armor group: median per-piece share of the owner's ${armorSetPool.items} armor-set bundle pieces = ${round4(armorSetPool.perUnit)} IC x ${offer.quantity}${price !== raw ? `; ${round4(raw)} rounded -> ${price}` : ''} (keeps armor tiers monotonic: no non-Tek piece above the Flak/Riot set pieces)`,
      } satisfies Offer;
    }

    const identity = identityKey(args.blueprint, offer.quantity, offer.quality);
    const owner = sellableIdentities.get(identity);
    if (owner) return { ok: false, code: 'duplicate', reason: `duplicate of ${owner}` };
    const externalKey = args.product ? args.product.externalKey! : createdExternalKey(args.blueprint, offer.quantity);
    sellableIdentities.set(identity, externalKey);
    const name = productName(args.displayName, offer.quantity);

    const row: PlanRow = {
      productId: args.product?.id ?? null,
      externalKey,
      name,
      displayName: args.displayName,
      blueprint: canonicalBlueprint(args.blueprint),
      entries: 1,
      action: args.product ? (args.product.isActive ? 'keep' : 'activate') : 'create',
      status: 'SELLABLE',
      code: args.classification.code,
      quantity: offer.quantity,
      quality: offer.quality,
      price: offer.price,
      priceBasis: offer.priceBasis,
      quantityBasis: offer.quantityBasis,
      qualityBasis: offer.qualityBasis,
      categoryName: args.categoryName,
      description: productDescription(args.displayName, offer.quantity),
      reason: args.product ? `draft activated: ${args.classification.reason}` : `missing from shop: ${args.classification.reason}`,
      subType,
      stackSize,
      source: args.product ? 'draft' : 'wiki',
      wikiPage: wikiPageUrl(args.wiki),
      sortOrder: null,
      current: args.product ? snapshotOf(args.product) : null,
    };
    newRows.push(row);
    pricing.set(row, { pricedBy, perUnit: offer.perUnit, genericBasis, priceGroup: offer.priceGroup });

    const newFlag = (code: string, note: string) => report.newPriceFlags.push({ productId: row.productId, externalKey, name, code, note });
    const categoryMedian = categoryMedianPrice[args.categoryName];
    const bundleFlag = pricedBy === 'bundle';
    if (bundleFlag) newFlag('bundle_derived', row.priceBasis);
    else if (pricedBy === 'boss_pool') newFlag('boss_drop_pool', `${row.priceBasis} (generic basis would have been: ${genericBasis})`);
    else if (pricedBy === 'armor_set_pool') newFlag('armor_set_pool', `${row.priceBasis} (generic basis would have been: ${genericBasis})`);
    else if (categoryMedian && (offer.price > categoryMedian * OUTLIER_FACTOR || offer.price * OUTLIER_FACTOR < categoryMedian)) {
      newFlag('outlier', `${offer.price} IC vs legacy ${args.categoryName} median ${categoryMedian} IC (${offer.priceGroup})`);
    }
    if (pricedBy === 'group' && offer.priceGroup.startsWith('*|*|')) newFlag('fallback_group', `no ${args.categoryName} legacy group with enough samples; priced from all legacy ${offer.priceGroup.split('|')[2]} items`);
    if (!bundleFlag && subType === 'tek') {
      newFlag(offer.priceGroup.includes('|tek|') ? 'tek_thin_sample' : 'tek_without_samples', offer.priceGroup.includes('|tek|')
        ? `Tek item priced from only ${offer.groupSamples} legacy Tek rows (${offer.priceGroup})`
        : `Tek item priced like a normal ${args.categoryName} item (no legacy Tek group with enough samples)`);
    }
    if (args.categoryName === 'Chibi') newFlag('chibi_median', `legacy chibi prices range 1-1590 IC by rarity; priced at the legacy chibi median (${offer.price} IC)`);
    return { ok: true };
  };

  const skippedRow = (product: ExportedProduct, blueprint: string, wiki: WikiItem | null, classification: { code: string; reason: string }): PlanRow => ({
    productId: product.id,
    externalKey: product.externalKey!,
    name: product.name,
    displayName: stripQuantitySuffix(product.name),
    blueprint: canonicalBlueprint(blueprint),
    entries: definitionItems(product).length || 1,
    action: product.isActive ? 'deactivate' : 'leave_inactive',
    status: 'NOT_SELLABLE',
    code: classification.code,
    quantity: null,
    quality: null,
    price: null,
    priceBasis: '',
    quantityBasis: '',
    qualityBasis: '',
    categoryName: product.category?.name ?? null,
    description: null,
    reason: classification.reason,
    subType: null,
    stackSize: wiki?.stackSize ?? null,
    source: 'draft',
    wikiPage: wikiPageUrl(wiki),
    sortOrder: null,
    current: snapshotOf(product),
  });

  // ------------------------------------------------------------------ drafts
  const sortedDrafts = [...draftProducts].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  for (const product of sortedDrafts) {
    const blueprint = primaryBlueprint(product);
    const wiki = wikiByPackage.get(packageKey(blueprint)) ?? null;
    seenPackages.add(packageKey(blueprint));
    let displayName = cleanDisplayName(stripQuantitySuffix(product.name));
    // The wiki files some blueprints under several pages; a draft named after the alias page
    // that does not match the asset ("Federation Exo Gauntlets" -> PrimalItemArmor_TekHelmet_Gen2)
    // takes the name of the page that does ("Federation Exo Helmet").
    let renamed: string | null = null;
    const aliases = wikiAliases.get(packageKey(blueprint)) ?? [];
    if (wiki && aliases.length > 1 && cleanDisplayName(wiki.name).toLowerCase() !== displayName.toLowerCase()
      && aliases.some((alias) => alias !== wiki && cleanDisplayName(alias.name).toLowerCase() === displayName.toLowerCase())) {
      renamed = `draft named after the wiki alias page "${displayName}" of ${assetName(blueprint)}; renamed to "${cleanDisplayName(wiki.name)}" (the page matching the asset)`;
      displayName = cleanDisplayName(wiki.name);
      warnings.push(`${product.externalKey} (#${product.id}): ${renamed}`);
    }
    const owner = legacyOwner.get(packageKey(blueprint));
    if (owner) {
      rows.push(skippedRow(product, blueprint, wiki, { code: 'duplicate', reason: `duplicate of ${owner}` }));
      continue;
    }
    const classification = classifyItem({ name: displayName, blueprint, wiki, provenRoots, sameName: sameNameOf(wiki?.name ?? displayName) });
    if (classification.status === 'NOT_SELLABLE') {
      rows.push(skippedRow(product, blueprint, wiki, classification));
      continue;
    }
    const draftCategory = (ITEM_CATEGORIES as readonly string[]).includes(product.category?.name ?? '')
      ? product.category!.name
      : itemCategoryFor({ wikiCategory: wiki?.category, page: wiki?.page, blueprint });
    const categoryName = blueprintCategoryOverride({ category: draftCategory, name: displayName, blueprint }) ?? draftCategory;
    const result = planOffer({ product, displayName, blueprint, wiki, categoryName, classification, source: 'draft' });
    if (result.ok && (renamed || categoryName !== draftCategory)) {
      const row = newRows[newRows.length - 1];
      if (renamed) row.reason += `; ${renamed}`;
      if (categoryName !== draftCategory) row.reason += `; category ${draftCategory} -> ${categoryName} (blueprint class ${assetName(blueprint).split('_')[0]})`;
    }
    if (!result.ok) rows.push(skippedRow(product, blueprint, wiki, { code: result.code, reason: result.reason }));
  }

  // --------------------------------------------- wiki items no product sells standalone
  const wikiCandidates = [...wikiByPackage.entries()]
    .filter(([key]) => !seenPackages.has(key))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name) || a.blueprint.localeCompare(b.blueprint));
  for (const [key, wiki] of wikiCandidates) {
    const displayName = cleanDisplayName(wiki.name);
    const blueprint = stripBlueprintRef(wiki.blueprint);
    const owner = legacyOwner.get(key);
    if (owner) { wikiSkipped.push({ name: displayName, blueprint: canonicalBlueprint(blueprint), code: 'duplicate', reason: `duplicate of ${owner}` }); continue; }
    const classification = classifyItem({ name: displayName, blueprint, wiki, provenRoots, sameName: sameNameOf(wiki.name) });
    if (classification.status === 'NOT_SELLABLE') {
      wikiSkipped.push({ name: displayName, blueprint: canonicalBlueprint(blueprint), code: classification.code, reason: classification.reason });
      continue;
    }
    const wikiCategory = itemCategoryFor({ wikiCategory: wiki.category, page: wiki.page, blueprint });
    const categoryName = blueprintCategoryOverride({ category: wikiCategory, name: displayName, blueprint }) ?? wikiCategory;
    const result = planOffer({ product: null, displayName, blueprint, wiki, categoryName, classification, source: 'wiki' });
    if (!result.ok) wikiSkipped.push({ name: displayName, blueprint: canonicalBlueprint(blueprint), code: result.code, reason: result.reason });
  }
  // Wiki rows without a usable /Game/ blueprint (cannot be delivered at all).
  for (const item of input.wiki) {
    if (wikiPackageKey(item.blueprint)) continue;
    const classification = classifyItem({ name: item.name, blueprint: item.blueprint, wiki: item, provenRoots, sameName: sameNameOf(item.name) });
    wikiSkipped.push({ name: item.name, blueprint: stripBlueprintRef(item.blueprint).slice(0, 160), code: classification.code, reason: classification.reason });
  }

  // Existing 'item-catalog:' rows from an earlier apply: re-attach their ids (idempotent re-plan).
  const catalogByKey = new Map(catalogProducts.map((product) => [product.externalKey!, product]));
  for (const row of newRows) {
    const existing = catalogByKey.get(row.externalKey);
    if (!existing) continue;
    row.productId = existing.id;
    row.action = existing.isActive ? 'keep' : 'activate';
    row.source = 'catalog';
    row.current = snapshotOf(existing);
    catalogByKey.delete(row.externalKey);
  }
  for (const product of catalogByKey.values()) {
    warnings.push(`catalog row ${product.id} ${product.externalKey} is no longer planned; left untouched for review`);
  }

  // Several wiki blueprints can share one page name ("Rockwell Recipes", "Dino Candy"): name them apart.
  const byDisplayName = new Map<string, PlanRow[]>();
  for (const row of newRows) byDisplayName.set(row.displayName.toLowerCase(), [...(byDisplayName.get(row.displayName.toLowerCase()) ?? []), row]);
  for (const group of byDisplayName.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.displayName = `${row.displayName} (${variantLabel(row.blueprint, group.map((other) => other.blueprint))})`;
      row.name = productName(row.displayName, row.quantity!);
      row.description = productDescription(row.displayName, row.quantity!);
    }
  }
  // Rows priced by a bundle share, a pool or the all-items fallback that land far below the
  // per-unit price of related new rows (same category, sub-type, stack class) are flagged.
  for (const row of newRows) {
    const info = pricing.get(row)!;
    if (info.pricedBy === 'group' && !info.priceGroup.startsWith('*|*|')) continue;
    const related = newRows.filter((other) => other !== row && other.categoryName === row.categoryName && other.subType === row.subType
      && stackClassOf(other.stackSize) === stackClassOf(row.stackSize));
    if (related.length < 3) continue;
    const relatedPerUnit = median(related.map((other) => other.price! / other.quantity!));
    const perUnit = row.price! / row.quantity!;
    if (perUnit * OUTLIER_FACTOR >= relatedPerUnit) continue;
    report.newPriceFlags.push({
      productId: row.productId, externalKey: row.externalKey, name: row.name, code: 'below_related',
      note: `per-unit ${round4(perUnit)} IC is below 1/${OUTLIER_FACTOR} of the ${round4(relatedPerUnit)} IC median of ${related.length} related new ${row.categoryName}/${row.subType}/${stackClassOf(row.stackSize)} rows (${info.pricedBy === 'group' ? 'fallback group' : info.pricedBy.replace(/_/g, ' ')}); owner to confirm`,
    });
  }
  const newRowByKey = new Map(newRows.map((row) => [row.externalKey, row]));
  for (const entry of report.newPriceFlags) entry.name = newRowByKey.get(entry.externalKey)?.name ?? entry.name;

  // Stable sort order for new rows: by category then name, after every legacy and dino catalog row.
  const categoryOrder = (name: string | null) => (ITEM_CATEGORIES as readonly string[]).indexOf(name ?? '');
  newRows.sort((a, b) => categoryOrder(a.categoryName) - categoryOrder(b.categoryName) || a.displayName.localeCompare(b.displayName) || (a.quantity ?? 0) - (b.quantity ?? 0));
  newRows.forEach((row, index) => { row.sortOrder = NEW_ROW_SORT_BASE + index; });
  rows.push(...newRows);

  // ------------------------------------------------------------------ checks
  for (const row of rows) {
    if (row.action !== 'keep' && row.action !== 'activate' && row.action !== 'create') continue;
    if (row.price == null || row.price < MIN_ITEM_PRICE || !Number.isSafeInteger(row.price)) errors.push(`${row.externalKey}: price ${row.price} invalid`);
    if (row.source === 'legacy' || row.source === 'seed') continue;
    if (!row.quantity || !Number.isSafeInteger(row.quantity) || row.quantity < 1) errors.push(`${row.externalKey}: quantity ${row.quantity} invalid`);
    if (row.stackSize != null && (row.quantity ?? 0) > row.stackSize) errors.push(`${row.externalKey}: quantity ${row.quantity} above stack size ${row.stackSize}`);
    if (!row.blueprint.startsWith("Blueprint'/Game/")) errors.push(`${row.externalKey}: blueprint not canonical`);
    if (!(ITEM_CATEGORIES as readonly string[]).includes(row.categoryName ?? '')) errors.push(`${row.externalKey}: category ${row.categoryName} is not an item category`);
    const payload = buildItemDeliveryPayload({
      externalKey: row.externalKey, blueprint: row.blueprint, quantity: row.quantity!, quality: row.quality ?? 0, price: row.price!, name: row.name,
      priceBasis: row.priceBasis, quantityBasis: row.quantityBasis, qualityBasis: row.qualityBasis, wikiPage: row.wikiPage, plannedAt: generatedAt,
    });
    const simulated = simulateBackendItemDelivery({
      productType: 'item', itemBlueprint: payload.definition.Items[0].Blueprint, requiredCapabilities: [ITEM_DELIVERY_CAPABILITY],
      deliveryPayload: payload, name: row.name, quantity: row.quantity!, quality: qualityColumn(row.quality ?? 0), isBlueprint: false,
    }, { strict: true });
    if (!simulated.ok) errors.push(`${row.externalKey}: ${simulated.error}`);
  }

  // ------------------------------------------------------------------ counts
  const byAction = emptyCounts(PLAN_ACTIONS);
  const byStatus = emptyCounts<SellStatus>(['SELLABLE', 'NOT_SELLABLE']);
  const bySource: Record<string, number> = {};
  const notSellableByCode: Record<string, number> = {};
  for (const row of rows) {
    byAction[row.action] += 1;
    byStatus[row.status] += 1;
    bySource[`${row.source}:${row.action}`] = (bySource[`${row.source}:${row.action}`] ?? 0) + 1;
    if (row.status === 'NOT_SELLABLE') notSellableByCode[row.code] = (notSellableByCode[row.code] ?? 0) + 1;
  }
  const wikiSkippedCounts: Record<string, number> = {};
  for (const skip of wikiSkipped) wikiSkippedCounts[skip.code] = (wikiSkippedCounts[skip.code] ?? 0) + 1;

  const sellable = rows.filter((row) => row.action === 'keep' || row.action === 'activate' || row.action === 'create');
  const fresh = sellable.filter((row) => row.source !== 'legacy' && row.source !== 'seed');
  const byCategoryAfterApply: Record<string, number> = {};
  for (const row of sellable) byCategoryAfterApply[row.categoryName ?? '(none)'] = (byCategoryAfterApply[row.categoryName ?? '(none)'] ?? 0) + 1;
  const priceStats = (values: number[]) => values.length === 0 ? null : {
    count: values.length, min: Math.min(...values), p25: quantile(values, 0.25), median: median(values), p75: quantile(values, 0.75), max: Math.max(...values),
  };
  const buckets: Array<[string, number, number]> = [['1', 1, 1], ['2-4', 2, 4], ['5-9', 5, 9], ['10-49', 10, 49], ['50-99', 50, 99], ['100-499', 100, 499], ['500+', 500, Number.POSITIVE_INFINITY]];
  const histogram = (values: number[]) => Object.fromEntries(buckets.map(([label, low, high]) => [label, values.filter((value) => value >= low && value <= high).length]));
  const priceDistribution = {
    allSellable: { ...priceStats(sellable.map((row) => row.price!)), histogram: histogram(sellable.map((row) => row.price!)) },
    legacyKept: priceStats(sellable.filter((row) => row.source === 'legacy').map((row) => row.price!)),
    newRows: { ...priceStats(fresh.map((row) => row.price!)), histogram: histogram(fresh.map((row) => row.price!)) },
    newByCategory: Object.fromEntries(ITEM_CATEGORIES.map((category) => [category, priceStats(fresh.filter((row) => row.categoryName === category).map((row) => row.price!))])),
    newQuantityByCategory: Object.fromEntries(ITEM_CATEGORIES.map((category) => [category, countBy(fresh.filter((row) => row.categoryName === category), (row) => String(row.quantity))])),
  };

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    generatedAt,
    generator: 'backend/scripts/item-catalog/build-plan.ts',
    sources: input.sources ?? {},
    rules: {
      delivery: 'productType=item, deliveryPayload.definition.Items=[{Blueprint,Amount,Quality,ForceBlueprint:false}], itemBlueprint=Items[0].Blueprint, quantity=Amount, quality=integer Quality (fractional -> 0, as import-arkshop-catalog), isBlueprint=false, requiredCapabilities=["delivery.item.v1"] -> plugin items[{blueprint,quantity: Amount x units bought,quality,isBlueprint}] -> GiveItemToPlayer',
      legacy: 'legacy arkshop:* rows keep price, quantity, quality, name, category and payload exactly; only a missing description is filled and a missing image added; clearly undeliverable rows (no/invalid blueprint, ASA, mod, mobile, payload rejected by the builder) are deactivated and listed in report.legacyFlagged; everything else questionable is only reported (report.legacyReview); a row whose name does not match the item it delivers (not just a misspelling) gets no image (row.imageHold) until the owner fixes it',
      sellability: 'ASA path/category, mobile, not on Steam PC, mod path/category, admin/debug/cheat, mission/VR/quest, unobtainable/WIP/disambiguation, non-items (implant, generic classes, generic Dermis), fertilized eggs, eggs of creatures that cannot breed on PC (Griffin, Phoenix), a PC page without a map whose same-name page is mobile/console-only, Genesis HLNA exchange lootcrates -> NOT_SELLABLE; unproven official-map /Game/Mods roots and anything not on the wiki or under an unproven root -> NOT_SELLABLE "unverified"; Aquatica (/Game/Abyss) follows the owner opt-in given for Aquatica creatures',
      quantity: 'non-stackable (wiki stack size 1 or unknown) -> 1 per purchase; stackable -> median legacy pack of the category (all categories when < 5 samples) rounded to a nice number and capped by the wiki stack size (one stack, one definition entry); ammo without a wiki stack size stacks to 100; single-use weapon-class tools (wiki "Tools") -> 1; boss drops in a small pack (<= 10, or their legacy bundle amount)',
      category: 'draft category, or the wiki category for new rows; the blueprint class overrides a keyword category where it is clearly wrong (PrimalItemConsumable_/Structure_/non-saddle Armor_ filed under Skins, PrimalItemTrophy_ -> Items); names drop the wiki "(Survival Evolved/Ascended)" suffix and a draft named after a wiki alias page takes the page that matches its asset',
      quality: 'Primitive (0) unless most legacy non-stackable rows of the category use a quality (then that category median, e.g. saddles/armor)',
      price: `legacy per-unit median of the narrowest group with >= 5 single-blueprint legacy rows: category+sub-type (tek/platform/costume) -> sub-type across categories -> category -> all, split by stackable/non-stackable; x quantity; rounded (integers kept, < 20 to 1, < 200 to 5, else 10); minimum ${MIN_ITEM_PRICE} IC; items the owner sells only inside legacy bundles use the median bundle per-unit price instead; apex drops / alpha apex drops / trophies / artifacts in no bundle use the median bundle share of their kind (report.newPriceFlags boss_drop_pool); armor pieces without an Armor group use the per-piece share of the owner armor-set bundles (armor_set_pool, keeps tiers monotonic); rows priced by a share/pool/fallback far below related new rows are flagged below_related`,
      dedupe: 'one sellable product per blueprint + quantity + quality + isBlueprint; a draft or wiki item whose blueprint a single-blueprint legacy row already sells stays inactive / is skipped as "duplicate of <key>"',
      description: 'new rows and legacy rows without a description: "<Name> x<qty>"',
    },
    counts: {
      byAction,
      byStatus,
      bySource,
      byCategoryAfterApply,
      notSellableByCode,
      sellableAfterApply: sellable.length,
      newSellable: fresh.length,
      wikiSkipped: wikiSkippedCounts,
      inputs: {
        products: products.length,
        legacyActive: legacyProducts.filter((product) => product.isActive).length,
        seed: seedProducts.length,
        drafts: draftProducts.length,
        wikiItems: input.wiki.length,
        wikiPackages: wikiByPackage.size,
      },
    },
    priceDistribution,
    groups: {
      provenRoots: [...provenRoots].sort(),
      priceGroups: Object.fromEntries([...model.groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((group) => [group.key, {
        samples: group.perUnit.length, perUnitMedian: Math.round(median(group.perUnit) * 10_000) / 10_000, quantityMedian: median(group.quantities),
      }])),
      qualityByCategory: model.qualityByCategory,
      categoryMedianPrice,
    },
    report,
    warnings,
    errors,
    rows,
    wikiSkipped,
  };
}

/**
 * Human label that tells apart blueprints sharing one wiki page name, from the part of
 * the asset name that differs: PrimalItem_RecipeNote_BrothofAtlan -> "Brothof Atlan".
 */
export function variantLabel(blueprint: string, siblings: string[]): string {
  const objectName = (value: string) => stripBlueprintRef(value).split('.').pop() ?? '';
  const own = objectName(blueprint).split('_');
  const others = siblings.filter((value) => value !== blueprint).map((value) => objectName(value).split('_'));
  let start = 0;
  while (start < own.length - 1 && others.every((parts) => parts[start] === own[start])) start += 1;
  const tail = own.slice(start).join(' ') || objectName(blueprint);
  return tail.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}

/** A legacy row whose per-unit price is this many times off its group's median is reported. */
export const LEGACY_ANOMALY_FACTOR = 10;

/** Report-only check on legacy prices against their own price group. */
export function legacyPriceAnomalies(legacyRows: LegacyItemRow[], model: PriceModel): Flag[] {
  const anomalies: Flag[] = [];
  for (const row of legacyRows) {
    if (!row.isActive || !row.singleBlueprint || row.totalQuantity < 1) continue;
    const cls = stackClassOf(row.stackSize);
    // Compare a Tek saddle with Tek saddles, a ghost costume with costumes, etc.
    const ownSubType = row.subType !== 'standard' ? model.groups.get(`${row.categoryName}|${row.subType}|${cls}`) : undefined;
    const group = ownSubType && ownSubType.perUnit.length >= 3 ? ownSubType : model.groups.get(`${row.categoryName}|*|${cls}`);
    if (!group || group.perUnit.length < 5) continue;
    const groupMedian = median(group.perUnit);
    const perUnit = row.price / row.totalQuantity;
    if (!groupMedian || (perUnit <= groupMedian * LEGACY_ANOMALY_FACTOR && perUnit * LEGACY_ANOMALY_FACTOR >= groupMedian)) continue;
    anomalies.push({
      productId: row.id,
      externalKey: row.externalKey,
      name: row.name,
      code: perUnit > groupMedian ? 'legacy_expensive' : 'legacy_cheap',
      note: `per-unit ${Math.round(perUnit * 10_000) / 10_000} IC is ${Math.round((perUnit / groupMedian) * 10) / 10}x the legacy ${group.key.replace(/\|/g, '/')} median ${Math.round(groupMedian * 10_000) / 10_000} IC; kept as-is (owner rule), owner to confirm`,
      suggestedPrice: roundPrice(groupMedian * row.totalQuantity),
    });
  }
  return anomalies;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

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
