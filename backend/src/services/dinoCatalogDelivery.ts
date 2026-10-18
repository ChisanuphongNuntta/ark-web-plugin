/**
 * Catalog dino delivery: turns a dino product into the `dino_catalog` delivery
 * job payload that HeartShop.cpp's DeliverCatalogDinoForPlayer consumes.
 *
 * Shared by the web checkout (checkout.controller) and the in-game quote/confirm
 * flow (game-shop.controller) so both build byte-identical payloads, and by the
 * dino catalog tooling (scripts/dino-catalog) and its unit tests so every product
 * the catalog activates is validated by this exact code.
 *
 * Plugin contract (ark-plugin CatalogDino::ParseRequest, used by HeartShop.cpp DeliverCatalogDinoForPlayer):
 *   schemaVersion == 1, productType == "dino", dino is an object with
 *   blueprint (non-empty), level 1..10000, forceTame == true, neutered (bool),
 *   optional cryopod (bool).
 * The plugin passes the blueprint string verbatim to ArkApi SpawnDino. When
 * dino.cryopod === true the plugin stores the spawned tame in a cryopod in the
 * buyer's inventory instead of leaving it next to the buyer. The flag is only set
 * for a target server that advertises DINO_CRYOPOD_CAPABILITY, so older plugins
 * (which ignore unknown keys) keep receiving the exact legacy payload. The plugin
 * advertises the capability only after the cryopod item class loads on that
 * server; a full buyer inventory releases the lease (no attempt consumed) instead
 * of failing, and a missing cryopod class falls back to the live spawn.
 *
 * Pure module: no Prisma, no Express.
 */

/** Plugin capability a server must advertise before catalog dinos are offered/delivered. */
export const DINO_CATALOG_CAPABILITY = 'delivery.dino.catalog.v1';
export const DINO_CATALOG_DELIVERY_TYPE = 'dino_catalog';
/** Plugin capability: catalog dinos can be delivered inside a cryopod (dino.cryopod). */
export const DINO_CRYOPOD_CAPABILITY = 'delivery.dino.cryopod.v1';
export const DINO_LEVEL_MIN = 1;
export const DINO_LEVEL_MAX = 10_000;

export type DinoCatalogDeliveryPayload = {
  schemaVersion: 1;
  orderId: string;
  productType: 'dino';
  productName: string;
  dino: { blueprint: string; level: number; forceTame: true; neutered: boolean; cryopod?: true };
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
 *
 * `serverCapabilities` is the capability manifest of the server the job is queued
 * for; when it includes DINO_CRYOPOD_CAPABILITY the payload asks for cryopod
 * delivery, otherwise the key is omitted entirely (byte-identical legacy payload).
 */
export function resolveDinoCatalogDelivery(
  product: DinoCatalogProduct,
  orderId: string,
  serverCapabilities: readonly string[] | null | undefined = [],
): DinoCatalogDeliveryResult {
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
        ...(serverSupportsDinoCryopod(serverCapabilities) ? { cryopod: true as const } : {}),
      },
    },
  };
}

/** True when the target server's plugin can deliver catalog dinos in a cryopod. */
export function serverSupportsDinoCryopod(serverCapabilities: readonly string[] | null | undefined): boolean {
  return Array.isArray(serverCapabilities) && serverCapabilities.includes(DINO_CRYOPOD_CAPABILITY);
}

/**
 * Mirror of the guards in ark-plugin CatalogDino::ParseRequest. Returns null
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
  if (dino.cryopod !== undefined && typeof dino.cryopod !== 'boolean') return 'dino.cryopod must be boolean';
  return null;
}
