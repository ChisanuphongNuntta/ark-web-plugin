// Unit tests for the pure admin-transactions helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/lib/adminTransactionsMath.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import(new URL('./adminTransactionsMath.ts', import.meta.url).href);

test('toAmountString accepts decimal strings, numbers and bigint only', () => {
  assert.equal(m.toAmountString('1500'), '1500');
  assert.equal(m.toAmountString(' -20 '), '-20');
  assert.equal(m.toAmountString(42), '42');
  assert.equal(m.toAmountString(10n ** 20n), '100000000000000000000');
  assert.equal(m.toAmountString(1e21), null);
  assert.equal(m.toAmountString('1e5'), null);
  assert.equal(m.toAmountString(''), null);
  assert.equal(m.toAmountString(null), null);
  assert.equal(m.toAmountString(Number.NaN), null);
});

test('amountSign / asDebit', () => {
  assert.equal(m.amountSign('-5'), -1);
  assert.equal(m.amountSign('0'), 0);
  assert.equal(m.amountSign('-0'), 0);
  assert.equal(m.amountSign('7'), 1);
  assert.equal(m.amountSign(undefined), 0);
  assert.equal(m.asDebit('300'), '-300');
  assert.equal(m.asDebit('-300'), '-300');
  assert.equal(m.asDebit('0'), '0');
  assert.equal(m.asDebit(null), null);
});

test('formatIc groups digits and signs without float math', () => {
  assert.equal(m.formatIc('1234567'), '1,234,567');
  assert.equal(m.formatIc('-1234567'), '-1,234,567');
  assert.equal(m.formatIc('1234567', { signed: true }), '+1,234,567');
  assert.equal(m.formatIc('-1000', { signed: true }), '−1,000');
  assert.equal(m.formatIc('0', { signed: true }), '0');
  assert.equal(m.formatIc('99999999999999999999'), '99,999,999,999,999,999,999');
  assert.equal(m.formatIc('007'), '7');
  assert.equal(m.formatIc(null), '—');
});

test('Bangkok day boundaries (UTC+7, to is exclusive)', () => {
  assert.equal(m.bangkokDayStartIso('2026-10-18'), '2026-10-17T17:00:00.000Z');
  assert.equal(m.bangkokDayEndExclusiveIso('2026-10-18'), '2026-10-18T17:00:00.000Z');
  assert.equal(m.bangkokDayStartIso('2026-02-30'), null);
  assert.equal(m.bangkokDate(new Date('2026-10-17T16:59:59.999Z')), '2026-10-17');
  assert.equal(m.bangkokDate(new Date('2026-10-17T17:00:00.000Z')), '2026-10-18');
  assert.equal(m.isIsoDate('2026-10-18'), true);
  assert.equal(m.isIsoDate('2026-13-01'), false);
  assert.equal(m.isIsoDate('18/10/2026'), false);
});

test('type labels and categories: server wins, local fallback, raw type last', () => {
  assert.equal(m.transactionTypeLabel('order_purchase'), 'ซื้อสินค้า');
  assert.equal(m.transactionTypeLabel('order_purchase', 'จากเซิร์ฟเวอร์'), 'จากเซิร์ฟเวอร์');
  assert.equal(m.transactionTypeLabel('brand_new_type'), 'brand_new_type');
  assert.equal(m.transactionTypeLabel(''), 'ไม่ระบุ');
  assert.equal(m.transactionCategory('dino_escrow_hold'), 'p2p');
  assert.equal(m.transactionCategory('brand_new_type'), 'other');
  assert.equal(m.transactionCategory('brand_new_type', 'topup'), 'topup');
  assert.equal(m.transactionCategory('order_purchase', 'nonsense'), 'purchase');
});

const ev = (over: Record<string, unknown> = {}) => ({
  id: 'txn_1',
  type: 'order_purchase',
  amount: '-500',
  user: { id: 'u1', name: 'Rex' },
  referenceType: 'order',
  referenceId: 'ord_9',
  createdAt: '2026-10-18T05:00:00.000Z', // 12:00 Bangkok
  ...over,
});
const ctx = (filters: Record<string, string> = {}, search = '') => ({ filters, search });

test('matchLiveEvent: no filters -> yes', () => {
  assert.equal(m.matchLiveEvent(ev(), ctx()), 'yes');
});

test('matchLiveEvent: type / category', () => {
  assert.equal(m.matchLiveEvent(ev(), ctx({ type: 'order_purchase' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ type: 'order_refund,order_purchase' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ type: 'order_refund' })), 'no');
  assert.equal(m.matchLiveEvent(ev(), ctx({ category: 'purchase' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ category: 'topup' })), 'no');
  assert.equal(m.matchLiveEvent(ev({ type: 'future_type' }), ctx({ category: 'topup' })), 'unknown');
});

