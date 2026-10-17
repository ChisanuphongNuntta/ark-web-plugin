// Unit tests for the pure admin pagination helpers. No test runner needed:
//   cd frontend && node --no-warnings --test src/components/admin/paginationMath.test.mts
// (Node >= 22.18 / 24 strips TypeScript types natively.) Not part of the Next build or tsc include.
import { test } from 'node:test';
import assert from 'node:assert/strict';


const m = await import(new URL('./paginationMath.ts', import.meta.url).href);

const req = (page: number, pageSize = 25, search = '', filters: Record<string, string> = {}) => ({ page, pageSize, search, filters });

test('normalizePageSize', () => {
  assert.equal(m.normalizePageSize(25), 25);
  assert.equal(m.normalizePageSize('50'), 50);
  assert.equal(m.normalizePageSize(undefined), 25);
  assert.equal(m.normalizePageSize('abc'), 25);
  assert.equal(m.normalizePageSize(0), 25);
  assert.equal(m.normalizePageSize(-5), 25);
  assert.equal(m.normalizePageSize('1.5'), 25);
  assert.equal(m.normalizePageSize(17), 10); // tie-ish -> nearest (|17-10|=7 < 8)
  assert.equal(m.normalizePageSize(75), 50); // exact tie -> smaller (matches backend)
  assert.equal(m.normalizePageSize(1000), 100);
  assert.equal(m.normalizePageSize(30), 25);
  assert.equal(m.normalizePageSize(1), 10);
});

test('parsePage', () => {
  assert.equal(m.parsePage('3'), 3);
  assert.equal(m.parsePage(null), 1);
  assert.equal(m.parsePage('0'), 1);
  assert.equal(m.parsePage('-2'), 1);
  assert.equal(m.parsePage('2abc'), 1);
  assert.equal(m.parsePage('1e3'), 1);
  assert.equal(m.parsePage('99999999999'), 1_000_000);
});

test('normalizeSearch', () => {
  assert.equal(m.normalizeSearch('  island  '), 'island');
  assert.equal(m.normalizeSearch(undefined), '');
  assert.equal(m.normalizeSearch('x'.repeat(150)).length, 100);
});

test('computeTotalPages', () => {
  assert.equal(m.computeTotalPages(0, 25), 1);
  assert.equal(m.computeTotalPages(25, 25), 1);
  assert.equal(m.computeTotalPages(26, 25), 2);
  assert.equal(m.computeTotalPages(41, 25), 2);
  assert.equal(m.computeTotalPages(NaN, 25), 1);
  assert.equal(m.computeTotalPages(10, 0), 1);
});

test('computeRange', () => {
  assert.deepEqual(m.computeRange(1, 25, 0), { start: 0, end: 0 });
  assert.deepEqual(m.computeRange(1, 25, 41), { start: 1, end: 25 });
  assert.deepEqual(m.computeRange(2, 25, 41), { start: 26, end: 41 });
  assert.deepEqual(m.computeRange(9, 25, 41), { start: 26, end: 41 }); // stale page clamped
  assert.deepEqual(m.computeRange(0, 25, 41), { start: 1, end: 25 });
  assert.deepEqual(m.computeRange(1, 10, 3), { start: 1, end: 3 });
});

test('formatRangeLabel', () => {
  assert.equal(m.formatRangeLabel(2, 25, 41), 'แสดง 26–41 จาก 41 รายการ');
  assert.equal(m.formatRangeLabel(2, 25, 60), 'แสดง 26–50 จาก 60 รายการ');
  assert.equal(m.formatRangeLabel(1, 25, 0), 'ไม่มีรายการ');
  assert.equal(m.formatRangeLabel(1, 100, 1234), 'แสดง 1–100 จาก 1,234 รายการ');
});

test('pageAfterSizeChange keeps first visible row', () => {
  assert.equal(m.pageAfterSizeChange(3, 25, 50), 2); // row 51 -> page 2 @50 (51-100)
  assert.equal(m.pageAfterSizeChange(2, 50, 25), 3); // row 51 -> page 3 @25
  assert.equal(m.pageAfterSizeChange(1, 25, 100), 1);
  assert.equal(m.pageAfterSizeChange(5, 10, 25), 2); // row 41 -> page 2 @25 (26-50)
  assert.equal(m.pageAfterSizeChange(4, 100, 10), 31); // row 301 -> page 31 @10
  assert.equal(m.pageAfterSizeChange(0, 25, 50), 1);
  assert.equal(m.pageAfterSizeChange(3, 0, 50), 1);
  // invariant: first visible row is on the new page
  for (const oldSize of [10, 25, 50, 100]) {
    for (const newSize of [10, 25, 50, 100]) {
      for (let page = 1; page <= 40; page += 1) {
        const firstRow = (page - 1) * oldSize + 1;
        const np = m.pageAfterSizeChange(page, oldSize, newSize);
        assert.ok(firstRow >= (np - 1) * newSize + 1 && firstRow <= np * newSize, `${page}@${oldSize}->${newSize}`);
      }
    }
  }
});

