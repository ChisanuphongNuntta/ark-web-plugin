/**
 * Pure, side-effect free logic for the IRIS item catalog plan.
 *
 * Used by build-plan.ts (offline plan generation), apply-plan.ts (DB writer) and
 * tests/unit/item-catalog*.test.ts. Nothing here touches the database or the network.
 *
 * Delivery contract (must match src/services/itemCatalogDelivery.ts, which
 * checkout.controller and game-shop.controller call, and HeartShop.cpp's "order" branch):
 *   product.productType          = 'item'
 *   product.itemBlueprint        = definition.Items[0].Blueprint (exact string)
 *   product.quantity/quality/isBlueprint = Items[0] Amount / integer Quality / ForceBlueprint
 *   product.requiredCapabilities = ['delivery.item.v1'] (one entry) | ['delivery.item.bundle.v1'] (several)
 *   deliveryPayload.definition   = { Type: 'item', Items: [{ Blueprint, Amount, Quality, ForceBlueprint }], Price, Description }
 * The backend turns that into { schemaVersion: 1, productType: 'item', item, items: [{ blueprint,
 * quantity: Amount x units bought, quality, isBlueprint }] } and the plugin calls
 * GiveItemToPlayer(player, blueprint, quantity, quality, isBlueprint) per entry.
 */
import { createHash } from 'node:crypto';
import {
  ITEM_BUNDLE_DELIVERY_CAPABILITY,
  ITEM_DELIVERY_CAPABILITY,
  pluginRejectsItemPayload,
  resolveItemDelivery,
  type ItemDeliveryPayload,
} from '../../src/services/itemCatalogDelivery.js';
// Blueprint + artwork helpers are shared with the dino catalog (imported, not copied).
import {
  assetName,
  canonicalBlueprint,
  lookupArtwork,
  lookupArtworkMatch,
  median,
  packageKey,
  packagePath,
  parseArtworkManifest as parseSharedArtworkManifest,
  stripBlueprintRef,
  type ArtworkIndex as SharedArtworkIndex,
  type ArtworkMatch,
} from '../dino-catalog/lib.js';

export {
  assetName, canonicalBlueprint, lookupArtwork, lookupArtworkMatch, median, packageKey, packagePath,
  stripBlueprintRef, ITEM_BUNDLE_DELIVERY_CAPABILITY, ITEM_DELIVERY_CAPABILITY,
};
export type { ArtworkMatch };

/**
 * Item artwork index: the shared (dino catalog) blueprint/externalKey index plus the
 * per-product images item-artwork.json lists under `productImages` ("<product id>": { imageUrl }).
 * fetch-artwork-products.mjs resolves those per product (shop name, bundle boss icon, a
 * product-specific icon where several products share one blueprint), so they win over a
 * blueprint-level match for that product id.
 */
export type ArtworkIndex = SharedArtworkIndex & { byProductId?: Map<number, string> };

export function parseArtworkManifest(raw: unknown): ArtworkIndex {
  const index: ArtworkIndex = parseSharedArtworkManifest(raw);
  const productImages = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).productImages : null;
  if (productImages && typeof productImages === 'object' && !Array.isArray(productImages)) {
    index.byProductId = new Map();
    for (const [key, value] of Object.entries(productImages as Record<string, unknown>)) {
      const id = Number(key);
      const url = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as Record<string, unknown>).imageUrl : null;
      if (Number.isSafeInteger(id) && typeof url === 'string' && url.trim()) index.byProductId.set(id, url.trim());
    }
  }
  return index;
}

/**
 * Artwork for one plan row: the manifest's image for that product id first (targeted at it),
 * then the externalKey entry, then the blueprint entry.
 */
export function lookupItemArtworkMatch(
  index: ArtworkIndex,
  row: { externalKey: string; blueprint: string; productId?: number | null },
): ArtworkMatch | null {
  const byProduct = row.productId != null ? index.byProductId?.get(row.productId) : undefined;
  if (byProduct) return { imageUrl: byProduct, productIds: [row.productId!] };
  return lookupArtworkMatch(index, row);
}

export const ITEM_CATALOG_SOURCE = 'iris-item-catalog';
export const CREATED_KEY_PREFIX = 'item-catalog:';
export const MIN_ITEM_PRICE = 1;
/** A (category, sub-type, stack class) price group needs this many legacy rows to be used. */
export const MIN_GROUP_SAMPLES = 5;
/**
 * A sub-type group (Tek / platform / costume) refines a category that is already
 * learned from >= MIN_GROUP_SAMPLES rows, so it is used from this many samples
 * (legacy sells only 2 Tek weapons and 4 Tek non-saddle items).
 */
export const MIN_SUBTYPE_SAMPLES = 2;

/** Shop categories item products live in (all exist in production). */
export const ITEM_CATEGORIES = ['Armor', 'Chibi', 'Consumables', 'Items', 'Resources', 'Saddles', 'Skins', 'Structures', 'Weapons & Ammo'] as const;
export type ItemCategory = typeof ITEM_CATEGORIES[number];

/** Capabilities HeartShop advertises (ark-plugin/src/HttpClient.cpp heartbeat). */
export const PLUGIN_CAPABILITIES = [
  'hmac_signatures', 'atomic_claims', 'delivery_receipts', 'local_idempotency_journal', 'read_retry', 'circuit_breaker',
  ITEM_DELIVERY_CAPABILITY, ITEM_BUNDLE_DELIVERY_CAPABILITY, 'delivery.dino.catalog.v1', 'game-shop.quote-confirm.v1',
  'marketplace.asset-lock.v1', 'marketplace.dino-native.v2', 'delivery.dino.v2', 'protocol.v1',
];

