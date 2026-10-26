// Unit tests for the pure perks helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/lib/perks.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const p = await import(new URL('./perks.ts', import.meta.url).href);

test('toQuota: object, string, unknown, flat limit', () => {
  assert.deepEqual(p.toQuota({ type: 'unlimited' }), { type: 'unlimited', limit: null });
  assert.deepEqual(p.toQuota({ type: 'per_day', limit: 3 }), { type: 'per_day', limit: 3 });
  assert.deepEqual(p.toQuota({ type: 'per_week', limit: '5' }), { type: 'per_week', limit: 5 });
  assert.deepEqual(p.toQuota({ type: 'per_day' }), { type: 'per_day', limit: 1 });
  assert.deepEqual(p.toQuota('unlimited'), { type: 'unlimited', limit: null });
  assert.deepEqual(p.toQuota({ type: 'bogus', limit: 2 }), { type: 'unlimited', limit: null });
  assert.deepEqual(p.toQuota(null), { type: 'unlimited', limit: null });
  assert.deepEqual(p.toQuota({ type: 'per_day', limit: -4 }), { type: 'per_day', limit: 0 });
});

test('toPerkFeature: commands normalised, defaults, rejects missing key', () => {
  const f = p.toPerkFeature({ id: 7, key: 'cmd.pod', name: 'Pod', commands: ['/POD', 'pods', ''], tokenCost: '2' });
  assert.equal(f.id, '7');
  assert.deepEqual(f.commands, ['/pod', '/pods']);
  assert.equal(f.tokenCost, 2);
  assert.equal(f.isActive, true);
  assert.equal(f.isFree, false);
  assert.equal(p.toPerkFeature({ name: 'x' }), null);
  assert.equal(p.toPerkFeature(null), null);
  assert.deepEqual(p.toPerkFeature({ key: 'k', commands: '/a, /b' }).commands, ['/a', '/b']);
});

test('toPerkPlan: grants in nested and flat shapes, price string, badge', () => {
  const plan = p.toPerkPlan({
    id: 'p1',
    key: 'vip',
    name: 'VIP',
    priceThb: '199.00',
    periodDays: 30,
    permissionGroup: 'VIP',
    grants: [
      { featureKey: 'cmd.pod', quota: { type: 'unlimited' } },
      { featureKey: 'cmd.getbags', quotaType: 'per_day', quotaLimit: 3 },
      { quota: { type: 'per_day', limit: 1 } },
    ],
    frameStyle: 'vip-gold',
    tierRank: 1,
    badgeLabel: 'VIP',
  });
  assert.equal(plan.priceThb, '199.00');
  assert.equal(plan.grants.length, 2);
  assert.deepEqual(plan.grants[1], { featureKey: 'cmd.getbags', featureName: null, commands: [], quota: { type: 'per_day', limit: 3 } });
  assert.deepEqual(plan.badge, { tierRank: 1, frameStyle: 'vip-gold', label: 'VIP' });
  assert.equal(p.toPerkPlan({ key: 'x', priceThb: 99 }).priceThb, '99');
  assert.equal(p.toPerkPlan({ key: 'x' }).badge, null);
});

test('toTokenPack: optional prices', () => {
  const a = p.toTokenPack({ key: 't10', tokens: 10, priceThb: '49', priceIc: null });
  assert.equal(a.priceThb, '49');
  assert.equal(a.priceIc, null);
  const b = p.toTokenPack({ key: 't5', tokens: '5', priceIc: 500 });
  assert.equal(b.priceIc, '500');
  assert.equal(b.priceThb, null);
});

test('actual /perks/me membership and decision payloads preserve scheduled state and quotas', () => {
  const me = p.toPerksMe({
    steamLinked: true,
    subscriptions: [{ id: 'membership-1', status: 'active', state: 'scheduled', package: { key: 'vip-30d', name: 'VIP 30 วัน' }, plan: { key: 'vip-30d', name: 'VIP 30 วัน' }, startsAt: '2026-11-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z', source: 'purchase' }],
    tokens: { balance: 12, ledger: [{ id: 'ledger-1', delta: -2, balanceAfter: 12, type: 'consume', createdAt: '2026-10-24T00:00:00.000Z' }] },
    features: [{ key: 'cmd.pod', name: 'Pod', commands: ['/pod'], tokenCost: 2, decision: { allowed: true, source: 'promotion', sourceRef: 'daily-pod', remaining: 2, windowResetsAt: '2026-10-24T17:00:00.000Z' } }],
  });
  assert.equal(me.subscriptions[0].planKey, 'vip-30d');
  assert.equal(me.subscriptions[0].state, 'scheduled');
  assert.equal(me.tokenLedger[0].kind, 'consume');
  assert.equal(me.features[0].sourceRef, 'daily-pod');
  assert.equal(me.features[0].remaining, 2);
  assert.equal(me.features[0].resetsAt, '2026-10-24T17:00:00.000Z');
});

