import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';

type PrismaLike = typeof prisma | any;

export type CheckoutPromotionLine = {
  lineNo?: number;
  productId: number;
  serverId: number;
  categoryId?: number | null;
  quantity: number;
  price: number;
  name?: string;
};

type Campaign = {
  id: string;
  code: string;
  name: string;
  status: string;
  currency: string;
  discountType: string;
  discountValue: bigint | number | string;
  maxDiscount?: bigint | number | string | null;
  minSubtotal?: bigint | number | string | null;
  minQuantity?: number | null;
  priority?: number | null;
  stackable?: boolean | null;
  exclusive?: boolean | null;
  requiresVoucher?: boolean | null;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  scopes?: any;
};

type Voucher = {
  id: string;
  campaignId: string;
  codeHash: string;
  status: string;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  campaign: Campaign;
};

export type PromotionApplication = {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  voucherId?: string;
  voucherCode?: string;
  discountAmount: bigint;
  allocation: Array<{
    lineNo: number;
    productId: number;
    serverId: number;
    amount: bigint;
  }>;
};

export type PromotionEvaluation = {
  currency: 'IC';
  subtotal: bigint;
  discountTotal: bigint;
  total: bigint;
  applications: PromotionApplication[];
  snapshot: {
    currency: 'IC';
    subtotal: string;
    discountTotal: string;
    total: string;
    voucherCodes: string[];
    applications: Array<{
      campaignId: string;
      campaignCode: string;
      campaignName: string;
      voucherId?: string;
      voucherCode?: string;
      discountAmount: string;
      allocation: Array<{
        lineNo: number;
        productId: number;
        serverId: number;
        amount: string;
      }>;
    }>;
  };
};

const ACTIVE_REDEMPTION_STATUSES = ['reserved', 'redeemed'];

export function normalizeVoucherCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function voucherCodeHash(code: string) {
  return crypto.createHash('sha256').update(normalizeVoucherCode(code)).digest('hex');
}

export const hashVoucherCode = voucherCodeHash;

function asBigInt(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function isLiveWindow(startsAt: Date | string | null | undefined, endsAt: Date | string | null | undefined, now: Date) {
  const start = toDate(startsAt);
  const end = toDate(endsAt);
  return (!start || start <= now) && (!end || end > now);
}

function matchesScope(line: CheckoutPromotionLine, scopes: any) {
  if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) return true;
  const productIds = Array.isArray(scopes.productIds) ? scopes.productIds.map(Number) : null;
  const serverIds = Array.isArray(scopes.serverIds) ? scopes.serverIds.map(Number) : null;
  const categoryIds = Array.isArray(scopes.categoryIds) ? scopes.categoryIds.map(Number) : null;

  if (productIds && !productIds.includes(line.productId)) return false;
  if (serverIds && !serverIds.includes(line.serverId)) return false;
  if (categoryIds && (line.categoryId === null || line.categoryId === undefined || !categoryIds.includes(Number(line.categoryId)))) {
    return false;
  }
  return true;
}

function allocateDiscount(lines: CheckoutPromotionLine[], eligibleSubtotal: bigint, discount: bigint) {
  let remaining = discount;
  return lines.map((line, index) => {
    const lineSubtotal = BigInt(line.price) * BigInt(line.quantity);
    const amount = index === lines.length - 1
      ? remaining
      : (eligibleSubtotal === 0n ? 0n : (discount * lineSubtotal) / eligibleSubtotal);
    remaining -= amount;
    return {
      lineNo: line.lineNo ?? index + 1,
      productId: line.productId,
      serverId: line.serverId,
      amount,
    };
  }).filter((line) => line.amount > 0n);
}

async function countActiveRedemptions(client: PrismaLike, where: Record<string, unknown>) {
  return client.promotionRedemption.count({
    where: {
      ...where,
      status: { in: ACTIVE_REDEMPTION_STATUSES },
    },
  });
}

async function usageAvailable(client: PrismaLike, userId: string, campaign: Campaign, voucher?: Voucher | null) {
  if (campaign.usageLimitTotal !== null && campaign.usageLimitTotal !== undefined) {
    const used = await countActiveRedemptions(client, { campaignId: campaign.id });
    if (used >= campaign.usageLimitTotal) return false;
  }
  if (campaign.usageLimitPerUser !== null && campaign.usageLimitPerUser !== undefined) {
    const used = await countActiveRedemptions(client, { campaignId: campaign.id, userId });
    if (used >= campaign.usageLimitPerUser) return false;
  }
  if (voucher?.usageLimitTotal !== null && voucher?.usageLimitTotal !== undefined) {
    const used = await countActiveRedemptions(client, { voucherId: voucher.id });
    if (used >= voucher.usageLimitTotal) return false;
  }
  if (voucher?.usageLimitPerUser !== null && voucher?.usageLimitPerUser !== undefined) {
    const used = await countActiveRedemptions(client, { voucherId: voucher.id, userId });
    if (used >= voucher.usageLimitPerUser) return false;
  }
  return true;
}

