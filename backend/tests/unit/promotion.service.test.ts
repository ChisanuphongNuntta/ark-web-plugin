import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import promotionService, { voucherCodeHash } from '../../src/services/promotion.service.js';

const db = prisma as any;

const campaign = (over: any = {}) => ({
  id: 'promo-1',
  code: 'SUMMER2026',
  name: 'Summer 2026',
  status: 'active',
  currency: 'IC',
  discountType: 'fixed_amount',
  discountValue: 50n,
  maxDiscount: null,
  minSubtotal: 0n,
  minQuantity: 0,
  priority: 100,
  stackable: false,
  exclusive: false,
  requiresVoucher: false,
  usageLimitTotal: null,
  usageLimitPerUser: null,
  startsAt: null,
  endsAt: null,
  scopes: null,
  ...over,
});

describe('PromotionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.promotionCampaign.findMany.mockResolvedValue([]);
    db.voucherCode.findMany.mockResolvedValue([]);
    db.promotionRedemption.count.mockResolvedValue(0);
  });

  it('applies a valid voucher against checkout lines', async () => {
    db.voucherCode.findMany.mockResolvedValueOnce([
      {
        id: 'voucher-1',
        campaignId: 'promo-1',
        codeHash: voucherCodeHash('SAVE50'),
        status: 'active',
        usageLimitTotal: null,
        usageLimitPerUser: null,
        startsAt: null,
        endsAt: null,
        campaign: campaign({ requiresVoucher: true }),
      },
    ]);

    const result = await promotionService.evaluateCheckout({
      userId: 'u1',
      voucherCodes: ['save50'],
      lines: [{ productId: 1, serverId: 1, quantity: 2, price: 100 }],
    });

    expect(result.subtotal).toBe(200n);
    expect(result.discountTotal).toBe(50n);
    expect(result.total).toBe(150n);
    expect(result.snapshot.applications[0]).toMatchObject({
      campaignId: 'promo-1',
      voucherId: 'voucher-1',
      voucherCode: 'SAVE50',
      discountAmount: '50',
    });
  });

  it('applies scoped percentage discounts only to matching lines', async () => {
    db.promotionCampaign.findMany.mockResolvedValueOnce([
      campaign({
        id: 'promo-2',
        code: 'RIFLE10',
        discountType: 'percentage_bps',
        discountValue: 1000n,
        scopes: { productIds: [1] },
      }),
    ]);

    const result = await promotionService.evaluateCheckout({
      userId: 'u1',
      lines: [
        { productId: 1, serverId: 1, quantity: 2, price: 100 },
        { productId: 2, serverId: 1, quantity: 1, price: 300 },
      ],
    });

    expect(result.subtotal).toBe(500n);
    expect(result.discountTotal).toBe(20n);
    expect(result.total).toBe(480n);
    expect(result.snapshot.applications[0].allocation).toEqual([
      { lineNo: 1, productId: 1, serverId: 1, amount: '20' },
    ]);
  });

  it('rejects unknown voucher codes in strict checkout mode', async () => {
    await expect(promotionService.evaluateCheckout({
      userId: 'u1',
      voucherCodes: ['NOPE'],
      lines: [{ productId: 1, serverId: 1, quantity: 1, price: 100 }],
    })).rejects.toMatchObject({ statusCode: 400, message: 'Invalid voucher code' });
  });

  it('skips a campaign when per-user usage is exhausted', async () => {
    db.promotionCampaign.findMany.mockResolvedValueOnce([
      campaign({ usageLimitPerUser: 1 }),
    ]);
    db.promotionRedemption.count.mockResolvedValueOnce(1);

    const result = await promotionService.evaluateCheckout({
      userId: 'u1',
      lines: [{ productId: 1, serverId: 1, quantity: 1, price: 100 }],
    });

    expect(result.discountTotal).toBe(0n);
    expect(result.total).toBe(100n);
    expect(result.applications).toEqual([]);
  });
});
