// Unit tests for the pure VIP helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/lib/vip.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const v = await import(new URL('./vip.ts', import.meta.url).href);

test('toVipBadge: badge object, nested vip, legacy boolean, non-VIP', () => {
  assert.deepEqual(v.toVipBadge({ tierRank: 3, frameStyle: 'vip-diamond', label: 'VIP+' }), {
    tierRank: 3,
    frameStyle: 'vip-diamond',
    label: 'VIP+',
  });
  assert.deepEqual(v.toVipBadge({ vip: { tierRank: 1, frameStyle: 'vip-gold', label: 'VIP' } }), {
    tierRank: 1,
    frameStyle: 'vip-gold',
    label: 'VIP',
  });
  assert.equal(v.toVipBadge(true)?.frameStyle, 'vip-gold');
  assert.equal(v.toVipBadge(null), null);
  assert.equal(v.toVipBadge(undefined), null);
  assert.equal(v.toVipBadge({}), null);
  assert.equal(v.toVipBadge({ vip: null }), null);
  assert.equal(v.toVipBadge({ isVip: false, frameStyle: 'vip-gold' }), null);
});

test('toVipBadge: unknown frame falls back to gold, label capped at 16', () => {
  const b = v.toVipBadge({ tierRank: 2, frameStyle: 'vip-unknown', label: 'A'.repeat(30) });
  assert.equal(b.frameStyle, 'vip-gold');
  assert.equal(b.label.length, 16);
});

test('formatThb never does arithmetic and groups thousands', () => {
  assert.equal(v.formatThb('199.00'), '฿199');
  assert.equal(v.formatThb('1499.5'), '฿1,499.50');
  assert.equal(v.formatThb('1000000'), '฿1,000,000');
  assert.equal(v.formatThb('0'), '฿0');
  assert.equal(v.formatThb('abc'), '—');
  assert.equal(v.formatThb(null), '—');
});

test('isZeroPrice / toMoneyString', () => {
  assert.equal(v.isZeroPrice('0'), true);
  assert.equal(v.isZeroPrice('0.00'), true);
  assert.equal(v.isZeroPrice('0.01'), false);
  assert.equal(v.toMoneyString(199), '199');
  assert.equal(v.toMoneyString(' 199.50 '), '199.50');
  assert.equal(v.toMoneyString('x'), '0');
});

test('durationLabel and daysRemaining', () => {
  assert.equal(v.durationLabel(null), 'ถาวร');
  assert.equal(v.durationLabel(30), '1 เดือน (30 วัน)');
  assert.equal(v.durationLabel(7), '7 วัน');
  assert.equal(v.durationLabel(365), '1 ปี');
  const now = Date.parse('2026-10-23T00:00:00Z');
  assert.equal(v.daysRemaining(null, now), null);
  assert.equal(v.daysRemaining('2026-10-24T00:00:00Z', now), 1);
  assert.equal(v.daysRemaining('2026-10-23T01:00:00Z', now), 1);
  assert.equal(v.daysRemaining('2026-10-01T00:00:00Z', now), 0);
});

test('toVipPackage parses the backend serializer and rejects junk', () => {
  const p = v.toVipPackage({
    id: 'p1',
    key: 'vip-30d',
    name: 'VIP 30 วัน',
    permissionGroup: 'VIP',
    tierRank: 1,
    frameStyle: 'vip-gold',
    badgeLabel: 'VIP',
    priceThb: '199.00',
    durationDays: 30,
    isActive: true,
    sortOrder: 0,
    activeMemberships: 4,
  });
  assert.equal(p.priceThb, '199.00');
  assert.equal(p.durationDays, 30);
  assert.equal(p.activeMemberships, 4);
  assert.equal(v.toVipPackage({ id: 'p2', durationDays: null }).durationDays, null);
  assert.equal(v.toVipPackage({ name: 'no id' }), null);
});

test('toVipMe: badge from API, else derived from the active membership; steamLinked + groups', () => {
  const membership = {
    id: 'm1',
    userId: 'u1',
    package: { id: 'p1', key: 'vip-30d', name: 'VIP', tierRank: 2, frameStyle: 'vip-emerald', badgeLabel: 'VIP' },
    permissionGroup: 'VIP',
    startsAt: '2026-10-01T00:00:00Z',
    expiresAt: '2026-11-01T00:00:00Z',
    status: 'active',
    state: 'active',
    source: 'purchase',
    sync: { status: 'synced', syncedAt: '2026-10-01T00:01:00Z', jobId: 'j1', jobStatus: 'completed', action: 'add', attempts: 1, lastError: null, updatedAt: null },
  };
  const me = v.toVipMe({ vip: null, isVip: false, active: membership, memberships: [membership], groups: [{ group: 'VIP', expiresAt: '2026-11-01T00:00:00Z' }], steamLinked: false });
  assert.equal(me.vip.frameStyle, 'vip-emerald');
  assert.equal(me.active.sync.status, 'synced');
  assert.equal(me.steamLinked, false);
  assert.deepEqual(me.groups, [{ group: 'VIP', expiresAt: '2026-11-01T00:00:00Z' }]);
  const none = v.toVipMe({});
  assert.equal(none.vip, null);
  assert.equal(none.active, null);
  assert.equal(none.steamLinked, true);
});

test('compareExpiry: permanent (null) is the latest', () => {
  assert.ok(v.compareExpiry(null, '2030-01-01T00:00:00Z') > 0);
  assert.ok(v.compareExpiry('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z') < 0);
  assert.equal(v.compareExpiry(null, null), 0);
});
