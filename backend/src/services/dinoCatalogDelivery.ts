/**
 * Catalog dino delivery: turns a dino product into the `dino_catalog` delivery
 * job payload that HeartShop.cpp's SpawnCatalogDinoForPlayer consumes.
 *
 * Shared by the web checkout (checkout.controller) and the in-game quote/confirm
 * flow (game-shop.controller) so both build byte-identical payloads, and by the
 * dino catalog tooling (scripts/dino-catalog) and its unit tests so every product
 * the catalog activates is validated by this exact code.
 *
 * Plugin contract (HeartShop.cpp SpawnCatalogDinoForPlayer):
 *   schemaVersion == 1, productType == "dino", dino is an object with
 *   blueprint (non-empty), level 1..10000, forceTame == true, neutered (bool).
 * The plugin passes the blueprint string verbatim to ArkApi SpawnDino.
 *
 * Pure module: no Prisma, no Express.
 */

/** Plugin capability a server must advertise before catalog dinos are offered/delivered. */
export const DINO_CATALOG_CAPABILITY = 'delivery.dino.catalog.v1';
export const DINO_CATALOG_DELIVERY_TYPE = 'dino_catalog';
export const DINO_LEVEL_MIN = 1;
export const DINO_LEVEL_MAX = 10_000;

export type DinoCatalogDeliveryPayload = {
  schemaVersion: 1;
  orderId: string;
  productType: 'dino';
  productName: string;
  dino: { blueprint: string; level: number; forceTame: true; neutered: boolean };
};

export type DinoCatalogProduct = {
  name: string;
  itemBlueprint: string | null;
  deliveryPayload?: any;
};

export type DinoCatalogDeliveryResult =
  | { ok: true; deliveryType: typeof DINO_CATALOG_DELIVERY_TYPE; payload: DinoCatalogDeliveryPayload }
  | { ok: false; reason: 'level' | 'blueprint' };

const cleanBlueprint = (value: unknown) => String(value ?? '').replace(/^"+|"+$/g, '').trim();

/**
 * Build the delivery for a dino product. The spawn definition comes from
 * deliveryPayload.spawn (catalog/legacy rows) or deliveryPayload.definition
 * (ArkShop import), and its blueprint must equal the product's itemBlueprint.
 */
export function resolveDinoCatalogDelivery(product: DinoCatalogProduct, orderId: string): DinoCatalogDeliveryResult {
  const configured = product.deliveryPayload?.spawn ?? product.deliveryPayload?.definition ?? {};
  const level = Number(configured.level ?? configured.Level ?? 1);
  if (!Number.isSafeInteger(level) || level < DINO_LEVEL_MIN || level > DINO_LEVEL_MAX) {
    return { ok: false, reason: 'level' };
  }
  const blueprint = cleanBlueprint(configured.blueprint ?? configured.Blueprint ?? product.itemBlueprint);
  if (!blueprint || blueprint !== product.itemBlueprint) {
    return { ok: false, reason: 'blueprint' };
  }
  return {
    ok: true,
    deliveryType: DINO_CATALOG_DELIVERY_TYPE,
    payload: {
      schemaVersion: 1,
      orderId,
      productType: 'dino',
      productName: product.name,
      dino: {
        blueprint,
        level,
        forceTame: true,
        neutered: Boolean(configured.neutered ?? configured.Neutered),
      },
    },
  };
}

/**
 * Mirror of the guards in HeartShop.cpp SpawnCatalogDinoForPlayer. Returns null
 * when the plugin would accept the payload, otherwise the reason it would reject it.
 */
export function pluginRejectsDinoPayload(payload: unknown): string | null {
  const record = payload as Record<string, any> | null;
  if (!record || typeof record !== 'object') return 'payload is not an object';
  if (record.schemaVersion !== 1) return 'schemaVersion must be 1';
  if (record.productType !== 'dino') return 'productType must be "dino"';
  const dino = record.dino;
  if (!dino || typeof dino !== 'object' || Array.isArray(dino)) return 'dino must be an object';
  if (typeof dino.blueprint !== 'string' || dino.blueprint.length === 0) return 'dino.blueprint must be a non-empty string';
  if (!Number.isInteger(dino.level) || dino.level < DINO_LEVEL_MIN || dino.level > DINO_LEVEL_MAX) return 'dino.level outside 1..10000';
  if (dino.forceTame !== true) return 'dino.forceTame must be true';
  if (dino.neutered !== undefined && typeof dino.neutered !== 'boolean') return 'dino.neutered must be boolean';
  return null;
}
