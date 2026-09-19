# E2E Test Infra: ARK Iris Heart-Plugin

## Test Philosophy
- Opaque-box, requirement-driven end-to-end verification covering all platform pages, commerce flows, and backend contracts.
- Independent verification mechanisms with zero client-side mock leaks into production bundles.
- Systematic testing across UI/UX visual fidelity, responsive layouts (375px to 4K), multi-account ledger displays, and P2P marketplace lifecycle.

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Vitest Backend Coverage | Playwright E2E Coverage |
|---|---------|-------------------|:-----------------------:|:-----------------------:|
| F1 | AAA Dark Luxury Design System | ORIGINAL_REQUEST §R1 | — | `design-system.spec.ts` (5 tests) |
| F2 | Responsive Multi-Device Layout | ORIGINAL_REQUEST §R1 | — | `layout-shell.spec.ts` (2 tests), `product-detail.spec.ts` (responsive check) |
| F3 | Platform Pages Visual Elevation | ORIGINAL_REQUEST §R1 | `api.test.ts` (28 tests) | `home.spec.ts` (5 tests), `support.spec.ts` (2 tests), `orders-detail.spec.ts` (3 tests) |
| F4 | Interactive Commerce & Cart | ORIGINAL_REQUEST §R1 | `cart-checkout.test.ts` (8), `cart-sync.test.ts` (6) | `cart.spec.ts` (3 tests), `commerce-flow.spec.ts` (1 test), `shop.spec.ts` (4 tests), `product-detail.spec.ts` (7 tests) |
| F5 | Dino Marketplace Dossiers | ORIGINAL_REQUEST §R2 | `ledger-migration.test.ts` (14) | `market.spec.ts` (2 tests) |
| F6 | Marketplace P2P Escrow | ORIGINAL_REQUEST §R2 | `ledger-migration.test.ts`, `api.test.ts` | `market.spec.ts` |
| F7 | Player Ranking & Leaderboard | ORIGINAL_REQUEST §R2 | `plugin-companion.test.ts` (7) | `layout-shell.spec.ts`, `/ranking` integration |
| F8 | Multi-Account Ledger Display | ORIGINAL_REQUEST §R3 | `wallet.service.test.ts` (6), `wallet-projection.test.ts` (7), `milestone2.test.ts` (8) | `wallet-profile.spec.ts` (5 tests) |
| F9 | Top-Up, PromptPay & Gateways | ORIGINAL_REQUEST §R3 | `payment.service.test.ts` (7) | `topup.spec.ts` (3 tests) |
| F10 | IRIS ID Auth & Cryptographic Session | ORIGINAL_REQUEST §R3 | `security.service.test.ts` (8), `linked-identities.test.ts` (3), `encryption.test.ts` (4) | `auth.spec.ts` (6 tests) |
| F11 | Server Cluster & Heartbeats | ORIGINAL_REQUEST §R3 | `server.controller.test.ts` (4), `plugin-companion.test.ts` (7) | `home.spec.ts` |
| F12 | Automated Verification & Integrity | ORIGINAL_REQUEST §R4 | 27 Vitest test suites (195 tests) | 13 Playwright E2E suites (48 tests) |

## Test Architecture
- **Backend Test Runner**: Vitest v4.1.10 (`npm test` in `backend`), isolated node environment with centralized schema mock in `backend/tests/setup.ts`.
- **Frontend E2E Runner**: Playwright v1.60.0 (`npx playwright test --project=chromium --workers=1` in `frontend`), Chromium browser automation with network mock interceptors.
- **Typecheck**: `tsc --noEmit` in both `backend` and `frontend`.
- **Unified Test Runner**: `bash tests/run-all-tests.sh` executing all pipelines in sequence.
