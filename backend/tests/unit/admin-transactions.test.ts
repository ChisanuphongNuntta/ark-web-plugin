import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import auditService from '../../src/services/audit.service.js';
import walletService, { walletRequestHashFor } from '../../src/services/wallet.service.js';
import { withAfterCommitScope } from '../../src/realtime/afterCommit.js';
import { setRealtimeServer } from '../../src/realtime/io.js';
import {
  bangkokDayRange,
  bangkokToday,
  customerSideOf,
  formatBangkok,
  normalizeReferenceType,
  referenceLinkFor,
  referenceTypeWhere,
} from '../../src/services/ledgerTypes.js';
import {
  CSV_HEADER,
  buildTransactionWhere,
  csvCell,
  exportTransactionsCsv,
  exportCursorWhere,
  csvTruncatedLine,
  EXPORT_SETTLE_MS,
  foldSummary,
  getDailySummary,
  getTransactionDetail,
  listTransactions,
  parseTransactionFilters,
  sanitizeMetadata,
} from '../../src/services/adminTransactions.service.js';
import { AdminTransactionsController } from '../../src/controllers/adminTransactions.controller.js';
import {
  LedgerReconcileScheduler,
  RECONCILE_LOCK_KEY,
  compareBalances,
  reconcileLedger,
} from '../../src/services/ledgerReconcile.service.js';
import adminRouter from '../../src/routes/admin.routes.js';

const db = prisma as any;
db.ledgerEntry.findFirst ??= vi.fn();
db.ledgerEntry.groupBy ??= vi.fn();
db.$queryRaw ??= vi.fn();
db.orderGroup.findUnique ??= vi.fn();
db.gamePurchaseQuote.findUnique ??= vi.fn();
db.paymentIntent ??= {};
db.paymentIntent.findUnique ??= vi.fn();

const flush = () => new Promise((resolve) => setImmediate(resolve));
const controller = new AdminTransactionsController();

function fakeIo() {
  const emitted: Array<{ room: string | null; event: string; payload: any }> = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }),
    emit: (event: string, payload: any) => emitted.push({ room: null, event, payload }),
  };
  return { io: io as any, emitted };
}

const userAcct = (userId: string, type = 'available', name = 'Heart', steamId: string | null = '76561198000000001') => ({
  id: `acct-${userId}-${type}`,
  key: `user:${userId}:${type}:IC`,
  type,
  userId,
  user: { id: userId, discordUsername: name, steamId },
});
const systemAcct = (type: string, key: string) => ({ id: `acct-${type}`, key, type, userId: null, user: null });

