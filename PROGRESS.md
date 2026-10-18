# IRIS Enterprise Commerce — Progress & Handoff

## Admin "every transaction" + review fixes — 2026-10-18 (uncommitted)

- Contract: `backend/contracts/admin-transactions-2026-10.md` (list/detail/summary/CSV export/reconcile, `admin:transaction`, `admin:ledger:mismatch`). UI: `/admin/transactions` + `/admin/transactions/reconcile`.
- Ledger convergence verified: the only `User.pointsBalance` write in `backend/src` is the projection inside `walletService.post` (POST /orders, dino P2P, admin adjust/refund and rewards all post through the ledger; `tests/unit/ledger-convergence.test.ts` scans the source).
- Review fixes applied:
  - Stripe `verify-session` credits only a `stripe` intent the caller owns, validates the session like the webhook, uses the webhook's key `payment:<intentId>:credit`, and gates on a conditional `pending|processing -> completed` flip. The no-intent branch, which minted IC, is gone (now 404).
  - `POST /admin/users/:id/points`: caller keys are namespaced `admin:adjust:<adminId>:<key>`. A replay returns the original posting with `replayed: true` and writes no second audit row; a P2002/P2034 race gets the same answer.
  - **Refund policy:** order refunds now credit `available`, the same as dino refunds. Legacy refunds left in `refundable` show as `refundableAfter` on admin rows and as `refundableBalances` in reconcile. Moving them is an admin decision (open).
  - Socket room `admin` is now role admin|root only (it no longer accepts the legacy `isAdmin` flag). Membership is re-checked every 60s. Logout or revoke disconnects that session's sockets, a demotion leaves the room, and a ban disconnects the user.
  - Delivery: a release no longer counts as an attempt. Release backoff runs 30s up to 5 min. The streak is incremented only after the release wins. Visibility comes from a DB probe marker (not Redis). An expired lease with no attempts left is dead-lettered (order -> failed / escrow refund).
  - Admin rows `balanceAfter` fallback ordered by `postedAt`. CSV export uses keyset pagination with a 5s settle snapshot and adds a truncation marker row. Reconcile logs Redis-lock skips and, after 2 windows, runs without the lock (audit `ledger_reconcile_degraded`).
- Verified: backend `tsc` + `vitest run tests/unit` (561 tests), frontend `tsc` + `eslint` (0 errors), `heart-plugin-backend:tx-check` and `heart-plugin-frontend:tx-check` Docker builds. Not deployed and no containers restarted.

## Pending owner decisions — end of session 2026-10-18 23:15 (+07)

- Server1: `drain_mode=false`, lifted for the in-game smoke test. The test passed: 3 items and 1 Aquatica dino (Tiktaalik) delivered. Server2 is still drained.
- Plugin 7dc0dae6... (commit 2f3f244: ArkShop-style item give, cryopod dinos, delivery guard, extras) was INSTALLED on Server1 and Server2 while both were stopped, on 2026-10-18 23:57 (+07). The old DLL ec155f58 and the configs are backed up in `C:smdata\Backups\HeartShop-plugin\Server{1,2}-20261018-235729`. Smoke test on the next start:
  - the heartbeat lists delivery.dino.cryopod.v1, delivery.item.stats.v1 and delivery.dino.extras.v1;
  - buying 2× a non-stackable item gives 2;
  - a large resource pack is split into stacks;
  - a dino arrives as a cryopod;
  - a full inventory defers the delivery.
- nginx 1.28.2 → 1.30.6: config tested OK, awaiting approval.
- Refunds posted before 2026-10-18 sit in the `refundable` sub-account. Decide whether to move them to `available`.
- Legacy items to fix: #212, #267 and #810 have names that don't match what they deliver. The Genesis Part 2 port 28013 appears twice.
- Deploys cause a few seconds of plugin 502s while the gateway recreates. Consider running 2 gateway replicas.

## Item catalog + dossier art + game servers online — 2026-10-18

- Items: 1,676 active (was 538), applied via `scripts/item-catalog/apply-plan.ts --apply` (backup `backups/postgres/heartshop-pre-item-catalog-20261018-152656.dump`). Legacy rows were left untouched apart from added images. 167 drafts stay off (ASA-only, platform-exclusive, mission-only, admin/debug, etc.). Icons: `frontend/public/images/catalog/ark/items` (1,501 webp).
- Dinos now use parchment dossier art: `images/catalog/ark/dossiers`, 286 files (commit f39a707).
- Server1 and Server2 came online 2026-10-18 15:15 (+07). Plugin build ec155f58 loads, its license verifies, and heartbeat, claim, wallet events and chat return 200 through the plugin gateway on :8443. Both servers are still `drain_mode=true`.
- Fixed: nginx pinned upstream container IPs, so a gateway recreate caused about 2 minutes of 502s. Upstreams now use `resolve` with the Docker DNS resolver 127.0.0.11 (commit e51d4a5).
- Owner review items:
  - legacy #212 "Chibi-Doedicurus" delivers the Direbear chibi;
  - legacy #267 "Chibi-Skeletal Jerboa" delivers the Skeletal Bronto chibi;
  - #810 "Stego Saddle" delivers a Tapejara Tek Saddle;
  - non-boss trophies are priced at 40 IC;
  - nginx 1.28.2 is legacy and affected by 22 CVEs; 1.30.6 is tested and pending owner approval.

## Dino catalog — 2026-10-18 (commits db6c868, 7cd07b7)