function calculateCampaignDiscount(campaign: Campaign, lines: CheckoutPromotionLine[]) {
  const eligibleLines = lines.filter((line) => matchesScope(line, campaign.scopes));
  const eligibleSubtotal = eligibleLines.reduce((sum, line) => sum + BigInt(line.price) * BigInt(line.quantity), 0n);
  const eligibleQuantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);

  if (eligibleLines.length === 0) return null;
  if (eligibleSubtotal < asBigInt(campaign.minSubtotal)) return null;
  if (eligibleQuantity < (campaign.minQuantity ?? 0)) return null;

  let discount = 0n;
  if (campaign.discountType === 'fixed_amount') {
    discount = asBigInt(campaign.discountValue);
  } else if (campaign.discountType === 'percentage') {
    discount = (eligibleSubtotal * asBigInt(campaign.discountValue)) / 100n;
  } else if (campaign.discountType === 'percentage_bps') {
    discount = (eligibleSubtotal * asBigInt(campaign.discountValue)) / 10000n;
  } else {
    return null;
  }

  if (campaign.maxDiscount !== null && campaign.maxDiscount !== undefined) {
    const maxDiscount = asBigInt(campaign.maxDiscount);
    discount = discount > maxDiscount ? maxDiscount : discount;
  }
  if (discount > eligibleSubtotal) discount = eligibleSubtotal;
  if (discount <= 0n) return null;

  return {
    discount,
    allocation: allocateDiscount(eligibleLines, eligibleSubtotal, discount),
  };
}

function buildSnapshot(
  subtotal: bigint,
  discountTotal: bigint,
  total: bigint,
  voucherCodes: string[],
  applications: PromotionApplication[],
): PromotionEvaluation['snapshot'] {
  return {
    currency: 'IC',
    subtotal: subtotal.toString(),
    discountTotal: discountTotal.toString(),
    total: total.toString(),
    voucherCodes,
    applications: applications.map((app) => ({
      campaignId: app.campaignId,
      campaignCode: app.campaignCode,
      campaignName: app.campaignName,
      voucherId: app.voucherId,
      voucherCode: app.voucherCode,
      discountAmount: app.discountAmount.toString(),
      allocation: app.allocation.map((line) => ({
        lineNo: line.lineNo,
        productId: line.productId,
        serverId: line.serverId,
        amount: line.amount.toString(),
      })),
    })),
  };
}

function capApplicationsToRemainingLines(applications: PromotionApplication[], lines: CheckoutPromotionLine[]) {
  const remainingByLine = new Map<number, bigint>();
  for (const [index, line] of lines.entries()) {
    remainingByLine.set(line.lineNo ?? index + 1, BigInt(line.price) * BigInt(line.quantity));
  }

  const capped: PromotionApplication[] = [];
  for (const app of applications) {
    const allocation = [];
    let discountAmount = 0n;
    for (const line of app.allocation) {
      const remaining = remainingByLine.get(line.lineNo) ?? 0n;
      if (remaining <= 0n) continue;
      const amount = line.amount > remaining ? remaining : line.amount;
      if (amount <= 0n) continue;
      remainingByLine.set(line.lineNo, remaining - amount);
      discountAmount += amount;
      allocation.push({ ...line, amount });
    }
    if (discountAmount > 0n) {
      capped.push({ ...app, discountAmount, allocation });
    }
  }
  return capped;
}

