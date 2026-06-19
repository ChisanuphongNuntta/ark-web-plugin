/**
 * Typed contract fixtures — frontend-owned snapshot.
 *
 * SOURCE OF TRUTH: F:/ARK Iris/Heart-Plugin/backend/contracts/fixtures/*.json
 * These are copied verbatim from the Backend contract so the UI can render
 * real-shaped data while the live API is being built. When the contract
 * fixtures change, re-sync this file (it is a snapshot, not the origin).
 *
 * Do NOT compute prices / discounts / totals from these values — the
 * backend remains authoritative for all money math (TEAM_OWNERSHIP.md rule 2).
 */
import type {
  Cart,
  CheckoutSession,
  ProductListResponse,
  ServersResponse,
  WalletBalance,
  WalletTransactionsResponse,
  CategoriesResponse,
  FeaturedResponse,
} from './types';

/** Mirrors fixtures/products.json (GET /products). */
export const productsFixture: ProductListResponse = {
  products: [
    {
      id: 1,
      name: 'Ascendant Longneck Rifle',
      description:
        'ปืนสไนเปอร์คุณภาพสูงสุด ระดับ Ascendant เหมาะสำหรับผู้ล่าที่ต้องการความแม่นยำสูงในระยะไกล',
      blueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
      price: 500,
      imageUrl: null,
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 2, name: 'อาวุธ', icon: '⚔️' },
    },
    {
      id: 2,
      name: 'Tek Sword',
      description:
        'ดาบ Tek ขับเคลื่อนด้วยพลังงานควอนตัม ให้ความเร็วในการโจมตีและพลังทำลายล้างระดับสูงสุด',
      blueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponTekSword.PrimalItem_WeaponTekSword'",
      price: 1200,
      imageUrl: null,
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 2, name: 'อาวุธ', icon: '⚔️' },
    },
    {
      id: 3,
      name: 'Mastercraft Riot Helmet',
      description: 'หมวกกันน็อค Mastercraft ป้องกันการบาดเจ็บที่ศีรษะระดับสูง',
      blueprint: null,
      price: 350,
      imageUrl: null,
      quantity: 1,
      quality: 4,
      isBlueprint: false,
      category: { id: 3, name: 'เกราะ', icon: '🛡️' },
    },
    {
      id: 4,
      name: 'Rex Level 300 (Bred)',
      description:
        'ไดโนเสาร์ Rex ที่ได้รับการเพาะพันธุ์ระดับ 300 พร้อม Stats สูงสุด เหมาะสำหรับการล่าบอสทุกประเภท',
      blueprint: null,
      price: 8000,
      imageUrl: null,
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 5,
      name: 'Argentavis Level 250',
      description: 'นกยักษ์ Argentavis ความเร็วในการบินสูง เหมาะสำหรับการขนส่งระยะไกล',
      blueprint: null,
      price: 3500,
      imageUrl: null,
      quantity: 1,
      quality: 3,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 6,
      name: 'Element x500',
      description: 'ทรัพยากร Element จำนวน 500 หน่วย สำหรับสร้างอุปกรณ์ Tek ระดับสูง',
      blueprint: null,
      price: 2000,
      imageUrl: null,
      quantity: 500,
      quality: 0,
      isBlueprint: false,
      category: { id: 4, name: 'ทรัพยากร', icon: '💎' },
    },
  ],
  pagination: { page: 1, limit: 20, total: 6, totalPages: 1 },
};

/** Derived categories view (GET /products/categories). */
export const categoriesFixture: CategoriesResponse = {
  categories: [
    { id: 1, name: 'ไดโนเสาร์', icon: '🦕', _count: { products: 2 } },
    { id: 2, name: 'อาวุธ', icon: '⚔️', _count: { products: 2 } },
    { id: 3, name: 'เกราะ', icon: '🛡️', _count: { products: 1 } },
    { id: 4, name: 'ทรัพยากร', icon: '💎', _count: { products: 1 } },
  ],
};

/** Featured products view (GET /products/featured). */
export const featuredFixture: FeaturedResponse = {
  products: productsFixture.products.filter((p) => p.quality >= 5),
};

