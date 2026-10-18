/**
 * Pure change computation for apply-plan.ts (no Prisma import, unit tested).
 *
 * Given a plan row and the CURRENT database row it targets, returns the minimal
 * set of field changes. An empty change set means "already applied", which is
 * what makes apply-plan.ts idempotent.
 */
import {
  ITEM_CATALOG_SOURCE,
  ITEM_DELIVERY_CAPABILITY,
  buildItemDeliveryPayload,
  canonicalBlueprint,
  lookupItemArtworkMatch,
  packageKey,
  productFingerprint,
  qualityColumn,
  simulateBackendItemDelivery,
  type ArtworkIndex,
  type ArtworkMatch,
} from './lib.js';
import { SEED_KEY_PREFIX, type PlanAction, type PlanRow } from './plan.js';

export type DbProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  productType: string;
  externalKey: string | null;
  deliveryPayload: any;
  requiredCapabilities: string[];
  itemBlueprint: string | null;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  categoryId: number | null;
  /** Snapshot timestamp used by apply-plan.ts as an optimistic concurrency guard. */
  updatedAt?: Date | string;
};

export type ProductWrite = Partial<Pick<DbProduct,
  'name' | 'description' | 'price' | 'deliveryPayload' | 'requiredCapabilities' | 'itemBlueprint' | 'quantity' | 'quality'
  | 'isBlueprint' | 'imageUrl' | 'isActive' | 'sortOrder' | 'categoryId'
>> & { productType?: 'item'; externalKey?: string };

export type Change = {
  externalKey: string;
  action: PlanAction;
  kind: 'update' | 'create' | 'noop' | 'skip';
  productId: number | null;
  data: ProductWrite;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  notes: string[];
};

export type ApplyContext = {
  planGeneratedAt: string;
  categoryIds: Record<string, number>;
  artwork: ArtworkIndex | null;
  reviewedAt: string;
  /**
   * Legacy placeholder images (sharedLegacyPlaceholders): the only existing legacy images the
   * manifest may replace. Absent = a legacy row's existing image is never replaced.
   */
  placeholderImages?: ReadonlySet<string>;
};

const SELLABLE_ACTIONS = new Set<PlanAction>(['keep', 'activate', 'create']);
/** Rows whose price/quantity/quality/payload belong to the owner and are never rewritten. */
const isOwnerRow = (row: PlanRow) => row.source === 'legacy' || row.source === 'seed';

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Full product state a sellable new/activated row must end up in. */
export function targetSellableState(row: PlanRow, ctx: ApplyContext): ProductWrite {
  if (row.quantity == null || row.price == null || !row.categoryName) throw new Error(`${row.externalKey}: sellable row without quantity/price/category`);
  const categoryId = ctx.categoryIds[row.categoryName];
  if (!categoryId) throw new Error(`${row.externalKey}: category "${row.categoryName}" does not exist`);
  const quality = row.quality ?? 0;
  const deliveryPayload = buildItemDeliveryPayload({
    externalKey: row.externalKey,
    blueprint: row.blueprint,
    quantity: row.quantity,
    quality,
    price: row.price,
    name: row.name,
    priceBasis: row.priceBasis,
    quantityBasis: row.quantityBasis,
    qualityBasis: row.qualityBasis,
    wikiPage: row.wikiPage,
    plannedAt: ctx.planGeneratedAt,
  });
  return {
    name: row.name,
    description: row.description,
    price: row.price,
    categoryId,
    itemBlueprint: deliveryPayload.definition.Items[0].Blueprint,
    quantity: row.quantity,
    quality: qualityColumn(quality),
    isBlueprint: false,
    requiredCapabilities: [ITEM_DELIVERY_CAPABILITY],
    deliveryPayload,
    isActive: true,
    sortOrder: row.sortOrder ?? 0,
  };
}

function diff(current: DbProduct, target: ProductWrite): { data: ProductWrite; before: Record<string, unknown>; after: Record<string, unknown> } {
  const data: ProductWrite = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target) as Array<[keyof ProductWrite, unknown]>) {
    const existing = (current as any)[key];
    if (sameJson(existing ?? null, value ?? null)) continue;
    (data as any)[key] = value;
    before[key] = existing ?? null;
    after[key] = value;
  }
  return { data, before, after };
}

/**
 * Owner-row images that are placeholders: one image URL used by two or more active owner
 * (legacy arkshop:* / seed) item products that deliver DIFFERENT blueprints (e.g. one seed
 * picture on Plant Species R-4, R-5 and Y). An image shared with a draft, or by rows that
 * deliver the same item, is the owner's picture and is never treated as a placeholder.
 */