test('pageItems with ellipsis', () => {
  assert.deepEqual(m.pageItems(5, 20), [1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 20]);
  assert.deepEqual(m.pageItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20]);
  assert.deepEqual(m.pageItems(20, 20), [1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  assert.deepEqual(m.pageItems(4, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20]);
  assert.deepEqual(m.pageItems(1, 1), [1]);
  assert.deepEqual(m.pageItems(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(m.pageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(m.pageItems(99, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(m.pageItems(4, 8), [1, 2, 3, 4, 5, 'ellipsis-end', 8]);
  // invariants for every page of many sizes
  for (let total = 1; total <= 60; total += 1) {
    for (let page = 1; page <= total; page += 1) {
      const items = m.pageItems(page, total);
      const nums = items.filter((x: unknown) => typeof x === 'number');
      assert.ok(nums.includes(page), `current shown ${page}/${total}`);
      assert.ok(nums.includes(1) && nums.includes(total), `ends shown ${page}/${total}`);
      assert.ok(items.length <= 7, `length ${page}/${total}`);
      if (total >= 7) assert.equal(items.length, 7, `constant length ${page}/${total}`);
      for (let i = 1; i < nums.length; i += 1) assert.ok(nums[i] > nums[i - 1], 'ascending');
      // an ellipsis never hides exactly one page
      for (let i = 0; i < items.length; i += 1) {
        if (typeof items[i] === 'string') assert.ok((items[i + 1] as number) - (items[i - 1] as number) > 2, `gap ${page}/${total}`);
      }
    }
  }
});

test('normalizePageResponse: server paginated (new contract)', () => {
  const r = m.normalizePageResponse([{ id: 1 }], { page: 2, pageSize: 25, total: 26, totalPages: 2 }, req(2));
  assert.deepEqual(r.pagination, { page: 2, pageSize: 25, total: 26, totalPages: 2 });
  assert.equal(r.serverPaginated, true);
});

test('normalizePageResponse: legacy limit + unclamped page', () => {
  const r = m.normalizePageResponse([], { page: 9, limit: 25, total: 41, totalPages: 2 }, req(9));
  assert.equal(r.pagination.page, 2);
  assert.equal(r.pagination.pageSize, 25);
});

test('normalizePageResponse: totalPages 0 / missing from old backend', () => {
  const r = m.normalizePageResponse([], { page: 1, limit: 20, total: 0, totalPages: 0 }, req(1));
  assert.deepEqual(r.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 1 });
});

test('normalizePageResponse: unpaginated list sliced locally with filter', () => {
  const all = Array.from({ length: 52 }, (_, i) => ({ id: i + 1, name: i % 2 ? 'Island' : 'Ragnarok' }));
  const r = m.normalizePageResponse(all, undefined, req(2, 10, 'island'), (x: { name: string }, q: { search: string }) =>
    x.name.toLowerCase().includes(q.search),
  );
  assert.equal(r.serverPaginated, false);
  assert.equal(r.pagination.total, 26);
  assert.equal(r.pagination.totalPages, 3);
  assert.equal(r.items.length, 10);
  assert.equal(r.items[0].id, 22);
  const last = m.normalizePageResponse(all, null, req(99, 25));
  assert.equal(last.pagination.page, 3);
  assert.equal(last.items.length, 2);
});

test('normalizePageResponse: defensive cap when server ignores pageSize', () => {
  const many = Array.from({ length: 300 }, (_, i) => i);
  const r = m.normalizePageResponse(many, { page: 1, pageSize: 25, total: 300 }, req(1));
  assert.equal(r.items.length, 25);
});

test('normalizePageResponse: garbage input', () => {
  const r = m.normalizePageResponse('nope', { page: 'x', total: 'y' }, req(3));
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.pagination, { page: 1, pageSize: 25, total: 0, totalPages: 1 });
});

test('paginateLocally', () => {
  const items = Array.from({ length: 41 }, (_, i) => i + 1);
  const r = m.paginateLocally(items, 2, 25);
  assert.deepEqual(r.pagination, { page: 2, pageSize: 25, total: 41, totalPages: 2 });
  assert.equal(r.items[0], 26);
  assert.equal(r.items.length, 16);
  assert.equal(m.paginateLocally([], 5, 25).pagination.page, 1);
});
