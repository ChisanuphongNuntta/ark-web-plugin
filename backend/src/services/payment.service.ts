import crypto from 'crypto';
import Stripe from 'stripe';
import { PaymentIntentStatus, Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService from './wallet.service.js';
import vipService, { formatThb, isSellablePrice } from './vip.service.js';
import { getPaymentProvider } from './payment-provider.service.js';
import { emitAdminSlipCreated } from '../realtime/emit.js';

const asCents = (value: string | number | Prisma.Decimal) => {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new AppError('Invalid payment amount', 400);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};

const serializeIntent = (intent: any) => ({
  ...intent,
  kind: intent.vipPackageId ? 'vip' : 'topup',
  amountThb: String(intent.amountThb),
  pointsAmount: intent.pointsAmount.toString(),
});

export type PaidIntent = {
  id: string;
  userId: string;
  vipPackageId?: string | null;
  pointsAmount: bigint;
  metadata?: unknown;
  provider?: string;
  amountThb?: unknown;
};

export type FulfillmentResult =
  | { kind: 'topup'; points: string }
  | { kind: 'vip'; membershipId: string; duplicate: boolean };

/**
 * The ONE completion step shared by every payment path (Stripe webhook, Stripe verify-session,
 * admin bank-slip approval). Callers flip the intent pending|processing -> completed in the same
 * transaction, which is what makes completion happen once per intent.
 *   - VIP intent (vipPackageId set): grant VIP. Never credits IC, whatever pointsAmount says.
 *   - Top-up intent: credit IC through walletService.creditUser with the caller's ledger key.
 */
export async function fulfillPaidIntent(
  tx: Prisma.TransactionClient,
  intent: PaidIntent,
  credit: {
    idempotencyKey: string;
    type: string;
    options: { referenceType?: string; description?: string; createdBy?: string };
    approvedBy?: string | null;
  },
): Promise<FulfillmentResult> {
  if (intent.vipPackageId) {
    const granted = await vipService.grantFromPaymentIntent(tx, {
      id: intent.id,
      userId: intent.userId,
      vipPackageId: intent.vipPackageId,
      metadata: intent.metadata,
      provider: intent.provider,
      amountThb: intent.amountThb,
    }, { approvedBy: credit.approvedBy ?? null });
    return { kind: 'vip', membershipId: granted.membership.id, duplicate: granted.duplicate };
  }
  await walletService.creditUser(
    intent.userId,
    intent.pointsAmount,
    credit.idempotencyKey,
    credit.type,
    intent.id,
    tx,
    credit.options,
  );
  return { kind: 'topup', points: intent.pointsAmount.toString() };
}

const SLIP_URL_PATTERN = /^(\/(?!\/)[^\s]{0,1023}|https:\/\/[^\s]{1,1016})$/i;

export interface VipSlipInput {
  slipImageUrl?: unknown;
  transferBank?: unknown;
  transferRef?: unknown;
  notes?: unknown;
}

function optionalText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new AppError(`${label} must be a string`, 400);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new AppError(`${label} must be at most ${max} characters`, 400);
  return trimmed || undefined;
}

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

  async createIntent(userId: string, packageId: string, idempotencyKey: string, providerName: string, autoCredit = false) {
    if (providerName === 'sandbox' && process.env.PAYMENT_SANDBOX_ENABLED !== 'true') {
      throw new AppError('Sandbox payments are disabled', 403);
    }
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

      if (autoCredit && providerName === 'sandbox') {
        try {
          await prisma.$transaction(async (tx) => {
            await walletService.creditUser(
              userId,
              intent.pointsAmount,
              `payment:${intent.id}:credit`,
              'payment_topup_sandbox',
              intent.id,
              tx,
              { referenceType: 'payment_intent' },
            );
            await tx.paymentIntent.update({
              where: { id: intent.id },
              data: { status: PaymentIntentStatus.completed, completedAt: new Date() },
            });
          });
          intent.status = PaymentIntentStatus.completed;
        } catch (e) {
          console.error('Failed to auto-credit sandbox payment:', e);
        }
      }

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

  /**
   * POST /vip/checkout — a VIP purchase paid with REAL MONEY (contracts/vip-2026-10.md).
   * Creates a PaymentIntent with vipPackageId, pointsAmount 0 and a snapshot of what is being
   * bought (duration/group/tier at checkout time). Completion goes through fulfillPaidIntent.
   *   - stripe: hosted Checkout Session returning to /vip (verify with POST /payments/verify-session)
   *   - bank_slip: pending until an admin approves the slip (POST /admin/payments/approve/:id)
   * Idempotent per (user, Idempotency-Key) exactly like POST /payments/intents.
   */
  async createVipIntent(userId: string, vipPackageId: string, idempotencyKey: string, providerName: string, slip: VipSlipInput = {}) {
    if (providerName !== 'stripe' && providerName !== 'bank_slip') {
      throw new AppError('provider must be stripe or bank_slip', 400);
    }
    if (!idempotencyKey?.trim()) throw new AppError('Idempotency-Key header is required', 400);
    if (idempotencyKey.length > 255) throw new AppError('Idempotency-Key must not exceed 255 characters', 400);
    if (typeof vipPackageId !== 'string' || !vipPackageId.trim()) throw new AppError('packageId is required', 400);

    const existing = await prisma.paymentIntent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) {
      if (existing.vipPackageId !== vipPackageId || existing.provider !== providerName) {
        throw new AppError('Idempotency key was already used for a different payment', 409);
      }
      return { intent: serializeIntent(existing), replayed: true };
    }

    const pkg = await prisma.vipPackage.findUnique({ where: { id: vipPackageId } });
    if (!pkg || !pkg.isActive) throw new AppError('VIP package not found', 404);
    if (!isSellablePrice(pkg.priceThb)) throw new AppError('VIP package is not priced yet', 409);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true } });
    if (!user?.steamId) {
      throw new AppError('Link your Steam account before buying VIP (VIP is applied to your Steam ID in game)', 409);
    }

    const slipImageUrl = optionalText(slip.slipImageUrl, 1024, 'slipImageUrl');
    const transferRef = optionalText(slip.transferRef, 120, 'transferRef');
    const transferBank = optionalText(slip.transferBank, 60, 'transferBank');
    const notes = optionalText(slip.notes, 500, 'notes');
    if (providerName === 'bank_slip') {
      if (!slipImageUrl && !transferRef) throw new AppError('slipImageUrl or transferRef is required for bank_slip', 400);
      if (slipImageUrl && !SLIP_URL_PATTERN.test(slipImageUrl)) throw new AppError('slipImageUrl must be an https:// URL or a /path', 400);
    }

    const stableKey = `${userId}:${idempotencyKey}`;
    const reference = `IRIS-VIP-${crypto.createHash('sha256').update(stableKey).digest('hex').slice(0, 28).toUpperCase()}`;
    const vipSnapshot = {
      key: pkg.key,
      name: pkg.name,
      permissionGroup: pkg.permissionGroup,
      tierRank: pkg.tierRank,
      frameStyle: pkg.frameStyle,
      durationDays: pkg.durationDays ?? null,
      priceThb: formatThb(pkg.priceThb),
    };

    let providerIntentId: string | null = null;
    let paymentUrl: string | null = null;
    let qrPayload: string | null = null;
    let expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    if (providerName === 'stripe') {
      const provider = getPaymentProvider('stripe');
      const created = await provider.createIntent({
        idempotencyKey: stableKey,
        reference,
        amountThb: String(pkg.priceThb),
        expiresAt,
        returnPath: '/vip',
        productName: `IRIS VIP — ${pkg.name}`,
      });
      providerIntentId = created.providerIntentId;
      paymentUrl = created.paymentUrl;
      qrPayload = created.qrPayload || null;
      expiresAt = created.expiresAt || expiresAt;
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      paymentUrl = slipImageUrl ?? null;
    }

    try {
      const intent = await prisma.paymentIntent.create({
        data: {
          userId,
          packageId: null,
          vipPackageId: pkg.id,
          provider: providerName,
          providerIntentId,
          reference,
          idempotencyKey,
          amountThb: pkg.priceThb,
          pointsAmount: 0n,
          paymentUrl,
          qrPayload,
          expiresAt,
          metadata: {
            kind: 'vip',
            vipSnapshot,
            packageName: pkg.name,
            ...(providerName === 'bank_slip'
              ? {
                  slipImageUrl: slipImageUrl ?? null,
                  transferBank: transferBank ?? null,
                  transferRef: transferRef ?? null,
                  notes: notes ?? '',
                  submittedAt: new Date().toISOString(),
                }
              : {}),
          },
        },
      });
      if (providerName === 'bank_slip') emitAdminSlipCreated(intent.id);
      return { intent: serializeIntent(intent), replayed: false };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await prisma.paymentIntent.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (!raced || raced.vipPackageId !== vipPackageId || raced.provider !== providerName) {
        throw new AppError('Idempotency key conflict', 409);
      }
      return { intent: serializeIntent(raced), replayed: true };
    }
  }

  /**
   * POST /payments/slips — a bank-transfer slip for an IC top-up, pending admin approval.
   * Price, IC amount and package name come ONLY from the server-side PaymentPackage; any
   * client-sent amountThb / pointsToCredit / packageName is ignored (approval credits
   * intent.pointsAmount, so a client-chosen value would be a money hole).
   */
  async submitTopupSlip(userId: string, packageId: unknown, slip: VipSlipInput = {}) {
    if (typeof packageId !== 'string' || !packageId.trim()) throw new AppError('packageId is required', 400);
    const pkg = (await prisma.paymentPackage.findUnique({ where: { id: packageId } }))
      ?? (await prisma.paymentPackage.findUnique({ where: { slug: packageId } }));
    if (!pkg || !pkg.isActive) throw new AppError('Payment package not found', 404);
    if (!isSellablePrice(pkg.priceThb)) throw new AppError('Payment package is not priced', 409);

    const slipImageUrl = optionalText(slip.slipImageUrl, 1024, 'slipImageUrl');
    const transferRef = optionalText(slip.transferRef, 120, 'transferRef');
    const transferBank = optionalText(slip.transferBank, 60, 'transferBank');
    const notes = optionalText(slip.notes, 500, 'notes');
    if (!slipImageUrl && !transferRef) throw new AppError('slipImageUrl or transferRef is required for bank_slip', 400);
    if (slipImageUrl && !SLIP_URL_PATTERN.test(slipImageUrl)) throw new AppError('slipImageUrl must be an https:// URL or a /path', 400);

    // reference is unique and server-generated; the payer's transfer reference lives in metadata.
    const nonce = crypto.randomBytes(12).toString('hex');
    const reference = `IRIS-SLIP-${crypto.createHash('sha256').update(`${userId}:${nonce}`).digest('hex').slice(0, 26).toUpperCase()}`;
    const intent = await prisma.paymentIntent.create({
      data: {
        userId,
        packageId: pkg.id,
        provider: 'bank_slip',
        reference,
        idempotencyKey: `slip-${nonce}`,
        amountThb: pkg.priceThb,
        pointsAmount: pkg.points + pkg.bonusPoints,
        status: 'pending',
        paymentUrl: slipImageUrl ?? null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: {
          kind: 'topup',
          packageName: pkg.name,
          transferBank: transferBank ?? null,
          transferRef: transferRef ?? null,
          slipImageUrl: slipImageUrl ?? null,
          notes: notes ?? '',
          submittedAt: new Date().toISOString(),
        },
      },
      include: { user: true, package: true },
    });
    emitAdminSlipCreated(intent.id);
    return intent;
  }

  /**
   * Success-page sync for a Stripe Checkout Session. Credits ONLY a PaymentIntent the caller
   * owns (provider 'stripe'), after validating the session the same way the webhook parser
   * does. The credit uses the SAME idempotency key and request shape as the webhook
   * (`payment:<intent.id>:credit`, type payment_topup) and is gated on a conditional
   * pending|processing -> completed flip inside the credit transaction, so the webhook and
   * this path can never both credit one payment, and refunded/failed/expired intents are
   * never re-credited.
   */
  async verifyStripeSession(userId: string, sessionId: string) {
    if (!sessionId?.trim()) throw new AppError('sessionId is required', 400);
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!secretKey) throw new AppError('Stripe sandbox key is not configured', 503);

    // Only sessions created through createIntent can be credited: look the intent up first,
    // scoped to the caller and the stripe provider. There is no "unknown session" credit path.
    const intent = await prisma.paymentIntent.findFirst({
      where: { provider: 'stripe', providerIntentId: sessionId, userId },
    });
    if (!intent) throw new AppError('Payment intent not found', 404);

    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.id !== intent.providerIntentId) throw new AppError('Stripe session not found', 404);

    if (session.payment_status !== 'paid') {
      return { success: false, status: session.status, paymentStatus: session.payment_status, message: 'Payment has not been completed on Stripe' };
    }
    if (
      session.livemode ||
      session.mode !== 'payment' ||
      session.currency !== 'thb' ||
      !Number.isSafeInteger(session.amount_total) ||
      BigInt(session.amount_total!) !== asCents(intent.amountThb) ||
      session.client_reference_id !== intent.reference
    ) {
      throw new AppError('Invalid Stripe payment details', 400);
    }

    const kind = intent.vipPackageId ? 'vip' : 'topup';
    // VIP intents never report IC: points is '0' and `kind` tells the client what was granted.
    const points = kind === 'vip' ? '0' : intent.pointsAmount.toString();
    if (intent.status === PaymentIntentStatus.completed) {
      return { success: true, alreadyCredited: true, kind, points, intentId: intent.id };
    }
    if (intent.status !== PaymentIntentStatus.pending && intent.status !== PaymentIntentStatus.processing) {
      throw new AppError(`Payment intent is ${intent.status}`, 409);
    }

    const credit = () => prisma.$transaction(async (tx) => {
      const flipped = await tx.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: [PaymentIntentStatus.pending, PaymentIntentStatus.processing] } },
        data: {
          status: PaymentIntentStatus.completed,
          completedAt: new Date(),
          metadata: {
            ...((intent.metadata as any) || {}),
            stripeSessionId: session.id,
            verifiedVia: 'stripe_session_sync',
          },
        },
      });
      if (flipped.count !== 1) return false;
      await fulfillPaidIntent(tx, intent, {
        idempotencyKey: `payment:${intent.id}:credit`,
        type: 'payment_topup',
        // Must stay byte-identical to processWebhook's credit so a concurrent webhook posting
        // under the same key replays instead of 409-ing.
        options: { referenceType: 'payment_intent' },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const credited = await credit();
        if (credited) return { success: true, credited: kind === 'topup', kind, points, intentId: intent.id };
        break;
      } catch (error) {
        const code = (error as { code?: string }).code;
        // P2034: serialization conflict (likely with the webhook). P2002: the webhook committed
        // the same ledger key first. Either way re-read the intent below / retry.
        if ((code === 'P2034' || code === 'P2002') && attempt < 3) continue;
        if (code !== 'P2034' && code !== 'P2002') throw error;
        break;
      }
    }

    const current = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    if (current?.status === PaymentIntentStatus.completed) {
      return { success: true, alreadyCredited: true, kind, points, intentId: intent.id };
    }
    throw new AppError(`Payment intent is ${current?.status ?? 'missing'}`, 409);
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
            // Replay-safe: the intent is claimed pending -> processing before this and
            // completed in the same transaction. VIP intents grant VIP here instead of IC.
            await fulfillPaidIntent(tx, intent, {
              idempotencyKey: `payment:${intent.id}:credit`,
              type: 'payment_topup',
              options: { referenceType: 'payment_intent' },
            });
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
      if (intent.vipPackageId) return { accepted: true, credited: false, vipGranted: true, kind: 'vip', intentId: intent.id };
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
