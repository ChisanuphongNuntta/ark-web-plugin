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
  LinkedIdentitiesResponse,
  SessionWithRisk,
  OrderListResponse,
  OrderDetailResponse,
  PaymentPackagesResponse,
  SlipTopupSubmission,
} from './types';

/** Mirrors fixtures/products.json (GET /products). */
export const productsFixture: ProductListResponse = {
  products: [
    {
      id: 1,
      name: 'Ascendant Longneck Rifle',
      description:
        'ปืนสไนเปอร์คุณภาพสูงสุด ระดับ Ascendant เหมาะสำหรับผู้ล่าที่ต้องการความแม่นยำสูงในระยะไกล พร้อมสโคปอินฟราเรด',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponOneShotRifle.PrimalItem_WeaponOneShotRifle'",
      price: 500,
      imageUrl: '/images/mock/products/ascendant-longneck.svg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 2, name: 'อาวุธ', icon: '⚔️' },
    },
    {
      id: 2,
      name: 'Tek Sword',
      description:
        'ดาบ Tek ขับเคลื่อนด้วยพลังงานควอนตัม ให้ความเร็วในการโจมตีและพลังทำลายล้างระดับสูงสุดพร้อมฟังก์ชันเจาะเกราะ',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponTekSword.PrimalItem_WeaponTekSword'",
      price: 1200,
      imageUrl: '/images/mock/products/tek-sword.svg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 2, name: 'อาวุธ', icon: '⚔️' },
    },
    {
      id: 3,
      name: 'Mastercraft Riot Helmet',
      description: 'หมวกกันน็อค Mastercraft ป้องกันการบาดเจ็บที่ศีรษะระดับสูง เพิ่มความทนทานต่อการน็อคเอาต์',
      itemBlueprint: null,
      price: 350,
      imageUrl: '/images/mock/products/riot-helmet.svg',
      quantity: 1,
      quality: 4,
      isBlueprint: false,
      category: { id: 3, name: 'เกราะ', icon: '🛡️' },
    },
    {
      id: 4,
      name: 'Rex Level 300 (Bred)',
      description:
        'ไทแรนโนซอรัส เร็กซ์ สายเลือดแท้ระดับ 300 เพาะพันธุ์สำเร็จ Stats พลังโจมตีและพลังชีวิตระดับสูงสุด พร้อมส่งมอบเข้าเซิร์ฟเวอร์ทันที',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'",
      price: 8000,
      imageUrl: '/images/products/rex_level_300.jpg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 5,
      name: 'Giganotosaurus Boss Level 350 (Mutated)',
      description:
        'กิกาโนโตซอรัสสายพันธุ์มิวเททสีเพลิงมหาศาล Level 350 พลังทำลายล้างบอส กวาดล้างศัตรูในสงครามและถ้ำระดับสูง',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/Dinos/Giganotosaurus/Gigant_Character_BP.Gigant_Character_BP'",
      price: 15000,
      imageUrl: '/images/products/giganotosaurus_boss.jpg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 6,
      name: 'Lightning Wyvern Level 225 (High Stat)',
      description:
        'มังกรสายฟ้า Wyvern ระดับ 225 ลำแสงพายุสายฟ้าทำลายล้างความเร็วสูง ความเร็วในการบินและต้านทานสภาพอากาศยอดเยี่ยม',
      itemBlueprint:
        "Blueprint'/Game/ScorchedEarth/Dinos/Wyvern/Wyvern_Character_BP_Lightning.Wyvern_Character_BP_Lightning'",
      price: 9500,
      imageUrl: '/images/products/wyvern_lightning.jpg',
      quantity: 1,
      quality: 4,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 7,
      name: 'Carcharodontosaurus Bloodrage Level 320',
      description:
        'คาร์คาโรดอนโทซอรัสสายบ้าคลั่ง Level 320 สะสม Stack พลังโจมตีไร้ขีดจำกัด เหมาะสำหรับการเก็บเกี่ยวทรัพยากรและต่อสู้บอส',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/Dinos/Carcha/Carcha_Character_BP.Carcha_Character_BP'",
      price: 14000,
      imageUrl: '/images/products/carcharodontosaurus.jpg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 8,
      name: 'Shadowmane Alpha Pair Level 300 (Bioluminescent)',
      description:
        'แชโดว์เมนสายเรืองแสง Alpha Level 300 สัตว์นักล่าเงาลอบสังหาร ล่องหน ลากดึง และสร้างเกราะสะท้อนการโจมตีให้เพื่อนร่วมทีม',
      itemBlueprint:
        "Blueprint'/Game/Genesis2/Dinos/Shadowmane/LionFishLion_Character_BP.LionFishLion_Character_BP'",
      price: 12500,
      imageUrl: '/images/products/shadowmane_alpha.jpg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 1, name: 'ไดโนเสาร์', icon: '🦕' },
    },
    {
      id: 9,
      name: 'Element Cache x500',
      description: 'ทรัพยากร Element จำนวน 500 หน่วย สำหรับสร้างและเติมพลังงานอุปกรณ์ Tek ระดับสูง',
      itemBlueprint: null,
      price: 2000,
      imageUrl: '/images/mock/products/element-cache.svg',
      quantity: 500,
      quality: 0,
      isBlueprint: false,
      category: { id: 4, name: 'ทรัพยากร', icon: '💎' },
    },
    {
      id: 10,
      name: 'Ascendant Tek Armor Full Set',
      description: 'ชุดเกราะ Tek ครบชุดระดับ Ascendant ป้องกันความเสียหายสูงสุด บิน ดำน้ำ และวิ่งพุ่งชนความเร็วสูง',
      itemBlueprint: null,
      price: 6500,
      imageUrl: '/images/mock/products/riot-helmet.svg',
      quantity: 1,
      quality: 5,
      isBlueprint: false,
      category: { id: 3, name: 'เกราะ', icon: '🛡️' },
    },
    {
      id: 11,
      name: 'Exceptional Kibble Bundle x200',
      description: 'อาหาร Kibble คุณภาพสูงสุด 200 ชิ้น ช่วยให้การ Tame ไดโนเสาร์สำเร็จลุล่วง 100% พร้อมค่า Bonus Stat สูงสุด',
      itemBlueprint: null,
      price: 1800,
      imageUrl: '/images/mock/products/element-cache.svg',
      quantity: 200,
      quality: 3,
      isBlueprint: false,
      category: { id: 4, name: 'ทรัพยากร', icon: '💎' },
    },
    {
      id: 12,
      name: 'Industrial Forge Blueprint (Mastercraft)',
      description: 'พิมพ์เขียวเตาหลอมอุตสาหกรรม หลอมโลหะและแร่ปริมาณมหาศาลรวดเร็ว สร้างไอเทมแบบคราฟต์ได้ไม่จำกัดครั้ง',
      itemBlueprint:
        "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/BuildingBases/PrimalItemStructure_IndustrialForge.PrimalItemStructure_IndustrialForge'",
      price: 2200,
      imageUrl: '/images/mock/products/ascendant-longneck.svg',
      quantity: 1,
      quality: 4,
      isBlueprint: true,
      category: { id: 5, name: 'สิ่งปลูกสร้าง', icon: '🏰' },
    },
  ],
  pagination: { page: 1, limit: 20, total: 12, totalPages: 1 },
};

