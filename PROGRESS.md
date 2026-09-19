# IRIS Enterprise Commerce — Progress & Handoff

## Verified cutover — 2026-07-11

- Production PostgreSQL is at 18/18 migrations; fresh bootstrap, legacy baseline, clone restore/migrate, schema diff, and rollback backups were verified.
- Backend verification: 185/185 unit tests and 28/28 live HTTPS integration tests pass. Frontend production build passes. Plugin canonical build passes CTest 5/5.
- Production services are healthy and one PostgreSQL replica is streaming. Redis and internal database connections use TLS.
- Canonical plugin SHA-256 is `ba59d3857f9f9bec1c834dbad1bc3a3223e1275f4c7b99fd17efe41576dd1a3d`; the same DLL is installed on Server1 and Server2.
- Both game servers now load only `HeartShop` and `Permissions`. Legacy `ArkShop` was moved (not deleted) to `C:\asmdata\DisabledPlugins\HeartShop-rollout-20260711`.
- Legacy balances were deduplicated from two identical SQLite copies: 8 raw rows -> 2 Steam identities -> 35 IC. Hashed pending claims credit the ledger only after verified Steam OAuth.
- All 993 legacy catalog definitions are preserved: 533 item, 362 dino, 68 engram, 30 kit. Exactly 434 compatible single-item definitions are active; unsupported types remain inactive.
- `/iris shop`, smart per-player ranking, authoritative quote/confirm, `/iris buy`, and `/iris claim` are implemented. Ranking never changes a player's price.
- P2P uses asset locks, durable mutation journaling, escrow, and native `FARKDinoData` snapshots with size + SHA-256 verification (`delivery.dino.v2`).
- Server1 and Server2 remain `drain_mode=true`. Do not remove drain or set `ENABLE_DINO_TRADING=true` until the public game servers are deliberately started, real heartbeats report this exact build/capabilities, and an operator completes item + native-dino in-game smoke tests.

Rollback evidence: `backups/postgres/heartshop-pre-baseline-20260711-193020.dump`, `backups/legacy-arkshop/20260711-200711`, and `backups/game-servers/pre-native-v2-20260711-195806`.

> **Living status doc for ALL agents/sessions.** Read this + `TEAM_OWNERSHIP.md` + `ENTERPRISE_REDESIGN_PLAN_TH.md` + `backend/contracts/README.md` before working. Update this file whenever a milestone/phase lands so the next agent can continue cold. Last updated: 2026-07-11. Last visited: 2026-07-11T20:20:00+07:00.

## Runtime hotfix - 2026-07-12

- Fixed repeated plugin HTTP 401s (`Duplicate request (nonce replayed)`) caused by `plugin.routes.ts` applying flexible HMAC authentication as a catch-all before nested chat, market, and protection routers authenticated the same request again.
- Flexible authentication is now attached only to concrete legacy plugin routes. Fresh signed requests to nested chat, market, and protection endpoints return HTTP 200, while an intentional nonce replay still returns HTTP 401.
- Read-only catalog browsing now remains available in drain mode while quote/confirm/delivery mutations stay blocked. Backend typecheck and all 193 unit tests pass; the production backend image was rebuilt and deployed healthy.
- `/shop` now aliases the backend-authoritative `/iris shop`, and player chat no longer repeats the HeartShop prefix. Canonical plugin CTest passes 5/5; both game servers have the new DLL hash above.

## How work is run
- 3-team agent orchestration driven by Claude via the Workflow tool. Pipeline per milestone: **Backend (contracts = source of truth) → Frontend ∥ Plugin → Integration Verify**.
- Ownership (write only your own): Backend `backend/**` (incl `backend/contracts/**`), Frontend `frontend/**`, Plugin `ark-plugin/**` + `HeartShop/**`. See `TEAM_OWNERSHIP.md`.
- Commit per merge order: Backend contract → Frontend/Plugin → Verify. Git baseline = `e9a1489`.

## Build / run constraints (important)
- **F: drive returns `readlink=EISDIR` drive-wide** → `next build`/`next dev` cannot run natively on the host. The app runs via **Docker** (`docker compose`; `heart-plugin-frontend-1/2` healthy, Bun + `next dev`). For native FE verification use `npx tsc --noEmit` (works); `npm run lint` also works on host.
- `frontend/Dockerfile.prod` exists (multi-stage, `output: standalone`); it compiles through webpack — the only thing gating the prod build is **app ESLint errors** (see Known issues).
- Dev **Postgres is reachable only inside the Docker network** (host `localhost:5433` is unmapped → P1001). Backend tests mock Prisma globally (`tests/setup.ts`), so no test has hit a real DB.

## Milestone status
| # | Milestone | Status |
|---|---|---|
| 1 | Baseline build | ✅ done (build path = Docker; native F: build impossible) |
| 2 | IRIS ID & Wallet | ✅ done (ledger projection, account linking/sessions) |
| 2.5 | Backend hardening | ✅ done (HMAC keyId→secret, plugin companion routes, linked-identities) |
| 3 | Cart/Checkout & Delivery | 🔄 **IN PROGRESS** (workflow `w292tri9y` running) |
| 4 | Auto Top-up | ⬜ not started |
| 5 | P2P Escrow | ⬜ not started |
| 6 | Unified notifications | ⬜ not started |
| 7 | Production verification | ⬜ not started |

