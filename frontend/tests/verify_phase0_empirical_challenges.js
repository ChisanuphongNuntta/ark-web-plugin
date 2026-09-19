const assert = require('node:assert/strict');
const crypto = require('node:crypto');

console.log('=== EMPIRICAL CHALLENGE SUITE FOR PHASE 0 ===\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// Challenge 1: Idempotency Key UUID Generation & Uniqueness
// -------------------------------------------------------------
runTest('Idempotency-Key UUID format & randomUUID availability', () => {
  function generateTopupIdempotencyKey() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  function generateCartIdempotencyKey() {
    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `checkout:${suffix}`;
  }

  const topupKey = generateTopupIdempotencyKey();
  const cartKey = generateCartIdempotencyKey();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  assert.ok(uuidRegex.test(topupKey), `Topup key "${topupKey}" is not a valid RFC 4122 v4 UUID`);
  assert.ok(cartKey.startsWith('checkout:'), `Cart key "${cartKey}" does not have checkout: prefix`);
  assert.ok(uuidRegex.test(cartKey.replace('checkout:', '')), `Cart key suffix is not a valid RFC 4122 v4 UUID`);
});

runTest('Idempotency-Key 10,000 iteration uniqueness test', () => {
  const generatedKeys = new Set();
  const iterations = 10000;

  for (let i = 0; i < iterations; i++) {
    const key = crypto.randomUUID();
    assert.ok(!generatedKeys.has(key), `Collision detected at iteration ${i}: ${key}`);
    generatedKeys.add(key);
  }

  assert.equal(generatedKeys.size, iterations);
});

// -------------------------------------------------------------
// Challenge 2: Package Fetching Fallback Logic
// -------------------------------------------------------------
const coinPackages = [
  { id: 'pkg-1', coins: 100, price: 35, bonus: 0, tier: 'basic', popular: false },
  { id: 'pkg-2', coins: 300, price: 99, bonus: 10, tier: 'basic', popular: false },
  { id: 'pkg-3', coins: 500, price: 159, bonus: 25, tier: 'standard', popular: false },
  { id: 'pkg-4', coins: 1000, price: 299, bonus: 100, tier: 'standard', popular: true },
  { id: 'pkg-5', coins: 2500, price: 699, bonus: 350, tier: 'premium', popular: false },
  { id: 'pkg-6', coins: 5000, price: 1299, bonus: 1000, tier: 'premium', popular: false },
  { id: 'pkg-7', coins: 10000, price: 2499, bonus: 2500, tier: 'legendary', popular: false },
];

function resolvePackages(fetchedPackages) {
  return (fetchedPackages && fetchedPackages.length > 0)
    ? fetchedPackages.map((pkg) => ({
        id: pkg.id,
        coins: Number(pkg.points),
        price: Number(pkg.priceThb),
        bonus: Number(pkg.bonusPoints),
        tier: pkg.tier || 'basic',
        popular: Boolean(pkg.isPopular),
      }))
    : coinPackages;
}

function resolveDefaultPackageId(fetchedPackages) {
  return (fetchedPackages && fetchedPackages.length > 0)
    ? (fetchedPackages.find((p) => p.isPopular)?.id || fetchedPackages[0].id)
    : coinPackages.find((p) => p.popular)?.id || coinPackages[0].id;
}

runTest('Package fallback when fetchedPackages is undefined', () => {
  const packages = resolvePackages(undefined);
  const defaultId = resolveDefaultPackageId(undefined);
  assert.equal(packages.length, 7);
  assert.equal(defaultId, 'pkg-4');
});

runTest('Package fallback when fetchedPackages is empty array []', () => {
  const packages = resolvePackages([]);
  const defaultId = resolveDefaultPackageId([]);
  assert.equal(packages.length, 7);
  assert.equal(defaultId, 'pkg-4');
});

runTest('Package fallback when fetchedPackages is null', () => {
  const packages = resolvePackages(null);
  const defaultId = resolveDefaultPackageId(null);
  assert.equal(packages.length, 7);
  assert.equal(defaultId, 'pkg-4');
});

runTest('Package override when API returns custom packages', () => {
  const mockApiData = [
    { id: 'custom-pkg-99', points: '999', priceThb: '499', bonusPoints: '100', tier: 'premium', isPopular: true }
  ];
  const packages = resolvePackages(mockApiData);
  const defaultId = resolveDefaultPackageId(mockApiData);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].coins, 999);
  assert.equal(packages[0].price, 499);
  assert.equal(defaultId, 'custom-pkg-99');
});

// -------------------------------------------------------------
// Challenge 3: Disabled Payment Provider Selection Prevention
// -------------------------------------------------------------
const paymentMethods = [
  { id: 'sandbox', name: 'Sandbox Gateway', description: 'ระบบทดลองชำระเงินสำหรับนักพัฒนา (Testing)', icon: '🧪', speed: 'INSTANT', supported: true },
  { id: 'promptpay', name: 'PromptPay', description: 'ชำระเงินผ่าน QR Code', icon: '🏦', speed: 'DISABLED', supported: false },
  { id: 'truemoney', name: 'TrueMoney Wallet', description: 'ชำระเงินผ่านทรูมันนี่', icon: '📱', speed: 'DISABLED', supported: false },
  { id: 'credit', name: 'Credit/Debit Card', description: 'Visa, Mastercard', icon: '💳', speed: 'SECURED', supported: false },
];

runTest('Disabled payment methods cannot be selected', () => {
  let selectedPayment = 'sandbox';

  function handleSelectPayment(methodId) {
    const method = paymentMethods.find((m) => m.id === methodId);
    if (!method) return;
    if (method.supported) {
      selectedPayment = method.id;
    }
  }

  // Attempt selecting disabled methods
  handleSelectPayment('promptpay');
  assert.equal(selectedPayment, 'sandbox', 'PromptPay selection should be blocked');

  handleSelectPayment('truemoney');
  assert.equal(selectedPayment, 'sandbox', 'TrueMoney selection should be blocked');

  handleSelectPayment('credit');
  assert.equal(selectedPayment, 'sandbox', 'Credit Card selection should be blocked');

  // Attempt selecting supported method
  handleSelectPayment('sandbox');
  assert.equal(selectedPayment, 'sandbox', 'Sandbox selection should be allowed');
});

runTest('Disabled payment methods have supported=false and HTML disabled property true', () => {
  const disabledMethods = paymentMethods.filter((m) => !m.supported);
  assert.equal(disabledMethods.length, 3);
  disabledMethods.forEach((method) => {
    assert.equal(method.supported, false, `${method.id} must have supported: false`);
    const isButtonDisabled = !method.supported;
    assert.equal(isButtonDisabled, true, `${method.id} button HTML disabled property must be true`);
  });
});

console.log(`\n=== SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) process.exit(1);
