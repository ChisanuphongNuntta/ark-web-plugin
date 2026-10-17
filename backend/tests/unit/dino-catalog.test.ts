import { describe, expect, it } from 'vitest';
import {
  AQUATIC_NOTE_TH,
  DINO_CATALOG_CAPABILITY,
  buildDinoDeliveryPayload,
  buildLegacyModel,
  canonicalBlueprint,
  classifyCreature,
  niceRound,
  offersFor,
  parseArtworkManifest,
  lookupArtwork,
  simulateBackendDinoDelivery,
  spawnLevelFor,
  type LegacyRow,
  type WikiCreature,
} from '../../scripts/dino-catalog/lib.js';
import { buildPlan, type ExportedProduct } from '../../scripts/dino-catalog/plan.js';
import { computeChange, projectedProduct, verifyDeliverable, type DbProduct } from '../../scripts/dino-catalog/apply-core.js';

const bp = (pkg: string) => {
  const name = pkg.slice(pkg.lastIndexOf('/') + 1);
  return `Blueprint'${pkg}.${name}'`;
};
const REX = '/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP';
const SPINO = '/Game/PrimalEarth/Dinos/Spino/Spino_Character_BP';
const DODO = '/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP';
const MEGALODON = '/Game/PrimalEarth/Dinos/Megalodon/Megalodon_Character_BP';

const wiki = (overrides: Partial<WikiCreature> & { blueprint: string; name: string }): WikiCreature => ({
  page: overrides.name,
  entityName: overrides.name,
  inGames: 'ARK: Survival Evolved',
  inMod: '',
  dlcs: [],
  taxonomicGroup: 'Dinosaurs',
  tameable: true,
  aquatic: false,
  isMobile: false,
  variantOf: null,
  ...overrides,
});

const legacyPayload = (blueprint: string, level: number, price: number, name: string, key: string) => ({
  type: 'dino',
  spawn: { level, command: `admincheat SpawnDino "${blueprint}" 500 0 0 ${level}`, neutered: false, blueprint, forceTame: true },
  source: 'arkshop',
  sourceKey: key,
  definition: { Type: 'dino', Level: level, Price: price, Neutered: false, Blueprint: blueprint, Description: name },
  schemaVersion: 1,
});