test('toPerksMe: features as map or array, token balance shapes', () => {
  const me = p.toPerksMe({
    steamLinked: true,
    tokenBalance: 12,
    subscriptions: [{ id: 's1', plan: { key: 'vip', name: 'VIP' }, state: 'active', expiresAt: '2026-11-01T00:00:00Z' }],
    features: {
      'cmd.pod': { allowed: true, source: 'subscription', remaining: null },
      'cmd.getbags': { allowed: true, source: 'promotion', remaining: 2 },
    },
    usage: [{ id: 'u1', featureKey: 'cmd.pod', command: '/pod', source: 'subscription', createdAt: '2026-10-24T01:00:00Z' }],
  });
  assert.equal(me.tokenBalance, 12);
  assert.equal(me.subscriptions[0].planName, 'VIP');
  assert.equal(me.features.length, 2);
  assert.equal(me.features.find((f) => f.key === 'cmd.getbags').remaining, 2);
  assert.equal(me.features.find((f) => f.key === 'cmd.pod').remaining, null);
  assert.equal(me.usage[0].command, '/pod');
  assert.equal(p.toPerksMe({ tokens: { balance: '4' } }).tokenBalance, 4);
  assert.equal(p.toPerksMe(null).tokenBalance, 0);
});

test('quotaLabel / remainingLabel / audienceLabel', () => {
  assert.equal(p.quotaLabel({ type: 'unlimited', limit: null }), 'ไม่จำกัด');
  assert.equal(p.quotaLabel({ type: 'per_day', limit: 3 }), 'วันละ 3 ครั้ง');
  assert.equal(p.quotaLabel({ type: 'per_week', limit: 2 }), 'สัปดาห์ละ 2 ครั้ง');
  assert.equal(p.remainingLabel({ allowed: false, remaining: null, source: null }), 'ใช้ไม่ได้');
  assert.equal(p.remainingLabel({ allowed: true, remaining: null, source: 'subscription' }), 'ไม่จำกัด');
  assert.equal(p.remainingLabel({ allowed: true, remaining: 2, source: 'promotion' }), 'เหลือ 2 ครั้ง');
  assert.equal(p.audienceLabel('all'), 'ทุกคน');
  assert.equal(p.audienceLabel('plan:vip', [{ key: 'vip', name: 'VIP 30 วัน' }]), 'สมาชิก VIP 30 วัน');
  assert.equal(p.audienceLabel('plan:gone'), 'สมาชิก gone');
});

test('isPromotionLive: window and active flag', () => {
  const now = Date.parse('2026-10-24T05:00:00Z');
  assert.equal(p.isPromotionLive({ isActive: true, startsAt: null, endsAt: null }, now), true);
  assert.equal(p.isPromotionLive({ isActive: false, startsAt: null, endsAt: null }, now), false);
  assert.equal(p.isPromotionLive({ isActive: true, startsAt: '2026-10-25T00:00:00Z', endsAt: null }, now), false);
  assert.equal(p.isPromotionLive({ isActive: true, startsAt: null, endsAt: '2026-10-24T05:00:00Z' }, now), false);
  assert.equal(p.isPromotionLive({ isActive: true, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }, now), true);
});

test('parseCommandList / duplicateCommands', () => {
  assert.deepEqual(p.parseCommandList('/pod, pods  /POD /'), ['/pod', '/pods']);
  const dup = p.duplicateCommands([
    { key: 'a', commands: ['/pod'] },
    { key: 'b', commands: ['/pod', '/hatch'] },
  ]);
  assert.deepEqual([...dup.entries()], [['/pod', ['a', 'b']]]);
});

test('Bangkok datetime-local round trip', () => {
  assert.equal(p.isoFromBangkokInput('2026-10-24T07:30'), '2026-10-24T00:30:00.000Z');
  assert.equal(p.bangkokInputFromIso('2026-10-24T00:30:00.000Z'), '2026-10-24T07:30');
  assert.equal(p.bangkokInputFromIso('2026-10-23T20:00:00Z'), '2026-10-24T03:00');
  assert.equal(p.isoFromBangkokInput(''), null);
  assert.equal(p.isoFromBangkokInput('2026-02-31T10:00'), null);
  assert.equal(p.bangkokInputFromIso(null), '');
});

test('isReservedGroup', () => {
  assert.equal(p.isReservedGroup('Admins'), true);
  assert.equal(p.isReservedGroup(' default '), true);
  assert.equal(p.isReservedGroup('VIP'), false);
});
