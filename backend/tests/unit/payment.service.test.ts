import crypto from 'crypto';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { AppError } from '../../src/middlewares/errorHandler.js';
import { SandboxPaymentProvider } from '../../src/services/payment-provider.service.js';
import paymentService from '../../src/services/payment.service.js';
import walletService from '../../src/services/wallet.service.js';

vi.mock('../../src/services/wallet.service.js', () => ({
  default: { creditUser: vi.fn() },
}));

const db = prisma as any;

const paymentPackage = {
  id: 'pkg-100', slug: 'iris-100', name: '100 Iris Coin', priceThb: '35.00',
  points: 100n, bonusPoints: 10n, isActive: true, sortOrder: 1,
};

const intent = {
  id: 'pi-1', userId: 'u1', packageId: 'pkg-100', provider: 'sandbox',
  providerIntentId: 'sb-1', reference: 'IRIS-1', idempotencyKey: 'idem-1',
  amountThb: '35.00', pointsAmount: 110n, status: 'pending',
  expiresAt: new Date(Date.now() + 60_000),
};

const sign = (payload: unknown) => crypto.createHmac('sha256', 'test-secret')
  .update(JSON.stringify(payload)).digest('hex');

describe('Payment sandbox', () => {
  beforeEach(() => {
    process.env.PAYMENT_SANDBOX_ENABLED = 'true';
    vi.clearAllMocks();
    process.env.PAYMENT_SANDBOX_WEBHOOK_SECRET = 'test-secret';
    db.paymentPackage = { findMany: vi.fn(), findUnique: vi.fn() };
    db.paymentIntent = {
      findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    };
    db.paymentWebhookEvent = {
      findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
    };
    db.$transaction.mockImplementation((callback: any) => callback(db));
  });

  it('rejects a webhook with an invalid HMAC', () => {
    const provider = new SandboxPaymentProvider('test-secret');
    expect(() => provider.verifyAndParseWebhook({ eventId: 'evt-1' }, '00'.repeat(32)))
      .toThrowError(AppError);
  });

  it('returns the original intent when an idempotency key is replayed', async () => {
    db.paymentIntent.findUnique.mockResolvedValue(intent);

    const result = await paymentService.createIntent('u1', 'pkg-100', 'idem-1', 'sandbox');

    expect(result.replayed).toBe(true);
    expect(result.intent.pointsAmount).toBe('110');
    expect(db.paymentPackage.findUnique).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for another request', async () => {
    db.paymentIntent.findUnique.mockResolvedValue(intent);

    await expect(paymentService.createIntent('u1', 'another-package', 'idem-1', 'sandbox'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates a provider intent from the immutable package price and points', async () => {
    db.paymentIntent.findUnique.mockResolvedValue(null);
    db.paymentPackage.findUnique.mockResolvedValue(paymentPackage);
    db.paymentIntent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'pi-new', status: 'pending', ...data }));

    const result = await paymentService.createIntent('u1', 'pkg-100', 'idem-new', 'sandbox');

    expect(result.replayed).toBe(false);
    expect(db.paymentIntent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'u1', packageId: 'pkg-100', amountThb: '35.00', pointsAmount: 110n,
    }) });
  });

  it('credits the wallet once with a stable ledger idempotency key', async () => {
    const payload = { eventId: 'evt-1', providerIntentId: 'sb-1', reference: 'IRIS-1', status: 'paid', amountThb: '35.00' };
    const event = { id: 'we-1', status: 'received', paymentIntentId: 'pi-1' };
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentIntent.findUnique.mockResolvedValue(intent);
    db.paymentWebhookEvent.create.mockResolvedValue(event);
    db.paymentWebhookEvent.update.mockResolvedValue(event);
    db.paymentIntent.updateMany.mockResolvedValue({ count: 1 });
    db.paymentIntent.update.mockResolvedValue({ ...intent, status: 'completed' });
    vi.mocked(walletService.creditUser).mockResolvedValue({} as any);

    const result = await paymentService.processWebhook('sandbox', payload, sign(payload));

    expect(result).toMatchObject({ accepted: true, credited: true, points: '110' });
    expect(walletService.creditUser).toHaveBeenCalledWith('u1', 110n, 'payment:pi-1:credit', 'payment_topup', 'pi-1', db, { referenceType: 'payment_intent' });
    expect(db.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'pi-1' }, data: expect.objectContaining({ status: 'completed' }),
    });
  });

  it('acknowledges an already processed provider event without crediting again', async () => {
    const payload = { eventId: 'evt-1', providerIntentId: 'sb-1', status: 'paid', amountThb: '35.00' };
    db.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'we-1',
      status: 'processed',
      payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    });

    const result = await paymentService.processWebhook('sandbox', payload, sign(payload));

    expect(result).toEqual({ accepted: true, duplicate: true });
    expect(walletService.creditUser).not.toHaveBeenCalled();
    expect(db.paymentIntent.findUnique).not.toHaveBeenCalled();
  });

  it('does not credit when the signed amount differs from the intent', async () => {
    const payload = { eventId: 'evt-bad', providerIntentId: 'sb-1', status: 'paid', amountThb: '34.00' };
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentIntent.findUnique.mockResolvedValue(intent);
    db.paymentWebhookEvent.create.mockResolvedValue({ id: 'we-bad', status: 'received' });
    db.paymentWebhookEvent.update.mockResolvedValue({});

    await expect(paymentService.processWebhook('sandbox', payload, sign(payload)))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });

  it('accepts a semantically identical signed Stripe retry despite JSON formatting', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    const payload = { id: 'evt_stripe_retry', type: 'checkout.session.completed', livemode: false, data: { object: {
      id: 'cs_test_1', mode: 'payment', currency: 'thb', amount_total: 3500, client_reference_id: 'IRIS-1', payment_status: 'paid', livemode: false,
    } } };
    db.paymentWebhookEvent.findUnique.mockResolvedValue({ status: 'processed', payload, payloadHash: 'old-serialization-hash' });
    const raw = JSON.stringify(payload, null, 2);
    const signature = new Stripe('sk_test_unit').webhooks.generateTestHeaderString({ payload: raw, secret: 'whsec_unit' });
    await expect(paymentService.processWebhook('stripe', Buffer.from(raw), signature)).resolves.toEqual({ accepted: true, duplicate: true });
    expect(walletService.creditUser).not.toHaveBeenCalled();
  });
});

