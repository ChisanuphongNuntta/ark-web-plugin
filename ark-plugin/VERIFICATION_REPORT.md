# HeartShop Plugin Verification Report

Date: 2026-06-20
Canonical target: `ark-plugin/` -> `HeartShop.dll`
Compiler: MSVC 19.38.33133.0 (Visual Studio 2022, 14.38.33130)
CMake: Visual Studio 17 2022 generator, x64

---

## Milestone 1 — Reproducible Build + Idempotency Journal ✅

- Fresh Visual Studio 2022 x64 Release configure and build (`--fresh`).
- CTest: `DeliveryJournalTests` 1/1 passed.
- Two sequential builds from identical inputs produced the same DLL SHA-256:
  `86992a5f0a389782e6996680c133c53c671fb48431e2dd4f7cab148f4f5e1346`
  (502272 bytes; verified `build-canonical` vs `build-verify`).
- `/Brepro` linker flag suppresses volatile PE timestamps, enabling binary
  reproducibility across separate build invocations on the same machine.
- Durable journal tests cover prepared duplicate blocking, completion replay,
  changed-payload rejection, known-failure retry, and restart recovery.
- Item and dino completion is persisted before backend acknowledgement. A lost
  acknowledgement causes acknowledgement replay, not asset replay.

## Milestone 2 — HMAC-SHA256 Request Signing ✅

- All delivery and heartbeat endpoints are HMAC-SHA256 signed.
- Signed endpoints: `/heartbeat`, `/deliveries/claim`, `/deliveries/**`,
  `/market/prepare-lock`, `/market/confirm-lock`.
- Headers sent: `X-Plugin-Key-Id`, `X-Plugin-Version`, `X-Request-Timestamp`,
  `X-Request-Nonce`, `X-Content-SHA256`, `X-Signature`.
- Canonical string: `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)`.
- Invalid localhost certificate rejected (`SEC_E_UNTRUSTED_ROOT`); diagnostic
  insecure access received HTTP 401 without credential.
- HTTP callbacks that touch Unreal state execute through the game-thread
  dispatcher. Plugin unload waits for active request workers.
- Capability heartbeat reports `pluginVersion`, `buildSha256`, and:
  `["hmac_signatures", "atomic_claims", "p2p_locks"]`.

## Milestone 3 — Delivery Claim/Lease + Idempotency ✅

`PollPendingOrders()` (HeartShop.cpp:508-711) implements the full lease flow:

1. **Claim**: `POST /plugin/deliveries/claim` (replaces old GET orders/pending).
2. **Offline player**: `POST /deliveries/{key}/release` returns to backend queue.
3. **Online player — Journal guard** via `PrepareDelivery` / `Journal->Begin`:
   - `AlreadyCompleted` -> skips game mutation, re-sends
     `POST /deliveries/{key}/complete` with stored `receiptId` (ACK replay).
   - `UncertainPrepared` / `PayloadMismatch` / `PersistenceError` ->
     `POST /deliveries/{key}/fail`; journal blocks duplicate asset grant.
   - `Started` -> proceeds to game mutation.
4. **Game mutation**:
   - `order`: `GiveItemToPlayer` (blueprint, quantity, quality).
   - `dino_marketplace`: `SpawnDinoForPlayer` (blueprint, gender, level).
   - Success: `Journal->Complete` persisted first, then
     `POST /deliveries/{key}/complete` with `localJournalReceiptId`.
   - Failure: `Journal->Abort` + `POST /deliveries/{key}/fail` with error.

**Idempotency guarantee**: a duplicate `deliveryKey` with identical payload
returns `AlreadyCompleted` — no game mutation is re-executed. A changed payload
for an existing ID is blocked as `PayloadMismatch`.

---

## Not yet provable without Backend contract/fixtures

- Atomic delivery claim/lease server ownership (backend-side enforcement).
- P2P prepare-lock/remove/confirm, return, and delivery receipt.
- Safe persistent retry/offline queue and circuit breaker for mutating requests.
- Version/capability negotiation in heartbeat (backend acknowledgement).
- Nonce replay rejection (backend enforcement).

These are specified as CR-PLUGIN-001 through CR-PLUGIN-005 in
`INTEGRATION_AUDIT.md`. Implementing them unilaterally would change the API
contract and is intentionally blocked pending Backend sandbox fixtures.

---

## Sandbox smoke test

Install a trusted certificate for the sandbox, provide a scoped credential only
through the process environment, then run:

```powershell
$env:HEARTSHOP_API_KEY = '<sandbox-scoped-secret>'
.\tests\Invoke-BackendSandboxTest.ps1
Remove-Item Env:\HEARTSHOP_API_KEY
```

The smoke test checks TLS verification, pending item/dino claim, idempotent
re-claim (duplicate blocking), offline lease release, and heartbeat. It does
not settle deliveries or mutate P2P assets without backend-issued fixtures.
