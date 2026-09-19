import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const dbUrl = new URL(process.env.DATABASE_URL || '');
if (dbUrl.hostname !== 'sandbox-postgres' || dbUrl.pathname !== '/iris_sandbox' || !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Isolated sandbox only');
const db = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
try {
  const pending = await db.paymentWebhookEvent.findFirst({ where: { provider: 'stripe', status: 'processing' }, orderBy: { createdAt: 'desc' } });
  if (!pending) throw new Error('No sandbox event awaiting recovery');
  const response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(pending.providerEventId)}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  if (!response.ok) throw new Error('Stripe event retrieval failed');
  const raw = await response.text();
  const event = JSON.parse(raw);
  if (event.livemode || event.id !== pending.providerEventId) throw new Error('Not the expected test event');
  const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
  const original = pending.payload as any;
  if (event.id !== original.id || event.type !== original.type || original.livemode || canonical(event.data) !== canonical(original.data)) throw new Error('Stored event does not match Stripe evidence');
  const payload = JSON.stringify(original);
  for (let attempt = 0; attempt < 2; attempt++) {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const res = await fetch('http://127.0.0.1:3001/api/payments/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload });
    const result = await res.json();
    if (!res.ok || (attempt === 1 && !result.duplicate)) throw new Error('Sandbox replay failed');
    console.log(JSON.stringify({ attempt: attempt + 1, ...result }));
  }
  const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pending.paymentIntentId! } });
  const account = await db.walletAccount.findUniqueOrThrow({ where: { key: `user:${intent.userId}:available:IC` } });
  console.log(JSON.stringify({ status: intent.status, walletBalance: account.balance.toString() }));
} finally { await db.$disconnect(); }