// ---------------------------------------------------------------------------
// Wiki snapshot
// ---------------------------------------------------------------------------

/** One ark.wiki.gg Cargo Items row plus its page categories (fetch-wiki.ts). */
export type WikiItem = {
  page: string;
  name: string;
  id: string | null;
  /** Raw Cargo value, e.g. Blueprint'/Game/.../X.X' (may be empty or malformed). */
  blueprint: string;
  /** Cargo "Category" (Skins, Resources, Saddles, ...). */
  category: string;
  stackSize: number | null;
  isMobile: boolean;
  pageCategories: string[];
};

/**
 * One wiki row per package path; prefer the non-mobile, English page with a stack size. On a
 * tie, the page whose name matches the asset name wins: the wiki files one blueprint under
 * several pages ("Federation Exo Gauntlets" and "Federation Exo Helmet" both point at
 * PrimalItemArmor_TekHelmet_Gen2; "Tek Binoculars (Survival Ascended)" and "Electronic
 * Binoculars (Survival Evolved)" at PrimalItem_WeaponElectronicBinoculars).
 */
export function indexWikiItems(items: WikiItem[]): Map<string, WikiItem> {
  const index = new Map<string, WikiItem>();
  const score = (item: WikiItem) => (item.isMobile ? -10 : 0) + (item.page.includes('/') ? -2 : 0) + (item.stackSize ? 1 : 0)
    + 0.01 * assetNameMatches(item.name, item.blueprint);
  for (const item of items) {
    const key = wikiPackageKey(item.blueprint);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing || score(item) > score(existing)) index.set(key, item);
  }
  return index;
}

/** Number of words (4+ letters) of a wiki page name that appear in the blueprint's asset name. */
export function assetNameMatches(name: string, blueprint: string): number {
  const asset = assetName(blueprint).replace(/[^a-z0-9]/g, '');
  return cleanDisplayName(name).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && asset.includes(word)).length;
}

/** Every usable wiki row per package path (the page index keeps one; aliases name the same blueprint). */
export function wikiAliasesByPackage(items: WikiItem[]): Map<string, WikiItem[]> {
  const aliases = new Map<string, WikiItem[]>();
  for (const item of items) {
    const key = wikiPackageKey(item.blueprint);
    if (key) aliases.set(key, [...(aliases.get(key) ?? []), item]);
  }
  return aliases;
}

/** Wiki rows by lower-case item name, including blueprint-less mobile pages ("Mobile:Griffin Egg"). */
export function wikiItemsByName(items: WikiItem[]): Map<string, WikiItem[]> {
  const byName = new Map<string, WikiItem[]>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  return byName;
}

/** Shop display name: drops the wiki's game disambiguation suffix ("Electronic Binoculars (Survival Evolved)"). */
export function cleanDisplayName(name: string): string {
  return name.replace(/\s*\((?:ARK:\s*)?Survival (?:Evolved|Ascended)\)/gi, '').replace(/\s+/g, ' ').trim();
}

/** Package key of a wiki blueprint value, or '' when it is not a usable /Game/ path. */
export function wikiPackageKey(value: string): string {
  const stripped = stripBlueprintRef(value);
  return /^\/game\//i.test(stripped) ? packageKey(stripped) : '';
}

export function wikiPageUrl(wiki: WikiItem | null | undefined): string | null {
  return wiki ? `https://ark.wiki.gg/wiki/${encodeURIComponent(wiki.page.replace(/ /g, '_'))}` : null;
}

// ---------------------------------------------------------------------------
// Category, sub-type, stack class
// ---------------------------------------------------------------------------

/**
 * Shop category for an item that is not in the products table yet. Same rule as
 * scripts/prepare-frozen-drafts.mjs, which created the 'frozen-reference:' drafts.
 */
export function itemCategoryFor(input: { wikiCategory?: string | null; page?: string | null; blueprint: string }): ItemCategory {
  // An unambiguous wiki Cargo category wins (so the resource "Sarcosuchus Skin" is not a Skin).
  const direct = WIKI_CATEGORY_MAP[(input.wikiCategory ?? '').trim()];
  if (direct) return direct;
  const value = `${input.wikiCategory ?? ''} ${input.page ?? ''} ${input.blueprint}`.toLowerCase();
  if (/chibi/.test(value)) return 'Chibi';
  if (/skin|costume/.test(value)) return 'Skins';
  if (/saddle/.test(value)) return 'Saddles';
  if (/armor/.test(value)) return 'Armor';
  if (/weapon|ammo/.test(value)) return 'Weapons & Ammo';
  if (/structure|primalitemstructure/.test(value)) return 'Structures';
  if (/resource/.test(value)) return 'Resources';
  if (/consumable|food|recipe|kibble/.test(value)) return 'Consumables';
  return 'Items';
}

const WIKI_CATEGORY_MAP: Record<string, ItemCategory> = {
  Resources: 'Resources', Resource: 'Resources', Skins: 'Skins', 'Chibi-pets': 'Chibi', Saddles: 'Saddles',
  Weapons: 'Weapons & Ammo', Weapon: 'Weapons & Ammo', Guns: 'Weapons & Ammo', 'Melee weapons': 'Weapons & Ammo',
  'Ranged weapons': 'Weapons & Ammo', Bows: 'Weapons & Ammo', Ammunition: 'Weapons & Ammo', Arrows: 'Weapons & Ammo',
  Explosives: 'Weapons & Ammo',
  Armor: 'Armor', Consumables: 'Consumables', Consumable: 'Consumables',
};