export class PromotionService {
  async evaluateCheckout(input: {
    userId: string;
    lines: CheckoutPromotionLine[];
    voucherCodes?: string[];
    now?: Date;
    client?: PrismaLike;
    strictVoucher?: boolean;
  }): Promise<PromotionEvaluation> {
    const client = input.client ?? prisma;
    const now = input.now ?? new Date();
    const voucherCodes = [...new Set((input.voucherCodes ?? []).map(normalizeVoucherCode).filter(Boolean))];

    if (voucherCodes.length > 5) {
      throw new AppError('Too many voucher codes (max 5)', 400);
    }

    const lines = input.lines.map((line, index) => ({ ...line, lineNo: line.lineNo ?? index + 1 }));
    const subtotal = lines.reduce((sum, line) => sum + BigInt(line.price) * BigInt(line.quantity), 0n);

    const automaticCampaigns: Campaign[] = await client.promotionCampaign.findMany({
      where: { status: 'active', requiresVoucher: false, currency: 'IC' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const vouchers: Voucher[] = voucherCodes.length === 0 ? [] : await client.voucherCode.findMany({
      where: { codeHash: { in: voucherCodes.map(voucherCodeHash) } },
      include: { campaign: true },
    });

    if (input.strictVoucher !== false && voucherCodes.length > 0 && vouchers.length !== voucherCodes.length) {
      throw new AppError('Invalid voucher code', 400);
    }

    const candidates: Array<{ campaign: Campaign; voucher?: Voucher; voucherCode?: string }> = [];
    for (const campaign of automaticCampaigns) {
      if (campaign.status === 'active' && campaign.currency === 'IC' && isLiveWindow(campaign.startsAt, campaign.endsAt, now)) {
        candidates.push({ campaign });
      }
    }
    for (const voucher of vouchers) {
      const campaign = voucher.campaign;
      const voucherCode = voucherCodes.find((code) => voucherCodeHash(code) === voucher.codeHash);
      if (voucher.status !== 'active') continue;
      if (campaign.status !== 'active' || campaign.currency !== 'IC') continue;
      if (!isLiveWindow(voucher.startsAt, voucher.endsAt, now) || !isLiveWindow(campaign.startsAt, campaign.endsAt, now)) continue;
      candidates.push({ campaign, voucher, voucherCode });
    }

    const evaluated: PromotionApplication[] = [];
    for (const candidate of candidates) {
      if (!await usageAvailable(client, input.userId, candidate.campaign, candidate.voucher)) continue;
      const discount = calculateCampaignDiscount(candidate.campaign, lines);
      if (!discount) continue;
      evaluated.push({
        campaignId: candidate.campaign.id,
        campaignCode: candidate.campaign.code,
        campaignName: candidate.campaign.name,
        voucherId: candidate.voucher?.id,
        voucherCode: candidate.voucherCode,
        discountAmount: discount.discount,
        allocation: discount.allocation,
      });
    }

    evaluated.sort((left, right) => {
      const leftCampaign = candidates.find((candidate) => candidate.campaign.id === left.campaignId)?.campaign;
      const rightCampaign = candidates.find((candidate) => candidate.campaign.id === right.campaignId)?.campaign;
      const priority = (leftCampaign?.priority ?? 100) - (rightCampaign?.priority ?? 100);
      if (priority !== 0) return priority;
      return Number(right.discountAmount - left.discountAmount);
    });

    const selected: PromotionApplication[] = [];
    for (const app of evaluated) {
      const campaign = candidates.find((candidate) => candidate.campaign.id === app.campaignId)?.campaign;
      if (!campaign) continue;
      if (selected.length === 0) {
        selected.push(app);
        if (campaign.exclusive || !campaign.stackable) break;
        continue;
      }
      if (campaign.stackable) selected.push(app);
    }

    const cappedApplications = capApplicationsToRemainingLines(selected, lines);
    const discountTotal = cappedApplications.reduce((sum, app) => sum + app.discountAmount, 0n);
    const total = subtotal - discountTotal;

    return {
      currency: 'IC',
      subtotal,
      discountTotal,
      total,
      applications: cappedApplications,
      snapshot: buildSnapshot(subtotal, discountTotal, total, voucherCodes, cappedApplications),
    };
  }

  async redeemForCheckout(input: {
    userId: string;
    checkoutSessionId: string;
    orderGroupId: string;
    evaluation: PromotionEvaluation;
    client: PrismaLike;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    for (const app of input.evaluation.applications) {
      await input.client.$queryRaw`SELECT id FROM promotion_campaigns WHERE id = ${app.campaignId} FOR UPDATE`;
      if (app.voucherId) {
        await input.client.$queryRaw`SELECT id FROM voucher_codes WHERE id = ${app.voucherId} FOR UPDATE`;
      }

      const campaign = await input.client.promotionCampaign.findUnique({ where: { id: app.campaignId } });
      const voucher = app.voucherId ? await input.client.voucherCode.findUnique({ where: { id: app.voucherId } }) : null;
      if (!campaign || campaign.status !== 'active' || campaign.currency !== 'IC' || !isLiveWindow(campaign.startsAt, campaign.endsAt, now)) {
        throw new AppError('Promotion is no longer available', 409);
      }
      if (voucher && (voucher.status !== 'active' || !isLiveWindow(voucher.startsAt, voucher.endsAt, now))) {
        throw new AppError('Voucher is no longer available', 409);
      }
      if (!await usageAvailable(input.client, input.userId, campaign, voucher ? { ...voucher, campaign } : null)) {
        throw new AppError('Promotion usage limit reached', 409);
      }

      await input.client.promotionRedemption.create({
        data: {
          userId: input.userId,
          campaignId: app.campaignId,
          voucherId: app.voucherId,
          checkoutSessionId: input.checkoutSessionId,
          orderGroupId: input.orderGroupId,
          status: 'redeemed',
          currency: 'IC',
          discountAmount: app.discountAmount,
          redeemedAt: now,
          snapshot: buildSnapshot(
            input.evaluation.subtotal,
            input.evaluation.discountTotal,
            input.evaluation.total,
            input.evaluation.snapshot.voucherCodes,
            [app],
          ),
        },
      });
      await input.client.promotionCampaign.update({
        where: { id: app.campaignId },
        data: { redeemedCount: { increment: 1 } },
      });
      if (app.voucherId) {
        await input.client.voucherCode.update({
          where: { id: app.voucherId },
          data: { redeemedCount: { increment: 1 } },
        });
      }
    }
  }
}

export default new PromotionService();
