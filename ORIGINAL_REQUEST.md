# Original User Request

## 2026-08-23T10:34:00Z

Transform the entire ARK Iris Heart-Plugin web platform into a comprehensive AAA-grade gaming launcher and marketplace experience, expanding the Player Marketplace and Player Ranking features while strictly preserving backend contracts and data integrity.

Working directory: f:/ARK Iris/Heart-Plugin
Integrity mode: demo

## Requirements

### R1. Complete AAA Gaming UI/UX Across All Platform Pages
- Elevate every page of the web platform (`/`, `/shop`, `/market`, `/ranking`, `/event`, `/promotion`, `/packs`, `/topup`, `/profile`, `/orders`, `/support`) into a high-end luxury dark gaming interface (Steam + Riot + Destiny 2 aesthetic).
- Implement responsive layout hierarchy, cinematic depth layering, dynamic glowing card frames, and smooth Framer Motion micro-interactions across desktop, tablet, and mobile.

### R2. Player Marketplace & Leaderboard Feature Expansion
- Deliver a comprehensive Dino & Item Player Marketplace with category filtering, stat highlights, seller credibility badges, and contract-aligned listing flows.
- Implement the Player Ranking / Leaderboards system displaying player tiers, total spent / activity badges, and server affiliations.

### R3. Preservation of Backend Contracts & Authentication
- Keep all existing REST / WebSocket API routes, Prisma database schemas, and session authentication flows intact without breaking modifications.
- Ensure all multi-account ledger views (Available, Held, Promotional) and double-entry transaction histories render accurately.

### R4. Automated Verification & Zero Regression
- Maintain 100% test pass rate across all Vitest backend unit/integration tests and Playwright frontend E2E tests.
- Ensure zero TypeScript compiler errors (`tsc --noEmit`).

## Acceptance Criteria

### Visual & Interactive Design
- [ ] All pages adhere to the unified ARK Iris design tokens (emerald energy, orchid accents, gold tiering, luxury dark obsidian backgrounds).
- [ ] Full responsiveness with zero horizontal scrollbars or element clipping on viewports from 375px to 4K.
- [ ] Accessible interactive states for all buttons, inputs, modals, and dropdowns.

### Feature Functionality
- [ ] Shop and Player Market allow real-time search, category filtering, price sorting, and cart/checkout integration.
- [ ] Player Ranking displays ranked survivor tiers, points, and character identity details.
- [ ] Wallet and Topup flows work seamlessly with sandbox/real gateways and promptpay slip verification.

### Test Automation & Integrity
- [ ] All 27 backend test files (195+ tests) pass successfully with `npm test`.
- [ ] All 13 Playwright E2E test suites (48+ tests) pass 100% green on Chromium.
- [ ] Frontend TypeScript typecheck (`npx tsc --noEmit`) passes with 0 errors.

## 2026-09-12T07:50:19Z

Complete full-loop verification and end-to-end readiness for the ARK Iris Heart-Plugin platform on Docker HTTPS, ensuring all features (shop, marketplace, ranking, authentication, and multi-mode payment gateway) are fully operable and verified across all test suites.

Working directory: f:/ARK Iris/Heart-Plugin
Integrity mode: development

## Requirements

### R1. Docker Production & HTTPS Service Readiness
- Ensure all Docker production containers (`heart-plugin-frontend`, `heart-plugin-backend`, `heartshop-nginx`, `postgres-primary`, `redis-primary`) are up, healthy, and communicating over TLS on `https://localhost/`.
- Validate that Nginx reverse proxy properly terminates SSL on port 443, routes `/api/` and `/socket.io/` to the backend, routes `/` to the Next.js frontend, and serves all static assets (3D Frozen Logo, 4K Winter Hero, brand icons) with HTTP 200 OK.

### R2. Payment Gateway & Economy Loop Readiness
- Confirm all 7 coin packages (`pkg-1` through `pkg-7`) in PostgreSQL `payment_packages` table are active and returned via `GET /api/payments/packages`.
- Verify the triple-gateway top-up flow in `/topup`:
  1. Stripe Sandbox credit/debit card intent creation and checkout URL generation.
  2. Bank transfer slip upload with pending status tracking for admin review.
  3. Sandbox developer gateway instant wallet crediting with unique reference.

### R3. Full-Loop Automated Regression & Health Verification
- Run the full backend Vitest test suite (`npm test`) across all 28 test files and ensure 100% pass rate (208+ tests).
- Run the complete Playwright E2E test suite (`npx playwright test`) across all 13 test suites directly against `https://localhost/` and ensure 100% pass rate (48 tests).
- Verify zero TypeScript compiler errors across both frontend (`npx tsc --noEmit`) and backend (`npm run build`).

## Acceptance Criteria

