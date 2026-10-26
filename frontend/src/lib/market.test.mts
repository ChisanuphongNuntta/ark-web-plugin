import { test } from 'node:test';
import assert from 'node:assert/strict';
const market = await import(new URL('./market.ts', import.meta.url).href);
test('market publish prices accept only supported positive integer IC amounts', () => {
  for (const input of ['1', '100', '2000000000']) assert.equal(market.marketPriceValid(input), true);
  for (const input of ['', '0', '-1', '1.5', '1e3', '2000000001', 'Infinity']) assert.equal(market.marketPriceValid(input), false);
});
test('unknown animal sex is not displayed as female', () => {
  assert.equal(market.marketGender('Male'), 'เพศผู้');
  assert.equal(market.marketGender('Female'), 'เพศเมีย');
  assert.equal(market.marketGender('Unknown'), 'ไม่ระบุเพศ');
});
