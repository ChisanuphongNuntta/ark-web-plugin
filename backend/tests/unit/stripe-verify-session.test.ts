// POST /api/payments/verify-session (PaymentService.verifyStripeSession) — the success-page sync
// must never double-credit a Stripe top-up and never mint IC for a session the caller does not
// own (admin transactions 2026-10 review).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retrieve = vi.fn();
vi.mock('stripe', () => ({
  default: class FakeStripe {
    checkout = { sessions: { retrieve } };
  },
}));
vi.mock('../../src/services/wallet.service.js', () => ({
  default: { creditUser: vi.fn() },
}));

import prisma from '../../src/config/database.js';
import paymentService from '../../src/services/payment.service.js';
import walletService from '../../src/services/wallet.service.js';

const db = prisma as any;

const intent = (over: Record<string, unknown> = {}) => ({
  id: 'pi-1', userId: 'u1', packageId: 'pkg-100', provider: 'stripe',
  providerIntentId: 'cs_test_1', reference: 'IRIS-REF-1', idempotencyKey: 'idem-1',
  amountThb: '35.00', pointsAmount: 110n, status: 'pending', metadata: null,
  ...over,
});

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_1', livemode: false, mode: 'payment', currency: 'thb', amount_total: 3500,
  client_reference_id: 'IRIS-REF-1', payment_status: 'paid', status: 'complete',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
  db.paymentIntent = { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  db.$transaction.mockImplementation((callback: any) => callback(db));
});

describe('verifyStripeSession', () => {
  it('credits only an intent the caller owns (provider stripe), with the webhook key and shape', async () => {
    db.paymentIntent.findFirst.mockResolvedValueOnce(intent({ status: 'processing' }));
    retrieve.mockResolvedValueOnce(session());
    db.paymentIntent.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await paymentService.verifyStripeSession('u1', 'cs_test_1');

    expect(db.paymentIntent.findFirst).toHaveBeenCalledWith({
      where: { provider: 'stripe', providerIntentId: 'cs_test_1', userId: 'u1' },
    });
    // Conditional flip inside the credit transaction: pending|processing -> completed.
    expect(db.paymentIntent.updateMany.mock.calls[0][0].where).toEqual({
      id: 'pi-1', status: { in: ['pending', 'processing'] },
    });
    expect(walletService.creditUser).toHaveBeenCalledTimes(1);
    expect(walletService.creditUser).toHaveBeenCalledWith(
      'u1', 110n, 'payment:pi-1:credit', 'payment_topup', 'pi-1', db, { referenceType: 'payment_intent' },
    );
    expect(result).toMatchObject({ success: true, credited: true, points: '110', intentId: 'pi-1' });
  });

  it('webhook won the race (flip count 0): no second credit', async () => {
    db.paymentIntent.findFirst.mockResolvedValueOnce(intent({ status: 'processing' }));
    retrieve.mockResolvedValueOnce(session());
    db.paymentIntent.updateMany.mockResolvedValueOnce({ count: 0 });
    db.paymentIntent.findUnique.mockResolvedValueOnce(intent({ status: 'completed' }));

    const result = await paymentService.verifyStripeSession('u1', 'cs_test_1');

    expect(walletService.creditUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, alreadyCredited: true });
  });

  it('never re-credits a refunded / failed / expired intent', async () => {
    for (const status of ['refunded', 'failed', 'expired']) {
      db.paymentIntent.findFirst.mockResolvedValueOnce(intent({ status }));
      retrieve.mockResolvedValueOnce(session());
      await expect(paymentService.verifyStripeSession('u1', 'cs_test_1')).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(db.paymentIntent.updateMany).not.toHaveBeenCalled();
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });

  it('a paid session with no intent of this caller is 404 — nothing is minted', async () => {
    db.paymentIntent.findFirst.mockResolvedValueOnce(null);

    await expect(paymentService.verifyStripeSession('attacker', 'cs_test_other')).rejects.toMatchObject({ statusCode: 404 });

    expect(retrieve).not.toHaveBeenCalled();
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });

  it('validates the session like the webhook parser (mode, currency, amount, reference, livemode)', async () => {
    const bad = [
      { amount_total: 3600 },
      { amount_total: null },
      { currency: 'usd' },
      { mode: 'subscription' },
      { client_reference_id: 'IRIS-OTHER' },
      { livemode: true },
    ];
    for (const over of bad) {
      db.paymentIntent.findFirst.mockResolvedValueOnce(intent());
      retrieve.mockResolvedValueOnce(session(over));
      await expect(paymentService.verifyStripeSession('u1', 'cs_test_1')).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });

  it('does not credit a complete-but-unpaid (async) session', async () => {
    db.paymentIntent.findFirst.mockResolvedValueOnce(intent());
    retrieve.mockResolvedValueOnce(session({ payment_status: 'unpaid', status: 'complete' }));

    const result = await paymentService.verifyStripeSession('u1', 'cs_test_1');

    expect(result).toMatchObject({ success: false, paymentStatus: 'unpaid' });
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });
});
