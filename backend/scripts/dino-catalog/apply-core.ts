/**
 * Pure change computation for apply-plan.ts (no Prisma import, unit tested).
 *
 * Given a plan row and the CURRENT database row it targets, returns the minimal
 * set of field changes. An empty change set means "already applied", which is
 * what makes apply-plan.ts idempotent.
 */
import {
  DINO_CATALOG_CAPABILITY,
  buildDinoDeliveryPayload,
  lookupArtworkMatch,
  simulateBackendDinoDelivery,
  type ArtworkIndex,
  type ArtworkMatch,
} from './lib.js';
import type { PlanAction, PlanRow } from './plan.js';

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
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  categoryId: number | null;
  /** Snapshot timestamp used by apply-plan.ts as an optimistic concurrency guard. */
  updatedAt?: Date | string;
};

export type ProductWrite = Partial<Pick<DbProduct,
  'name' | 'description' | 'price' | 'deliveryPayload' | 'requiredCapabilities' | 'itemBlueprint' | 'imageUrl' | 'isActive' | 'sortOrder' | 'categoryId'
>> & { productType?: 'dino'; externalKey?: string; quantity?: number; quality?: number; isBlueprint?: boolean };

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
};

const SELLABLE_ACTIONS = new Set<PlanAction>(['keep', 'activate', 'create']);

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Full product state a sellable new/activated row must end up in. */
export function targetSellableState(row: PlanRow, ctx: ApplyContext): ProductWrite {
  if (row.level == null || row.price == null || !row.categoryName) throw new Error(`${row.externalKey}: sellable row without level/price/category`);
  const categoryId = ctx.categoryIds[row.categoryName];
  if (!categoryId) throw new Error(`${row.externalKey}: category "${row.categoryName}" does not exist`);
  const deliveryPayload = buildDinoDeliveryPayload({
    externalKey: row.externalKey,
    blueprint: row.blueprint,
    spawnLevel: row.level,
    price: row.price,
    name: row.name,
    priceBasis: row.priceBasis,
    levelBasis: row.levelBasis,
    wikiPage: row.wikiPage,
    plannedAt: ctx.planGeneratedAt,
  });
  return {
    name: row.name,
    description: row.description,
    price: row.price,
    categoryId,
    itemBlueprint: deliveryPayload.spawn.blueprint,
    requiredCapabilities: [DINO_CATALOG_CAPABILITY],
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
 * Image for a sellable row (undefined = leave imageUrl as it is).
 *  - activate/create rows take the manifest image whenever there is one;
 *  - keep rows (legacy, already on sale) only get it when they have no image, or when
 *    the manifest entry was fetched for that product id (fetch-artwork.mjs lists the
 *    legacy rows whose image was a placeholder shared by several creatures). A legacy
 *    row's own image is never replaced by a blueprint-level match.
 */
export function chooseImage(row: PlanRow, current: DbProduct | null, artwork: ArtworkMatch | null, notes: string[]): string | undefined {
  if (!artwork) return undefined;
  const currentUrl = current?.imageUrl ?? null;
  if (currentUrl === artwork.imageUrl) return undefined;
  if (row.action !== 'keep' || !currentUrl) return artwork.imageUrl;
  if (current && artwork.productIds?.includes(current.id)) return artwork.imageUrl;
  notes.push(`kept existing image ${currentUrl}; manifest image ${artwork.imageUrl} is not targeted at product ${current?.id}`);
  return undefined;
}

/**
 * Compute the change for one plan row. `current` is the DB row (by productId, or by
 * externalKey for create rows) or null when it does not exist yet.
 */
export function computeChange(row: PlanRow, current: DbProduct | null, ctx: ApplyContext): Change {
  const base = { externalKey: row.externalKey, action: row.action, notes: [] as string[] };
  const artwork = ctx.artwork ? lookupArtworkMatch(ctx.artwork, { externalKey: row.externalKey, blueprint: row.blueprint }) : null;

  if (current) {
    if (current.productType !== 'dino') throw new Error(`${row.externalKey}: product ${current.id} is ${current.productType}, refusing to touch a non-dino product`);
    if (current.externalKey !== row.externalKey) throw new Error(`${row.externalKey}: product ${current.id} has externalKey ${current.externalKey}`);
  } else if (row.action !== 'create') {
    return { ...base, kind: 'skip', productId: row.productId, data: {}, before: {}, after: {}, notes: [`product ${row.productId} not found; skipped`] };
  }

  let target: ProductWrite = {};
  switch (row.action) {
    case 'keep': {
      // Legacy/existing sellable rows: never touch price, level, name, category or payload.
      if (row.description && row.description !== current!.description) target.description = row.description;
      if (row.source !== 'legacy') target = { ...targetSellableState(row, ctx), isActive: current!.isActive };
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

  const imageUrl = SELLABLE_ACTIONS.has(row.action) ? chooseImage(row, current, artwork, base.notes) : undefined;
  if (imageUrl !== undefined) target.imageUrl = imageUrl;

  if (!current) {
    const data: ProductWrite = {
      ...target,
      productType: 'dino',
      externalKey: row.externalKey,
      quantity: 1,
      quality: 0,
      isBlueprint: false,
      imageUrl: target.imageUrl ?? null,
    };
    return { ...base, kind: 'create', productId: null, data, before: {}, after: { ...data } };
  }

  const { data, before, after } = diff(current, target);
  // A refreshed review timestamp alone is not a change.
  return { ...base, kind: Object.keys(data).length > 0 ? 'update' : 'noop', productId: current.id, data, before, after };
}

/** The product as it will look after the change (for delivery verification). */
export function projectedProduct(current: DbProduct | null, change: Change): DbProduct {
  const merged = { ...(current ?? {}), ...change.data } as any;
  return {
    id: current?.id ?? -1,
    name: merged.name,
    description: merged.description ?? null,
    price: merged.price,
    productType: 'dino',
    externalKey: merged.externalKey ?? change.externalKey,
    deliveryPayload: merged.deliveryPayload,
    requiredCapabilities: merged.requiredCapabilities ?? [],
    itemBlueprint: merged.itemBlueprint ?? null,
    imageUrl: merged.imageUrl ?? null,
    isActive: Boolean(merged.isActive),
    sortOrder: merged.sortOrder ?? 0,
    categoryId: merged.categoryId ?? null,
  };
}

/** Every product that will be active after apply must pass the backend dino delivery builder. */
export function verifyDeliverable(product: DbProduct): string | null {
  if (!product.isActive) return null;
  const result = simulateBackendDinoDelivery(product);
  return result.ok ? null : result.error;
}
