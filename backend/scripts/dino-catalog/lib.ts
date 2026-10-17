/**
 * Pure, side-effect free logic for the IRIS dino catalog plan.
 *
 * Used by build-plan.ts (offline plan generation), apply-plan.ts (DB writer)
 * and tests/unit/dino-catalog.test.ts. Nothing here touches the database or
 * the network so every rule can be unit tested.
 *
 * Delivery contract (must match backend/src/controllers/game-shop.controller.ts
 * and checkout.controller.ts buildDeliveryPayload, and HeartShop.cpp
 * SpawnCatalogDinoForPlayer):
 *   product.productType           = 'dino'
 *   product.itemBlueprint         = deliveryPayload.spawn.blueprint (exact string)
 *   product.requiredCapabilities  = ['delivery.dino.catalog.v1']
 *   deliveryPayload.spawn         = { blueprint, level (1..10000), forceTame: true, neutered, command }
 * The backend turns that into { schemaVersion: 1, productType: 'dino',
 * dino: { blueprint, level, forceTame: true, neutered } } and the plugin calls
 * ArkApi SpawnDino(player, blueprint, nullptr, level, true, neutered), which
 * spawns ~1m in front of the player and TameDino()s it.
 */

import {
  DINO_CATALOG_CAPABILITY,
  pluginRejectsDinoPayload,
  resolveDinoCatalogDelivery,
  type DinoCatalogDeliveryPayload,
} from '../../src/services/dinoCatalogDelivery.js';

export { DINO_CATALOG_CAPABILITY };
export const DINO_CATALOG_SOURCE = 'iris-dino-catalog';
export const CREATED_KEY_PREFIX = 'dino-catalog:';
export const AQUATIC_NOTE_TH = 'ต้องอยู่ในน้ำตอนรับ';
export const MIN_DINO_PRICE = 10;
/** Tek creatures get a 1.2x level bonus in game; legacy rows sell "Lv.400" Tek as spawn level 334. */
export const TEK_LEVEL_BONUS = 1.2;

export type VariantGroup = 'base' | 'aquatic' | 'aberrant' | 'x' | 'r' | 'tek' | 'wyvern';
export const VARIANT_GROUPS: VariantGroup[] = ['base', 'aquatic', 'aberrant', 'x', 'r', 'tek', 'wyvern'];
export type MultipliedGroup = 'aberrant' | 'x' | 'r' | 'tek';
export const MULTIPLIED_GROUPS: MultipliedGroup[] = ['aberrant', 'x', 'r', 'tek'];

export const GROUP_CATEGORY: Record<VariantGroup, string> = {
  base: 'Dinos',
  aquatic: 'Dinos · Aquatic',
  aberrant: 'Dinos · Aberrant',
  x: 'Dinos · X',
  r: 'Dinos · R',
  tek: 'Dinos · Tek',
  wyvern: 'Dinos · Wyvern',
};

const CATEGORY_GROUP: Record<string, VariantGroup> = Object.fromEntries(
  Object.entries(GROUP_CATEGORY).map(([group, category]) => [category, group as VariantGroup]),
) as Record<string, VariantGroup>;

// ---------------------------------------------------------------------------
// Blueprint helpers
// ---------------------------------------------------------------------------

/** Strip quotes and the Blueprint'...' wrapper: returns "/Game/.../X.X" (case preserved). */
export function stripBlueprintRef(value: unknown): string {
  let text = String(value ?? '').trim().replace(/^"+|"+$/g, '').trim();
  const wrapped = text.match(/^Blueprint'(.*)'$/i);
  if (wrapped) text = wrapped[1];
  return text.trim();
}

/** Package path without the object name, case preserved: "/Game/.../Rex_Character_BP". */
export function packagePath(value: unknown): string {
  const stripped = stripBlueprintRef(value);
  const dot = stripped.indexOf('.');
  return dot >= 0 ? stripped.slice(0, dot) : stripped;
}

/** Identity key used for dedupe/matching: lower-cased package path. */
export function packageKey(value: unknown): string {
  return packagePath(value).toLowerCase();
}

/** Lower-cased asset (file) name, e.g. "rex_character_bp". */
export function assetName(value: unknown): string {
  const pkg = packageKey(value);
  return pkg.slice(pkg.lastIndexOf('/') + 1);
}

/**
 * Canonical ArkShop-style blueprint reference used by every legacy row:
 *   Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'
 * (asset object name, never the generated "_C" class).
 */
export function canonicalBlueprint(value: unknown): string {
  const pkg = packagePath(value);
  if (!pkg) return '';
  const name = pkg.slice(pkg.lastIndexOf('/') + 1);
  return `Blueprint'${pkg}.${name}'`;
}

// ---------------------------------------------------------------------------
// Names, species and variant groups
// ---------------------------------------------------------------------------

export function displayLevelFromName(name: string): number | null {
  const match = name.match(/\(\s*Lv\.?\s*(\d+)\s*\)/i);
  return match ? Number(match[1]) : null;
}

/** "X-Rex (Lv.380)" -> "X-Rex" */
export function stripLevelSuffix(name: string): string {
  return name.replace(/\s*\(\s*Lv\.?\s*\d+\s*\)\s*$/i, '').trim();
}

const VARIANT_PREFIXES: Array<[RegExp, MultipliedGroup]> = [
  [/^Aberrant\s+/i, 'aberrant'],
  // Aquatica's Abyssal biome variants are priced like Aberrant ones (owner opt-in 2026-10-18).
  [/^Abyssal\s+/i, 'aberrant'],
  [/^X-/i, 'x'],
  [/^R-/i, 'r'],
  [/^Tek\s+/i, 'tek'],
];

