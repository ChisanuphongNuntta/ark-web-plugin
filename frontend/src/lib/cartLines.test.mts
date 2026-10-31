// Unit tests for the pure cart-line helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/lib/cartLines.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mergeCartLines, migrateCartState } = await import(new URL('./cartLines.ts', import.meta.url).href);

test('mergeCartLines sums quantities of the same product', () => {
  assert.deepEqual(
    mergeCartLines([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }, { productId: 1, quantity: 3 }]),
    [{ productId: 1, quantity: 5 }, { productId: 2, quantity: 1 }],
  );
});

test('mergeCartLines drops zero, negative, fractional-to-zero and non-numeric lines', () => {
  assert.deepEqual(
    mergeCartLines([
      { productId: 1, quantity: 0 },
      { productId: 2, quantity: -3 },
      { productId: 3, quantity: 0.4 },
      { productId: Number.NaN, quantity: 2 },
      { productId: 4, quantity: Number.NaN },
      { productId: 5, quantity: 2.9 },
    ]),
    [{ productId: 5, quantity: 2 }],
  );
});

test('v2 cart: same product on two servers merges, basket server is the last line', () => {
  const out = migrateCartState(
    { items: [{ productId: 1, serverId: 7, quantity: 1 }, { productId: 2, serverId: 7, quantity: 2 }, { productId: 1, serverId: 9, quantity: 3 }] },
    2,
  );
  assert.deepEqual(out, { items: [{ productId: 1, quantity: 4 }, { productId: 2, quantity: 2 }], serverId: 9, deliveryMode: 'server' });
});

test('v2 cart with a single server keeps it', () => {
  assert.deepEqual(
    migrateCartState({ items: [{ productId: 1, serverId: 1, quantity: 2 }] }, 2),
    { items: [{ productId: 1, quantity: 2 }], serverId: 1, deliveryMode: 'server' },
  );
});

test('v1 cart uses its global serverId and ignores per-line values', () => {
  assert.deepEqual(
    migrateCartState({ items: [{ productId: 3, quantity: 1 }], serverId: 4 }, 1),
    { items: [{ productId: 3, quantity: 1 }], serverId: 4, deliveryMode: 'server' },
  );
});

test('empty, missing or malformed persisted state becomes an empty basket', () => {
  assert.deepEqual(migrateCartState(undefined, 2), { items: [], serverId: null, deliveryMode: 'auto' });
  assert.deepEqual(migrateCartState(null, 1), { items: [], serverId: null, deliveryMode: 'auto' });
  assert.deepEqual(migrateCartState('nope', 2), { items: [], serverId: null, deliveryMode: 'auto' });
  assert.deepEqual(migrateCartState({ items: 'bad' }, 2), { items: [], serverId: null, deliveryMode: 'auto' });
  assert.deepEqual(migrateCartState({}, 2), { items: [], serverId: null, deliveryMode: 'auto' });
});

test('v2 lines without a server leave the basket server unset', () => {
  assert.deepEqual(
    migrateCartState({ items: [{ productId: 1, quantity: 1 }] }, 2),
    { items: [{ productId: 1, quantity: 1 }], serverId: null, deliveryMode: 'auto' },
  );
});

test('v3 basket without a mode: a chosen server keeps server mode, no server means automatic', () => {
  assert.deepEqual(
    migrateCartState({ items: [{ productId: 1, quantity: 1 }], serverId: 5 }, 3),
    { items: [{ productId: 1, quantity: 1 }], serverId: 5, deliveryMode: 'server' },
  );
  assert.deepEqual(
    migrateCartState({ items: [{ productId: 1, quantity: 1 }], serverId: null }, 3),
    { items: [{ productId: 1, quantity: 1 }], serverId: null, deliveryMode: 'auto' },
  );
});

test('a saved delivery mode wins over the guess, and unknown values are ignored', () => {
  assert.equal(migrateCartState({ items: [], serverId: 5, deliveryMode: 'auto' }, 4).deliveryMode, 'auto');
  assert.equal(migrateCartState({ items: [], serverId: null, deliveryMode: 'server' }, 4).deliveryMode, 'server');
  assert.equal(migrateCartState({ items: [], serverId: null, deliveryMode: 'weird' }, 4).deliveryMode, 'auto');
});
