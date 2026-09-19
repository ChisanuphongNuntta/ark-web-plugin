import crypto from 'crypto';
import { PaymentIntentStatus, Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService from './wallet.service.js';
import { getPaymentProvider } from './payment-provider.service.js';

const asCents = (value: string | number | Prisma.Decimal) => {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new AppError('Invalid payment amount', 400);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};

const serializeIntent = (intent: any) => ({
  ...intent,
  amountThb: String(intent.amountThb),
  pointsAmount: intent.pointsAmount.toString(),
});

const canonicalJson = (value: any): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

export class PaymentService {
  async listPackages() {
    const packages = await prisma.paymentPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return packages.map((item) => ({
      ...item,
      priceThb: String(item.priceThb),
      points: item.points.toString(),
      bonusPoints: item.bonusPoints.toString(),
      totalPoints: (item.points + item.bonusPoints).toString(),
    }));
  }

  async createIntent(userId: string, packageId: string, idempotencyKey: string, providerName = 'sandbox') {
    if (!idempotencyKey?.trim()) throw new AppError('Idempotency-Key header is required', 400);
    if (idempotencyKey.length > 255) throw new AppError('Idempotency-Key must not exceed 255 characters', 400);
    if (!packageId) throw new AppError('packageId is required', 400);

    const existing = await prisma.paymentIntent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) {
      if (existing.userId !== userId || existing.packageId !== packageId || existing.provider !== providerName) {
        throw new AppError('Idempotency key was already used for a different payment', 409);
      }
      return { intent: serializeIntent(existing), replayed: true };
    }

    const paymentPackage = await prisma.paymentPackage.findUnique({ where: { id: packageId } });
    if (!paymentPackage || !paymentPackage.isActive) throw new AppError('Payment package not found', 404);
    const provider = getPaymentProvider(providerName);
    const stableKey = `${userId}:${idempotencyKey}`;
    const reference = `IRIS-${crypto.createHash('sha256').update(stableKey).digest('hex').slice(0, 32).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const providerIntent = await provider.createIntent({
      idempotencyKey: stableKey,
      reference,
      amountThb: String(paymentPackage.priceThb),
      expiresAt,
    });

    try {
      const intent = await prisma.paymentIntent.create({
        data: {
          userId,
          packageId,
          provider: provider.name,
          providerIntentId: providerIntent.providerIntentId,
          reference,
          idempotencyKey,
          amountThb: paymentPackage.priceThb,
          pointsAmount: paymentPackage.points + paymentPackage.bonusPoints,
          paymentUrl: providerIntent.paymentUrl,
          qrPayload: providerIntent.qrPayload,
          expiresAt: providerIntent.expiresAt || expiresAt,
        },
      });
      return { intent: serializeIntent(intent), replayed: false };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await prisma.paymentIntent.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (!raced || raced.userId !== userId || raced.packageId !== packageId || raced.provider !== providerName) {
        throw new AppError('Idempotency key conflict', 409);
      }
      return { intent: serializeIntent(raced), replayed: true };
    }
  }

  async getIntent(userId: string, intentId: string) {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.userId !== userId) throw new AppError('Payment intent not found', 404);
    return serializeIntent(intent);
  }

  async processWebhook(providerName: string, payload: unknown, signature?: string) {
    const provider = getPaymentProvider(providerName);
    const payloadBytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8');
    const payloadHash = crypto.createHash('sha256').update(payloadBytes).digest('hex');
    let payloadJson: Prisma.InputJsonValue;
    try {
      payloadJson = (Buffer.isBuffer(payload) ? JSON.parse(payload.toString('utf8')) : payload) as Prisma.InputJsonValue;
    } catch {
      throw new AppError('Invalid webhook JSON', 400);
    }
    const webhook = provider.verifyAndParseWebhook(payload, signature);
    if (!webhook) return { accepted: true, ignored: true };
    let event = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_providerEventId: { provider: provider.name, providerEventId: webhook.eventId } },
    });
    const matchesRecorded = (recorded: any) => recorded.payloadHash === payloadHash ||
      (providerName === 'stripe' && canonicalJson(recorded.payload) === canonicalJson(payloadJson));
    if (event && !matchesRecorded(event)) {
      throw new AppError('Webhook event ID was reused with a different payload', 409);
    }
    if (event?.status === 'processed' || event?.status === 'duplicate') {
      return { accepted: true, duplicate: true };
    }

    const intent = await prisma.paymentIntent.findUnique({
      where: {
        provider_providerIntentId: {
          provider: provider.name,
          providerIntentId: webhook.providerIntentId,
        },
      },
    });
    if (!intent || intent.provider !== provider.name) throw new AppError('Payment intent not found', 404);

    if (!event) {
      try {
        event = await prisma.paymentWebhookEvent.create({
          data: {
            provider: provider.name,
            providerEventId: webhook.eventId,
            paymentIntentId: intent.id,
            signature,
            payload: payloadJson,
            payloadHash,
            status: 'received',
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        event = await prisma.paymentWebhookEvent.findUnique({
          where: { provider_providerEventId: { provider: provider.name, providerEventId: webhook.eventId } },
        });
        if (event && !matchesRecorded(event)) {
          throw new AppError('Webhook event ID was reused with a different payload', 409);
        }
        if (event?.status === 'processed' || event?.status === 'duplicate') return { accepted: true, duplicate: true };
      }
    }
    if (!event) throw new AppError('Unable to record webhook event', 500);

    if (webhook.reference && webhook.reference !== intent.reference) {
      await this.failEvent(event.id, 'Reference mismatch');
      throw new AppError('Payment reference mismatch', 400);
    }
    if (asCents(webhook.amountThb) !== asCents(intent.amountThb)) {
      await this.failEvent(event.id, 'Amount mismatch');
      throw new AppError('Payment amount mismatch', 400);
    }

    if (webhook.status !== 'paid') {
      const targetStatus = webhook.status === 'expired' ? PaymentIntentStatus.expired : PaymentIntentStatus.failed;
      const transitioned = await prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: PaymentIntentStatus.pending },
        data: { status: targetStatus },
      });
      if (transitioned.count !== 1) {
        await prisma.paymentWebhookEvent.update({
          where: { id: event.id }, data: { status: 'duplicate', processedAt: new Date(), error: 'Intent already claimed' },
        });
        return { accepted: true, duplicate: true };
      }
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id }, data: { status: 'processed', processedAt: new Date() },
      });
      return { accepted: true, credited: false, status: targetStatus };
    }

    if (intent.status === PaymentIntentStatus.completed) {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id }, data: { status: 'duplicate', processedAt: new Date() },
      });
      return { accepted: true, duplicate: true };
    }

    const resumingClaim = event.status === 'processing';
    if (!resumingClaim) {
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { status: 'processing', error: null } });
      const claimed = await prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: PaymentIntentStatus.pending },
        data: { status: PaymentIntentStatus.processing },
      });
      if (claimed.count !== 1) {
        await prisma.paymentWebhookEvent.update({
          where: { id: event.id }, data: { status: 'duplicate', processedAt: new Date(), error: 'Intent already claimed' },
        });
        return { accepted: true, duplicate: true };
      }
    }

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await prisma.$transaction(async (tx) => {
            await walletService.creditUser(
              intent.userId,
              intent.pointsAmount,
              `payment:${intent.id}:credit`,
              'payment_topup',
              intent.id,
              tx,
            );
            await tx.paymentIntent.update({
              where: { id: intent.id },
              data: { status: PaymentIntentStatus.completed, completedAt: new Date() },
            });
            await tx.paymentWebhookEvent.update({
              where: { id: event.id }, data: { status: 'processed', processedAt: new Date(), error: null },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          break;
        } catch (error) {
          if ((error as { code?: string }).code === 'P2034' && attempt < 3) continue;
          throw error;
        }
      }
      return { accepted: true, credited: true, points: intent.pointsAmount.toString(), intentId: intent.id };
    } catch (error: any) {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id }, data: { status: 'processing', error: String(error?.message || error) },
      });
      throw error;
    }
  }

  private async failEvent(eventId: string, error: string) {
    await prisma.paymentWebhookEvent.update({
      where: { id: eventId }, data: { status: 'failed', error, processedAt: new Date() },
    });
  }
}

export default new PaymentService();
