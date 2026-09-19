import crypto from 'crypto';
import { AppError } from '../middlewares/errorHandler.js';
import { StripePaymentProvider } from './stripe-payment-provider.service.js';

export type ProviderPaymentStatus = 'paid' | 'failed' | 'expired';

export interface ProviderIntentRequest {
  idempotencyKey: string;
  reference: string;
  amountThb: string;
  expiresAt: Date;
}

export interface ProviderIntentResult {
  expiresAt?: Date;
  providerIntentId: string;
  paymentUrl: string;
  qrPayload: string;
}

export interface ProviderWebhook {
  eventId: string;
  providerIntentId: string;
  reference?: string;
  status: ProviderPaymentStatus;
  amountThb: string;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(request: ProviderIntentRequest): Promise<ProviderIntentResult>;
  verifyAndParseWebhook(payload: unknown, signature: string | undefined): ProviderWebhook | null;
}

export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  constructor(private readonly webhookSecret = process.env.PAYMENT_SANDBOX_WEBHOOK_SECRET || '') {}

  async createIntent(request: ProviderIntentRequest): Promise<ProviderIntentResult> {
    const providerIntentId = `sb_${crypto.createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 32)}`;
    return {
      providerIntentId,
      paymentUrl: `https://sandbox-pay.iris.local/pay/${providerIntentId}`,
      qrPayload: `IRIS|SANDBOX|${providerIntentId}|${request.amountThb}|${request.reference}`,
    };
  }

  verifyAndParseWebhook(payload: any, signature: string | undefined): ProviderWebhook {
    if (!this.webhookSecret) throw new AppError('Sandbox webhook secret is not configured', 503);
    if (!signature) throw new AppError('Missing webhook signature', 401);

    const rawPayload = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8');
    const expected = crypto.createHmac('sha256', this.webhookSecret)
      .update(rawPayload)
      .digest('hex');
    const received = signature.replace(/^sha256=/, '').toLowerCase();
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = /^[a-f0-9]{64}$/.test(received) ? Buffer.from(received, 'hex') : Buffer.alloc(0);
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new AppError('Invalid webhook signature', 401);
    }

    if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString('utf8'));
      } catch {
        throw new AppError('Invalid webhook JSON', 400);
      }
    }

    const eventId = payload?.eventId;
    const providerIntentId = payload?.providerIntentId;
    const status = payload?.status;
    const amountThb = payload?.amountThb;
    if (typeof eventId !== 'string' || !eventId.trim() || typeof providerIntentId !== 'string' || !providerIntentId.trim()) {
      throw new AppError('Invalid webhook identifiers', 400);
    }
    if (!['paid', 'failed', 'expired'].includes(status) || (typeof amountThb !== 'string' && typeof amountThb !== 'number')) {
      throw new AppError('Invalid webhook payload', 400);
    }
    return { eventId, providerIntentId, reference: payload.reference, status, amountThb: String(amountThb) };
  }
}

export const getPaymentProvider = (name: string): PaymentProvider => {
  if (name === 'stripe') return new StripePaymentProvider();
  if (name === 'sandbox') return new SandboxPaymentProvider();
  throw new AppError(`Unsupported payment provider: ${name}`, 400);
};
