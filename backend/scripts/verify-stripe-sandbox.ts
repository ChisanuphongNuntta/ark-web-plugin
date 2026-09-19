import dotenv from 'dotenv';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import { StripePaymentProvider } from '../src/services/stripe-payment-provider.service.js';

dotenv.config({ path: '../.env.stripe.local' });
const provider = new StripePaymentProvider();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const request = { idempotencyKey: `iris-smoke-${crypto.randomUUID()}`, reference: `IRIS-SMOKE-${crypto.randomUUID()}`, amountThb: '35.00', expiresAt: new Date(Date.now() + 86400000) };
let sessionId: string | undefined;
try {
  const first = await provider.createIntent(request);
  sessionId = first.providerIntentId;
  const replay = await provider.createIntent(request);
  if (first.providerIntentId !== replay.providerIntentId) throw new Error('Stripe idempotency failed');
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.livemode || session.amount_total !== 3500 || session.currency !== 'thb' || session.client_reference_id !== request.reference) throw new Error('Stripe session verification failed');
  console.log('PASS: real Stripe test session, THB amount, reference, test mode, idempotent replay. No charge or wallet credit performed.');
} catch {
  console.error('FAIL: Stripe sandbox smoke check. Inspect local configuration; credentials are not printed.');
  process.exitCode = 1;
} finally {
  if (sessionId) {
    try { await stripe.checkout.sessions.expire(sessionId); console.log('Test checkout expired successfully.'); }
    catch { console.error('Could not expire smoke session; inspect Stripe test dashboard.'); process.exitCode = 1; }
  }
}
