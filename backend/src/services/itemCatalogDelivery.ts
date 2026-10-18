/**
 * Item delivery: turns an item product into the `order` delivery job payload that
 * HeartShop.cpp's order branch consumes (GiveItemToPlayer per entry).
 *
 * Shared by the web checkout (checkout.controller) and the in-game quote/confirm
 * flow (game-shop.controller) so both build the same payload, and by the item
 * catalog tooling (scripts/item-catalog) and its unit tests so every product the
 * catalog activates is validated by this exact code.
 *
 * Product shape (ArkShop import and item catalog):
 *   deliveryPayload.definition.Items = [{ Blueprint, Amount, Quality, ForceBlueprint }]
 *   (one entry: capability delivery.item.v1; several: delivery.item.bundle.v1).
 * Without definition.Items the legacy single-item projection
 * (itemBlueprint, quantity, quality, isBlueprint) is used.
 *
 * Plugin contract (HeartShop.cpp, DeliveryType == "order"):
 *   payload.items (array) or payload.item (object); every entry needs a non-empty
 *   string blueprint and an integer quantity >= 1; quality (number, default 0) and
 *   isBlueprint (bool, default false) are passed to UPrimalItem::AddNewItem.
 *   Optional armor / durability / damage (integers 1..65535, ArkShop "Armor",
 *   "Durability", "Damage") are only emitted for a server that advertises
 *   ITEM_STATS_CAPABILITY; the plugin applies them to non-stackable items. Absent
 *   keys = no override, so the legacy payload is byte-identical.
 *
 * Pure module: no Prisma, no Express.
 */

export const ITEM_DELIVERY_CAPABILITY = 'delivery.item.v1';
export const ITEM_BUNDLE_DELIVERY_CAPABILITY = 'delivery.item.bundle.v1';
export const ITEM_DELIVERY_TYPE = 'order';
/** Plugin capability: per-line armor/durability/damage overrides are applied. */
export const ITEM_STATS_CAPABILITY = 'delivery.item.stats.v1';
export const ITEM_STAT_MAX = 65_535;

export type ItemDeliveryLine = {
  blueprint: string;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  armor?: number;
  durability?: number;
  damage?: number;
};

type ItemStatOverrides = Pick<ItemDeliveryLine, 'armor' | 'durability' | 'damage'>;

/** True when the target server's plugin applies item stat overrides. */
export function serverSupportsItemStats(serverCapabilities: readonly string[] | null | undefined): boolean {
  return Array.isArray(serverCapabilities) && serverCapabilities.includes(ITEM_STATS_CAPABILITY);
}

/** ArkShop Armor/Durability/Damage -> emitted only when a positive integer <= 65535. */
function statOverrides(item: any): ItemStatOverrides {
  const out: ItemStatOverrides = {};
  for (const [source, key] of [['Armor', 'armor'], ['Durability', 'durability'], ['Damage', 'damage']] as const) {
    const value = Number(item?.[source] ?? 0);
    if (Number.isSafeInteger(value) && value > 0 && value <= ITEM_STAT_MAX) out[key] = value;
  }
  return out;
}

export type ItemDeliveryPayload = {
  schemaVersion: 1;
  orderId: string;
  productType: 'item';
  productName: string;
  item: ItemDeliveryLine;
  items: ItemDeliveryLine[];
};

export type ItemDeliveryProduct = {
  name: string;
  itemBlueprint: string | null;
  deliveryPayload?: any;
  /** Units delivered per purchase for the legacy single-item projection (products.quantity). */
  quantity: number;
  quality: number;
  isBlueprint: boolean;
};

const cleanBlueprint = (value: unknown) => String(value ?? '').replace(/^"+|"+$/g, '').trim();

/**
 * Build the delivery for an item product bought `purchasedQuantity` times.
 * Definition entries with an empty blueprint or a non-integer total quantity are
 * dropped; when none remain the single-item projection is used.
 *
 * `serverCapabilities` is the capability manifest of the server the job is queued
 * for; stat overrides are only included when it has ITEM_STATS_CAPABILITY.
 */
export function resolveItemDelivery(
  product: ItemDeliveryProduct,
  orderId: string,
  purchasedQuantity: number,
  serverCapabilities: readonly string[] | null | undefined = [],
): { deliveryType: typeof ITEM_DELIVERY_TYPE; payload: ItemDeliveryPayload } {
  const withStats = serverSupportsItemStats(serverCapabilities);
  const configuredItems: ItemDeliveryLine[] = Array.isArray(product.deliveryPayload?.definition?.Items)
    ? product.deliveryPayload.definition.Items
      .map((item: any) => ({
        blueprint: cleanBlueprint(item?.Blueprint),
        quantity: Math.max(1, Number(item?.Amount ?? 1)) * purchasedQuantity,
        quality: Math.max(0, Number(item?.Quality ?? 0)),
        isBlueprint: Boolean(item?.ForceBlueprint),
        ...(withStats ? statOverrides(item) : {}),
      }))
      .filter((item: ItemDeliveryLine) => item.blueprint && Number.isSafeInteger(item.quantity))
    : [];
  const items: ItemDeliveryLine[] = configuredItems.length > 0
    ? configuredItems
    : [{
        blueprint: product.itemBlueprint as string,
        quantity: product.quantity * purchasedQuantity,
        quality: product.quality,
        isBlueprint: product.isBlueprint,
      }];
  return {
    deliveryType: ITEM_DELIVERY_TYPE,
    payload: {
      schemaVersion: 1,
      orderId,
      productType: 'item',
      productName: product.name,
      item: items[0],
      items,
    },
  };
}

/**
 * Mirror of the guards in HeartShop.cpp's "order" delivery branch. Returns null when
 * the plugin would attempt every entry, otherwise the reason it would fail the job.
 * (Whether ARK can load the blueprint class is only known in game.)
 */
export function pluginRejectsItemPayload(payload: unknown): string | null {
  const record = payload as Record<string, any> | null;
  if (!record || typeof record !== 'object') return 'payload is not an object';
  let entries: unknown[] = [];
  if (Array.isArray(record.items)) entries = record.items;
  else if (record.item && typeof record.item === 'object' && !Array.isArray(record.item)) entries = [record.item];
  if (entries.length === 0) return 'payload has no items';
  for (const [index, entry] of entries.entries()) {
    const item = entry as Record<string, unknown> | null;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `items[${index}] is not an object`;
    // nlohmann::json::value() throws on a type mismatch, which fails the delivery.
    if (typeof item.blueprint !== 'string' || item.blueprint.length === 0) return `items[${index}].blueprint must be a non-empty string`;
    if (!Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 2_147_483_647) {
      return `items[${index}].quantity must be an integer >= 1`;
    }
    if (item.quality !== undefined && (typeof item.quality !== 'number' || !Number.isFinite(item.quality))) return `items[${index}].quality must be a number`;
    if (item.isBlueprint !== undefined && typeof item.isBlueprint !== 'boolean') return `items[${index}].isBlueprint must be boolean`;
    for (const key of ['armor', 'durability', 'damage'] as const) {
      const value = item[key];
      if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > ITEM_STAT_MAX)) {
        return `items[${index}].${key} must be an integer 0..${ITEM_STAT_MAX}`;
      }
    }
  }
  return null;
}