### Infrastructure & Security
- [ ] All production Docker containers report `healthy` in `docker compose --env-file .env.prod --profile prod ps`.
- [ ] `https://localhost/health` returns `{"status":"ok"}` with valid security headers (HSTS, CSP, X-Frame-Options).
- [ ] Static assets (`/images/brand/ark_iris_frozen_logo.jpg`, `/images/backgrounds/winter_hero_frozen.jpg`) load with HTTP 200 OK.

### Payment & Commerce Loops
- [ ] `GET https://localhost/api/payments/packages` returns 7 active packages with THB prices and coin rewards.
- [ ] `POST https://localhost/api/payments/intents` successfully issues valid Stripe checkout URLs and Sandbox references with auto-generated idempotency keys.
- [ ] Double-entry ledger zero-sum invariants and wallet balance updates operate without discrepancies.

### Automated Testing Suite
- [ ] Vitest backend tests: 28/28 files passed (100% green).
- [ ] Playwright E2E suites: 13/13 suites passed (48/48 tests, 100% green on Chromium).
- [ ] TypeScript check: 0 errors in frontend and backend.

## 2026-09-13T13:07:12Z

Perform a comprehensive UX/UI audit and defect remediation across every page, interactive button, navigation link, modal, and drawer of the ARK Iris Heart-Plugin platform under the Frozen Disney Club theme, ensuring zero broken interactions, flawless visual responsiveness, and 100% green test pass rates.

Requested team: "สร้างทีม QC แก้ไขเลยครับ" (Adversarial UX/UI Quality Control & Remediation Team)

Working directory: f:/ARK Iris/Heart-Plugin
Integrity mode: development

## Requirements

### R1. Full-Platform UX/UI Audit Across All Pages
- Inspect every route of the web platform:
  - `/` (Home & Winter Hero)
  - `/shop` (Palworld Frozen Storefront & 8-column high-density item grid)
  - `/market` (Player Marketplace, listing creation, filter tags)
  - `/ranking` (Leaderboard & Survivor Hall of Fame)
  - `/event` (Winter Expeditions & Seasonal Quests)
  - `/promotion` (Iris Pass Season 1 & Vouchers)
  - `/packs` (Ascendant Starter & Master Bundles)
  - `/topup` (Triple-Gateway Coin Recharge, Stripe, Bank Slip, Sandbox)
  - `/profile` (Player Profile, Steam/Epic linking, Wallet History)
  - `/orders` (Order Tracking & Delivery Status)
  - `/support` (Help Center, Ticket Submission, Command Center)
- Validate visual harmony under the Frozen Disney Club theme (midnight violet `#0d091a`, frosty cyan accents, glowing magenta `#e83d84` CTA buttons, sparkling snow particles).

### R2. Interactive Button & Action Defect Remediation (QC Sweep)
- Verify every interactive button, input field, tab switcher, modal trigger, and link for:
  - Working click handlers (e.g. Add to Cart, Buy Now, Quantity increment/decrement, Tab switches, Copy to clipboard).
  - Proper feedback states (loading spinners, hover transforms, active pressed states, success pulses).
  - Complete elimination of dead links, broken `href` targets, unhandled promise rejections, or console errors.
  - Zero layout overflows, clipped text, or broken mobile viewports (375px to 4K).

### R3. Automated Regression & Data Integrity Preservation
- Preserve all 45 Prisma models, double-entry accounting ledger invariants (`SUM(amount) === 0`), and live backend contracts.
- Ensure all Vitest backend test files (28 files, 208+ tests) pass 100% green with `npm test`.
- Ensure all Playwright frontend E2E test suites (13 suites, 48+ tests) pass 100% green with `npx playwright test --project=chromium`.
- Ensure 0 TypeScript compiler errors across both frontend (`npx tsc --noEmit`) and backend (`npm run build`).

## Acceptance Criteria

### UX/UI & Visual Quality
- [ ] Every page adheres consistently to the Frozen Disney Club theme without visual glitches or unstyled elements.
- [ ] Responsive design operates smoothly across desktop (1600px+), tablet (768px-1024px), and mobile (375px) without horizontal scrollbar leaks.
- [ ] Palworld Storefront (`/shop`) features a functional left sidebar, 3 category pill switches, subcategory horizontal ribbon, and 8-column item grid with quick-buy pink cart buttons.

### Interactive Buttons & Functionality
- [ ] 100% of buttons across all pages have valid interactive handlers, aria-labels, and visual hover/active feedback.
- [ ] Cart drawer opens reliably upon adding items, updates totals, and proceeds smoothly through checkout.
- [ ] Search, filter, and pagination states synchronize correctly with URL query parameters.

### Verification & Automated Testing
- [ ] Backend Vitest tests: 28/28 test files pass (100% green).
- [ ] Playwright E2E suites: 13/13 test suites pass on Chromium against `https://localhost/`.
- [ ] TypeScript check: 0 errors in frontend (`tsc --noEmit`) and backend (`npm run build`).
- [ ] Independent QC audit report documents all verified pages, inspected buttons, and fixed issues.