let nextId = 1;
const legacyProduct = (name: string, pkg: string, level: number, price: number, category = 'Dinos', spawnLevel = level): ExportedProduct => {
  const key = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${level}`;
  return {
    id: nextId++,
    name: `${name} (Lv.${level})`,
    description: `${name} (Lv.${level})`,
    price,
    productType: 'dino',
    externalKey: `arkshop:${key}`,
    deliveryPayload: legacyPayload(bp(pkg), spawnLevel, price, `${name} (Lv.${level})`, key),
    requiredCapabilities: [DINO_CATALOG_CAPABILITY],
    itemBlueprint: bp(pkg),
    imageUrl: '/images/catalog/legacy/x.webp',
    isActive: true,
    sortOrder: nextId,
    category: { id: 7, name: category },
  };
};

const draftProduct = (name: string, pkg: string, category = 'Dinos'): ExportedProduct => ({
  id: nextId++,
  name,
  description: 'ร่างรอตรวจ',
  price: 150,
  productType: 'dino',
  externalKey: `frozen-reference:${bp(pkg).replace(/^Blueprint'|'$/g, '').toLowerCase()}`,
  deliveryPayload: {
    type: 'dino',
    review: { status: 'pending', special: false },
    source: 'ark-wiki-reference',
    definition: { Type: 'dino', Level: 150, Price: 150, Blueprint: bp(pkg), Description: name },
    schemaVersion: 1,
  },
  requiredCapabilities: ['delivery.dino.v1'],
  itemBlueprint: null,
  imageUrl: null,
  isActive: false,
  sortOrder: 0,
  category: { id: 7, name: category },
});

function fixture() {
  nextId = 1;
  const legacy = [
    legacyProduct('Rex', REX, 190, 100), legacyProduct('Rex', REX, 380, 195),
    legacyProduct('Spino', SPINO, 190, 110), legacyProduct('Spino', SPINO, 380, 215),
    legacyProduct('Dodo', DODO, 200, 2), legacyProduct('Dodo', DODO, 400, 3),
    legacyProduct('Megalodon', MEGALODON, 190, 70), legacyProduct('Megalodon', MEGALODON, 380, 135),
    legacyProduct('X-Rex', '/Game/Genesis/Dinos/BiomeVariants/Volcano_Rex/Volcano_Rex_Character_BP', 380, 351, 'Dinos · X'),
    legacyProduct('Aberrant Dodo', '/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP_Aberrant', 400, 4, 'Dinos · Aberrant'),
    legacyProduct('Tek Rex', '/Game/PrimalEarth/Dinos/Rex/BionicRex_Character_BP', 380, 390, 'Dinos · Tek', 317),
  ];
  return legacy;
}

describe('dino catalog: classification', () => {
  const sellable = (name: string, pkg: string, extra: Partial<WikiCreature> = {}) =>
    classifyCreature({ name, blueprint: bp(pkg), wiki: wiki({ name, blueprint: `${pkg}.x`, ...extra }) });

  it('sells vanilla tameables and flags water-only creatures', () => {
    expect(sellable('Rex', REX).status).toBe('SELLABLE');
    const megalodon = sellable('Megalodon', MEGALODON);
    expect(megalodon.status).toBe('SELLABLE_AQUATIC');
    expect(sellable('Megachelon', '/Game/Genesis/Dinos/GiantTurtle/GiantTurtle_Character_BP').status).toBe('SELLABLE_AQUATIC');
    expect(sellable('Thorny Dragon', '/Game/ScorchedEarth/Dinos/SpineyLizard/SpineyLizard_Character_BP').status).toBe('SELLABLE');
    // space flyer, not a water creature, even though its asset is "SpaceDolphin"
    expect(sellable('Astrodelphis', '/Game/Genesis2/Dinos/SpaceDolphin/SpaceDolphin_Character_BP').status).toBe('SELLABLE');
    expect(sellable('X-Ichthyosaurus', '/Game/Genesis/Dinos/BiomeVariants/Ocean_Dolphin/Ocean_Dolphin_Character_BP').status).toBe('SELLABLE_AQUATIC');
  });

  it.each([
    ['Alpha T-Rex', '/Game/PrimalEarth/Dinos/Rex/MegaRex_Character_BP', { taxonomicGroup: 'Alpha Creatures', tameable: false }, 'alpha'],
    ['Forest Titan', '/Game/Extinction/Dinos/KingKaiju/KingKaiju_Character_BP', { tameable: false }, 'titan'],
    ['Broodmother Lysrix', '/Game/PrimalEarth/Dinos/SpiderL/SpiderL_Character_BP', { taxonomicGroup: 'Bosses', tameable: false }, 'boss'],
    ['Dragon (Gamma)', '/Game/PrimalEarth/Dinos/Dragon/Dragon_Character_BP_Boss_Easy', { tameable: false }, 'boss'],
    ['Corrupted Rex', '/Game/Extinction/Dinos/Corrupt/Rex/Rex_Character_BP_Corrupt', { tameable: false }, 'corrupted'],
    ['Brute X-Rex', '/Game/Genesis/Dinos/MissionVariants/Hunt/Volcano/Volcano_Rex_Character_BP_Hunt', { taxonomicGroup: 'Brute Creatures' }, 'brute'],
    ['Malfunctioned Tek Rex', '/Game/PrimalEarth/Dinos/Rex/BionicRex_Character_BP_Malfunctioned', { tameable: false }, 'malfunctioned'],
    ['VR Rex', '/Game/Genesis2/Missions/ModularMission/Gauntlet2/VR/Rex_Character_BP_Gauntlet2', { taxonomicGroup: 'VR Creatures' }, 'vr_mission'],
    ['Golden Striped Megalodon', '/Game/Genesis/Dinos/MissionVariants/Retrieve/Ocean/Ocean_Megalodon_Character_BP_Retrieve', {}, 'mission_variant'],
    ['Bunny Dodo', '/Game/PrimalEarth/Dinos/Dodo/Dodo_Character_BP_Bunny', { taxonomicGroup: 'Event Creatures' }, 'event_only'],
    ['Gigantoraptor', '/Game/ASA/Dinos/Gigantoraptor/Gigantoraptor_Character_BP', { inGames: 'ARK: Survival Ascended' }, 'asa_path'],
    ['Adasaurus', '/PPR-Adasaurus/Dinos/SPAdasaurus/Adasaurus_Character_BP', {}, 'mod_path'],
    ['Achatina', '/Game/Mods/DarkArk/Dinos/Achatina/DA_Achatina_Character_BP', { inMod: 'The Hunted 2.0' }, 'mod_path'],
    ['Takifugu', '/Game/Abyss/Dinos/Takifugu/Takifugu_Character_BP', { dlcs: ['Aquatica'] }, 'untameable'],
    ['Abyssal Reaper King', '/Game/Abyss/Dinos/Abyssal/Reaper/Reaper_Character_BP_Male_Abyssal', { dlcs: ['Aquatica'] }, 'owner_excluded'],
    ['Rhyniognatha', '/Game/PrimalEarth/Dinos/Rhyniognatha/Rhynio_Character_BP', { tameable: true }, 'owner_excluded'],
    ['Chalk Golem', '/Game/Mods/Valguero/Assets/Dinos/RockGolem/ChalkGolem/ChalkGolem_Character_BP', {}, 'unverified'],
    ['Meganeura', '/Game/PrimalEarth/Dinos/Dragonfly/Dragonfly_Character_BP', { tameable: false }, 'untameable'],
    ['Piranha', '/Game/PrimalEarth/Dinos/Piranha/Piranha_Character_BP', { tameable: true }, 'untameable'],
    ['Reaper Queen', '/Game/Aberration/Dinos/Nameless/Xenomorph_Character_BP_Female', { tameable: false }, 'untameable'],
    ['Mega Mek', '/Game/Extinction/Dinos/Mek/MegaMek_Character_BP', {}, 'non_creature'],
    // wiki says tameable, but the tame starves within a day and cannot be cryopodded or leveled
    ['Titanosaur', '/Game/PrimalEarth/Dinos/Titanosaur/Titanosaur_Character_BP', { tameable: true }, 'temporary_tame'],
  ])('%s is NOT_SELLABLE (%s)', (name, pkg, extra, code) => {
    const result = sellable(name, pkg, extra as Partial<WikiCreature>);
    expect(result.status).toBe('NOT_SELLABLE');
    expect(result.code).toBe(code);
  });

  it('the boss check wins over the unverified official-map check', () => {
    const result = sellable('Crystal Wyvern Queen', '/Game/Mods/CrystalIsles/Assets/Dinos/CIBoss/CrystalWyvern_Character_BP_Boss');
    expect(result.code).toBe('boss');
  });

  it('is conservative with unknown creatures', () => {
    expect(classifyCreature({ name: 'Mystery', blueprint: bp('/Game/PrimalEarth/Dinos/Mystery/Mystery_Character_BP') }).code).toBe('unverified');
    expect(sellable('Mystery', '/Game/PrimalEarth/Dinos/Mystery/Mystery_Character_BP', { tameable: null }).code).toBe('unverified');
    expect(sellable('Mystery', '/Game/PrimalEarth/Dinos/Mystery/Mystery_Character_BP', { inGames: '' }).code).toBe('unverified');
  });

  it('sells no Reaper creatures (owner decision 2026-10-18)', () => {
    expect(sellable('Reaper King', '/Game/Aberration/Dinos/Nameless/Xenomorph_Character_BP_Male_Tamed', { tameable: false }).code).toBe('owner_excluded');
    expect(sellable('Reaper', '/Game/Aberration/Dinos/Nameless/Xenomorph_Character_BP_Male', { tameable: false, dlcs: ['Aberration', 'Aquatica'] }).code).toBe('untameable');
  });

  it('sells Aquatica creatures the owner opted in to, flagging water-only ones', () => {
    const dako = sellable('Dakosaurus', '/Game/Abyss/Dinos/Dakosaurus/Dakosaurus_Character_BP', { dlcs: ['Aquatica'] });
    expect(dako.status).toBe('SELLABLE_AQUATIC');
    expect(sellable('Homarus', '/Game/Abyss/Dinos/Homarus/Homarus_Character_BP', { dlcs: ['Aquatica'] }).status).toBe('SELLABLE');
  });

  it('legacy rows on proven official-map paths stay sellable without wiki data', () => {
    const iceWyvern = classifyCreature({
      name: 'Ice Wyvern (Lv.350)',
      blueprint: bp('/Game/Mods/Ragnarok/Custom_Assets/Dinos/Wyvern/Ice_Wyvern/Ragnarok_Wyvern_Override_Ice'),
      legacyProven: true,
    });
    expect(iceWyvern.status).toBe('SELLABLE');
  });
});

describe('dino catalog: levels and prices', () => {
  const rows: LegacyRow[] = fixture().map((product) => ({
    id: product.id, externalKey: product.externalKey!, name: product.name, price: product.price,
    level: product.deliveryPayload.spawn.level, displayLevel: Number(product.name.match(/Lv\.(\d+)/)![1]),
    blueprint: product.itemBlueprint!, categoryName: product.category!.name, isActive: true,
  }));
  const model = buildLegacyModel(rows);

  it('learns variant multipliers from legacy pairs', () => {
    expect(model.variantMultipliers.x.multiplier).toBe(1.8); // 351 / 195
    expect(model.variantMultipliers.tek.multiplier).toBe(2); // 390 / 195
    expect(model.variantMultipliers.aberrant.multiplier).toBe(1.35); // 4 / 3 -> 1.333 -> 1.35
  });

  it('prices a variant from its legacy base species at the base top level', () => {
    const offers = offersFor(model, { name: 'X-Spino', group: 'x', baseSpecies: 'Spino' });
    expect(offers).toEqual([expect.objectContaining({ displayLevel: 380, spawnLevel: 380, price: 390 })]);
    expect((offers as any)[0].priceBasis).toMatch(/legacy Spino Lv\.380 = 215 IC x X multiplier 1\.8/);
  });

  it('never prices a new dino below 10 IC and rounds to 5/10', () => {
    const offers = offersFor(model, { name: 'R-Dodo', group: 'r', baseSpecies: 'Dodo' }) as any[];
    expect(offers[0].price).toBe(10);
    expect(niceRound(142.5)).toBe(145);
    expect(niceRound(387)).toBe(390);
    expect(niceRound(3)).toBe(10);
  });

  it('uses the Tek spawn convention (displayed level / 1.2)', () => {
    expect(spawnLevelFor('tek', 400)).toBe(334);
    expect(spawnLevelFor('tek', 380)).toBe(317);
    expect(spawnLevelFor('base', 400)).toBe(400);
  });

  it('falls back to the tier table only for species with a tier assignment', () => {
    const reaperKing = offersFor(model, { name: 'Reaper King', group: 'base', baseSpecies: 'Reaper King' });
    expect(Array.isArray(reaperKing)).toBe(true);
    expect((reaperKing as any[]).every((offer) => offer.price >= 10 && /^tier 'apex'/.test(offer.priceBasis))).toBe(true);
    expect(offersFor(model, { name: 'Unknownosaurus', group: 'base', baseSpecies: 'Unknownosaurus' })).toEqual({ error: expect.stringMatching(/no legacy species/) });
  });

  it('does not apply a variant multiplier when the variant has no legacy base species (Tek Stryder)', () => {
    const offers = offersFor(model, { name: 'Tek Stryder', group: 'tek', baseSpecies: 'Stryder' }) as any[];
    const large = model.tierTable.large;
    expect(offers).toEqual([expect.objectContaining({ displayLevel: large.ladder[large.ladder.length - 1], price: large.prices[large.ladder[large.ladder.length - 1]] })]);
    expect(offers[0].priceBasis).toMatch(/no legacy base species, so no TEK multiplier/);
    expect(offers[0].priceBasis).not.toMatch(/x TEK multiplier/);
  });

  describe('with a richer legacy set', () => {
    const extra: LegacyRow[] = [
      ['Managarmr', '/Game/Genesis2/Dinos/Managarmr/Managarmr_Character_BP', 190, 200], ['Managarmr', '/Game/Genesis2/Dinos/Managarmr/Managarmr_Character_BP', 380, 395],
      ['Rock Elemental', '/Game/ScorchedEarth/Dinos/RockGolem/RockGolem_Character_BP', 175, 175], ['Rock Elemental', '/Game/ScorchedEarth/Dinos/RockGolem/RockGolem_Character_BP', 350, 345],
      ['Phoenix', '/Game/ScorchedEarth/Dinos/Phoenix/Phoenix_Character_BP', 150, 300], ['Phoenix', '/Game/ScorchedEarth/Dinos/Phoenix/Phoenix_Character_BP', 300, 590],
      ['Astrocetus', '/Game/Genesis2/Dinos/SpaceWhale/SpaceWhale_Character_BP', 190, 340], ['Astrocetus', '/Game/Genesis2/Dinos/SpaceWhale/SpaceWhale_Character_BP', 380, 675],
      ['Astrodelphis', '/Game/Genesis2/Dinos/SpaceDolphin/SpaceDolphin_Character_BP', 190, 250], ['Astrodelphis', '/Game/Genesis2/Dinos/SpaceDolphin/SpaceDolphin_Character_BP', 380, 435],
    ].map(([name, pkg, level, price], index) => ({
      id: 500 + index, externalKey: `arkshop:x${index}`, name: `${name} (Lv.${level})`, price: price as number, level: level as number,
      displayLevel: level as number, blueprint: bp(pkg as string), categoryName: 'Dinos', isActive: true,
    }));
    const rich = buildLegacyModel([...rows, ...extra]);

    it('tier slots only use members selling exactly the tier ladder (Phoenix 150/300 is not a 190/380 sample)', () => {
      expect(rich.tierTable.premium.ladder).toEqual([190, 380]);
      expect(rich.tierTable.premium.species).toEqual(['Astrocetus', 'Astrodelphis']);
      expect(rich.tierTable.premium.prices).toEqual({ 190: 300, 380: 560 }); // niceRound(median(340,250)=295), niceRound(median(675,435)=555)
    });

    it('keeps a legacy price copied 1:1 instead of re-rounding it (Ice Golem = Rock Elemental)', () => {
      const offers = offersFor(rich, { name: 'Ice Golem', group: 'base', baseSpecies: 'Ice Golem' }) as any[];
      expect(offers.map((offer) => [offer.displayLevel, offer.price])).toEqual([[175, 175], [350, 345]]);
      expect(offers[1].priceBasis).not.toMatch(/rounded/);
    });

    it('prices a Titanosaur opt-in against the land apex (Managarmr), not the premium tier', () => {
      const offers = offersFor(rich, { name: 'Titanosaur', group: 'base', baseSpecies: 'Titanosaur' }) as any[];
      expect(offers.map((offer) => [offer.displayLevel, offer.price])).toEqual([[190, 200], [380, 395]]);
      expect(offers[0].priceBasis).toMatch(/priced as legacy Managarmr/);
    });
  });
});

describe('dino catalog: plan + dedupe', () => {
  const plan = () => {
    const products = [
      ...fixture(),
      draftProduct('Rex', REX),
      draftProduct('X-Spino', '/Game/Genesis/Dinos/BiomeVariants/Bog_Spino/Bog_Spino_Character_BP_X', 'Dinos · X'),
      draftProduct('Alpha T-Rex', '/Game/PrimalEarth/Dinos/Rex/MegaRex_Character_BP'),
    ];
    const creatures = [
      wiki({ name: 'Rex', blueprint: `${REX}.Rex_Character_BP` }),
      wiki({ name: 'X-Spino', blueprint: '/Game/Genesis/Dinos/BiomeVariants/Bog_Spino/Bog_Spino_Character_BP_X.Bog_Spino_Character_BP_X', variantOf: 'Spino', taxonomicGroup: 'X-Creatures' }),
      wiki({ name: 'Alpha T-Rex', blueprint: '/Game/PrimalEarth/Dinos/Rex/MegaRex_Character_BP.MegaRex_Character_BP', taxonomicGroup: 'Alpha Creatures', tameable: false }),
      wiki({ name: 'Dodo', blueprint: `${DODO}.Dodo_Character_BP` }),
      wiki({ name: 'Megalodon', blueprint: `${MEGALODON}.Megalodon_Character_BP`, aquatic: true }),
      // tameable ASE creature missing from the products table -> created with the legacy Spino ladder
      wiki({ name: 'Spinosaur Junior', entityName: 'Spino', blueprint: '/Game/PrimalEarth/Dinos/Spino/Spino_Character_BP_Junior.Spino_Character_BP_Junior', variantOf: 'Spino' }),
    ];
    return buildPlan({ products, wiki: creatures, now: new Date('2026-10-18T00:00:00Z') });
  };

  it('keeps every legacy row and never changes its price', () => {
    const result = plan();
    const legacy = result.rows.filter((row) => row.source === 'legacy');
    expect(legacy).toHaveLength(11);
    expect(legacy.every((row) => row.action === 'keep' && row.price === row.current!.price)).toBe(true);
  });

  it('marks a draft that repeats a legacy blueprint as duplicate', () => {
    const rex = plan().rows.find((row) => row.source === 'draft' && row.displayName === 'Rex')!;
    expect(rex.action).toBe('leave_inactive');
    expect(rex.code).toBe('duplicate');
    expect(rex.reason).toBe('duplicate of arkshop:rex190');
  });

  it('activates sellable drafts and leaves the rest inactive with a reason', () => {
    const result = plan();
    const xSpino = result.rows.find((row) => row.displayName === 'X-Spino')!;
    expect(xSpino).toMatchObject({ action: 'activate', displayLevel: 380, level: 380, price: 390, categoryName: 'Dinos · X', description: 'X-Spino เลเวล 380' });
    const alpha = result.rows.find((row) => row.displayName === 'Alpha T-Rex')!;
    expect(alpha).toMatchObject({ action: 'leave_inactive', code: 'alpha' });
  });

  it('creates missing wiki creatures once per blueprint + level', () => {
    const result = plan();
    const created = result.rows.filter((row) => row.action === 'create');
    expect(created.map((row) => row.name).sort()).toEqual(['Spino (Lv.190)', 'Spino (Lv.380)']);
    const slots = result.rows.filter((row) => ['keep', 'activate', 'create'].includes(row.action)).map((row) => `${row.blueprint}@${row.displayLevel}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(result.errors).toEqual([]);
    expect(result.counts.byAction).toMatchObject({ keep: 11, activate: 1, create: 2, leave_inactive: 2 });
  });

  it('adds the Thai water note to aquatic legacy rows', () => {
    const megalodon = plan().rows.find((row) => row.name === 'Megalodon (Lv.380)')!;
    expect(megalodon.aquatic).toBe(true);
    expect(megalodon.description).toBe(`Megalodon (Lv.380) · ${AQUATIC_NOTE_TH}`);
  });

  it('reports legacy level anomalies instead of changing them', () => {
    nextId = 100;
    const maewing = legacyProduct('Maewing', '/Game/Genesis2/Dinos/MilkGlider/MilkGlider_Character_BP', 190, 90, 'Dinos', 200);
    const result = buildPlan({ products: [...fixture(), maewing], wiki: [] });
    expect(result.report.legacyLevelAnomalies).toEqual([expect.objectContaining({ name: 'Maewing (Lv.190)', spawnLevel: 200 })]);
    expect(result.rows.find((row) => row.name === 'Maewing (Lv.190)')).toMatchObject({ action: 'keep', level: 200 });
  });

  it('reports (but never changes) odd legacy prices: variant below base, outsized ladder step', () => {
    const products = fixture();
    nextId = 200;
    const OVIS = '/Game/PrimalEarth/Dinos/Sheep/Sheep_Character_BP';
    const FEROX = '/Game/Genesis2/Dinos/Shapeshifter/Shapeshifter_Small/Shapeshifter_Small_Character_BP';
    products.push(
      legacyProduct('Ovis', OVIS, 400, 55),
      legacyProduct('Aberrant Ovis', `${OVIS}_Aberrant`, 400, 28, 'Dinos · Aberrant'),
      legacyProduct('Ferox', FEROX, 75, 30, 'Dinos', 60),
      legacyProduct('Ferox', FEROX, 150, 115),
    );
    const result = buildPlan({ products, wiki: [] });
    const anomalies = result.report.legacyPriceAnomalies;
    expect(anomalies.map((entry) => [entry.name, entry.price])).toEqual(expect.arrayContaining([['Aberrant Ovis (Lv.400)', 28], ['Ferox (Lv.75)', 30]]));
    expect(anomalies.find((entry) => entry.name === 'Ferox (Lv.75)')!.note).toMatch(/spawns Lv\.60/);
    expect(anomalies.some((entry) => entry.name.startsWith('Rex') || entry.name.startsWith('Spino'))).toBe(false);
    expect(result.rows.find((row) => row.name === 'Aberrant Ovis (Lv.400)')).toMatchObject({ action: 'keep', price: 28 });
  });
});

