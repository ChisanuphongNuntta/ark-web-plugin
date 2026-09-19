import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { StripePaymentProvider } from '../../src/services/stripe-payment-provider.service.js';

const secret = 'whsec_local_unit_test';
const stripe = new Stripe('sk_test_unit_test');
const provider = new StripePaymentProvider('sk_test_unit_test', secret, 'https://localhost');
function signed(overrides: Record<string, unknown> = {}, type = 'checkout.session.completed', live = false) {
  const payload = JSON.stringify({ id: 'evt_test', object: 'event', type, livemode: live, data: { object: {
    id: 'cs_test_123', livemode: false, mode: 'payment', payment_status: 'paid', currency: 'thb', amount_total: 3500,
    client_reference_id: 'IRIS-123', ...overrides,
  } } });
  return { payload: Buffer.from(payload), signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
}
describe('Stripe sandbox provider', () => {
  it('rejects live keys', () => expect(() => new StripePaymentProvider('sk_live_invalid')).toThrow('sandbox key'));
  it('validates a signed paid checkout using exact minor units', () => {
    const event = signed();
    expect(provider.verifyAndParseWebhook(event.payload, event.signature)).toEqual({ eventId: 'evt_test', providerIntentId: 'cs_test_123', reference: 'IRIS-123', status: 'paid', amountThb: '35.00' });
  });
  it('rejects missing and tampered signatures', () => {
    const event = signed();
    expect(() => provider.verifyAndParseWebhook(event.payload, undefined)).toThrow();
    expect(() => provider.verifyAndParseWebhook(Buffer.from('{}'), event.signature)).toThrow();
  });
  it('does not credit unpaid checkout completion', () => {
    const event = signed({ payment_status: 'unpaid' });
    expect(provider.verifyAndParseWebhook(event.payload, event.signature)).toBeNull();
  });
  it.each([{ currency: 'usd' }, { client_reference_id: null }, { amount_total: 35.5 }, { livemode: true }, { mode: 'subscription' }])('rejects mismatched payment details %j', details => {
    const event = signed(details);
    expect(() => provider.verifyAndParseWebhook(event.payload, event.signature)).toThrow();
  });
  it('ignores unrelated signed events', () => {
    const event = signed({}, 'payment_intent.created');
    expect(provider.verifyAndParseWebhook(event.payload, event.signature)).toBeNull();
  });
  it('rejects live events', () => {
    const event = signed({}, 'checkout.session.completed', true);
    expect(() => provider.verifyAndParseWebhook(event.payload, event.signature)).toThrow();
  });
  it('refuses checkout before webhook configuration', async () => {
    await expect(new StripePaymentProvider('sk_test_unit_test', '', 'https://localhost').createIntent({ idempotencyKey: 'a', reference: 'b', amountThb: '35', expiresAt: new Date() })).rejects.toThrow('webhook');
  });
});
