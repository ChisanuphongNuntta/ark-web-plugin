/** Pure cart-line helpers (no app imports, so they can be unit-tested with plain Node). */

export interface CartLine {
  productId: number;
  quantity: number;
}

/** Merge lines of the same product by summing quantity; drops invalid lines. */
export function mergeCartLines(lines: Array<{ productId: number; quantity: number }>): CartLine[] {
  const merged = new Map<number, number>();
  for (const line of lines) {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(line.productId) || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + quantity);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Upgrade a persisted cart to the current shape (v3: one delivery server per basket).
 * v2 lines carried a serverId each: duplicates of a product are merged (quantities summed) and the server of the most
 * recently added line becomes the basket server. v1 had one global serverId and product-only lines, which already fits.
 */
export function migrateCartState(persisted: unknown, version: number): { items: CartLine[]; serverId: number | null } {
  if (!persisted || typeof persisted !== 'object') return { items: [], serverId: null };
  const old = persisted as {
    items?: Array<{ productId: number; serverId?: number; quantity: number }>;
    serverId?: number | null;
  };
  const lines = Array.isArray(old.items) ? old.items : [];
  let serverId: number | null = typeof old.serverId === 'number' ? old.serverId : null;
  if (version >= 2) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (typeof lines[i]?.serverId === 'number') { serverId = lines[i].serverId as number; break; }
    }
  }
  return { items: mergeCartLines(lines), serverId };
}