/** Name aliases so "Aberrant Spinosaur" pairs with legacy "Spino", "Aberrant Direbear" with "Dire Bear", etc. */
const SPECIES_ALIASES: Record<string, string> = {
  spinosaur: 'spino',
  spinosaurus: 'spino',
  stego: 'stegosaurus',
  trike: 'triceratops',
  bronto: 'brontosaurus',
  dunkeosteus: 'dunkleosteus',
  quetzalcoatlus: 'quetzal',
  parasaurolophus: 'parasaur',
  trex: 'rex',
  tyrannosaurus: 'rex',
  carno: 'carnotaurus',
  allo: 'allosaurus',
  anky: 'ankylosaurus',
  ankylo: 'ankylosaurus',
  megaloceros: 'megaloceros',
  saber: 'sabertooth',
  sabertoothsalmon: 'sabertoothsalmon',
  // regional forms priced as their legacy species
  icegolem: 'rockelemental',
  chalkgolem: 'rockelemental',
  direpolarbear: 'direbear',
};

/**
 * Wiki entity names that are ambiguous in a shop list (several blueprints share the
 * page name "Rock Elemental"). Key = assetName().
 */
export const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  icegolem_character_bp: 'Ice Golem',
  chalkgolem_character_bp: 'Chalk Golem',
  rubblegolem_character_bp: 'Rubble Golem',
};

/** Shop display name: explicit override, else the given (wiki entity / draft) name without a level suffix. */
export function displayNameFor(blueprint: string, name: string): string {
  return DISPLAY_NAME_OVERRIDES[assetName(blueprint)] ?? stripLevelSuffix(name).replace(/\.png$/i, '').trim();
}

/** "Aberrant Spinosaur (Lv.380)" -> "Spinosaur" */
export function baseSpeciesName(name: string): string {
  let base = stripLevelSuffix(name);
  for (const [pattern] of VARIANT_PREFIXES) base = base.replace(pattern, '');
  return base.trim();
}

export function speciesKey(name: string): string {
  const key = baseSpeciesName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return SPECIES_ALIASES[key] ?? key;
}

/**
 * Variant group. Legacy rows use their category (authoritative, the owner
 * curated it); new rows are derived from the name prefix / blueprint and the
 * aquatic flag.
 */