/** Derived categories view (GET /products/categories). */
export const categoriesFixture: CategoriesResponse = {
  categories: [
    { id: 1, name: 'ไดโนเสาร์', icon: '🦕', _count: { products: 5 } },
    { id: 2, name: 'อาวุธ', icon: '⚔️', _count: { products: 2 } },
    { id: 3, name: 'เกราะ', icon: '🛡️', _count: { products: 2 } },
    { id: 4, name: 'ทรัพยากร', icon: '💎', _count: { products: 2 } },
    { id: 5, name: 'สิ่งปลูกสร้าง', icon: '🏰', _count: { products: 1 } },
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

/** Mirrors fixtures/orders.json (GET /orders — paginated list). */
export const ordersFixture: OrderListResponse = {
  orders: [
    {
      id: 'd3f1c2a0-1111-4aaa-8bbb-000000000001',
      userId: '9a75908e-5b12-4217-ba6e-cc7887e5b56a',
      productId: 1,
      serverId: 1,
      quantity: 2,
      totalPrice: 1000,
      status: 'delivered',
      deliveredAt: '2026-06-20T03:08:00.000Z',
      deliveryAttempts: 1,
      lastError: null,
      paidAt: '2026-06-20T03:05:30.000Z',
      queuedAt: '2026-06-20T03:05:30.000Z',
      refundedAt: null,
      checkoutSessionId: '7f09c693-e18e-4a67-b50a-9d297e28b8cf',
      createdAt: '2026-06-20T03:05:30.000Z',
      updatedAt: '2026-06-20T03:08:00.000Z',
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
    {
      id: 'd3f1c2a0-2222-4aaa-8bbb-000000000002',
      userId: '9a75908e-5b12-4217-ba6e-cc7887e5b56a',
      productId: 2,
      serverId: 1,
      quantity: 1,
      totalPrice: 1200,
      status: 'failed',
      deliveredAt: null,
      deliveryAttempts: 5,
      lastError: 'player not online after max attempts',
      paidAt: '2026-06-20T02:40:00.000Z',
      queuedAt: '2026-06-20T02:40:00.000Z',
      refundedAt: null,
      checkoutSessionId: 'aa11bb22-cc33-44dd-88ee-ff0011223344',
      createdAt: '2026-06-20T02:40:00.000Z',
      updatedAt: '2026-06-20T02:55:00.000Z',
      product: {
        id: 2,
        name: 'Tek Sword',
        price: 1200,
        itemBlueprint:
          "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponTekSword.PrimalItem_WeaponTekSword'",
        quantity: 1,
        quality: 5,
        isBlueprint: false,
      },
      server: { id: 1, name: 'IRIS-PVE-TheIsland-01', map: 'TheIsland' },
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

/** Mirrors fixtures/order-detail.json (GET /orders/{id}). */
export const orderDetailFixture: OrderDetailResponse = {
  order: ordersFixture.orders[0],
  delivery: {
    status: 'delivered',
    attempts: 1,
    lastError: null,
    receiptId: 'rcpt-9a3f2b1c',
  },
  timeline: [
    { status: 'created', at: '2026-06-20T03:05:30.000Z' },
    { status: 'paid', at: '2026-06-20T03:05:30.000Z' },
    { status: 'queued', at: '2026-06-20T03:05:30.000Z' },
    { status: 'delivering', at: '2026-06-20T03:07:10.000Z' },
    { status: 'delivered', at: '2026-06-20T03:08:00.000Z' },
  ],
};

/** Mirrors fixtures/linked-identities.json (Account Center linked identities). */
export const linkedIdentitiesFixture: LinkedIdentitiesResponse = {
  userId: 'b3f1c2a4-1111-4d2e-9a8b-000000000001',
  identities: [
    {
      provider: 'discord',
      providerAccountId: '284736510028374016',
      displayName: 'IrisPlayerOne',
      linkedAt: '2026-05-01T09:12:00.000Z',
      proofMethod: 'discord_oauth',
      isPrimary: true,
      canUnlink: true,
    },
    {
      provider: 'steam',
      providerAccountId: '76561198000000001',
      displayName: null,
      linkedAt: '2026-05-03T14:40:00.000Z',
      proofMethod: 'steam_openid',
      isPrimary: false,
      canUnlink: true,
    },
    {
      provider: 'epic',
      providerAccountId: null,
      displayName: null,
      linkedAt: null,
      proofMethod: null,
      isPrimary: false,
      canUnlink: false,
    },
  ],
  rules: {
    autoMergeByEmailOrName: false,
    proofOfControlRequired: true,
    minimumLinkedProviders: 1,
    note: 'At least one provider must remain linked. Linking always requires proof-of-control; email/name are never used to merge accounts.',
  },
};

/** Mirrors fixtures/sessions.json (GET /auth/sessions). */
export const sessionsFixture: SessionWithRisk[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    token: 'f3a1...redacted-hash',
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IRIS-Web',
    isActive: true,
    createdAt: '2026-06-20T08:00:00.000Z',
    expiresAt: '2026-06-27T08:00:00.000Z',
    lastUsedAt: '2026-06-20T08:55:00.000Z',
    isCurrent: true,
    riskFlag: false,
    riskReasons: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    token: '9bd2...redacted-hash',
    ipAddress: '198.51.100.42',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) IRIS-Mobile',
    isActive: true,
    createdAt: '2026-06-19T21:14:00.000Z',
    expiresAt: '2026-06-26T21:14:00.000Z',
    lastUsedAt: '2026-06-20T07:02:00.000Z',
    isCurrent: false,
    riskFlag: true,
    riskReasons: ['new_ip', 'new_device'],
  },
];

/** Mirrors GET /payments/packages */
export const paymentPackagesFixture: PaymentPackagesResponse = {
  packages: [
    { id: 'pkg-1', name: 'Basic Pack 100', priceThb: '35', points: '100', bonusPoints: '0', totalPoints: '100', tier: 'basic', isPopular: false },
    { id: 'pkg-2', name: 'Basic Pack 300', priceThb: '99', points: '300', bonusPoints: '10', totalPoints: '310', tier: 'basic', isPopular: false },
    { id: 'pkg-3', name: 'Standard Pack 500', priceThb: '159', points: '500', bonusPoints: '25', totalPoints: '525', tier: 'standard', isPopular: false },
    { id: 'pkg-4', name: 'Standard Pack 1000', priceThb: '299', points: '1000', bonusPoints: '100', totalPoints: '1100', tier: 'standard', isPopular: true },
    { id: 'pkg-5', name: 'Premium Pack 2500', priceThb: '699', points: '2500', bonusPoints: '350', totalPoints: '2850', tier: 'premium', isPopular: false },
    { id: 'pkg-6', name: 'Premium Pack 5000', priceThb: '1299', points: '5000', bonusPoints: '1000', totalPoints: '6000', tier: 'premium', isPopular: false },
    { id: 'pkg-7', name: 'Legendary Pack 10000', priceThb: '2499', points: '10000', bonusPoints: '2500', totalPoints: '12500', tier: 'legendary', isPopular: false },
  ],
};

/** Mirrors Pending Slip Topups for Admin Approval */
export const pendingTopupsFixture: SlipTopupSubmission[] = [
  {
    id: 'topup-slip-001',
    userId: 'user-001',
    userName: 'Krit (Survivor #8821)',
    userDiscordId: '298172948192847102',
    packageId: 'pkg-4',
    packageName: 'Standard Pack 1000 IC',
    amountThb: 299,
    pointsToCredit: 1100,
    slipImageUrl: '/images/mock/slips/sample-slip-01.svg',
    transferBank: 'KBANK (กสิกรไทย)',
    transferRef: 'KBANK-TRX-948271',
    transferredAt: '2026-08-15T18:42:00.000Z',
    status: 'pending_approval',
    createdAt: '2026-08-15T18:43:10.000Z',
  },
  {
    id: 'topup-slip-002',
    userId: 'user-002',
    userName: 'Aom (Tribe Leader Alpha)',
    userDiscordId: '381927481928374829',
    packageId: 'pkg-6',
    packageName: 'Premium Pack 5000 IC',
    amountThb: 1299,
    pointsToCredit: 6000,
    slipImageUrl: '/images/mock/slips/sample-slip-02.svg',
    transferBank: 'SCB (ไทยพาณิชย์)',
    transferRef: 'SCB-E-SLIP-554109',
    transferredAt: '2026-08-15T19:15:30.000Z',
    status: 'pending_approval',
    createdAt: '2026-08-15T19:16:05.000Z',
  },
];

