# IRIS Enterprise Commerce — Progress & Handoff

> **Living status doc for ALL agents/sessions.** Read this + `TEAM_OWNERSHIP.md` + `ENTERPRISE_REDESIGN_PLAN_TH.md` + `backend/contracts/README.md` before working. Update this file whenever a milestone/phase lands so the next agent can continue cold. Last updated: 2026-06-20.

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