test('matchLiveEvent: user and direction', () => {
  assert.equal(m.matchLiveEvent(ev(), ctx({ userId: 'u1' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ userId: 'u2' })), 'no');
  assert.equal(m.matchLiveEvent(ev({ user: null }), ctx({ userId: 'u1' })), 'no');
  assert.equal(m.matchLiveEvent(ev(), ctx({ direction: 'out' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ direction: 'in' })), 'no');
  assert.equal(m.matchLiveEvent(ev({ amount: null }), ctx({ direction: 'in' })), 'no');
  assert.equal(m.matchLiveEvent(ev({ amount: '0' }), ctx({ direction: 'in' })), 'unknown');
});

test('matchLiveEvent: Bangkok date range', () => {
  assert.equal(m.matchLiveEvent(ev(), ctx({ from: '2026-10-18', to: '2026-10-18' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ from: '2026-10-19' })), 'no');
  assert.equal(m.matchLiveEvent(ev(), ctx({ to: '2026-10-17' })), 'no');
  // 23:30 Bangkok on the 18th is still the 18th
  assert.equal(m.matchLiveEvent(ev({ createdAt: '2026-10-18T16:30:00.000Z' }), ctx({ to: '2026-10-18' })), 'yes');
  assert.equal(m.matchLiveEvent(ev({ createdAt: null }), ctx({ from: '2026-10-18' })), 'unknown');
});

test('matchLiveEvent: referenceType and search', () => {
  assert.equal(m.matchLiveEvent(ev(), ctx({ referenceType: 'order' })), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({ referenceType: 'slip' })), 'no');
  assert.equal(m.matchLiveEvent(ev(), ctx({}, 'txn_1')), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({}, 'ORD_9')), 'yes');
  assert.equal(m.matchLiveEvent(ev(), ctx({}, 're')), 'yes');
  // Could match on Steam ID / description the event does not carry
  assert.equal(m.matchLiveEvent(ev(), ctx({}, '7656119')), 'unknown');
  // A definite "no" on one filter wins over an unknown on another
  assert.equal(m.matchLiveEvent(ev(), ctx({ type: 'order_refund' }, '7656119')), 'no');
});

test('safeAdminHref / resolveAdminLink', () => {
  assert.equal(m.safeAdminHref('//evil.example'), null);
  assert.equal(m.safeAdminHref('javascript:alert(1)'), null);
  assert.equal(m.safeAdminHref('https://evil.example/admin'), null);
  assert.equal(m.safeAdminHref('/\\evil'), null);
  assert.equal(m.resolveAdminLink('/admin/users?search=u1'), '/admin/users?q=u1');
  assert.equal(m.resolveAdminLink('/admin/users?q=u1&search=x'), '/admin/users?q=u1&search=x');
  assert.equal(m.resolveAdminLink('/admin?tab=slips&intent=pi_1'), '/admin?tab=slips&intent=pi_1');
  // Backend links for order / checkout / quote / listing / delivery (ledgerTypes.referenceLinkFor)
  assert.equal(m.resolveAdminLink('/admin/transactions?q=ord_9'), '/admin/transactions?q=ord_9');
  // Routes this frontend does not have are not linked
  assert.equal(m.resolveAdminLink('/admin/orders?search=ord_9'), null);
  assert.equal(m.resolveAdminLink('/admin/market?listing=l1'), null);
});

test('redactSecrets drops secret-looking keys at any depth', () => {
  const out = m.redactSecrets({ a: 1, apiKey: 'k', nested: { webhookSecret: 's', ok: [{ token: 't', keep: 2 }] } });
  assert.deepEqual(out, { a: 1, apiKey: '[ซ่อน]', nested: { webhookSecret: '[ซ่อน]', ok: [{ token: '[ซ่อน]', keep: 2 }] } });
});

test('toSummaryMetric reads the backend summary buckets', () => {
  assert.deepEqual(m.toSummaryMetric({ count: 3, amount: '900' }), { amount: '900', count: 3 });
  assert.deepEqual(m.toSummaryMetric({ count: 2, credit: '100', debit: '40', net: '60' }), { amount: '60', count: 2 });
  assert.deepEqual(m.toSummaryMetric({ count: 1, volume: '250', releasedToSellers: '0' }), { amount: '250', count: 1 });
  assert.deepEqual(m.toSummaryMetric({ count: 5, in: '10', out: '4', net: '6' }), { amount: '6', count: 5 });
  assert.deepEqual(m.toSummaryMetric(undefined), { amount: null, count: null });
});