export function sharedLegacyPlaceholders(products: DbProduct[]): Set<string> {
  const blueprintsByUrl = new Map<string, Set<string>>();
  for (const product of products) {
    const owner = product.externalKey === null || product.externalKey.startsWith('arkshop:');
    if (!owner || !product.isActive || !product.imageUrl) continue;
    const set = blueprintsByUrl.get(product.imageUrl) ?? new Set<string>();
    set.add(product.itemBlueprint ? packageKey(product.itemBlueprint) : `#${product.id}`);
    blueprintsByUrl.set(product.imageUrl, set);
  }
  return new Set([...blueprintsByUrl].filter(([, blueprints]) => blueprints.size >= 2).map(([url]) => url));
}

/**
 * Image for a sellable row (undefined = leave imageUrl as it is).
 *  - activate/create rows take the manifest image whenever there is one;
 *  - keep rows (legacy/seed, already on sale) get it when they have no image; an existing
 *    image is only replaced when it is a placeholder shared by different items
 *    (`placeholders`, see sharedLegacyPlaceholders) AND the manifest entry was fetched for
 *    that product id. A legacy row's own image is never replaced by a blueprint-level match.
 */
export function chooseImage(
  row: PlanRow,
  current: DbProduct | null,
  artwork: ArtworkMatch | null,
  notes: string[],
  placeholders?: ReadonlySet<string>,
): string | undefined {
  if (!artwork) return undefined;
  const currentUrl = current?.imageUrl ?? null;
  if (currentUrl === artwork.imageUrl) return undefined;
  if (row.action !== 'keep' || !currentUrl) return artwork.imageUrl;
  const targeted = Boolean(current && artwork.productIds?.includes(current.id));
  if (targeted && placeholders?.has(currentUrl)) return artwork.imageUrl;
  notes.push(targeted
    ? `kept existing image ${currentUrl}; manifest image ${artwork.imageUrl} targets product ${current?.id} but the current image is not a shared placeholder`
    : `kept existing image ${currentUrl}; manifest image ${artwork.imageUrl} is not targeted at product ${current?.id}`);
  return undefined;
}

export const OWNER_DEACTIVATED_NOTE = 'owner-deactivated';
export const IMAGE_HELD_NOTE = 'image held for owner review';

/**
 * A row this catalog already activated or created (its payload is an iris-item-catalog payload)
 * that is inactive now was switched off by the owner after an apply: a re-run must not turn it
 * back on (activate / create / catalog keep rows are skipped and reported instead).
 */
export function isOwnerDeactivated(row: PlanRow, current: DbProduct): boolean {
  if (current.isActive || isOwnerRow(row) || !SELLABLE_ACTIONS.has(row.action)) return false;
  return current.deliveryPayload?.source === ITEM_CATALOG_SOURCE;
}

/** True when `current` is the product the plan row means. */
export function matchesRow(row: PlanRow, current: DbProduct): boolean {
  if (row.externalKey.startsWith(SEED_KEY_PREFIX)) return current.externalKey === null && current.id === row.productId;
  return current.externalKey === row.externalKey;
}

/**
 * Compute the change for one plan row. `current` is the DB row (by productId, or by
 * externalKey for create rows) or null when it does not exist yet.
 */
export function computeChange(row: PlanRow, current: DbProduct | null, ctx: ApplyContext): Change {
  const base = { externalKey: row.externalKey, action: row.action, notes: [] as string[] };
  const artwork = ctx.artwork
    ? lookupItemArtworkMatch(ctx.artwork, { externalKey: row.externalKey, blueprint: row.blueprint, productId: current?.id ?? row.productId })
    : null;

  if (current) {
    if (current.productType !== 'item') throw new Error(`${row.externalKey}: product ${current.id} is ${current.productType}, refusing to touch a non-item product`);
    if (!matchesRow(row, current)) throw new Error(`${row.externalKey}: product ${current.id} has externalKey ${current.externalKey}`);
  } else if (row.action !== 'create') {
    return { ...base, kind: 'skip', productId: row.productId, data: {}, before: {}, after: {}, notes: [`product ${row.productId} not found; skipped`] };
  }
  if (current && isOwnerDeactivated(row, current)) {
    return {
      ...base, kind: 'skip', productId: current.id, data: {}, before: {}, after: {},
      notes: [`${OWNER_DEACTIVATED_NOTE}: the catalog already put this row on sale and it is inactive now; not re-activated`],
    };
  }

  let target: ProductWrite = {};
  switch (row.action) {
    case 'keep': {
      if (isOwnerRow(row)) {
        // Legacy/seed rows: never touch price, quantity, quality, name, category or payload.
        // Only a missing description is filled.
        if (row.description && !current!.description?.trim()) target.description = row.description;
      } else {
        target = { ...targetSellableState(row, ctx), isActive: current!.isActive };
      }
      if (!current!.isActive) base.notes.push('row is inactive in the database; keep leaves it inactive');
      break;
    }
    case 'activate':
    case 'create':
      target = targetSellableState(row, ctx);
      break;
    case 'deactivate':
      target = { isActive: false };
      break;
    case 'leave_inactive': {
      if (current!.isActive) base.notes.push(`row is ACTIVE in the database but planned as not sellable (${row.code}); left untouched, review manually`);
      if (row.source === 'draft' && !current!.isActive) {
        const payload = current!.deliveryPayload && typeof current!.deliveryPayload === 'object' ? current!.deliveryPayload : {};
        const review = payload.review ?? {};
        if (review.status !== 'not_sellable' || review.code !== row.code || review.reason !== row.reason) {
          target.deliveryPayload = {
            ...payload,
            review: { ...review, status: 'not_sellable', code: row.code, reason: row.reason, reviewedAt: ctx.reviewedAt, plan: ctx.planGeneratedAt },
          };
        }
      }
      break;
    }
    default:
      throw new Error(`unknown action ${(row as PlanRow).action}`);
  }

  // Images only for rows that are (or stay) on sale, and never for an inactive owner row or
  // an owner row whose name does not match what it delivers (row.imageHold).
  let imageUrl: string | undefined;
  if (SELLABLE_ACTIONS.has(row.action) && (row.action !== 'keep' || current?.isActive)) {
    if (row.imageHold && isOwnerRow(row)) {
      if (artwork && !current?.imageUrl) base.notes.push(`${IMAGE_HELD_NOTE}: ${row.imageHold} (manifest image ${artwork.imageUrl} not applied)`);
    } else {
      imageUrl = chooseImage(row, current, artwork, base.notes, ctx.placeholderImages);
    }
  }
  if (imageUrl !== undefined) target.imageUrl = imageUrl;

  if (!current) {
    const data: ProductWrite = {
      ...target,
      productType: 'item',
      externalKey: row.externalKey,
      imageUrl: target.imageUrl ?? null,
    };
    return { ...base, kind: 'create', productId: null, data, before: {}, after: { ...data } };
  }

  const { data, before, after } = diff(current, target);
  return { ...base, kind: Object.keys(data).length > 0 ? 'update' : 'noop', productId: current.id, data, before, after };
}