- 414 active dinos (was 362), every one with an image and every one passing the real delivery builder and the HeartShop.cpp guards. Applied with `scripts/dino-catalog/apply-plan.ts --apply` (one transaction, audited). Backup: `backups/postgres/heartshop-pre-dino-catalog-20261018-031047.dump`.
- Owner rules:
  - legacy prices and levels are kept, cheap legacy dinos stay as they are;
  - Aquatica creatures are sold;
  - no Reaper King, Rhyniognatha or Reapers;
  - wiki-untameable creatures (Riftwalker, Takifugu, Vulcanite) are excluded;
  - Titanosaur is excluded (temporary tame).
- New prices come from the legacy species price × learned variant multiplier (Aberrant/Abyssal 1.5, X 1.8, R 2, Tek 2), or from a legacy tier median.
- Images: 342 ark.wiki.gg webp in `frontend/public/images/catalog/ark/dinos` (ATTRIBUTION.md; footer credit).
- Legacy fixes: Ferox Lv.75/Lv.100, Maewing names Lv.200/Lv.400.
- Water-only creatures say "ต้องอยู่ในน้ำตอนรับ" (they spawn where the buyer stands).
- Aquatica creatures need servers that have the Aquatica content.
- Nothing has been spawn-tested in game yet: test one land, one aquatic and one Aquatica creature when Server1 is up.

## Admin pagination + Frozen admin theme — 2026-10-17 (commits 1d9dc21, 5582d09)

- Backend `utils/pagination.ts`: page clamped server-side, pageSize snapped to 10/25/50/100 (max 100), count+rows in one transaction, stable `id` tiebreak. Applies to /admin servers, products, users, api-keys, chat-ranks, categories, protection, content. Without `page` the old full-list behaviour is kept.
- `/admin/servers` list rows return `apiKeyLast4` only. The full key comes back only on create and regenerate. `counts` per gameMode feed the tabs.
- Fixed: a server_admin with no assigned server used to see every user and API key.
- Frontend admin kit is in `frontend/src/components/admin/**` (see `frontend/ADMIN_UI.md`). `usePaginatedQuery` keeps page, size, search and filters in the URL and remembers rows-per-page per table. All 11 admin pages use the Frozen look.
- Verified against the live DB: filters, clamp, counts, and 400 on bad filters. DB backup: `backups/postgres/heartshop-pre-admin-pagination-20261017-221008.dump`.

## Plugin gateway split — 2026-10-17 (commit 03ff057)

- Backend runs as two compose services from ONE image: `backend` (`SERVICE_ROLE=web`: site/user/admin API, Socket.IO, Discord bot, runs migrations) and `plugin-gateway` (`SERVICE_ROLE=plugin-gateway`: `/api/plugin/**` only). Same Postgres/Redis.
- nginx: `/api/plugin/` returns 404 on public 80/443. Plugins use `https://localhost:8443/api/plugin`, published only on `127.0.0.1:8443`. Docker Desktop NATs every client to 172.18.0.1, so isolation is by loopback port binding, not an IP allowlist. Remote game servers must come in over a VPN.
- Server1/Server2 `ArkApi/Plugins/HeartShop/config.json` ApiUrl now points to :8443 (backups `config.json.bak-20261017-191325`). Game servers are still offline + drained.
- osv1 promoted admin → root (audited). Frontend reverted to the Frozen design (3734951) per owner; only nav click effects removed.
- Stack sheet: https://claude.ai/artifact/Eyb5Vmunx2iCco38s9YJYm

## UI redesign + server directory deployed — 2026-10-17

- Commits `3f51fca` (backend), `9ac4099` (frontend), `4e133ad` (seed fix). Deployed to Docker prod (backend + 2 frontends healthy). Pre-deploy DB backup: `backups/postgres/heartshop-pre-redesign-20261017-181451.dump`.
- Migration `20261017010000_server_directory_site_settings` applied (19/19). `GameMode` enum per Server (PVE/PVE_MOD/PVPVE), Cluster metadata, `SiteSetting`.
- Seasonal theming: `html[data-season]` (default/winter/christmas/easter), `GET /api/site/settings`, admin override at `/admin/settings`; `auto` resolves by Asia/Bangkok date (2026-10-17 → winter). Design rules: `frontend/DESIGN.md` (no glow/sparkle/glass/gradient text).
- Server directory seeded: 4 clusters × 13 maps = 52 listed servers (`npm run seed:servers`, idempotent, all new rows `drainMode=true`, no credentials). Public page `/servers`; legacy `/Listserver-*` URLs 308-redirect. Existing plugin servers 1–2 stay in cluster `PrivateEIEI022` (gameMode unset — assign in admin). Fixed `servers_id_seq` (was `is_called=false`).
- Open data anomalies (admin must confirm): PvPvE vs PvE-Mod Genesis Part 2 both list port 28013; Pre-Aqua Scorched Earth/Aquatica have no address.
- Admin console behind `AdminGuard` (admin|server_admin|root; root-only items hidden). Fixed: slip approval on unknown id used to credit the approving admin.
- NEXT: full catalog — 1,440 ark.wiki.gg reference drafts (`frozen-reference:*`, 1,122 items + 318 dinos) are inactive pending price/deliverability review; 1,706 products lack images.

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
| 3 | Cart/Checkout & Delivery | ✅ done (see cutover 2026-07-11) |
| 4 | Auto Top-up | ✅ done (Stripe + bank slip, Sep 2026) |
| 5 | P2P Escrow | ✅ done (asset locks + native dino snapshot) |
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
- ~~**M5 ledger convergence:** 4 money paths wrote `pointsBalance` directly~~ — RESOLVED (verified 2026-10-18): all post through `walletService.post`; the projection write inside `post` is the only `pointsBalance` writer.
- Frontend cart→checkout depends on syncing local Zustand lines to the server cart (`/cart/sync` being added in M3) before `/checkout/session`.