describe('dino catalog: delivery payload', () => {
  it('matches the legacy arkshop payload shape and survives the backend dino builder', () => {
    const blueprint = bp('/Game/Genesis/Dinos/BiomeVariants/Bog_Spino/Bog_Spino_Character_BP_X');
    const payload = buildDinoDeliveryPayload({
      externalKey: 'frozen-reference:x', blueprint, spawnLevel: 380, price: 390, name: 'X-Spino (Lv.380)',
      priceBasis: 'p', levelBasis: 'l', wikiPage: null, plannedAt: '2026-10-18T00:00:00.000Z',
    });
    const legacy = legacyPayload(blueprint, 380, 390, 'X-Spino (Lv.380)', 'x');
    expect(Object.keys(payload.spawn).sort()).toEqual(Object.keys(legacy.spawn).sort());
    expect(Object.keys(payload.definition).sort()).toEqual(Object.keys(legacy.definition).sort());
    expect(payload.spawn).toEqual(legacy.spawn);
    expect(payload).toMatchObject({ type: 'dino', schemaVersion: 1 });

    const delivered = simulateBackendDinoDelivery({
      productType: 'dino', itemBlueprint: payload.spawn.blueprint, requiredCapabilities: [DINO_CATALOG_CAPABILITY], deliveryPayload: payload, name: 'X-Spino (Lv.380)',
    });
    expect(delivered).toEqual({
      ok: true,
      payload: { schemaVersion: 1, productType: 'dino', productName: 'X-Spino (Lv.380)', dino: { blueprint, level: 380, forceTame: true, neutered: false } },
    });
  });

  it('normalises wiki class paths to the legacy Blueprint reference', () => {
    expect(canonicalBlueprint('/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP_C'))
      .toBe("Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'");
  });

  it('rejects drafts that the backend would refuse (no itemBlueprint / old capability)', () => {
    const draft = draftProduct('X', REX);
    expect(simulateBackendDinoDelivery({ ...draft, requiredCapabilities: draft.requiredCapabilities! } as any).ok).toBe(false);
  });
});