/**
 * Category from the blueprint class where a keyword-based category (the draft rule matches
 * "skin" / "trophy" in names) is clearly wrong: Waterskin (PrimalItemConsumable_) is not a
 * Skin, Seafin Glider Suit (PrimalItemArmor_) is armor, fishing trophies (PrimalItemStructure_)
 * are structures, boss trophies (PrimalItemTrophy_) are items. Returns null when the given
 * category is kept. Saddle armor, "... Skin" armor/weapon skins and consumable-buff skins
 * (Balloon Parachute Skin) stay where they are.
 */
export function blueprintCategoryOverride(input: { category: string; name: string; blueprint: string }): ItemCategory | null {
  const asset = assetName(input.blueprint);
  const skinName = /\bskin\b/i.test(input.name);
  if (/^primalitemtrophy_/.test(asset)) return input.category === 'Items' ? null : 'Items';
  if (input.category !== 'Skins') return null;
  if (/^primalitemconsumable_/.test(asset)) return 'Consumables';
  if (/^primalitemstructure_/.test(asset)) return 'Structures';
  if (/^primalitemarmor_/.test(asset) && !/saddle/.test(asset) && !skinName) return 'Armor';
  return null;
}

/**
 * Boss-arena inputs and boss rewards: apex drops (ApexDrop_, alpha ones apart), trophies
 * (PrimalItemTrophy_, Fjordur MiniBossDrop_ relics) and artifacts (PrimalItemArtifact*).
 * They are priced from the owner's arena bundles, never from the bulk-resource median.
 */
export type BossDropKind = 'alpha_apex' | 'apex' | 'trophy' | 'artifact';
export function bossDropKind(blueprint: string): BossDropKind | null {
  const asset = assetName(blueprint);
  if (/apexdrop_alpha/.test(asset)) return 'alpha_apex';
  if (/apexdrop_/.test(asset)) return 'apex';
  if (/^primalitemtrophy_|minibossdrop_/.test(asset)) return 'trophy';
  if (/^primalitemartifact/.test(asset)) return 'artifact';
  return null;
}
export const BOSS_DROP_KINDS: BossDropKind[] = ['alpha_apex', 'apex', 'trophy', 'artifact'];
/** Largest pack a boss drop is sold in (arena bundles ask for 1-20; a 100-stack would undercut them). */
export const BOSS_DROP_MAX_PACK = 10;

export type SubType = 'tek' | 'platform' | 'costume' | 'standard' | BossDropKind;
/** Categories where "Tek" marks a premium tier of equipment (not cosmetics or materials). */
const TEK_TIER_CATEGORIES = new Set(['Armor', 'Weapons & Ammo', 'Structures', 'Items', 'Saddles']);

