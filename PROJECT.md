# Project: ARK Iris Heart-Plugin AAA Gaming Transformation

## Architecture
ARK Iris Heart-Plugin is an AAA-grade gaming web platform, launcher, and player marketplace for the ARK: Survival Evolved / Ascended community.
- **Frontend Architecture**: Next.js 16 (App Router), React 18, Tailwind CSS with Obsidian & Prismatic Design Tokens, Framer Motion for interactive micro-interactions, Zustand & TanStack Query for reactive client state.
- **Backend Architecture**: Node.js / Express / TypeScript REST API, Prisma ORM with PostgreSQL, Socket.IO real-time cross-chat, AES-256 / HMAC security layer, and in-game ARK plugin communication.
- **Financial Architecture**: Double-entry accounting money ledger (`LedgerTransaction` + `LedgerEntry`), multi-sub-account ledger structure (Available, Held, Promotional, Refundable, System Issuance, System Clearing, Platform Revenue), zero-sum invariants, and deterministic idempotency hashes.
- **Fulfillment & Marketplace Architecture**: Asynchronous delivery job queue with lease-based state machine, P2P Dino/Item marketplace with escrow holds in `system:clearing:IC`, native cryopod binary blob confidentiality, and mutation lineage tracking.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | AAA Dark Luxury Design System | Obsidian Navy (`#05070D`), Deep River (`#071A24`), Iris Cyan (`#37E5D2`), Royal Orchid (`#A77BFF`), Champagne Gold (`#DDBB72`), Thai typography, GlassCard, glowing frames | M1 | R1, survey |
| F2 | Responsive Multi-Device Layout Hierarchy | Zero overflow across 375px mobile, tablet, 1080p, and 4K viewports, skip-links, WCAG 2.2 AA accessibility | M1 | R1, survey |
| F3 | Platform Pages Visual & Interactive Elevation | High-fidelity UI across `/`, `/shop`, `/market`, `/ranking`, `/event`, `/promotion`, `/packs`, `/topup`, `/profile`, `/orders`, `/support` | M1 | R1, survey |
| F4 | Interactive Commerce & Cart Drawer | Cart line keying by `(productId, serverId)`, Framer Motion sliding cart drawer, server cluster selection | M1 | R1, survey |
| F5 | Dino Player Marketplace & Specimen Dossiers | 3D creature dossiers, gender/level badges, base & mutation stats, color region swatches, ancestry tree | M2 | R2, survey |
| F6 | Marketplace P2P Escrow & Trading Lifecycle | Buyer purchase flow holding funds in clearing, seller listing management, cancel flow, signed in-game delivery release | M2 | R2, R3, survey |
| F7 | Player Ranking & Leaderboard Tiers | 4 competitive categories (Spenders, Playtime, Dinos Killed, Resources Harvested), 3D Esports podium, rank tier badges | M3 | R2, survey |
| F8 | Double-Entry Ledger & Multi-Account Displays | 5 sub-accounts (`available`, `held`, `promotional`, `refundable`, `pending`), double-entry history timeline, zero client-side math | M4 | R3, survey |
| F9 | Top-Up, PromptPay & Payment Gateways | PromptPay QR slip upload verification, sandbox gateway, payment packages with bonus coins | M4 | R3, survey |
| F10 | IRIS ID Auth & Cryptographic Session Security | Discord OAuth, Steam OpenID with HMAC proof cookie, proof-of-control identity linking, UserSession revocation | M4 | R3, survey |
| F11 | Server Cluster Directory & Heartbeat HUD | Public server registry, runtime online status computation (<=180s), cluster capabilities, chat styling | M4 | R3, survey |
| F12 | Automated Verification & Zero Regression | 27 Vitest test suites (195 tests 100% pass), 13 Playwright E2E suites (48 tests 100% green), 0 TypeScript compiler errors | M5 | R4, survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | AAA Gaming UI/UX & Responsive Layout System | Design tokens, GlassCard/Button/Badge primitives, all 11 platform pages visual elevation, 375px-4K responsiveness | none | **DONE** |
| M2 | Player Marketplace & Dino Lineage Trading System | `/market`, `/market/[id]`, `/market/my-listings`, `/market/my-purchases`, P2P escrow integration, mutation/stat dossiers | M1 | **DONE** |
| M3 | Player Ranking, Leaderboard & Esports Tiering | `/ranking`, 4 competitive categories, 3D esports podium, rank badges, player stats integration | M1 | **DONE** |
| M4 | Multi-Account Ledger, Top-Up & Auth Preservation | `WalletPanel.tsx`, 5 sub-account ledger views, PromptPay QR topup, Steam/Discord proof-of-control auth, backend contract preservation | none | **DONE** |
| M5 | Full Platform Verification, E2E Suites & Hardening | 100% Vitest test pass (27 files, 195 tests), 100% Playwright E2E pass (13 suites, 48 tests), 0 tsc errors, adversarial coverage audit | M1, M2, M3, M4 | **DONE** |

## Interface Contracts
### Frontend ↔ Backend Commerce Contract
- Cart items are strictly identified and keyed by `(productId, serverId)`.
- Frontend never performs currency math for checkout; it requests backend checkout sessions (`POST /api/checkout/session`) and displays backend-calculated `totalAmount`.
- Checkout commits (`POST /api/checkout/session/:id/commit`) deduct funds via balanced double-entry ledger transactions (`checkout:commit:<sessionId>`).

### P2P Marketplace Escrow Contract
- Dino purchase (`POST /api/market/listings/:id/buy`) places buyer funds into `system:clearing:IC`.
- Native binary cryopod blobs (`cryopodData`) are filtered out on all public endpoints.
- Seller receives payout only upon signed companion plugin delivery confirmation (`POST /api/plugin/deliveries/:key/complete`).

### Multi-Account Ledger Contract
- Balances are projected from immutable `LedgerEntry` records.
- Wallet balances are returned and rendered verbatim as decimal strings across `available`, `held`, `promotional`, `refundable`, and `pending`.
- Direct manipulation of `User.pointsBalance` outside `walletService.post` is strictly forbidden.

## Code Layout
- `backend/src/`:
  - `controllers/`: API request handlers (`auth`, `cart`, `checkout`, `dino-market`, `order`, `payment`, `plugin`, `product`, `protection`, `ranking`, `server`, `user`, `wallet`).
  - `services/`: Core business logic (`wallet.service.ts`, `delivery.service.ts`, `payment.service.ts`, `promotion.service.ts`, `security.service.ts`, `pdpa.service.ts`).
  - `routes/`: Express route definitions with auth and role middlewares.
  - `config/`: Database and environment configurations.
- `frontend/src/`:
  - `app/`: Next.js App Router platform pages (`/`, `/shop`, `/market`, `/ranking`, `/event`, `/promotion`, `/packs`, `/topup`, `/profile`, `/orders`, `/support`, `/cart`, `/design-system`, `/login`, `/terms`, `/privacy`, `/admin/*`).
  - `components/`: Modular UI primitives (`components/ui/*`) and domain components (`components/account/*`, `components/home/*`, etc.).
  - `lib/`: Contract clients (`contracts/client.ts`), types (`contracts/types.ts`), and global store (`store.ts`).
- `tests/`:
  - `backend/tests/`: Vitest unit and integration test suites (27 test files, 195 tests).
  - `frontend/tests/e2e/`: Playwright E2E test suites (13 spec files, 48 tests).