describe('dino catalog: apply', () => {
  const ctx = {
    planGeneratedAt: '2026-10-18T00:00:00.000Z',
    categoryIds: { 'Dinos': 7, 'Dinos · X': 20, 'Dinos · Aquatic': 14, 'Dinos · Aberrant': 9, 'Dinos · R': 18, 'Dinos · Tek': 19, 'Dinos · Wyvern': 16 },
    artwork: parseArtworkManifest({
      entries: { '/game/genesis/dinos/biomevariants/bog_spino/bog_spino_character_bp_x.bog_spino_character_bp_x': { imageUrl: '/images/catalog/ark/dinos/bog_spino.webp' } },
    }),
    reviewedAt: '2026-10-18T01:00:00.000Z',
  };
  const toDb = (product: ExportedProduct): DbProduct => ({
    id: product.id, name: product.name, description: product.description ?? null, price: product.price, productType: product.productType,
    externalKey: product.externalKey, deliveryPayload: product.deliveryPayload, requiredCapabilities: product.requiredCapabilities ?? [],
    itemBlueprint: product.itemBlueprint, imageUrl: product.imageUrl ?? null, isActive: product.isActive, sortOrder: product.sortOrder ?? 0, categoryId: 7,
  });

  it('activates a draft into a deliverable product and is idempotent', () => {
    const draft = draftProduct('X-Spino', '/Game/Genesis/Dinos/BiomeVariants/Bog_Spino/Bog_Spino_Character_BP_X', 'Dinos · X');
    const plan = buildPlan({
      products: [...fixture(), draft],
      wiki: [wiki({ name: 'X-Spino', blueprint: '/Game/Genesis/Dinos/BiomeVariants/Bog_Spino/Bog_Spino_Character_BP_X.Bog_Spino_Character_BP_X', variantOf: 'Spino' })],
      now: new Date(ctx.planGeneratedAt),
    });
    const row = plan.rows.find((candidate) => candidate.externalKey === draft.externalKey)!;
    const current = toDb(draft);
    const change = computeChange(row, current, ctx);
    expect(change.kind).toBe('update');
    expect(change.data).toMatchObject({ isActive: true, price: 390, categoryId: 20, imageUrl: '/images/catalog/ark/dinos/bog_spino.webp', requiredCapabilities: [DINO_CATALOG_CAPABILITY] });
    const after = projectedProduct(current, change);
    expect(verifyDeliverable(after)).toBeNull();
    expect(computeChange(row, after, ctx).kind).toBe('noop');
  });

  it('keeps legacy price/payload, only adds the aquatic note, and is idempotent', () => {
    const plan = buildPlan({ products: fixture(), wiki: [] });
    const row = plan.rows.find((candidate) => candidate.name === 'Megalodon (Lv.380)')!;
    const current = toDb(fixture().find((product) => product.name === 'Megalodon (Lv.380)')!);
    const change = computeChange(row, current, { ...ctx, artwork: null });
    expect(Object.keys(change.data)).toEqual(['description']);
    expect(computeChange(row, projectedProduct(current, change), { ...ctx, artwork: null }).kind).toBe('noop');
  });

  it('records the review decision on rejected drafts once', () => {
    const draft = draftProduct('Alpha T-Rex', '/Game/PrimalEarth/Dinos/Rex/MegaRex_Character_BP');
    const plan = buildPlan({ products: [...fixture(), draft], wiki: [] });
    const row = plan.rows.find((candidate) => candidate.externalKey === draft.externalKey)!;
    const current = toDb(draft);
    const change = computeChange(row, current, ctx);
    expect(change.data.deliveryPayload.review).toMatchObject({ status: 'not_sellable', code: 'alpha' });
    expect(change.data).not.toHaveProperty('isActive');
    expect(computeChange(row, projectedProduct(current, change), { ...ctx, reviewedAt: 'later' }).kind).toBe('noop');
  });

  it('refuses to touch a non-dino product', () => {
    const plan = buildPlan({ products: fixture(), wiki: [] });
    const row = plan.rows[0];
    expect(() => computeChange(row, { ...toDb(fixture()[0]), productType: 'item' }, ctx)).toThrow(/non-dino/);
  });

  it('reads the artwork manifest written by fetch-artwork.mjs', () => {
    const index = parseArtworkManifest({ entries: { '/game/primalearth/dinos/rex/rex_character_bp.rex_character_bp': { imageUrl: '/a.webp', name: 'Rex' } } });
    expect(lookupArtwork(index, { externalKey: 'arkshop:rex1', blueprint: bp(REX) })).toBe('/a.webp');
  });
});