/** Sub-type used to pick a narrower legacy price group when it has enough samples. */
export function subTypeOf(input: { category: string; name: string; blueprint: string }): SubType {
  const asset = assetName(input.blueprint);
  const boss = bossDropKind(input.blueprint);
  if (boss) return boss;
  if (input.category === 'Saddles' && (/platform/i.test(input.name) || /platform/.test(asset))) return 'platform';
  // "PrimalItemArmor_TekBoots", "PrimalItem_WeaponTekBow", "..._CropPlot_Tek", ".../Structures/Tek/..." (not "ShadowSteak").
  if (TEK_TIER_CATEGORIES.has(input.category)
    && (/^Tek\b/i.test(input.name) || /(^|_)(weapon)?tek/.test(asset) || /\/tek\//.test(packageKey(input.blueprint)))) return 'tek';
  if (input.category === 'Saddles' && (/ghost|costume|bunny/i.test(input.name) || /costume|ghost/.test(asset))) return 'costume';
  return 'standard';
}

export type StackClass = 'stack' | 'single';

/** Stackable when the wiki stack size is > 1; unknown stack size is treated as non-stackable (sold as 1). */
export function stackClassOf(stackSize: number | null | undefined): StackClass {
  return stackSize != null && stackSize > 1 ? 'stack' : 'single';
}

/** ASE stack size of arrows / bullets when the wiki leaves it empty (Metal Arrow). */
export const DEFAULT_AMMO_STACK = 100;

const isAmmo = (wiki: WikiItem | null | undefined, blueprint: string) =>
  /^primalitemammo/.test(assetName(blueprint)) || (wiki?.pageCategories ?? []).some((category) => category === 'Ammunition' || category === 'Arrows');

/**
 * Stack size the quantity rule uses: the wiki value, except
 *  - ammunition without a wiki stack size stacks to DEFAULT_AMMO_STACK (all ASE arrows/bullets stack);
 *  - single-use tools filed as weapons (PrimalItem_Weapon* in the wiki "Tools" category, e.g.
 *    Electronic Binoculars, which the wiki lists with stack 100) are sold one per purchase.
 */
export function effectiveStackSize(wiki: WikiItem | null | undefined, blueprint: string): { stackSize: number | null; note: string | null } {
  const stackSize = wiki?.stackSize ?? null;
  if (stackSize == null && isAmmo(wiki, blueprint)) {
    return { stackSize: DEFAULT_AMMO_STACK, note: `ammunition without a wiki stack size: ASE ammo stacks to ${DEFAULT_AMMO_STACK}` };
  }
  if (/^primalitem_weapon/.test(assetName(blueprint)) && wiki?.category === 'Tools' && !isAmmo(wiki, blueprint)) {
    return { stackSize: 1, note: `single-use tool (wiki "Tools", weapon class): 1 per purchase whatever the wiki stack size (${stackSize ?? 'unknown'})` };
  }
  return { stackSize, note: null };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type SellStatus = 'SELLABLE' | 'NOT_SELLABLE';
export type Classification = { status: SellStatus; code: string; reason: string };

/** Asset roots shipped by every ASE server (base game + official DLC maps). */
export const ASE_CORE_ROOTS = [
  '/game/primalearth/', '/game/aberration/', '/game/extinction/', '/game/genesis/', '/game/genesis2/', '/game/scorchedearth/',
];
/**
 * Roots proven on IRIS by legacy rows: item legacy rows (computed by the plan from the
 * products export, e.g. /game/lostisland/, /game/fjordur/, /game/valguero/) plus the
 * dino catalog's legacy Ice Wyvern (/game/mods/ragnarok/).
 */
export const DINO_PROVEN_ROOTS = ['/game/mods/ragnarok/'];
/** Official-map roots under /Game/Mods that ship with ASE but are not proven on IRIS yet. */
export const UNPROVEN_OFFICIAL_ROOTS = [
  '/game/mods/valguero/', '/game/mods/crystalisles/', '/game/mods/lostisland/', '/game/mods/fjordurofficial/', '/game/mods/thecenter/',
];
/** ASA-only content roots (Ascended maps, premium packs, Bob's Tales, Lost Colony, Astraeos...). */
export const ASA_ROOTS = [
  '/game/asa/', '/game/packs/', '/game/lostcolony/', '/game/dragontopia/', '/game/water/', '/game/mods/astraeos/', '/game/astraeos/',
];
/**
 * ark.wiki.gg page categories that mark ASA-only content. Map categories ("Lost Colony",
 * "Astraeos", "Love Ascended Items", ...) are NOT here: the wiki adds them to ASE items that
 * also drop on ASA maps (e.g. Manticore artifacts, Ghost costumes); see ASA_MAP_CATEGORIES.
 */
export const ASA_PAGE_CATEGORIES = new Set([
  'ARK: Survival Ascended', "Bob's Tall Tales", "Bob's True Tales",
  'Fantastic Tames', 'Fantastic Tames Season 1', 'Teenage Mutant Ninja Turtles', 'Club ARK',
]);
/** ASA-only maps. An item listed for one of these and for no ASE map/base game is ASA-only. */
export const ASA_MAP_CATEGORIES = new Set(['Lost Colony', 'Astraeos', 'Dragontopia']);
export const ASE_MAP_CATEGORIES = new Set([
  'Aberration', 'Extinction', 'Genesis: Part 1', 'Genesis: Part 2', 'Scorched Earth', 'Ragnarok', 'Valguero',
  'Crystal Isles', 'Lost Island', 'Fjordur', 'The Center',
]);
/** Page categories for content that is not on the Steam PC version of ASE. */
export const NOT_ON_STEAM_CATEGORIES = new Set(['Unavailable on Steam', 'Legacy Mobile exclusives', 'Ultimate Mobile Edition exclusives']);
export const MOD_PAGE_CATEGORIES = new Set(['Originating from Mods', 'Primitive Plus']);
export const UNOBTAINABLE_CATEGORIES = new Set(['Unobtainable items', 'Unreleased', 'Work-in-progress', 'Disambiguations']);
/** ARK Aquatica (/Game/Abyss): same owner opt-in as the dino catalog (2026-10-18). */
export const AQUATICA_ROOT = '/game/abyss/';
export const AQUATICA_OPT_IN = true;

/** Classes that are not a normal player item even though the wiki lists them. Key = assetName(). */
export const NON_ITEMS: Record<string, string> = {
  primalitem_startingnote: 'Specimen Implant: every survivor already has one; a second implant is not a shop item',
  primalitemresourcegeneric_curing: 'generic placeholder class ("Leech Blood or Horns"), not a real item',
  primalitemconsumablepoop: 'generic feces parent class (the sized Feces items are the real ones)',
  primalitem_taxidermydermis: 'generic Dermis template: a spawned dermis carries no creature data, so it shows nothing on a taxidermy base',
};

/** Items that exist as classes but cannot be obtained or used on ASE PC. Key = assetName(). */
export const UNOBTAINABLE_ITEMS: Record<string, string> = {
  primalitemconsumable_egg_griffin: 'leftover /Game/PrimalEarth/Test/ egg: Griffins cannot breed on ASE PC (the wiki egg is a Legacy Mobile exclusive)',
  primalitemconsumable_egg_phoenix: 'leftover /Game/PrimalEarth/Test/ egg: Phoenixes cannot breed or lay eggs on ASE PC',
};

/** Genesis HLNA lootcrates: hexagon-exchange rewards whose loot scales with the tier; not priceable from legacy data. */
const isExchangeLootcrate = (asset: string) => /^primalitemconsumable_lootcrate_lvl\d+$/.test(asset);

const no = (code: string, reason: string): Classification => ({ status: 'NOT_SELLABLE', code, reason });

export type ClassifyItemInput = {
  name: string;
  blueprint: string;
  wiki?: WikiItem | null;
  /** Row comes from the owner's legacy ArkShop config (proven delivery history). */
  legacyProven?: boolean;
  /** Roots proven by legacy rows (lower-case, '/game/<root>/'). */
  provenRoots?: Set<string>;
  /** Other wiki rows with the same item name (wikiItemsByName), e.g. the "Mobile:" page of it. */
  sameName?: WikiItem[] | null;
};

const hasAseMapCategory = (categories: Iterable<string>) =>
  [...categories].some((category) => ASE_MAP_CATEGORIES.has(category) || category === 'Aquatica' || category.startsWith('Base game'));

export function rootOf(blueprint: string): string {
  const pkg = packageKey(blueprint);
  const parts = pkg.split('/');
  if (parts[1] !== 'game') return '';
  return parts[2] === 'mods' && parts[3] ? `/game/mods/${parts[3]}/` : parts[2] ? `/game/${parts[2]}/` : '';
}

export function classifyItem(input: ClassifyItemInput): Classification {
  const stripped = stripBlueprintRef(input.blueprint);
  if (!stripped) return no('no_blueprint', 'no blueprint path (wiki has none); cannot be delivered');
  if (!/^\/game\//i.test(stripped) || /[<>"\s]/.test(stripped)) return no('invalid_path', `blueprint "${stripped.slice(0, 80)}" is not a /Game/ asset path (malformed wiki value or plugin content)`);
  const pkg = packageKey(stripped);
  const asset = assetName(stripped);
  const root = rootOf(stripped);
  const wiki = input.wiki ?? null;
  const categories = new Set(wiki?.pageCategories ?? []);
  const name = input.name;

  const asaRoot = ASA_ROOTS.find((value) => pkg.startsWith(value));
  if (asaRoot) return no('asa_only', `ASA-only asset path (${asaRoot.replace(/\/$/, '')}); does not exist on ASE servers`);
  const asaCategory = [...categories].find((category) => ASA_PAGE_CATEGORIES.has(category));
  if (asaCategory) return no('asa_only', `ASA-only content per ark.wiki.gg (category "${asaCategory}")`);
  if (wiki?.isMobile || /\/mobile\//.test(pkg)) return no('mobile_only', 'ARK Mobile-only item');
  const notOnSteam = [...categories].find((category) => NOT_ON_STEAM_CATEGORIES.has(category));
  if (notOnSteam) return no('platform_exclusive', `not in the Steam PC version of ASE (ark.wiki.gg: "${notOnSteam}")`);
  if (!input.legacyProven && wiki && !hasAseMapCategory(categories)) {
    // The PC page lists no map, and a same-name page is a mobile/console exclusive ("Mobile:Griffin Egg").
    const alias = (input.sameName ?? []).filter((other) => other !== wiki)
      .map((other) => other.pageCategories.find((category) => NOT_ON_STEAM_CATEGORIES.has(category)))
      .find(Boolean);
    if (alias) return no('platform_exclusive', `not obtainable on Steam PC: the PC page lists no map and the same-name ark.wiki.gg page is "${alias}"`);
  }

  const provenRoots = new Set([...(input.provenRoots ?? []), ...DINO_PROVEN_ROOTS]);
  const unprovenOfficial = UNPROVEN_OFFICIAL_ROOTS.find((value) => pkg.startsWith(value));
  if (pkg.startsWith('/game/mods/') && !unprovenOfficial && !provenRoots.has(root)) return no('mod_path', `mod asset path (${root.replace(/\/$/, '')}) is not vanilla ASE`);
  const modCategory = [...categories].find((category) => MOD_PAGE_CATEGORIES.has(category));
  if (modCategory && !input.legacyProven) return no('mod_path', `mod content per ark.wiki.gg (category "${modCategory}")`);

  if (/\b(admin|debug|cheat|test(ing)?|dev(eloper)?)\b/i.test(name) || /(^|_)(admin|debug|cheat|dev)(_|$)|adminblink|_test(_|$)|^test_/.test(asset)) {
    return no('admin_debug', 'admin / debug / cheat-only item (not obtainable by players)');
  }
  if (/_account_/.test(asset)) {
    // PrimalItem_Skin_Account_WildcardAdmin / _GameTester / _DevKitMaster.
    return no('admin_debug', 'account-bound reward skin for Wildcard staff, testers or dev-kit creators (not obtainable by players)');
  }
  if (/\/missions?\/|_mission(_|$)|\/vr\/|gauntlet|hlna|\/racing\//.test(pkg) || /\b(VR|HLNA)\b|\bMission\b/.test(name)) {
    return no('mission_only', 'Genesis mission / VR / quest-only item');
  }
  const unobtainable = [...categories].find((category) => UNOBTAINABLE_CATEGORIES.has(category));
  if (unobtainable) return no('unobtainable', `not a released, obtainable item (ark.wiki.gg: "${unobtainable}")`);
  if (NON_ITEMS[asset]) return no('non_item', NON_ITEMS[asset]);
  if (UNOBTAINABLE_ITEMS[asset] && !input.legacyProven) return no('unobtainable', UNOBTAINABLE_ITEMS[asset]);
  if (isExchangeLootcrate(asset) && !input.legacyProven) {
    return no('exchange_reward', 'Genesis HLNA exchange lootcrate (hexagon/mission economy; the loot scales with the tier); not priceable from legacy data, owner can price it by hand');
  }
  if (/fertilized/.test(asset)) return no('fertilized_egg', 'fertilized egg: a given egg has no parents/stats and its hatch result is undefined');

  const asaMap = [...categories].find((category) => ASA_MAP_CATEGORIES.has(category));
  if (asaMap && !input.legacyProven && ![...categories].some((category) => ASE_MAP_CATEGORIES.has(category) || category.startsWith('Base game'))) {
    return no('asa_only', `listed only for ASA maps on ark.wiki.gg ("${asaMap}", no ASE map or base-game category)`);
  }
  if (pkg.startsWith(AQUATICA_ROOT) && !input.legacyProven) {
    return AQUATICA_OPT_IN
      ? { status: 'SELLABLE', code: 'sellable_opt_in', reason: 'owner opt-in (2026-10-18, as for Aquatica creatures): ARK Aquatica DLC item; servers must have Aquatica content' }
      : no('unverified', 'unverified: ARK Aquatica content');
  }
  if (unprovenOfficial && !input.legacyProven) {
    return no('unverified', `unverified: official-map asset under ${unprovenOfficial.replace(/\/$/, '')} not yet proven to load on IRIS servers`);
  }
  if (!input.legacyProven) {
    if (!wiki) return no('unverified', 'unverified: blueprint not found in ark.wiki.gg Items');
    if (!ASE_CORE_ROOTS.includes(root) && !provenRoots.has(root)) return no('unverified', `unverified: asset root ${root || '(none)'} is not proven on IRIS servers`);
  }
  return { status: 'SELLABLE', code: 'sellable', reason: input.legacyProven ? 'legacy ArkShop row (proven config)' : 'vanilla ASE item' };
}

/** Codes that mean a legacy row can never be delivered (it is deactivated and reported). */
export const UNDELIVERABLE_CODES = new Set(['no_blueprint', 'invalid_path', 'asa_only', 'mod_path', 'mobile_only']);

// ---------------------------------------------------------------------------
// Legacy price / quantity / quality model
// ---------------------------------------------------------------------------

export type LegacyItemRow = {
  id: number;
  externalKey: string;
  name: string;
  price: number;
  categoryName: string;
  /** Canonical blueprints of definition.Items, in order. */
  blueprints: string[];
  amounts: number[];
  qualities: number[];
  totalQuantity: number;
  isActive: boolean;
  /** One blueprint delivered (possibly split into several stacks). */
  singleBlueprint: boolean;
  stackSize: number | null;
  subType: SubType;
};

export type PriceGroup = { key: string; perUnit: number[]; quantities: number[]; names: string[] };
export type PriceModel = {
  groups: Map<string, PriceGroup>;
  qualityByCategory: Record<string, { samples: number; nonZero: number; median: number; used: number }>;
};

export const groupKey = (category: string, subType: string, stackClass: StackClass) => `${category}|${subType}|${stackClass}`;

/**
 * Learn per-unit prices and pack sizes from ACTIVE legacy rows that deliver one
 * blueprint (bundles of different items are excluded), and the quality convention
 * per category from every active legacy row.
 */
export function buildPriceModel(rows: LegacyItemRow[], options: { exclude?: Set<number> } = {}): PriceModel {
  const groups = new Map<string, PriceGroup>();
  const add = (key: string, row: LegacyItemRow) => {
    const group = groups.get(key) ?? { key, perUnit: [], quantities: [], names: [] };
    group.perUnit.push(row.price / row.totalQuantity);
    group.quantities.push(row.totalQuantity);
    group.names.push(row.name);
    groups.set(key, group);
  };
  const active = rows.filter((row) => row.isActive && !options.exclude?.has(row.id));
  for (const row of active) {
    if (!row.singleBlueprint || row.totalQuantity < 1) continue;
    const cls = stackClassOf(row.stackSize);
    add(groupKey(row.categoryName, row.subType, cls), row);
    // Saddle sub-types are saddle-specific (Tek saddles cost far more than other Tek items).
    if (row.subType !== 'standard' && row.categoryName !== 'Saddles') add(groupKey('*', row.subType, cls), row);
    add(groupKey(row.categoryName, '*', cls), row);
    add(groupKey('*', '*', cls), row);
  }
  const qualityByCategory: PriceModel['qualityByCategory'] = {};
  for (const category of new Set(active.map((row) => row.categoryName))) {
    const qualities = active.filter((row) => row.categoryName === category && stackClassOf(row.stackSize) === 'single').map((row) => row.qualities[0] ?? 0);
    const nonZero = qualities.filter((value) => value > 0).length;
    const med = median(qualities);
    // Legacy convention "differs from Primitive" only when most rows of the category use a quality.
    const used = qualities.length >= MIN_GROUP_SAMPLES && nonZero * 2 > qualities.length ? Math.round(med * 4) / 4 : 0;
    qualityByCategory[category] = { samples: qualities.length, nonZero, median: med, used };
  }
  return { groups, qualityByCategory };
}

/** Round to a "nice" pack size: 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, ... (never above cap). */
export function nicePack(value: number, cap: number): number {
  const target = Math.max(1, Math.min(value, cap));
  const steps: number[] = [];
  for (let scale = 1; scale <= 1_000_000; scale *= 10) steps.push(scale, 2 * scale, 2.5 * scale, 5 * scale);
  const candidates = steps.filter((step) => Number.isInteger(step) && step <= cap);
  if (candidates.length === 0) return Math.max(1, Math.floor(cap));
  return candidates.reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) || (Math.abs(step - target) === Math.abs(best - target) && step < best) ? step : best), candidates[0]);
}

/** Round a computed price: < 20 to 1 IC, < 200 to 5 IC, else to 10 IC; minimum 1 IC. */
export function roundPrice(raw: number): number {
  if (!Number.isFinite(raw) || raw <= MIN_ITEM_PRICE) return MIN_ITEM_PRICE;
  if (raw < 20) return Math.max(MIN_ITEM_PRICE, Math.round(raw));
  if (raw < 200) return Math.round(raw / 5) * 5;
  return Math.round(raw / 10) * 10;
}

export type Offer = {
  quantity: number;
  quality: number;
  price: number;
  priceBasis: string;
  quantityBasis: string;
  qualityBasis: string;
  priceGroup: string;
  groupSamples: number;
  perUnit: number;
};

function pickGroup(model: PriceModel, category: string, subType: SubType, cls: StackClass): PriceGroup | null {
  const refined = subType !== 'standard';
  const keys: Array<[string, number]> = [[groupKey(category, subType, cls), refined ? MIN_SUBTYPE_SAMPLES : MIN_GROUP_SAMPLES]];
  if (refined && category !== 'Saddles') keys.push([groupKey('*', subType, cls), MIN_SUBTYPE_SAMPLES]);
  keys.push([groupKey(category, '*', cls), MIN_GROUP_SAMPLES], [groupKey('*', '*', cls), MIN_GROUP_SAMPLES]);
  for (const [key, minimum] of keys) {
    const group = model.groups.get(key);
    if (group && group.perUnit.length >= minimum) return group;
  }
  return null;
}

/** Emote / hairstyle unlock consumables: one unlocks it for good, so a pack makes no sense. */
export function isUnlockItem(blueprint: string): boolean {
  return /unlock(emote|hair)/.test(assetName(blueprint).replace(/_/g, ''));
}

/** Quantity, quality and price for an item that has no legacy row. */
export function offerFor(model: PriceModel, input: { category: string; subType: SubType; stackSize: number | null; blueprint?: string }): Offer | { error: string } {
  const unlock = Boolean(input.blueprint && isUnlockItem(input.blueprint));
  const cls = unlock ? 'single' : stackClassOf(input.stackSize);
  const group = pickGroup(model, input.category, input.subType, cls);
  if (!group) return { error: `no legacy price group with >= ${MIN_GROUP_SAMPLES} samples for ${input.category}/${input.subType}/${cls}` };

  let quantity = 1;
  let quantityBasis = unlock ? 'emote/hairstyle unlock item: 1 per purchase (one unlocks it)'
    : input.stackSize == null ? 'stack size unknown on the wiki: sold as 1' : 'not stackable: 1 per purchase';
  if (cls === 'stack') {
    const packGroup = [groupKey(input.category, '*', 'stack'), groupKey('*', '*', 'stack')]
      .map((key) => model.groups.get(key))
      .find((value): value is PriceGroup => Boolean(value && value.quantities.length >= MIN_GROUP_SAMPLES))!;
    const medianQuantity = median(packGroup.quantities);
    quantity = nicePack(medianQuantity, input.stackSize!);
    quantityBasis = `median legacy pack of ${packGroup.key.replace(/\|/g, '/')} = ${medianQuantity} (${packGroup.quantities.length} rows), capped by wiki stack size ${input.stackSize} -> ${quantity}`;
  }

  const quality = cls === 'single' ? (model.qualityByCategory[input.category]?.used ?? 0) : 0;
  const qualityStats = model.qualityByCategory[input.category];
  const qualityBasis = quality > 0
    ? `legacy ${input.category} convention: ${qualityStats.nonZero}/${qualityStats.samples} rows use a quality, median ${qualityStats.median}`
    : 'Primitive (0)';

  const perUnit = median(group.perUnit);
  const raw = perUnit * quantity;
  // One unit at a median that IS an owner-set legacy price (odd sample count) is copied 1:1,
  // like the dino catalog does, instead of being re-rounded (54 IC chibis stay 54).
  const copiedLegacyPrice = quantity === 1 && Number.isInteger(raw) && raw >= MIN_ITEM_PRICE && group.perUnit.includes(perUnit);
  const price = copiedLegacyPrice ? raw : roundPrice(raw);
  let priceBasis = `legacy per-unit median of ${group.key.replace(/\|/g, '/')} = ${round4(perUnit)} IC (${group.perUnit.length} rows) x ${quantity}`;
  if (price !== raw) priceBasis += `; ${round4(raw)} rounded -> ${price}${raw < MIN_ITEM_PRICE ? ' (minimum 1 IC)' : ''}`;
  return { quantity, quality, price, priceBasis, quantityBasis, qualityBasis, priceGroup: group.key, groupSamples: group.perUnit.length, perUnit };
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

// ---------------------------------------------------------------------------
// Product text + delivery payload
// ---------------------------------------------------------------------------

/** Legacy naming: "Metal Ingot (1,000x)". */
export function productName(displayName: string, quantity: number): string {
  return `${displayName} (${quantity.toLocaleString('en-US')}x)`;
}

/** Thai description: "<Name> x<qty>". */
export function productDescription(displayName: string, quantity: number): string {
  return `${displayName} x${quantity.toLocaleString('en-US')}`;
}

/** "Metal Ingot (1,000x)" -> "Metal Ingot" */
export function stripQuantitySuffix(name: string): string {
  return name.replace(/\s*\(\s*[\d,]+\s*x\s*\)\s*$/i, '').trim();
}

/** Integer product.quality column, as import-arkshop-catalog.ts stores it (fractional -> 0). */
export function qualityColumn(quality: number): number {
  return Number.isSafeInteger(quality) ? Math.max(0, quality) : 0;
}

export type ItemCatalogPayload = {
  schemaVersion: 1;
  source: string;
  sourceKey: string;
  type: 'item';
  definition: {
    Type: 'item';
    Items: Array<{ Blueprint: string; Amount: number; Quality: number; ForceBlueprint: false }>;
    Price: number;
    Description: string;
  };
  review: {
    status: 'approved';
    priceBasis: string;
    quantityBasis: string;
    qualityBasis: string;
    wikiPage: string | null;
    plannedAt: string;
  };
};

/** Same shape as legacy arkshop item rows (import-arkshop-catalog.ts) plus a review block. */
export function buildItemDeliveryPayload(input: {
  externalKey: string; blueprint: string; quantity: number; quality: number; price: number; name: string;
  priceBasis: string; quantityBasis: string; qualityBasis: string; wikiPage: string | null; plannedAt: string;
}): ItemCatalogPayload {
  return {
    schemaVersion: 1,
    source: ITEM_CATALOG_SOURCE,
    sourceKey: input.externalKey,
    type: 'item',
    definition: {
      Type: 'item',
      Items: [{ Blueprint: canonicalBlueprint(input.blueprint), Amount: input.quantity, Quality: input.quality, ForceBlueprint: false }],
      Price: input.price,
      Description: input.name,
    },
    review: {
      status: 'approved',
      priceBasis: input.priceBasis,
      quantityBasis: input.quantityBasis,
      qualityBasis: input.qualityBasis,
      wikiPage: input.wikiPage,
      plannedAt: input.plannedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Snapshot fingerprint (drift detection between plan build and apply)
// ---------------------------------------------------------------------------

/** Product columns apply-plan.ts can write; an owner edit to any of them after the plan is drift. */
export const FINGERPRINT_FIELDS = [
  'name', 'description', 'price', 'isActive', 'categoryId', 'itemBlueprint', 'quantity', 'quality', 'isBlueprint',
  'requiredCapabilities', 'deliveryPayload', 'imageUrl', 'sortOrder',
] as const;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value ?? null);
}

/**
 * Hash of the writable product columns (key order and Date/string independent), stored in
 * plan row.current at build time and recomputed from the live row by apply-plan.ts.
 * Columns the shop itself changes (stock, updatedAt) are not part of it.
 */
export function productFingerprint(product: Partial<Record<(typeof FINGERPRINT_FIELDS)[number], unknown>>): string {
  const subset = Object.fromEntries(FINGERPRINT_FIELDS.map((field) => [field, product[field] ?? null]));
  return createHash('sha1').update(stableJson(subset)).digest('hex').slice(0, 16);
}

export type SimulatedProduct = {
  productType: string;
  itemBlueprint: string | null;
  requiredCapabilities: string[];
  deliveryPayload: any;
  name: string;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
};

/**
 * Runs the REAL backend item delivery builder (src/services/itemCatalogDelivery.ts,
 * used by checkout.controller and game-shop.controller) plus the gates around it:
 *  - catalog listing / checkout only offer item products with itemBlueprint != null;
 *  - the game shop only offers products whose requiredCapabilities the plugin advertises;
 *  - every configured definition entry must survive the builder (none silently dropped);
 *  - the resulting payload must pass HeartShop.cpp's "order" guards, for 1 and 10 units.
 * `strict` (rows the catalog writes): exactly one entry, ['delivery.item.v1'],
 * itemBlueprint/quantity/quality/isBlueprint equal to that entry, canonical blueprint.
 */
export function simulateBackendItemDelivery(product: SimulatedProduct, options: { strict?: boolean } = {}):
  { ok: true; payload: Omit<ItemDeliveryPayload, 'orderId'> } | { ok: false; error: string } {
  if (product.productType !== 'item') return { ok: false, error: 'productType must be item' };
  if (!product.itemBlueprint) return { ok: false, error: 'itemBlueprint is required (catalog filters itemBlueprint != null)' };
  const unsupported = product.requiredCapabilities.filter((capability) => !PLUGIN_CAPABILITIES.includes(capability));
  if (unsupported.length) return { ok: false, error: `plugin does not advertise ${unsupported.join(', ')}` };
  const definitionItems: any[] | null = Array.isArray(product.deliveryPayload?.definition?.Items) ? product.deliveryPayload.definition.Items : null;

  if (options.strict) {
    if (!definitionItems || definitionItems.length !== 1) return { ok: false, error: 'definition.Items must have exactly one entry' };
    if (product.requiredCapabilities.length !== 1 || product.requiredCapabilities[0] !== ITEM_DELIVERY_CAPABILITY) {
      return { ok: false, error: `requiredCapabilities must be ["${ITEM_DELIVERY_CAPABILITY}"]` };
    }
    const [entry] = definitionItems;
    if (entry.Blueprint !== product.itemBlueprint) return { ok: false, error: 'itemBlueprint must equal definition.Items[0].Blueprint' };
    if (canonicalBlueprint(entry.Blueprint) !== entry.Blueprint || !/^Blueprint'\/Game\//.test(entry.Blueprint)) return { ok: false, error: 'blueprint is not canonical Blueprint\'/Game/...\'' };
    if (!Number.isSafeInteger(entry.Amount) || entry.Amount < 1 || entry.Amount !== product.quantity) return { ok: false, error: 'Amount must be an integer >= 1 equal to products.quantity' };
    if (typeof entry.Quality !== 'number' || entry.Quality < 0 || qualityColumn(entry.Quality) !== product.quality) return { ok: false, error: 'Quality must be >= 0 and match products.quality' };
    if (entry.ForceBlueprint !== false || product.isBlueprint !== false) return { ok: false, error: 'isBlueprint must be false' };
  } else if (definitionItems && definitionItems.length > 1 && !product.requiredCapabilities.includes(ITEM_BUNDLE_DELIVERY_CAPABILITY)) {
    return { ok: false, error: `a ${definitionItems.length}-entry bundle must require ${ITEM_BUNDLE_DELIVERY_CAPABILITY}` };
  }

  let first: ItemDeliveryPayload | null = null;
  for (const units of [1, 10]) {
    const { payload } = resolveItemDelivery(product, 'dry-run', units);
    if (definitionItems && definitionItems.length > 0 && payload.items.length !== definitionItems.length) {
      return { ok: false, error: `builder dropped ${definitionItems.length - payload.items.length} of ${definitionItems.length} definition entries (empty blueprint or non-integer Amount)` };
    }
    const rejected = pluginRejectsItemPayload(payload);
    if (rejected) return { ok: false, error: `HeartShop would reject (${units} units): ${rejected}` };
    if (units === 1) first = payload;
  }
  const { orderId: _orderId, ...payload } = first!;
  return { ok: true, payload };
}