export function variantGroupOf(input: { name: string; blueprint: string; categoryName?: string | null; aquatic?: boolean }): VariantGroup {
  if (input.categoryName && CATEGORY_GROUP[input.categoryName]) return CATEGORY_GROUP[input.categoryName];
  const name = stripLevelSuffix(input.name);
  for (const [pattern, group] of VARIANT_PREFIXES) if (pattern.test(name)) return group;
  const asset = assetName(input.blueprint);
  if (asset.startsWith('bionic')) return 'tek';
  if (/wyvern/i.test(name) || /\/wyvern\/|crystalwyvern/.test(packageKey(input.blueprint))) return 'wyvern';
  if (input.aquatic) return 'aquatic';
  return 'base';
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type SellStatus = 'SELLABLE' | 'SELLABLE_AQUATIC' | 'NOT_SELLABLE';
export type Classification = { status: SellStatus; code: string; reason: string };

/** Subset of the ark.wiki.gg Cargo Creatures + Entities rows used for classification. */
export type WikiCreature = {
  page: string;
  name: string;
  entityName?: string | null;
  inGames: string;
  inMod: string;
  dlcs: string[];
  taxonomicGroup: string;
  tameable: boolean | null;
  aquatic?: boolean;
  isMobile?: boolean;
  variantOf?: string | null;
  blueprint: string;
};

export type ClassifyInput = {
  name: string;
  blueprint: string;
  wiki?: WikiCreature | null;
  /** Row comes from the owner's legacy ArkShop config (proven delivery history). */
  legacyProven?: boolean;
};

/**
 * Official-map asset roots that live under /Game/Mods/ but ship with every ASE
 * server. Only Ragnarok is proven on IRIS (legacy Ice Wyvern). Others stay
 * "unverified" until an operator confirms a spawn.
 */
const PROVEN_OFFICIAL_MOD_ROOTS = ['/game/mods/ragnarok/'];
const UNPROVEN_OFFICIAL_MOD_ROOTS = ['/game/mods/valguero/', '/game/mods/crystalisles/', '/game/mods/thecenter/', '/game/mods/lostisland/', '/game/mods/fjordur/'];

/**
 * Wiki marks these as "Tameable" because ASA added the Fish Basket / new taming,
 * or because the tame is temporary. In ASE they are wild-only (or expire), so a
 * cheat-spawned tame is unsupported.
 */
const ASE_NOT_KEEPABLE: Record<string, string> = {
  coel_character_bp: 'Coelacanth',
  coel_character_bp_aberrant: 'Aberrant Coelacanth',
  piranha_character_bp: 'Piranha',
  piranha_character_bp_aberrant: 'Aberrant Piranha',
  salmon_character_bp: 'Sabertooth Salmon',
  salmon_character_aberrant: 'Aberrant Salmon',
  lunar_salmon_character_bp: 'X-Sabertooth Salmon',
  rare_lunar_salmon_character_bp: 'Rare X-Sabertooth Salmon',
  trilobite_character: 'Trilobite',
  trilobite_character_aberrant: 'Aberrant Trilobite',
  leech_character: 'Leech',
  leech_character_diseased: 'Diseased Leech',
  lamprey_character: 'Lamprey',
  bat_character_bp: 'Onyc',
  bee_character_bp: 'Giant (worker) Bee',
};

/**
 * Tameable per the wiki, but the tame does not last: selling it means the buyer pays
 * for a creature that dies or expires. Key = assetName(). Checked for legacy rows too.
 */
export const TEMPORARY_TAMES: Record<string, string> = {
  titanosaur_character_bp: 'temporary tame: starves, cannot be cryopodded or leveled (Titanosaur cannot eat under normal settings and dies ~16-20h after taming)',
};

/** Not obtainable through taming but legitimately owned in ASE (egg/birth). */
const OWNABLE_WITHOUT_TAMING = new Set<string>([
  'xenomorph_character_bp_male_tamed', // Reaper King (the tamed-from-birth class players own)
]);

/** Creatures the owner chose not to sell (2026-10-18). */
const OWNER_EXCLUDED: Record<string, string> = {
  xenomorph_character_bp_male_tamed: 'owner: Reaper King is not sold',
  rhynio_character_bp: 'owner: Rhyniognatha is not sold',
};

/** Aquatica creatures ark.wiki.gg marks untameable: a forced tame would fail delivery. */
const AQUATICA_UNTAMEABLE: Record<string, string> = {
  riftwalker_bp: 'Riftwalker is untameable per ark.wiki.gg',
  takifugu_character_bp: 'Takifugu is untameable per ark.wiki.gg',
  vulcanite_character_bp: 'Vulcanite is untameable per ark.wiki.gg',
};

/** Aquatica creatures ark.wiki.gg lists as aquatic: they spawn where the buyer stands. */
const AQUATICA_WATER_ONLY = new Set<string>([
  'chrysaora_character_bp', 'dakosaurus_character_bp', 'istiophorus_character_bp', 'kathreptis_character_bp',
  'malleocephalus_character_bp', 'mantisshrimp_character_bp', 'monodon_character_bp', 'onchopristis_character_bp',
  'qarmoutus_character_bp', 'seahorse_character_bp', 'stereolepis_character_bp', 'thunnus_character_bp',
  'tridacna_character_bp', 'wyvern_character_bp_water',
]);

/** Classes whose spawn is not a normal ownable creature. */
const NON_CREATURE: Record<string, string> = {
  megamek_character_bp: 'Mega Mek is a temporary fusion of four Meks, not a standalone tame',
  exosuit_character_bp: 'Exo-Mek is a crafted exosuit',
  tekhoverskiff_character_bp: 'Hover Skiff is a crafted vehicle',
  scout_character_bp: 'Scout is a crafted drone item',
  enddrone_character_bp: 'Attack Drone is a hostile Extinction enemy',
  endtank_character_bp: 'Defense Unit is a hostile Extinction enemy',
  insectswarmchar_bp: 'insect swarm, not a creature',
  microbeswarmchar_bp: 'fish school swarm, not a creature',
  macrophage_swarm_character: 'Macrophage swarm, not a creature',
  playerpawntest_male: 'player pawn, not a creature',
  shapeshifter_large_character_bp: 'large shapeshift form of Ferox (Ferox is already sold in its spawnable small form)',
  crystalwyvern_character_bp: 'abstract parent of Blood/Ember/Tropical Crystal Wyverns (those are sold instead)',
  wyvern_character_bp_base: 'abstract parent of the Fire/Lightning/Poison/Ice Wyverns (those are sold instead)',
  jugbug_character_basebp: 'abstract Jug Bug parent class',
  lightbug_character_basebp: 'abstract Glowbug parent class',
};

// "Dragon" only as the boss, never the tameable "Thorny Dragon".
const BOSS_NAMES = /\b(Broodmother|Megapithecus|(?<!Thorny )Dragon|Manticore|Overseer|Rockwell|Moeder|Master Controller|Iceworm Queen|Crystal Wyvern Queen|Hati|Sk[oö]ll|Steinbj[oö]rn|Fenris[uú]lfr|Beyla|Medusa|Lava Elemental|Summoner|King Titan)\b/i;

const no = (code: string, reason: string): Classification => ({ status: 'NOT_SELLABLE', code, reason });

/** Water-only creatures: they spawn where the buyer stands, so the buyer must be in water. */
const AQUATIC_ASSET_PATTERNS: RegExp[] = [
  /^angler_character/, /^basilosaurus_character/, /^ocean_basilosaurus/, /dunkle_character/, /^eel_character/,
  /^(ocean_)?dolphin_character/, /^manta_character/, /megalodon_character/, /mosa_character/, /^plesiosaur_character/,
  /^tusoteuthis_character/, /^giantturtle_character/, /^coel_character/, /^piranha_character/, /salmon_character/,
  /^lamprey_character/, /^leedsichthys/, /^cnidaria/, /^ammonite/, /^euryp/, /^liopleurodon/, /^bionicmosa/,
  /^bionicmegalodon/,
];

export function isAquaticOnly(blueprint: string): boolean {
  const asset = assetName(blueprint);
  return AQUATIC_ASSET_PATTERNS.some((pattern) => pattern.test(asset));
}

export function classifyCreature(input: ClassifyInput): Classification {
  const pkg = packageKey(input.blueprint);
  const asset = assetName(input.blueprint);
  const name = stripLevelSuffix(input.name);
  const wiki = input.wiki ?? null;
  const tax = wiki?.taxonomicGroup ?? '';
  const games = wiki?.inGames ?? '';

  if (!asset || !pkg.startsWith('/')) return no('invalid_path', `invalid blueprint path "${input.blueprint}"`);
  if (!pkg.startsWith('/game/')) return no('mod_path', 'not a /Game/ asset (mod or ASA plugin content), cannot exist on vanilla ASE');
  if (pkg.startsWith('/game/asa/') || pkg.startsWith('/game/mods/astraeos/')) return no('asa_path', 'ASA-only asset path; does not exist on ASE servers');
  if (games && /Ascended/.test(games) && !/Evolved/.test(games)) return no('asa_only', 'ASA-only creature per ark.wiki.gg');
  if (wiki?.inMod) return no('mod_path', `third-party mod creature (${wiki.inMod})`);
  if (wiki?.isMobile || /\/mobile\//.test(pkg)) return no('mobile_only', 'ARK Mobile-only creature');
  const officialMapRoot = UNPROVEN_OFFICIAL_MOD_ROOTS.find((root) => pkg.startsWith(root));
  if (pkg.startsWith('/game/mods/') && !officialMapRoot && !PROVEN_OFFICIAL_MOD_ROOTS.some((root) => pkg.startsWith(root))) {
    return no('mod_path', 'mod asset path (/Game/Mods/...) is not vanilla ASE');
  }

  // Never-sellable creature classes (checked before the legacy exemption so a
  // legacy mistake would surface, but legacy rows are only reported, not deactivated).
  if (/\bTitan\b/i.test(name) || /kaiju/.test(pkg)) return no('titan', 'Titan: boss-tier creature, temporary tame only');
  if (tax === 'Bosses' || BOSS_NAMES.test(name) || /\((Alpha|Beta|Gamma)\)\s*$/.test(name) || /boss/.test(asset)) {
    return no('boss', 'boss / boss-arena creature');
  }
  if (tax === 'Alpha Creatures' || /\bAlpha\b/.test(name) || /_alpha$|_mega$/.test(asset)
    || /^mega(?!lodon|lania|losaurus|therium|loceros|chelon|mek)/.test(asset) || /^bone_mega/.test(asset)) {
    return no('alpha', 'Alpha creature (untameable)');
  }
  if (tax === 'Corrupted Creatures' || tax === 'Enraged Creatures' || /\b(Corrupted|Enraged)\b/i.test(name) || /_corrupt/.test(asset)) {
    return no('corrupted', 'Corrupted/Enraged creature (untameable)');
  }
  if (tax === 'Brute Creatures' || /^Brute\b/i.test(name)) return no('brute', 'Genesis Brute hunt variant (untameable)');
  if (tax === 'Malfunctioned Tek Creatures' || /Malfunctioned/i.test(name) || /malfunctioned/.test(asset)) {
    return no('malfunctioned', 'Malfunctioned Tek mission variant (untameable)');
  }
  if (tax === 'VR Creatures' || /lifesupport|_tamesta|\/gauntlet/.test(pkg)) return no('vr_mission', 'Genesis 2 VR / simulation variant');
  if (/missionvariants|\/missions\/|_hunt$|_mission|_retrieve$|_race$|_escort$/.test(pkg)) {
    return no('mission_variant', 'Genesis mission/hunt variant (untameable)');
  }
  if (tax === 'Event Creatures' || tax === 'Eerie Creatures'
    || /(^|\/)(bone_|ghost_)|zombie|_bunny|bunny|_birthday|turkey|_vday|loveevolved|_polar$|yeti_|gacha_claus|dodorex|dodowyvern/.test(pkg)) {
    return no('event_only', 'event-only / cosmetic event creature');
  }
  if (/lifelabyrinth|_ll_|minion|summoned|eelboss|_steinbjorn/.test(pkg)) return no('boss_minion', 'boss-arena minion / summoned variant');
  if (NON_CREATURE[asset]) return no('non_creature', NON_CREATURE[asset]);
  if (asset === 'liopleurodon_character_bp') return no('untameable', 'Liopleurodon tames are temporary in ASE and expire');
  if (TEMPORARY_TAMES[asset]) return no('temporary_tame', TEMPORARY_TAMES[asset]);
  if (/^xenomorph_/.test(asset) && !OWNABLE_WITHOUT_TAMING.has(asset)) {
    return no('untameable', 'Reaper variant that cannot be owned (only the Reaper King tamed class is sold)');
  }
  if (ASE_NOT_KEEPABLE[asset]) return no('untameable', `${ASE_NOT_KEEPABLE[asset]} cannot be tamed in ASE (wiki "tameable" refers to the ASA Fish Basket)`);

  // Content whose presence on every IRIS server is not proven (checked after the
  // class rules so a boss under such a path still reports as a boss).
  if (officialMapRoot && !input.legacyProven) {
    return no('unverified', `unverified: official-map asset under ${officialMapRoot.replace(/\/$/, '')} not yet proven to spawn on IRIS servers`);
  }
  if (OWNER_EXCLUDED[asset]) return no('owner_excluded', OWNER_EXCLUDED[asset]);
  // Aquatica (/Game/Abyss): the owner opted in to selling it (2026-10-18). It is judged by
  // asset path only, because the wiki lists "Aquatica" on base creatures (e.g. Reaper)
  // that merely have an Abyssal variant there.
  if (pkg.startsWith('/game/abyss/') && !input.legacyProven) {
    if (/(^|_)reaper_|xenomorph/.test(asset)) return no('owner_excluded', 'owner: no Reaper creatures in the shop');
    if (AQUATICA_UNTAMEABLE[asset]) return no('untameable', AQUATICA_UNTAMEABLE[asset]);
    const reason = 'owner opt-in: ARK Aquatica DLC creature (server must have Aquatica content)';
    return AQUATICA_WATER_ONLY.has(asset)
      ? { status: 'SELLABLE_AQUATIC', code: 'sellable_aquatic', reason: `${reason}; water-only: buyer must stand in water when claiming` }
      : { status: 'SELLABLE', code: 'sellable', reason };
  }

  if (!input.legacyProven) {
    if (!wiki) return no('unverified', 'unverified: blueprint not found in ark.wiki.gg Creatures/Entities');
    if (wiki.tameable === false && !OWNABLE_WITHOUT_TAMING.has(asset)) return no('untameable', 'untameable per ark.wiki.gg');
    if (wiki.tameable === null) return no('unverified', 'unverified: wiki has no tameable flag');
    if (!/Survival Evolved/.test(games)) return no('unverified', 'unverified: ark.wiki.gg does not list this creature for ARK: Survival Evolved');
  }

  const aquatic = isAquaticOnly(input.blueprint);
  const origin = input.legacyProven ? 'legacy ArkShop row (proven config)' : 'vanilla ASE, tameable';
  return aquatic
    ? { status: 'SELLABLE_AQUATIC', code: 'sellable_aquatic', reason: `${origin}; water-only: buyer must stand in water when claiming` }
    : { status: 'SELLABLE', code: 'sellable', reason: origin };
}

// ---------------------------------------------------------------------------
// Legacy model: levels, variant multipliers, tier table
// ---------------------------------------------------------------------------

export type LegacyRow = {
  id: number;
  externalKey: string;
  name: string;
  price: number;
  /** Spawn level actually sent to the plugin. */
  level: number;
  /** Level the customer sees in the product name. */
  displayLevel: number;
  blueprint: string;
  categoryName: string;
  isActive: boolean;
};

export type Tier = 'small' | 'utility' | 'mid' | 'large' | 'apex' | 'premium';
export const TIERS: Tier[] = ['small', 'utility', 'mid', 'large', 'apex', 'premium'];

/** Tier bands on the legacy HIGH-slot (top level) price of a base species. */
export const TIER_PRICE_BANDS: Record<Tier, [number, number]> = {
  small: [0, 20],
  utility: [21, 60],
  mid: [61, 120],
  large: [121, 200],
  apex: [201, 400],
  premium: [401, Number.POSITIVE_INFINITY],
};

export function tierForHighPrice(price: number): Tier {
  return TIERS.find((tier) => price >= TIER_PRICE_BANDS[tier][0] && price <= TIER_PRICE_BANDS[tier][1]) ?? 'premium';
}

/**
 * Tier assignment by species knowledge for creatures with no legacy price.
 * Key = speciesKey(). Kept tiny on purpose: legacy already covers almost all
 * vanilla ASE tameables.
 */
export const NEW_SPECIES_TIER: Record<string, { tier: Tier; why: string; priceAs?: string }> = {
  // NOT_SELLABLE (TEMPORARY_TAMES); kept so an owner opt-in is priced against the
  // land apex (Managarmr) instead of the flyer-heavy premium tier.
  titanosaur: { tier: 'apex', why: 'largest land creature (Island), temporary tame that cannot level or heal', priceAs: 'managarmr' },
  reaperking: { tier: 'apex', why: 'Aberration apex predator obtained by birth' },
  stryder: { tier: 'large', why: 'Genesis 2 utility harvester/turret mount' },
  // No plain Stryder exists, so no Tek multiplier: priced as the 'large' tier directly.
  tekstryder: { tier: 'large', why: 'Genesis 2 utility harvester/turret mount (no base species, so no Tek multiplier)' },
  // ARK Aquatica species (owner opt-in 2026-10-18), tiered by role.
  chrysaora: { tier: 'small', why: 'Aquatica jellyfish' },
  seahorse: { tier: 'small', why: 'Aquatica small mount' },
  mudpuppy: { tier: 'small', why: 'Aquatica small amphibian' },
  tiktaalik: { tier: 'small', why: 'Aquatica small amphibian' },
  homarus: { tier: 'utility', why: 'Aquatica lobster utility tame' },
  mantisshrimp: { tier: 'utility', why: 'Aquatica utility tame' },
  riftcrawler: { tier: 'utility', why: 'Aquatica utility tame' },
  tridacna: { tier: 'utility', why: 'Aquatica giant clam utility tame' },
  istiophorus: { tier: 'mid', why: 'Aquatica fast water mount' },
  kathreptis: { tier: 'mid', why: 'Aquatica water mount' },
  onchopristis: { tier: 'mid', why: 'Aquatica sawfish combat mount' },
  qarmoutus: { tier: 'mid', why: 'Aquatica water mount' },
  stereolepis: { tier: 'mid', why: 'Aquatica water mount' },
  thunnus: { tier: 'mid', why: 'Aquatica fast water mount' },
  dakosaurus: { tier: 'large', why: 'Aquatica marine predator' },
  malleocephalus: { tier: 'large', why: 'Aquatica large shark' },
  monodon: { tier: 'large', why: 'Aquatica narwhal combat mount' },
  ocepechelon: { tier: 'large', why: 'Aquatica giant sea turtle' },
  waterwyvern: { tier: 'apex', why: 'Aquatica wyvern', priceAs: 'firewyvern' },
};

export type LegacySpecies = {
  key: string;
  name: string;
  group: VariantGroup;
  ladder: number[];
  priceByDisplay: Record<number, number>;
  spawnByDisplay: Record<number, number>;
  highPrice: number;
  tier: Tier;
};

export type LegacyModel = {
  species: Record<string, LegacySpecies>;
  groupLadders: Record<VariantGroup, { ladder: number[]; samples: number }>;
  variantMultipliers: Record<MultipliedGroup, { multiplier: number; samples: number; pairs: string[] }>;
  tierTable: Record<Tier, { ladder: number[]; prices: Record<number, number>; samples: number; species: string[] }>;
  levelHistogram: Record<number, number>;
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mode<T>(values: T[], key: (value: T) => string): T | undefined {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const k = key(value);
    const entry = counts.get(k) ?? { value, count: 0 };
    entry.count += 1;
    counts.set(k, entry);
  }
  // Highest count, ties broken by higher first element (prefer the higher level ladder).
  return [...counts.values()].sort((a, b) => b.count - a.count || key(b.value).localeCompare(key(a.value), 'en', { numeric: true }))[0]?.value;
}

export function niceRound(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_DINO_PRICE;
  const step = value >= 200 ? 10 : 5;
  return Math.max(MIN_DINO_PRICE, Math.round(value / step) * step);
}

const NON_VARIANT_GROUPS = new Set<VariantGroup>(['base', 'aquatic', 'wyvern']);

export function buildLegacyModel(rows: LegacyRow[]): LegacyModel {
  const active = rows.filter((row) => row.isActive);
  const levelHistogram: Record<number, number> = {};
  for (const row of active) levelHistogram[row.displayLevel] = (levelHistogram[row.displayLevel] ?? 0) + 1;

  // Species ladders from non-variant groups (the price anchors).
  const species: Record<string, LegacySpecies> = {};
  for (const row of active) {
    const group = variantGroupOf({ name: row.name, blueprint: row.blueprint, categoryName: row.categoryName });
    if (!NON_VARIANT_GROUPS.has(group)) continue;
    const key = speciesKey(row.name);
    const entry = species[key] ?? {
      key, name: baseSpeciesName(row.name), group, ladder: [], priceByDisplay: {}, spawnByDisplay: {}, highPrice: 0, tier: 'mid' as Tier,
    };
    if (!entry.ladder.includes(row.displayLevel)) entry.ladder.push(row.displayLevel);
    entry.priceByDisplay[row.displayLevel] = row.price;
    entry.spawnByDisplay[row.displayLevel] = row.level;
    species[key] = entry;
  }
  for (const entry of Object.values(species)) {
    entry.ladder.sort((a, b) => a - b);
    entry.highPrice = entry.priceByDisplay[entry.ladder[entry.ladder.length - 1]];
    entry.tier = tierForHighPrice(entry.highPrice);
  }

  // Modal level ladder per variant group (per distinct blueprint).
  const ladderByBlueprint = new Map<string, { group: VariantGroup; levels: number[] }>();
  for (const row of active) {
    const group = variantGroupOf({ name: row.name, blueprint: row.blueprint, categoryName: row.categoryName });
    const key = packageKey(row.blueprint);
    const entry = ladderByBlueprint.get(key) ?? { group, levels: [] };
    if (!entry.levels.includes(row.displayLevel)) entry.levels.push(row.displayLevel);
    ladderByBlueprint.set(key, entry);
  }
  const groupLadders = {} as LegacyModel['groupLadders'];
  for (const group of VARIANT_GROUPS) {
    const ladders = [...ladderByBlueprint.values()].filter((entry) => entry.group === group).map((entry) => [...entry.levels].sort((a, b) => a - b));
    groupLadders[group] = { ladder: mode(ladders, (ladder) => ladder.join('/')) ?? [], samples: ladders.length };
  }
  if (groupLadders.aquatic.ladder.length === 0) groupLadders.aquatic = { ...groupLadders.base };

  // Variant multipliers: variant price / legacy base species price at the same displayed level.
  const variantMultipliers = {} as LegacyModel['variantMultipliers'];
  for (const group of MULTIPLIED_GROUPS) {
    const ratios: number[] = [];
    const pairs: string[] = [];
    for (const row of active) {
      if (variantGroupOf({ name: row.name, blueprint: row.blueprint, categoryName: row.categoryName }) !== group) continue;
      const base = species[speciesKey(row.name)];
      if (!base) continue;
      const basePrice = base.priceByDisplay[row.displayLevel] ?? base.highPrice;
      if (!basePrice) continue;
      ratios.push(row.price / basePrice);
      pairs.push(`${stripLevelSuffix(row.name)} ${row.price}/${basePrice}`);
    }
    variantMultipliers[group] = { multiplier: Math.round(median(ratios) * 20) / 20 || 1, samples: ratios.length, pairs };
  }

  // Tier table from base-group species (aquatic/wyvern excluded so flyer/wyvern
  // premiums don't leak into land tiers).
  const tierTable = {} as LegacyModel['tierTable'];
  for (const tier of TIERS) {
    const members = Object.values(species).filter((entry) => entry.group === 'base' && entry.tier === tier && entry.ladder.length >= 1);
    const ladder = mode(members.map((entry) => entry.ladder), (value) => value.join('/')) ?? groupLadders.base.ladder;
    // Only members selling exactly the tier ladder contribute, so a 150/300 or 175/350
    // species never lands in the 190/380 slots.
    const ladderKey = ladder.join('/');
    const sampled = members.filter((entry) => entry.ladder.join('/') === ladderKey);
    const prices: Record<number, number> = {};
    for (const level of ladder) {
      const slotPrices = sampled
        .map((entry) => entry.priceByDisplay[level])
        .filter((price): price is number => typeof price === 'number');
      prices[level] = niceRound(median(slotPrices));
    }
    tierTable[tier] = { ladder, prices, samples: sampled.length, species: sampled.map((entry) => entry.name).sort() };
  }

  return { species, groupLadders, variantMultipliers, tierTable, levelHistogram };
}

// ---------------------------------------------------------------------------
// Level + price decisions for non-legacy rows
// ---------------------------------------------------------------------------

export type Offer = {
  displayLevel: number;
  spawnLevel: number;
  price: number;
  priceBasis: string;
  levelBasis: string;
};

export function spawnLevelFor(group: VariantGroup, displayLevel: number): number {
  return group === 'tek' ? Math.ceil(displayLevel / TEK_LEVEL_BONUS) : displayLevel;
}

/**
 * Decide the level ladder and prices for a creature that has no legacy row.
 * baseSpecies: the species it is a variant of (wiki VariantOf or name minus prefix).
 */
export function offersFor(
  model: LegacyModel,
  input: { name: string; group: VariantGroup; baseSpecies: string },
): Offer[] | { error: string } {
  const isVariant = (MULTIPLIED_GROUPS as VariantGroup[]).includes(input.group);
  const base = model.species[speciesKey(input.baseSpecies)];
  const ownKey = speciesKey(input.name);
  const known = NEW_SPECIES_TIER[ownKey] ?? NEW_SPECIES_TIER[speciesKey(input.baseSpecies)];
  const anchor = !base && known?.priceAs ? model.species[known.priceAs] : undefined;
  // Variant multipliers are learned from (variant, real base) pairs; a variant whose
  // base species has no legacy price (Tek Stryder) is priced from its tier as-is.
  const applyMultiplier = isVariant && Boolean(base);

  let ladder: number[];
  let levelBasis: string;
  let priceAt: (level: number) => number;
  let basis: (level: number) => string;

  if (!base && anchor) {
    ladder = isVariant ? [anchor.ladder[anchor.ladder.length - 1]] : [...anchor.ladder];
    levelBasis = `same ladder as legacy ${anchor.name} (${known!.why})`;
    priceAt = (level) => anchor.priceByDisplay[level] ?? anchor.highPrice;
    basis = (level) => `priced as legacy ${anchor.name} Lv.${level} = ${priceAt(level)} IC (${known!.why})`;
  } else if (base) {
    ladder = isVariant ? [base.ladder[base.ladder.length - 1]] : [...base.ladder];
    levelBasis = isVariant
      ? `top level of legacy ${base.name} (variant groups sell one top-level row)`
      : `same ladder as legacy ${base.name}`;
    priceAt = (level) => base.priceByDisplay[level] ?? base.highPrice;
    basis = (level) => `legacy ${base.name} Lv.${level} = ${priceAt(level)} IC`;
  } else {
    if (!known) return { error: `no legacy species and no tier assignment for "${input.name}"` };
    const tier = model.tierTable[known.tier];
    if (!tier || tier.ladder.length === 0) return { error: `tier ${known.tier} has no legacy data` };
    ladder = isVariant ? [tier.ladder[tier.ladder.length - 1]] : [...tier.ladder];
    levelBasis = `modal ladder of legacy '${known.tier}' tier (${tier.ladder.join('/')})`;
    priceAt = (level) => tier.prices[level] ?? tier.prices[tier.ladder[tier.ladder.length - 1]];
    basis = (level) => `tier '${known.tier}' (${known.why}); median of ${tier.samples} legacy species at Lv.${level} = ${priceAt(level)} IC`;
  }

  return ladder.map((displayLevel) => {
    let raw = priceAt(displayLevel);
    let priceBasis = basis(displayLevel);
    // A legacy price copied 1:1 (same species/regional form, or a priceAs anchor) is
    // already an owner-set number: keep it exactly instead of re-rounding it.
    const copiedLegacyPrice = !isVariant && Boolean(base ?? anchor) && Number.isInteger(raw) && raw >= MIN_DINO_PRICE;
    if (applyMultiplier) {
      const multiplier = model.variantMultipliers[input.group as MultipliedGroup];
      raw *= multiplier.multiplier;
      priceBasis += ` x ${input.group.toUpperCase()} multiplier ${multiplier.multiplier} (median of ${multiplier.samples} legacy pairs)`;
    } else if (isVariant) {
      priceBasis += ` (no legacy base species, so no ${input.group.toUpperCase()} multiplier)`;
    } else if (base && speciesKey(input.name) !== base.key) {
      priceBasis += ' (regional variant priced as its legacy species)';
    }
    const price = copiedLegacyPrice ? raw : niceRound(raw);
    if (price !== raw) priceBasis += `; rounded ${Math.round(raw * 100) / 100} -> ${price}`;
    return {
      displayLevel,
      spawnLevel: spawnLevelFor(input.group, displayLevel),
      price,
      priceBasis,
      levelBasis: input.group === 'tek' ? `${levelBasis}; Tek spawn level = ceil(${displayLevel}/1.2) like legacy Tek rows` : levelBasis,
    };
  });
}

// ---------------------------------------------------------------------------
// Product text + delivery payload
// ---------------------------------------------------------------------------

export function productName(displayName: string, displayLevel: number): string {
  return `${displayName} (Lv.${displayLevel})`;
}

export function productDescription(displayName: string, displayLevel: number, aquatic: boolean): string {
  return `${displayName} เลเวล ${displayLevel}${aquatic ? ` · ${AQUATIC_NOTE_TH}` : ''}`;
}

export type DinoDeliveryPayload = {
  schemaVersion: 1;
  source: string;
  sourceKey: string;
  type: 'dino';
  definition: { Type: 'dino'; Blueprint: string; Level: number; Price: number; Neutered: false; Description: string };
  spawn: { blueprint: string; level: number; forceTame: true; neutered: false; command: string };
  review: { status: 'approved'; priceBasis: string; levelBasis: string; wikiPage: string | null; plannedAt: string };
};

/** Same shape as legacy arkshop rows (import-arkshop-catalog.ts) plus a review block. */
export function buildDinoDeliveryPayload(input: {
  externalKey: string; blueprint: string; spawnLevel: number; price: number; name: string;
  priceBasis: string; levelBasis: string; wikiPage: string | null; plannedAt: string;
}): DinoDeliveryPayload {
  const blueprint = canonicalBlueprint(input.blueprint);
  return {
    schemaVersion: 1,
    source: DINO_CATALOG_SOURCE,
    sourceKey: input.externalKey,
    type: 'dino',
    definition: { Type: 'dino', Blueprint: blueprint, Level: input.spawnLevel, Price: input.price, Neutered: false, Description: input.name },
    spawn: {
      blueprint,
      level: input.spawnLevel,
      forceTame: true,
      neutered: false,
      command: `admincheat SpawnDino "${blueprint}" 500 0 0 ${input.spawnLevel}`,
    },
    review: { status: 'approved', priceBasis: input.priceBasis, levelBasis: input.levelBasis, wikiPage: input.wikiPage, plannedAt: input.plannedAt },
  };
}

/**
 * Runs the REAL backend dino delivery builder (src/services/dinoCatalogDelivery.ts,
 * used by checkout.controller and game-shop.controller) plus the gates around it:
 *  - catalog listing / checkout only offer products with itemBlueprint != null;
 *  - the game shop only offers products whose requiredCapabilities the plugin
 *    advertises (HeartShop HttpClient.cpp advertises delivery.dino.catalog.v1);
 *  - the resulting payload must pass HeartShop.cpp SpawnCatalogDinoForPlayer guards.
 * Returns the payload the plugin will receive (minus orderId), or an error string.
 */
export function simulateBackendDinoDelivery(product: {
  productType: string; itemBlueprint: string | null; requiredCapabilities: string[]; deliveryPayload: any; name: string;
}): { ok: true; payload: Omit<DinoCatalogDeliveryPayload, 'orderId'> } | { ok: false; error: string } {
  if (product.productType !== 'dino') return { ok: false, error: 'productType must be dino' };
  if (!product.itemBlueprint) return { ok: false, error: 'itemBlueprint is required (catalog filters itemBlueprint != null)' };
  if (product.requiredCapabilities.length !== 1 || product.requiredCapabilities[0] !== DINO_CATALOG_CAPABILITY) {
    return { ok: false, error: `requiredCapabilities must be ["${DINO_CATALOG_CAPABILITY}"]` };
  }
  const configured = product.deliveryPayload?.spawn ?? product.deliveryPayload?.definition ?? {};
  // The backend always sends forceTame:true; the catalog additionally requires the
  // stored spawn definition to say so, so a non-tame definition is never sold.
  if (configured.forceTame !== true) return { ok: false, error: 'spawn.forceTame must be true' };
  const result = resolveDinoCatalogDelivery(product, 'dry-run');
  if (!result.ok) return { ok: false, error: result.reason === 'level' ? 'level outside 1..10000' : 'spawn.blueprint must equal itemBlueprint' };
  const rejected = pluginRejectsDinoPayload(result.payload);
  if (rejected) return { ok: false, error: `HeartShop would reject: ${rejected}` };
  const { orderId: _orderId, ...payload } = result.payload;
  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Artwork manifest (written concurrently by the artwork team)
// ---------------------------------------------------------------------------

/**
 * Accepts any of these shapes (all keys case-insensitive for blueprints):
 *   { products: { "<externalKey>": "<url>" | { imageUrl } } }
 *   { byBlueprint|blueprints|creatures: { "<blueprint or package path>": "<url>" | { imageUrl } } }
 *   { entries|items|rows|images: [ { externalKey?, blueprint?, packageKey?, imageUrl } ] }
 *   { entries: { "<lower-cased /game/... path>": { imageUrl, ... } } }   (fetch-artwork.mjs)
 *   [ { externalKey?, blueprint?, imageUrl } ]
 *   { "<externalKey or blueprint>": "<url>" | { imageUrl } }
 */
export type ArtworkIndex = {
  byExternalKey: Map<string, string>;
  byPackage: Map<string, string>;
  /** Product ids an entry was fetched for (fetch-artwork.mjs `productIds`), when the manifest says. */
  targetsByExternalKey: Map<string, number[]>;
  targetsByPackage: Map<string, number[]>;
};
export type ArtworkMatch = { imageUrl: string; productIds: number[] | null };

export function parseArtworkManifest(raw: unknown): ArtworkIndex {
  const index: ArtworkIndex = { byExternalKey: new Map(), byPackage: new Map(), targetsByExternalKey: new Map(), targetsByPackage: new Map() };
  const idsOf = (value: unknown): number[] | null => {
    if (!value || typeof value !== 'object') return null;
    const ids = (value as Record<string, unknown>).productIds;
    return Array.isArray(ids) ? ids.map(Number).filter((id) => Number.isSafeInteger(id)) : null;
  };
  const urlOf = (value: unknown): string | null => {
    if (typeof value === 'string') return value.trim() || null;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const candidate = record.imageUrl ?? record.url ?? record.publicPath ?? record.path;
      return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
    }
    return null;
  };
  const addKeyed = (key: string, value: unknown) => {
    const url = urlOf(value);
    if (!url) return;
    const ids = idsOf(value);
    if (/^\/game\//i.test(stripBlueprintRef(key))) {
      index.byPackage.set(packageKey(key), url);
      if (ids) index.targetsByPackage.set(packageKey(key), ids);
    } else {
      index.byExternalKey.set(key, url);
      if (ids) index.targetsByExternalKey.set(key, ids);
    }
    if (value && typeof value === 'object') addEntry(value);
  };
  const addEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const url = urlOf(record);
    if (!url) return;
    const ids = idsOf(record);
    if (typeof record.externalKey === 'string') {
      index.byExternalKey.set(record.externalKey, url);
      if (ids) index.targetsByExternalKey.set(record.externalKey, ids);
    }
    for (const field of ['blueprint', 'packageKey', 'itemBlueprint']) {
      if (typeof record[field] === 'string' && /\/game\//i.test(record[field] as string)) {
        index.byPackage.set(packageKey(record[field]), url);
        if (ids) index.targetsByPackage.set(packageKey(record[field]), ids);
      }
    }
  };
  const visitMap = (map: unknown) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) addKeyed(key, value);
  };

  if (Array.isArray(raw)) raw.forEach(addEntry);
  else if (raw && typeof raw === 'object') {
    const root = raw as Record<string, unknown>;
    let structured = false;
    for (const field of ['products', 'byExternalKey', 'byBlueprint', 'blueprints', 'creatures', 'byPackage']) {
      if (root[field] && typeof root[field] === 'object') {
        structured = true;
        if (Array.isArray(root[field])) (root[field] as unknown[]).forEach(addEntry);
        else visitMap(root[field]);
      }
    }
    for (const field of ['entries', 'items', 'rows', 'images']) {
      if (Array.isArray(root[field])) { structured = true; (root[field] as unknown[]).forEach(addEntry); }
      // fetch-artwork.mjs writes { entries: { "/game/a/b.b": { imageUrl, name, ... } } }
      else if (root[field] && typeof root[field] === 'object') { structured = true; visitMap(root[field]); }
    }
    if (!structured) visitMap(root);
  }
  return index;
}

export function lookupArtworkMatch(index: ArtworkIndex, row: { externalKey: string; blueprint: string }): ArtworkMatch | null {
  const byKey = index.byExternalKey.get(row.externalKey);
  if (byKey) return { imageUrl: byKey, productIds: index.targetsByExternalKey.get(row.externalKey) ?? null };
  const pkg = packageKey(row.blueprint);
  const byPackage = index.byPackage.get(pkg);
  return byPackage ? { imageUrl: byPackage, productIds: index.targetsByPackage.get(pkg) ?? null } : null;
}

export function lookupArtwork(index: ArtworkIndex, row: { externalKey: string; blueprint: string }): string | null {
  return lookupArtworkMatch(index, row)?.imageUrl ?? null;
}
