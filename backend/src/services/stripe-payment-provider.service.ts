import crypto from 'node:crypto';
import Stripe from 'stripe';
import { AppError } from '../middlewares/errorHandler.js';
import type { PaymentProvider, ProviderIntentRequest, ProviderIntentResult, ProviderWebhook } from './payment-provider.service.js';

/** Sandbox only. Live payments require a separate reviewed rollout. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    secretKey = process.env.STRIPE_SECRET_KEY || '',
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '',
    private readonly origin = process.env.STRIPE_CHECKOUT_ORIGIN || '',
  ) {
    if (!/^(sk|rk)_test_/.test(secretKey)) throw new AppError('Stripe sandbox key is not configured', 503);
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
  }

  async createIntent(request: ProviderIntentRequest): Promise<ProviderIntentResult> {
    if (!this.webhookSecret) throw new AppError('Stripe webhook is not configured', 503);
    let origin: URL;
    try { origin = new URL(this.origin); } catch { throw new AppError('Stripe checkout origin is not configured', 503); }
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
      throw new AppError('Stripe checkout requires a secure origin', 503);
    }
    if (!/^\d+(\.\d{1,2})?$/.test(request.amountThb)) throw new AppError('Invalid payment amount', 400);
    const [whole, fraction = ''] = request.amountThb.split('.');
    const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
    if (cents < 1n || cents > 99_999_999n) throw new AppError('Payment amount is out of range', 400);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: request.reference,
      metadata: { iris_reference: request.reference },
      line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: Number(cents), product_data: { name: 'IRIS Coin — sandbox top-up' } } }],
      success_url: `${origin.origin}/topup?checkout=returned&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin.origin}/topup?checkout=cancelled`,
      // Stripe defaults to 24 hours; a stable request also makes retries deterministic.
    }, { idempotencyKey: crypto.createHash('sha256').update(request.idempotencyKey).digest('hex') });
    if (session.livemode || !session.url) throw new AppError('Invalid Stripe sandbox session', 502);
    return { providerIntentId: session.id, paymentUrl: session.url, qrPayload: '', expiresAt: new Date(session.expires_at * 1000) };
  }

  verifyAndParseWebhook(payload: unknown, signature: string | undefined): ProviderWebhook | null {
    if (!this.webhookSecret) throw new AppError('Stripe webhook is not configured', 503);
    if (!Buffer.isBuffer(payload) || !signature) throw new AppError('Missing raw Stripe payload or signature', 401);
    let event: Stripe.Event;
    try { event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret); }
    catch { throw new AppError('Invalid Stripe webhook signature', 401); }
    if (event.livemode) throw new AppError('Live Stripe events are disabled', 400);
    const statuses = {
      'checkout.session.completed': 'paid',
      'checkout.session.async_payment_succeeded': 'paid',
      'checkout.session.async_payment_failed': 'failed',
      'checkout.session.expired': 'expired',
    } as const;
    if (!(event.type in statuses)) return null;
    const session = event.data.object as Stripe.Checkout.Session;
    const status = statuses[event.type as keyof typeof statuses];
    if (status === 'paid' && session.payment_status !== 'paid') return null;
    if (session.livemode || session.mode !== 'payment' || session.currency !== 'thb' || !Number.isSafeInteger(session.amount_total) || session.amount_total! <= 0 || !session.client_reference_id) {
      throw new AppError('Invalid Stripe payment details', 400);
    }
    const amount = BigInt(session.amount_total!);
    return { eventId: event.id, providerIntentId: session.id, reference: session.client_reference_id, status,
      amountThb: `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}` };
  }
}