let seq = 0;
function txRow(over: Record<string, any> = {}) {
  seq += 1;
  const id = over.id ?? `tx-${seq}`;
  return {
    id,
    idempotencyKey: `key-${id}`,
    requestHash: 'h',
    type: 'order_purchase',
    referenceType: 'order',
    referenceId: 'o1',
    description: 'Purchased Rifle x1',
    metadata: null,
    createdBy: null,
    createdAt: new Date('2026-10-18T03:00:00.000Z'),
    postedAt: new Date('2026-10-18T03:00:01.000Z'),
    entries: [
      { id: `${id}-e1`, transactionId: id, accountId: 'acct-u1-available', amount: -200n, balanceAfter: 800n, createdAt: new Date(), account: userAcct('u1') },
      { id: `${id}-e2`, transactionId: id, accountId: 'acct-platform_revenue', amount: 200n, balanceAfter: 9000n, createdAt: new Date(), account: systemAcct('platform_revenue', 'system:revenue:IC') },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((ops: any) => (typeof ops === 'function' ? ops(db) : Promise.all(ops)));
  db.user.findMany.mockResolvedValue([]);
});

afterEach(() => setRealtimeServer(null));

// ------------------------------------------------------------------------- vocabulary

describe('ledger vocabulary', () => {
  it('picks the customer side: the user with the largest absolute net movement', () => {
    expect(customerSideOf([
      { amount: -200n, userId: 'u1', accountType: 'available', balanceAfter: 800n },
      { amount: 200n, userId: null, accountType: 'platform_revenue' },
    ])).toEqual({ userId: 'u1', amount: -200n, availableAfter: 800n });

    // P2P release: clearing -> seller + revenue. Customer = seller, credited, available after known.
    expect(customerSideOf([
      { amount: -200n, userId: null, accountType: 'system_clearing' },
      { amount: 190n, userId: 's1', accountType: 'available', balanceAfter: 190n },
      { amount: 10n, userId: null, accountType: 'platform_revenue' },
    ])).toEqual({ userId: 's1', amount: 190n, availableAfter: 190n });

    // Refund lands in `refundable`: available-after is unknown from the entries alone.
    expect(customerSideOf([
      { amount: -250n, userId: null, accountType: 'platform_revenue' },
      { amount: 250n, userId: 'u1', accountType: 'refundable', balanceAfter: 250n },
    ])).toEqual({ userId: 'u1', amount: 250n, availableAfter: null });

    expect(customerSideOf([
      { amount: -5n, userId: null, accountType: 'system_issuance' },
      { amount: 5n, userId: null, accountType: 'platform_revenue' },
    ])).toEqual({ userId: null, amount: null, availableAfter: null });
  });

  it('normalizes legacy reference spellings and builds admin links', () => {
    expect(normalizeReferenceType('admin_adjustment', 'admin', 'u1')).toBe('admin_adjustment');
    expect(normalizeReferenceType('earn_playtime', 'gameplay', 'u1')).toBe('reward');
    expect(normalizeReferenceType('bank_slip_approval', 'external', 'pi1')).toBe('slip');
    expect(normalizeReferenceType('payment_topup', 'external', 'pi1')).toBe('payment_intent');
    expect(normalizeReferenceType('stripe_topup', 'external', 'cs_test_1')).toBe('stripe_session');
    expect(normalizeReferenceType('stripe_topup', 'external', 'pi1')).toBe('payment_intent');
    expect(normalizeReferenceType('order_purchase', 'order', 'o1')).toBe('order');
    expect(normalizeReferenceType('x', null, null)).toBeNull();

    expect(referenceLinkFor('order', 'o 1')).toBe('/admin/transactions?q=o%201');
    expect(referenceLinkFor('slip', 'pi1')).toBe('/admin?tab=slips&intent=pi1');
    expect(referenceLinkFor('dino_listing', 'l1')).toBe('/admin/transactions?q=l1');
    expect(referenceLinkFor('delivery', 'd1')).toBe('/admin/transactions?q=d1');
    expect(referenceLinkFor('stripe_session', 'cs_1')).toBe('/admin/transactions?q=cs_1');
    expect(referenceLinkFor('admin_adjustment', 'u1')).toBe('/admin/users?q=u1');
    expect(referenceLinkFor('unknown_kind', 'x')).toBeNull();

    expect(referenceTypeWhere('order')).toEqual({ referenceType: 'order' });
    expect(referenceTypeWhere('reward')).toEqual({ OR: [{ referenceType: 'reward' }, { referenceType: 'gameplay' }] });
  });

  it('computes Bangkok day boundaries (UTC+7) and rejects impossible dates', () => {
    const { from, to } = bangkokDayRange('2026-10-18');
    expect(from.toISOString()).toBe('2026-10-17T17:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-18T17:00:00.000Z');
    expect(() => bangkokDayRange('2026-02-31')).toThrow();
    expect(() => bangkokDayRange('18/10/2026')).toThrow();
    expect(bangkokToday(new Date('2026-10-17T18:30:00Z'))).toBe('2026-10-18');
    expect(formatBangkok(new Date('2026-10-17T18:30:05Z'))).toBe('2026-10-18 01:30:05');
  });
});

// ------------------------------------------------------------------------- filters

describe('transaction filters', () => {
  it('parses every filter and rejects junk with 400', () => {
    const filters = parseTransactionFilters({
      search: '  Heart  ', type: 'order_purchase,checkout_purchase', category: 'purchase', userId: 'u1',
      referenceType: 'order', from: '2026-10-17T17:00:00.000Z', to: '2026-10-18T17:00:00+07:00', direction: 'out',
    });
    expect(filters).toMatchObject({
      search: 'Heart', types: ['order_purchase', 'checkout_purchase'], category: 'purchase', userId: 'u1',
      referenceType: 'order', direction: 'out',
    });
    expect(filters.from!.toISOString()).toBe('2026-10-17T17:00:00.000Z');
    expect(parseTransactionFilters({ type: 'all', direction: '' })).toEqual({ search: undefined, from: undefined, to: undefined });

    for (const query of [
      { type: 'DROP TABLE' }, { type: ['a', 'b'] }, { category: 'nope' }, { direction: 'sideways' },
      { from: '2026-10-18' }, { from: 'yesterday' }, { userId: 'a b' },
      { from: '2026-10-18T00:00:00Z', to: '2026-10-17T00:00:00Z' },
    ]) {
      expect(() => parseTransactionFilters(query as any)).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });

  it('builds a where clause: user scope, Bangkok range incl. unposted opening rows, direction on the customer side', () => {
    const where = buildTransactionWhere(parseTransactionFilters({
      userId: 'u1', direction: 'in', from: '2026-10-17T17:00:00Z', to: '2026-10-18T17:00:00Z', referenceType: 'slip',
    })) as any;
    const range = { gte: new Date('2026-10-17T17:00:00Z'), lt: new Date('2026-10-18T17:00:00Z') };
    expect(where.AND).toEqual(expect.arrayContaining([
      { entries: { some: { account: { userId: 'u1' } } } },
      { OR: [{ postedAt: range }, { postedAt: null, createdAt: range }] },
      {
        entries: {
          some: { amount: { gt: 0n }, account: { userId: 'u1' } },
          none: { amount: { lt: 0n }, account: { userId: 'u1' } },
        },
      },
      { OR: [{ referenceType: 'slip' }, { referenceType: 'external', type: { in: ['bank_slip_approval', 'bank_slip_approval_demo'] } }] },
    ]));
    expect(buildTransactionWhere({})).toEqual({});
  });
});

// ------------------------------------------------------------------------- list

describe('GET /admin/transactions', () => {
  it('returns customer-side rows, server-side pagination and totals for the filter', async () => {
    const purchase = txRow({ id: 'tx-buy' });
    const refund = txRow({
      id: 'tx-refund', type: 'order_refund', description: 'Refund for order o1', createdBy: 'admin1',
      entries: [
        { id: 'r1', transactionId: 'tx-refund', accountId: 'acct-platform_revenue', amount: -250n, balanceAfter: 1n, createdAt: new Date(), account: systemAcct('platform_revenue', 'system:revenue:IC') },
        { id: 'r2', transactionId: 'tx-refund', accountId: 'acct-u1-refundable', amount: 250n, balanceAfter: 250n, createdAt: new Date(), account: userAcct('u1', 'refundable') },
      ],
    });
    db.ledgerTransaction.count.mockResolvedValue(2);
    db.ledgerTransaction.findMany.mockResolvedValue([refund, purchase]);
    db.user.findMany.mockResolvedValue([{ id: 'admin1', discordUsername: 'Boss' }]);
    db.ledgerEntry.findFirst.mockResolvedValue({ balanceAfter: 800n }); // available-after fallback for the refund
    db.ledgerEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 250n } })   // credits to customers
      .mockResolvedValueOnce({ _sum: { amount: -200n } }); // debits from customers

    const body = await listTransactions({ page: '1', pageSize: '25', userId: 'u1' });

    expect(body.pagination).toEqual({ page: 1, pageSize: 25, total: 2, totalPages: 1 });
    expect(body.totals).toEqual({ in: '250', out: '200', net: '50', count: 2 });
    expect(body.items[0]).toEqual({
      id: 'tx-refund',
      type: 'order_refund',
      typeLabelTh: 'คืนเงินคำสั่งซื้อ',
      category: 'refund',
      createdAt: '2026-10-18T03:00:00.000Z',
      postedAt: '2026-10-18T03:00:01.000Z',
      createdBy: { id: 'admin1', name: 'Boss' },
      description: 'Refund for order o1',
      referenceType: 'order',
      referenceId: 'o1',
      referenceLink: '/admin/transactions?q=o1',
      user: { id: 'u1', name: 'Heart', steamId: '76561198000000001' },
      amount: '250',
      balanceAfter: '800',
      // Legacy refund into `refundable`: the admin row also shows that sub-account after.
      refundableAfter: '250',
      entriesCount: 2,
    });
    expect(body.items[1]).toMatchObject({ id: 'tx-buy', amount: '-200', balanceAfter: '800', refundableAfter: null, createdBy: null, typeLabelTh: 'ซื้อสินค้า' });
    // Only the refund needed the fallback lookup.
    expect(db.ledgerEntry.findFirst).toHaveBeenCalledTimes(1);
    // The fallback orders by posting order (postedAt), not entry insert order.
    expect(db.ledgerEntry.findFirst.mock.calls[0][0].orderBy).toEqual([
      { transaction: { postedAt: { sort: 'desc', nulls: 'last' } } },
      { id: 'desc' },
    ]);

    const findArgs = db.ledgerTransaction.findMany.mock.calls[0][0];
    expect(findArgs.orderBy).toEqual([{ postedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(25);
    // Totals are scoped to the filtered user's accounts and the same transaction filter.
    const creditArgs = db.ledgerEntry.aggregate.mock.calls[0][0];
    expect(creditArgs.where).toMatchObject({ amount: { gt: 0n }, account: { userId: 'u1' }, transaction: findArgs.where });
  });

  it('clamps a page past the end and re-queries the last page', async () => {
    db.ledgerTransaction.count.mockResolvedValue(3);
    db.ledgerTransaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([txRow()]);
    db.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const body = await listTransactions({ page: '9', pageSize: '10' });

    expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    expect(body.items).toHaveLength(1);
    expect(body.totals).toEqual({ in: '0', out: '0', net: '0', count: 3 });
  });

  it('controller passes filter errors to next as 400', async () => {
    const res: any = { json: vi.fn() };
    const next = vi.fn();
    await controller.list({ query: { direction: 'up' } } as any, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(res.json).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------- detail

describe('GET /admin/transactions/:id', () => {
  it('returns every entry with owners, sanitized metadata and related order + deliveries', async () => {
    db.ledgerTransaction.findUnique.mockResolvedValueOnce(txRow({
      id: 'tx-d', metadata: { inventoryReclaimed: true, apiKey: 'sk_live_x', nested: { webhookSignature: 'sig', note: 'ok' } },
    }));
    db.order.findUnique.mockResolvedValueOnce({ id: 'o1', status: 'delivered', totalPrice: 200, createdAt: new Date('2026-10-18T03:00:00Z') });
    db.deliveryJob.findMany.mockResolvedValueOnce([{ id: 'o1', status: 'completed', attempts: 1 }]);

    const body: any = await getTransactionDetail('tx-d');

    expect(body.transaction.metadata).toEqual({ inventoryReclaimed: true, nested: { note: 'ok' } });
    expect(body.transaction.balanced).toBe(true);
    expect(body.transaction.entries).toEqual([
      expect.objectContaining({ accountKey: 'user:u1:available:IC', accountLabelTh: 'ยอดใช้ได้', amount: '-200', balanceAfter: '800', owner: { id: 'u1', name: 'Heart', steamId: '76561198000000001' } }),
      expect.objectContaining({ accountKey: 'system:revenue:IC', accountLabelTh: 'ระบบ: รายได้ร้าน', amount: '200', owner: null }),
    ]);
    expect(body.related.order).toMatchObject({ id: 'o1', status: 'delivered', createdAt: '2026-10-18T03:00:00.000Z' });
    expect(body.related.deliveries).toEqual([{ id: 'o1', status: 'completed', attempts: 1 }]);
  });

  it('404s unknown or malformed ids', async () => {
    db.ledgerTransaction.findUnique.mockResolvedValueOnce(null);
    await expect(getTransactionDetail('missing')).rejects.toMatchObject({ statusCode: 404 });
    await expect(getTransactionDetail('../../etc')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sanitizeMetadata strips secret-looking keys at any depth and stringifies bigint', () => {
    expect(sanitizeMetadata({ token: 'x', password: 'y', qrPayload: 'z', amount: 5n, list: [{ authorization: 'a', ok: 1 }] }))
      .toEqual({ amount: '5', list: [{ ok: 1 }] });
  });
});

// ------------------------------------------------------------------------- summary

describe('GET /admin/transactions/summary', () => {
  it('folds per-type customer movements into the Bangkok-day dashboard buckets', () => {
    const { from, to } = bangkokDayRange('2026-10-18');
    const summary = foldSummary('2026-10-18', from, to, [
      { type: 'payment_topup', count: 2, credit: 1000n, debit: 0n },
      { type: 'bank_slip_approval', count: 1, credit: 500n, debit: 0n },
      { type: 'checkout_purchase', count: 3, credit: 0n, debit: 900n },
      { type: 'order_refund', count: 1, credit: 100n, debit: 0n },
      { type: 'admin_adjustment', count: 2, credit: 300n, debit: 50n },
      { type: 'dino_escrow_hold', count: 1, credit: 0n, debit: 400n },
      { type: 'dino_escrow_release', count: 1, credit: 380n, debit: 0n },
      { type: 'earn_playtime', count: 4, credit: 40n, debit: 0n },
      { type: 'mystery', count: 1, credit: 7n, debit: 0n },
    ]);
    expect(summary.topups).toEqual({ count: 3, amount: '1500' });
    expect(summary.purchases).toEqual({ count: 3, amount: '900' });
    expect(summary.refunds).toEqual({ count: 1, amount: '100' });
    expect(summary.adminAdjustments).toEqual({ count: 2, credit: '300', debit: '50', net: '250' });
    expect(summary.p2p).toEqual({ count: 1, volume: '400', releasedToSellers: '380' });
    expect(summary.rewards).toEqual({ count: 4, amount: '40' });
    expect(summary.other).toEqual({ count: 1, credit: '7', debit: '0' });
    expect(summary.totals).toEqual({ count: 16, in: '2327', out: '1350', net: '977' });
    expect(summary.from).toBe('2026-10-17T17:00:00.000Z');
    expect(summary.byType[0]).toMatchObject({ type: 'earn_playtime', typeLabelTh: 'รางวัลจากการเล่นเกม', count: 4 });
  });

  it('queries the Bangkok day as UTC wall-clock bounds and validates the date', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ type: 'payment_topup', count: 1, credit: 100n, debit: 0n }]);
    const summary = await getDailySummary({ date: '2026-10-18' });
    expect(summary.topups).toEqual({ count: 1, amount: '100' });
    const values = db.$queryRaw.mock.calls[0].slice(1);
    expect(values).toEqual(['2026-10-17 17:00:00.000', '2026-10-18 17:00:00.000']);

    await expect(getDailySummary({ date: '2026-13-01' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(getDailySummary({ date: ['2026-10-18'] })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ------------------------------------------------------------------------- export

describe('GET /admin/transactions/export.csv', () => {
  it('streams BOM + Thai header, then one chunk per batch, until the rows run out', async () => {
    db.ledgerTransaction.findMany
      .mockResolvedValueOnce([txRow({ id: 'a' }), txRow({ id: 'b', description: '=HYPERLINK("x")' })])
      .mockResolvedValueOnce([txRow({ id: 'c' })]);
    const state = { rows: 0, truncated: false };
    const chunks: string[] = [];
    for await (const chunk of exportTransactionsCsv({}, state, { batchSize: 2, now: new Date('2026-10-18T05:00:00Z') })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);
    expect(chunks[0].startsWith('﻿')).toBe(true);
    expect(chunks[0]).toContain(CSV_HEADER[0]);
    const lines = chunks.slice(1).join('').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain(',a,ซื้อสินค้า,order_purchase,purchase,Heart,76561198000000001,u1,-200,800,order,o1,');
    expect(lines[0].startsWith('2026-10-18 10:00:01,')).toBe(true);
    // Formula injection guard on text cells.
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(state).toEqual({ rows: 3, truncated: false });
    // Snapshot bound (export start minus the settle window) on postedAt, createdAt for unposted rows.
    const snapshot = new Date(new Date('2026-10-18T05:00:00Z').getTime() - EXPORT_SETTLE_MS);
    expect(db.ledgerTransaction.findMany.mock.calls[0][0].where.AND[1]).toEqual({
      OR: [{ postedAt: { lte: snapshot } }, { postedAt: null, createdAt: { lte: snapshot } }],
    });
    // Keyset continuation from the last row of batch 1 (postedAt desc, id desc), never an offset.
    expect(db.ledgerTransaction.findMany.mock.calls[0][0].skip).toBeUndefined();
    expect(db.ledgerTransaction.findMany.mock.calls[1][0].skip).toBeUndefined();
    expect(db.ledgerTransaction.findMany.mock.calls[1][0].where.AND[2]).toEqual(
      exportCursorWhere({ postedAt: new Date('2026-10-18T03:00:01.000Z'), id: 'b' }),
    );
  });

  it('stops at the row cap and reports truncation only when more rows exist', async () => {
    db.ledgerTransaction.findMany
      .mockResolvedValueOnce([txRow(), txRow()])
      .mockResolvedValueOnce([{ id: 'more' }]);
    const state = { rows: 0, truncated: false };
    const chunks: string[] = [];
    for await (const chunk of exportTransactionsCsv({}, state, { maxRows: 2, batchSize: 5 })) chunks.push(chunk);
    expect(state).toEqual({ rows: 2, truncated: true });
    // The downloaded file itself says it was cut.
    expect(chunks[chunks.length - 1]).toBe(csvTruncatedLine(2));
    expect(chunks[chunks.length - 1]).toContain('truncated at 2 rows');
    expect(db.ledgerTransaction.findMany.mock.calls[0][0].take).toBe(2);
  });

  it('csvCell quotes separators and guards formulas only on text cells', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('+66')).toBe("'+66");
    expect(csvCell('-200', false)).toBe('-200');
    expect(csvCell(null)).toBe('');
  });

  it('controller writes the stream with download headers and audits the export', async () => {
    db.ledgerTransaction.findMany.mockResolvedValueOnce([txRow()]);
    const written: string[] = [];
    const headers: Record<string, string> = {};
    const res: any = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }),
      write: vi.fn((chunk: string) => { written.push(chunk); return true; }),
      end: vi.fn(() => { res.writableEnded = true; }),
      once: vi.fn(),
      off: vi.fn(),
      headersSent: true,
      writableEnded: false,
    };
    const req: any = { query: { type: 'order_purchase' }, user: { id: 'admin1' }, on: vi.fn() };
    const next = vi.fn();

    await controller.exportCsv(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(/^attachment; filename="iris-transactions-\d{12}\.csv"$/);
    expect(written.join('').startsWith('﻿')).toBe(true);
    expect(res.end).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin1',
      action: 'transactions_export',
      resource: 'ledger',
      newValue: { rows: 1, truncated: false, aborted: false },
      metadata: expect.objectContaining({ filters: expect.objectContaining({ types: ['order_purchase'] }) }),
    }), req);
  });

  it('controller rejects bad filters before sending any bytes', async () => {
    const res: any = { setHeader: vi.fn(), write: vi.fn() };
    const next = vi.fn();
    await controller.exportCsv({ query: { from: 'nope' }, user: { id: 'admin1' } } as any, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(res.write).not.toHaveBeenCalled();
  });

  it('is mounted admin|root with a rate limiter; reconcile is root-only; static paths precede :id', () => {
    const routes = (adminRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({ path: layer.route.path, handlers: layer.route.stack.map((s: any) => s.handle.name) }));
    const exportRoute = routes.find((r: any) => r.path === '/transactions/export.csv');
    expect(exportRoute.handlers[0]).toBe('requireWebsiteAdmin');
    expect(exportRoute.handlers).toHaveLength(3); // guard, rate limiter, handler
    expect(routes.find((r: any) => r.path === '/ledger/reconcile').handlers[0]).toBe('requireRoot');
    const paths = routes.map((r: any) => r.path);
    expect(paths.indexOf('/transactions/summary')).toBeLessThan(paths.indexOf('/transactions/:id'));
    expect(paths.indexOf('/transactions/export.csv')).toBeLessThan(paths.indexOf('/transactions/:id'));
  });
});

// ------------------------------------------------------------------------- reconcile

describe('ledger reconciliation', () => {
  const accounts = [
    { id: 'a1', key: 'user:u1:available:IC', type: 'available', userId: 'u1', balance: 800n },
    { id: 'a2', key: 'user:u1:refundable:IC', type: 'refundable', userId: 'u1', balance: 0n },
    { id: 'a3', key: 'user:u2:available:IC', type: 'available', userId: 'u2', balance: 999n }, // drifted
    { id: 'sys', key: 'system:issuance:IC', type: 'system_issuance', userId: null, balance: -1700n },
  ];

  it('compareBalances detects a cached-balance mismatch, a pointsBalance drift and an unbalanced txn', () => {
    const sums = new Map([['a1', 800n], ['a3', 900n], ['sys', -1700n]]);
    const result = compareBalances(accounts, sums, [
      { id: 'u1', pointsBalance: 800n },
      { id: 'u2', pointsBalance: 900n },
      { id: 'u3', pointsBalance: 50n }, // no wallet account at all
    ], [{ transactionId: 'tx-bad', sum: 3n }]);

    expect(result.ok).toBe(false);
    expect(result.checkedAccounts).toBe(4);
    expect(result.mismatches).toEqual([{
      accountId: 'a3', accountKey: 'user:u2:available:IC', accountType: 'available', userId: 'u2',
      cachedBalance: '999', ledgerSum: '900', difference: '99',
    }]);
    expect(result.legacyPointsMismatches).toEqual([{
      userId: 'u3', pointsBalance: '50', availableAccountId: null, availableBalance: null, ledgerSum: '0', difference: '50',
    }]);
    expect(result.unbalancedTransactions).toEqual([{ transactionId: 'tx-bad', sum: '3' }]);
  });

  it('compareBalances is ok when caches equal the ledger', () => {
    const result = compareBalances(accounts.slice(0, 2), new Map([['a1', 800n]]), [{ id: 'u1', pointsBalance: 800n }], []);
    expect(result).toMatchObject({ ok: true, mismatchCount: 0, legacyPointsMismatchCount: 0, unbalancedTransactionCount: 0 });
  });

  it('reconcileLedger reads one snapshot and reports drift', async () => {
    db.walletAccount.findMany.mockResolvedValueOnce(accounts);
    db.ledgerEntry.groupBy.mockImplementation((args: any) => Promise.resolve(args.by[0] === 'accountId'
      ? [{ accountId: 'a1', _sum: { amount: 800n } }, { accountId: 'a3', _sum: { amount: 999n } }, { accountId: 'sys', _sum: { amount: -1799n } }]
      : []));
    db.user.findMany.mockResolvedValueOnce([{ id: 'u1', pointsBalance: 800n }, { id: 'u2', pointsBalance: 1000n }]);

    const result = await reconcileLedger();

    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' });
    expect(result.mismatches.map((m) => m.accountId)).toEqual(['sys']);
    expect(result.legacyPointsMismatches).toEqual([expect.objectContaining({ userId: 'u2', pointsBalance: '1000', ledgerSum: '999' })]);
  });

  it('scheduled tick takes the Redis lock, emits admin:ledger:mismatch to room admin, and audits', async () => {
    const fake = fakeIo();
    setRealtimeServer(fake.io);
    const lock = { status: 'ready', set: vi.fn().mockResolvedValue('OK') };
    const drift = compareBalances(accounts, new Map([['a1', 800n], ['a3', 900n], ['sys', -1700n]]), [], []);
    const scheduler = new LedgerReconcileScheduler(15 * 60 * 1000, lock, async () => drift);

    expect(await scheduler.tick()).toBe(drift);

    expect(lock.set).toHaveBeenCalledWith(RECONCILE_LOCK_KEY, expect.any(String), 'PX', 15 * 60 * 1000 - 30_000, 'NX');
    expect(fake.emitted).toEqual([{
      room: 'admin',
      event: 'admin:ledger:mismatch',
      payload: expect.objectContaining({
        checkedAccounts: 4, mismatchCount: 1, legacyPointsMismatchCount: 0, unbalancedTransactionCount: 0,
        sample: [{ accountId: 'a3', userId: 'u2', cachedBalance: '999', ledgerSum: '900' }],
      }),
    }]);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ledger_mismatch_detected', status: 'failure' }));
  });

  it('scheduled tick is silent when clean and skips when another replica holds the lock', async () => {
    const fake = fakeIo();
    setRealtimeServer(fake.io);
    const clean = compareBalances([], new Map(), [], []);
    const run = vi.fn(async () => clean);

    const held = new LedgerReconcileScheduler(60_000, { status: 'ready', set: vi.fn().mockResolvedValue(null) }, run);
    expect(await held.tick()).toBeNull();
    expect(run).not.toHaveBeenCalled();

    const notReady = new LedgerReconcileScheduler(60_000, { status: 'reconnecting', set: vi.fn() }, run);
    expect(await notReady.tick()).toBeNull();

    const owner = new LedgerReconcileScheduler(60_000, { status: 'ready', set: vi.fn().mockResolvedValue('OK') }, run);
    expect(await owner.tick()).toBe(clean);
    expect(fake.emitted).toEqual([]);
  });

  it('Redis outage is never silent: warns per skipped window, then runs without the lock and audits once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clean = compareBalances([], new Map(), [], []);
    const run = vi.fn(async () => clean);
    const lock = { status: 'reconnecting', set: vi.fn() };
    const scheduler = new LedgerReconcileScheduler(60_000, lock, run, 2);

    expect(await scheduler.tick()).toBeNull();
    expect(await scheduler.tick()).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);

    // Third window still without Redis: runs read-only without the lock, audits the degradation once.
    expect(await scheduler.tick()).toBe(clean);
    expect(await scheduler.tick()).toBe(clean);
    expect(run).toHaveBeenCalledTimes(2);
    const degraded = vi.mocked(auditService.log).mock.calls.filter(([entry]: any) => entry.action === 'ledger_reconcile_degraded');
    expect(degraded).toHaveLength(1);
    expect(lock.set).not.toHaveBeenCalled();

    // Redis back: the lock is used again and the counter resets.
    lock.status = 'ready';
    lock.set.mockResolvedValueOnce('OK');
    expect(await scheduler.tick()).toBe(clean);
    expect(scheduler.skippedWindows).toBe(0);
    warn.mockRestore();
  });

  it('compareBalances reports IC parked in refundable sub-accounts without failing ok', () => {
    const rows = [
      { id: 'r1', key: 'user:u1:refundable:IC', type: 'refundable', userId: 'u1', balance: 250n },
      { id: 'r2', key: 'user:u2:refundable:IC', type: 'refundable', userId: 'u2', balance: 0n },
    ];
    const result = compareBalances(rows, new Map([['r1', 250n]]), [], []);
    expect(result).toMatchObject({
      ok: true,
      refundableBalanceCount: 1,
      refundableTotal: '250',
      refundableBalances: [{ accountId: 'r1', userId: 'u1', balance: '250' }],
    });
  });

  it('GET /admin/ledger/reconcile returns the result and audits it', async () => {
    db.walletAccount.findMany.mockResolvedValueOnce([]);
    db.ledgerEntry.groupBy.mockResolvedValue([]);
    db.user.findMany.mockResolvedValueOnce([]);
    const res: any = { json: vi.fn() };
    const next = vi.fn();
    const req: any = { user: { id: 'root1' } };
    await controller.reconcile(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, checkedAccounts: 0, mismatches: [], legacyPointsMismatches: [] }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ledger_reconcile', userId: 'root1' }), req);
  });
});

// ------------------------------------------------------------------------- admin:transaction

describe('walletService.post -> admin:transaction', () => {
  const accounts = [
    { id: 'a1', key: 'user:u1:available:IC', userId: 'u1', type: 'available', status: 'active', balance: 10n },
    { id: 'a2', key: 'system:revenue:IC', userId: null, type: 'platform_revenue', status: 'active', balance: 0n },
  ];
  const input = {
    idempotencyKey: 'checkout:commit:s1',
    type: 'checkout_purchase',
    referenceType: 'checkout',
    referenceId: 's1',
    entries: [
      { accountKey: 'user:u1:available:IC', amount: -5n },
      { accountKey: 'system:revenue:IC', amount: 5n },
    ],
  };

  function ledgerTx(existing: any = null) {
    return {
      ledgerTransaction: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockResolvedValue({ id: 'tx-1' }),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'tx-1', entries: [] }),
      },
      walletAccount: {
        findMany: vi.fn().mockResolvedValue(accounts),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }: any) => Promise.resolve({ ...accounts.find((a) => a.id === where.id), balance: 5n })),
      },
      ledgerEntry: { create: vi.fn() },
      user: { update: vi.fn() },
    };
  }

  const adminEvents = (emitted: any[]) => emitted.filter((e) => e.event === 'admin:transaction');

  it('emits exactly one admin:transaction to room admin, only after the caller transaction commits', async () => {
    const fake = fakeIo();
    setRealtimeServer(fake.io);
    db.walletAccount.findMany.mockResolvedValue([{ type: 'available', balance: 5n }]);
    db.user.findUnique.mockResolvedValue({ id: 'u1', discordUsername: 'Heart' });

    await withAfterCommitScope(async () => {
      await walletService.post(input, ledgerTx() as any);
      await flush();
      expect(adminEvents(fake.emitted)).toHaveLength(0); // nothing leaves before commit
    });
    await flush();
    await flush();

    const events = adminEvents(fake.emitted);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      room: 'admin',
      event: 'admin:transaction',
      payload: {
        id: 'tx-1',
        type: 'checkout_purchase',
        typeLabelTh: 'ซื้อสินค้า (ตะกร้า)',
        amount: '-5',
        user: { id: 'u1', name: 'Heart' },
        referenceType: 'checkout',
        referenceId: 's1',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
  });

  it('emits nothing when the caller transaction rolls back', async () => {
    const fake = fakeIo();
    setRealtimeServer(fake.io);
    await expect(withAfterCommitScope(async () => {
      await walletService.post(input, ledgerTx() as any);
      throw new Error('stock check failed');
    })).rejects.toThrow();
    await flush();
    await flush();
    expect(adminEvents(fake.emitted)).toHaveLength(0);
  });

  it('emits nothing for an idempotent replay', async () => {
    const fake = fakeIo();
    setRealtimeServer(fake.io);
    const sorted = [...input.entries].sort((a, b) => a.accountKey.localeCompare(b.accountKey));
    const existing = { id: 'tx-old', requestHash: walletRequestHashFor(input, sorted), entries: [] };
    await withAfterCommitScope(async () => {
      await walletService.post(input, ledgerTx(existing) as any);
    });
    await flush();
    await flush();
    expect(fake.emitted).toHaveLength(0);
  });
});