/**
 * Drift between the plan snapshot (row.current) and the live row, or null. A row already in its
 * planned state (noop, e.g. a re-run after apply) or skipped is not drift. With a fingerprint
 * (plans built since 2026-10-18) any owner edit to a writable column counts (blueprint,
 * quantity, quality, payload, description, image, ...); older plans compare price/active/name.
 */
export function driftOf(row: PlanRow, current: DbProduct | null, change: Change): string | null {
  if (!current || !row.current || change.kind === 'noop' || change.kind === 'skip') return null;
  const snapshot = row.current;
  const changed: string[] = [];
  if (current.price !== snapshot.price) changed.push(`price ${snapshot.price}->${current.price}`);
  if (current.isActive !== snapshot.isActive) changed.push(`active ${snapshot.isActive}->${current.isActive}`);
  if (current.name !== snapshot.name) changed.push(`name "${snapshot.name}"->"${current.name}"`);
  if (snapshot.fingerprint && productFingerprint(current) !== snapshot.fingerprint && changed.length === 0) {
    const when = snapshot.updatedAt && current.updatedAt ? ` (updatedAt ${snapshot.updatedAt} -> ${new Date(current.updatedAt).toISOString()})` : '';
    changed.push(`blueprint/quantity/quality/payload/description/image/category edited${when}`);
  }
  return changed.length ? `${row.externalKey} (#${current.id}): changed since plan (${changed.join(', ')})` : null;
}

/** The product as it will look after the change (for delivery verification). */
export function projectedProduct(current: DbProduct | null, change: Change): DbProduct {
  const merged = { ...(current ?? {}), ...change.data } as any;
  return {
    id: current?.id ?? -1,
    name: merged.name,
    description: merged.description ?? null,
    price: merged.price,
    productType: 'item',
    externalKey: merged.externalKey ?? (current ? current.externalKey : change.externalKey),
    deliveryPayload: merged.deliveryPayload ?? null,
    requiredCapabilities: merged.requiredCapabilities ?? [],
    itemBlueprint: merged.itemBlueprint ?? null,
    quantity: merged.quantity ?? 1,
    quality: merged.quality ?? 0,
    isBlueprint: merged.isBlueprint ?? false,
    imageUrl: merged.imageUrl ?? null,
    isActive: Boolean(merged.isActive),
    sortOrder: merged.sortOrder ?? 0,
    categoryId: merged.categoryId ?? null,
  };
}

/**
 * Every product that will be active after apply must pass the backend item delivery
 * builder. Rows the catalog writes (iris-item-catalog payloads) are checked strictly.
 */
export function verifyDeliverable(product: DbProduct): string | null {
  if (!product.isActive) return null;
  const strict = product.deliveryPayload?.source === 'iris-item-catalog';
  const result = simulateBackendItemDelivery(product, { strict });
  if (!result.ok) return result.error;
  if (strict && canonicalBlueprint(product.itemBlueprint) !== product.itemBlueprint) return 'itemBlueprint is not canonical';
  return null;
}