describe('Sandbox payments gate', () => {
  it('refuses the sandbox provider when PAYMENT_SANDBOX_ENABLED is not "true"', async () => {
    const previous = process.env.PAYMENT_SANDBOX_ENABLED;
    delete process.env.PAYMENT_SANDBOX_ENABLED;
    try {
      await expect(paymentService.createIntent('u1', 'pkg-100', 'k-1', 'sandbox', true)).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_SANDBOX_ENABLED; else process.env.PAYMENT_SANDBOX_ENABLED = previous;
    }
  });

  it('only lets admin/root use sandbox, and only with the env switch on', async () => {
    const { sandboxPaymentsAllowedFor } = await import('../../src/controllers/payment.controller.js');
    const on = { PAYMENT_SANDBOX_ENABLED: 'true' } as NodeJS.ProcessEnv;
    expect(sandboxPaymentsAllowedFor({ id: 'u', role: 'user' } as any, on)).toBe(false);
    expect(sandboxPaymentsAllowedFor({ id: 'u', role: 'server_admin' } as any, on)).toBe(false);
    expect(sandboxPaymentsAllowedFor({ id: 'a', role: 'admin' } as any, on)).toBe(true);
    expect(sandboxPaymentsAllowedFor({ id: 'r', role: 'root' } as any, on)).toBe(true);
    expect(sandboxPaymentsAllowedFor({ id: 'r', role: 'root' } as any, {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('bank slip top-up submission (server-priced)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.paymentPackage = { findMany: vi.fn(), findUnique: vi.fn() };
    db.paymentIntent = { findUnique: vi.fn(), create: vi.fn(async ({ data }: any) => ({ id: 'pi-slip', createdAt: new Date(), ...data })), update: vi.fn(), updateMany: vi.fn() };
  });

  it('takes amount, IC and name from the package and ignores client-sent values', async () => {
    db.paymentPackage.findUnique.mockResolvedValueOnce(paymentPackage);
    const { PaymentController } = await import('../../src/controllers/payment.controller.js');
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    await new PaymentController().submitSlip({
      user: { id: 'u1' },
      body: { packageId: 'pkg-100', amountThb: 35, pointsToCredit: 10_000_000, packageName: 'Starter Pack', transferRef: 'KB-1' },
    } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    const data = db.paymentIntent.create.mock.calls[0][0].data;
    expect(data.pointsAmount).toBe(110n);
    expect(String(data.amountThb)).toBe('35.00');
    expect(data.packageId).toBe('pkg-100');
    expect(data.metadata.packageName).toBe('100 Iris Coin');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('404s an unknown or inactive package instead of falling back', async () => {
    db.paymentPackage.findUnique.mockResolvedValue(null);
    await expect(paymentService.submitTopupSlip('u1', 'pkg-4', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    db.paymentPackage.findUnique.mockResolvedValue({ ...paymentPackage, isActive: false });
    await expect(paymentService.submitTopupSlip('u1', 'pkg-100', { transferRef: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('rejects non https / non /path slip URLs', async () => {
    db.paymentPackage.findUnique.mockResolvedValue(paymentPackage);
    for (const url of ['javascript:alert(1)', 'blob:http://x/1', '//evil.example/a.png', 'http://plain.example/a.png']) {
      await expect(paymentService.submitTopupSlip('u1', 'pkg-100', { slipImageUrl: url })).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
  });
});