/** Mirrors fixtures/servers.json (GET /servers). */
export const serversFixture: ServersResponse = {
  servers: [
    {
      id: 1,
      name: 'IRIS-PVE-TheIsland-01',
      map: 'TheIsland',
      isActive: true,
      isOnline: true,
      lastHeartbeat: '2026-06-20T03:10:00.000Z',
      chatTag: '[ISL]',
      chatColor: '#37E5D2',
      chatIcon: '🏝️',
    },
    {
      id: 2,
      name: 'IRIS-PVE-ScorchedEarth-01',
      map: 'ScorchedEarth',
      isActive: true,
      isOnline: true,
      lastHeartbeat: '2026-06-20T03:10:00.000Z',
      chatTag: '[SE]',
      chatColor: '#DDBB72',
      chatIcon: '🏜️',
    },
    {
      id: 3,
      name: 'IRIS-PVPVE-Ragnarok-01',
      map: 'Ragnarok',
      isActive: true,
      isOnline: true,
      lastHeartbeat: '2026-06-20T03:09:50.000Z',
      chatTag: '[RAG]',
      chatColor: '#A77BFF',
      chatIcon: '⚔️',
    },
    {
      id: 4,
      name: 'IRIS-PVE-Aberration-01',
      map: 'Aberration',
      isActive: true,
      isOnline: false,
      lastHeartbeat: '2026-06-20T02:45:00.000Z',
      chatTag: '[ABB]',
      chatColor: '#071A24',
      chatIcon: '🌌',
    },
    {
      id: 5,
      name: 'IRIS-PVE-Extinction-01',
      map: 'Extinction',
      isActive: true,
      isOnline: true,
      lastHeartbeat: '2026-06-20T03:10:00.000Z',
      chatTag: '[EXT]',
      chatColor: '#05070D',
      chatIcon: '🏙️',
    },
  ],
};

/** Mirrors fixtures/cart.json (GET /cart). */
export const cartFixture: Cart = {
  id: '8b9db8d7-048a-4422-9df7-f6558e0a300d',
  userId: '9a75908e-5b12-4217-ba6e-cc7887e5b56a',
  createdAt: '2026-06-20T03:00:00.000Z',
  updatedAt: '2026-06-20T03:05:00.000Z',
  items: [
    {
      id: 'e939a3f2-1b6d-4952-ba63-5ffc4d3bc30f',
      cartId: '8b9db8d7-048a-4422-9df7-f6558e0a300d',
      productId: 1,
      serverId: 1,
      quantity: 2,
      createdAt: '2026-06-20T03:01:00.000Z',
      updatedAt: '2026-06-20T03:05:00.000Z',
      product: {
        id: 1,
        name: 'Ascendant Longneck Rifle',
        price: 500,
        itemBlueprint:
          "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
        quantity: 1,
        quality: 5,
        isBlueprint: false,
      },
      server: { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland' },
    },
  ],
};

/** Mirrors fixtures/checkout-session.json (POST /checkout/session). */
export const checkoutSessionFixture: CheckoutSession = {
  id: '7f09c693-e18e-4a67-b50a-9d297e28b8cf',
  userId: '9a75908e-5b12-4217-ba6e-cc7887e5b56a',
  cartSnapshot: [
    {
      productId: 1,
      serverId: 1,
      quantity: 2,
      price: 500,
      name: 'Ascendant Longneck Rifle',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
      quality: 5,
      isBlueprint: false,
    },
  ],
  // Backend-computed decimal string. Frontend must NOT recompute this.
  totalAmount: '1000',
  status: 'pending',
  idempotencyKey: 'idem-checkout-123456',
  expiresAt: '2026-06-20T03:20:00.000Z',
  createdAt: '2026-06-20T03:05:00.000Z',
  updatedAt: '2026-06-20T03:05:00.000Z',
};

/** Mirrors fixtures/wallet-balance.json (GET /wallet). */
export const walletBalanceFixture: WalletBalance = {
  currency: 'IC',
  accounts: {
    available: '1250',
    held: '300',
    promotional: '50',
    refundable: '0',
  },
  total: '1600',
};

/** Mirrors fixtures/wallet-transactions.json (GET /wallet/transactions). */
export const walletTransactionsFixture: WalletTransactionsResponse = {
  transactions: [
    {
      id: 'ckl1tx0000checkoutpurchase01',
      idempotencyKey: 'checkout:commit:7f09c693-e18e-4a67-b50a-9d297e28b8cf',
      type: 'checkout_purchase',
      referenceType: 'checkout',
      referenceId: '7f09c693-e18e-4a67-b50a-9d297e28b8cf',
      description: 'Checkout session committed',
      createdAt: '2026-06-20T03:06:00.000Z',
      entries: [
        {
          id: 'ckl1en0000availabledebit01',
          amount: '-1000',
          balanceAfter: '1250',
          account: {
            key: 'user:9a75908e-5b12-4217-ba6e-cc7887e5b56a:available:IC',
            type: 'available',
            currency: 'IC',
          },
        },
      ],
    },
    {
      id: 'ckl1tx0000topupcredit0001',
      idempotencyKey: 'topup:sandbox:ref-abc123',
      type: 'wallet_credit',
      referenceType: 'external',
      referenceId: 'ref-abc123',
      description: 'Sandbox top-up credited',
      createdAt: '2026-06-20T02:50:00.000Z',
      entries: [
        {
          id: 'ckl1en0000availablecredit01',
          amount: '2250',
          balanceAfter: '2250',
          account: {
            key: 'user:9a75908e-5b12-4217-ba6e-cc7887e5b56a:available:IC',
            type: 'available',
            currency: 'IC',
          },
        },
      ],
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};