## Commit log (newest first)
| Commit | What |
|---|---|
| `f46382c` | backend M2 hardening — HMAC keyId→secret (ServerCredential model), CR-PLUGIN-006/007/008 companion routes, GET /auth/identities, cart-sync decision. 96 tests |
| `7df390d` | plugin M2 — split HMAC key-id from secret (signed paths), /iris, wallet event sync. CTest 2/2 |
| `fb70b3e` | frontend M2 — Account Center, Wallet UI, cart per-line (productId,serverId) keys, itemBlueprint |
| `d8d88df` | backend M2 — Wallet ledger projection (dual-write retired), IRIS ID, public GET /servers. 77 tests |
| `4ccd2f8` | frontend M1 — design tokens, typed contract layer, eslint skew fix |
| `cd10a04` | backend M1 — solidify Wallet+Cart+Checkout contracts |
| `e4372dc` | chore — ignore tsbuildinfo |
| `e9a1489` | baseline snapshot |

## In flight — M3 (workflow `w292tri9y`)
Backend: POST /cart/sync (bulk, server-authoritative), Order state machine (draft→pending_payment→paid→queued→delivering→delivered + failed/refunded/cancelled), GET /orders + /orders/{id} timeline, refund via ledger, delivery orchestrator (claim-lease + idempotent complete + retry/dead-letter). FE: checkout flow + Orders + delivery timeline UI. Plugin: switch to SIGNED requests (keyId/secret), confirm delivery idempotency, wire /iris to real companion routes. → results pending; commit per merge order when done.

## Latest plugin verification — Chat 3 (2026-06-20)
- Canonical plugin path remains `ark-plugin/` → `HeartShop.dll`; legacy `HeartShop/` is not the production canonical build path unless explicitly ported.
- `ark-plugin/scripts/Build-Plugin.ps1` passed twice from a fresh CMake configure.
- CTest passed 4/4: `DeliveryJournalTests`, `WalletNotificationsTests`, `RequestPolicyTests`, `RequestSigningTests`.
- Reproducible DLL SHA-256: `7f8fea5719443557d7dad62926f3f65e683bb7f93d198fec3cfd5be2d89fff74`.
- Request signing has deterministic C++ unit coverage for SHA-256 body hash, HMAC-SHA256, canonical path+query ordering, CSPRNG nonce format, and signed endpoint classification, including Backend flexible-auth legacy plugin routes.
- Server1 smoke deploy completed at `C:\asmdata\Servers\Server1`: plugin backup stored outside `ArkApi\Plugins`, issued ServerCredential for `serverId=1`, signed heartbeat returned 200, replay returned 401, signed `/verify`, `/deliveries/claim`, and `/wallet/events` returned 200, and ArkApi loaded HeartShop successfully under PID 45340.
- Delivery claim/lease/complete/fail/release is integrated with durable local idempotency journal semantics; duplicate completed delivery acks do not repeat game mutation, and failed completion persistence remains `prepared` instead of acking.
- Backend audit status: CR-PLUGIN-001 through CR-PLUGIN-003 ready; CR-PLUGIN-005 heartbeat compatibility partial; CR-PLUGIN-004 P2P lock remains blocked because `prepare-lock` lacks plugin idempotency, `confirm-lock` is not atomic/idempotent, and no cancel/abort/return route exists.
- Do not switch `/sell` to the new P2P lock flow until Backend hardens CR-PLUGIN-004. Current `/sell` remains legacy and is documented as a crash-window risk in `ark-plugin/P2P_SAFETY_AUDIT.md`.

## Deploy-prerequisites (NOT dev-blockers, do before any cutover)
1. Apply additive migration `20260620040000_add_server_credentials` (`prisma migrate deploy` + seed) **inside the Docker network** — host can't reach the DB.
2. Add a **live-DB integration test** for the signed-credential path (all current tests mock Prisma).
3. `encryptDeterministic` uses a static IV and `ENCRYPTION_KEY` defaults to a hardcoded literal if unset (it IS set in this env) — move to randomized IV + ensure key is set in every env.
4. Remove the `keyId==secret` legacy HMAC overlap once every server has an issued `{keyId,secret}`.
5. Commit a `bun.lockb` for the Docker/Bun path (currently `bun install` floats; no lockfile tracked).

## Known issues / tech debt
- **REAL bugs (gate the prod `next build`): `react-hooks/rules-of-hooks` — conditional `React.useId()` in `frontend/src/components/ui/Input.tsx:33` and `Select.tsx:29`.** Frontend-owned; fix to unblock `frontend/Dockerfile.prod`.
- 21× `react/no-unescaped-entities` (cosmetic) in admin/chat-ranks, admin/servers, admin/products, components/ApiKeyManager — also gate `next build`.
- **M5 (P2P Escrow):** `/sell` is create-then-destroy (CRITICAL — crash window leaves a live dino + a sellable listing); `prepare-lock`/`confirm-lock` exist in contract but are dead scaffolding.
- **M5 ledger convergence:** 4 money paths still write `pointsBalance` directly bypassing the ledger — `order.controller` (POST /orders), `dino-market` P2P, `admin` credit/refund, `user` rewards. Converge onto `walletService.post` to keep the wallet invariant globally true.
- Frontend cart→checkout depends on syncing local Zustand lines to the server cart (`/cart/sync` being added in M3) before `/checkout/session`.
