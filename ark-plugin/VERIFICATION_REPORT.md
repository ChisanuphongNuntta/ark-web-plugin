# HeartShop Plugin Verification Report

Date: 2026-06-20  
Canonical target: `ark-plugin/` -> `HeartShop.dll`

## Verified locally

- Fresh Visual Studio 2022 x64 Release configure and build passed.
- CTest passed 4/4: `DeliveryJournalTests`, `WalletNotificationsTests`,
  `RequestPolicyTests`, and `RequestSigningTests`.
- Two successful final builds were byte-identical. DLL SHA-256:
  `7f8fea5719443557d7dad62926f3f65e683bb7f93d198fec3cfd5be2d89fff74`.
- Production TLS rejected the current untrusted localhost certificate.
- HMAC requests use a 128-bit Windows CSPRNG nonce and sign the exact path and
  query sent over WinHTTP.
- Request signing has deterministic C++ unit coverage for SHA-256 body hashes,
  HMAC-SHA256, canonical string ordering, nonce format, and signed endpoint
  classification, including Backend flexible-auth legacy plugin routes.
- HTTP is limited to eight concurrent workers. The circuit opens after five
  final transient failures for 30 seconds and permits one half-open probe.
- GET/HEAD retry at most twice with 250/500 ms backoff. Mutating requests are
  never retried automatically.
- Delivery claim/lease/complete/fail/release is integrated with the Backend
  contract. Completion is journalled durably before acknowledgement.
- Duplicate completed deliveries replay only the acknowledgement. Prepared or
  payload-mismatched records block a second game mutation.
- A forced `MoveFileEx` persistence failure proves that an unsuccessful journal
  completion rolls back to `prepared` and cannot be acknowledged as durable.
- HTTP callbacks that access Unreal objects execute on the game thread; plugin
  unload waits for request workers.
- Heartbeat reports the actual ArkApi version and circuit state and does not
  advertise the unsafe P2P lock capability.
- Server1 runtime smoke test loaded `HeartShop.dll` under ArkApi 3.56, accepted
  a ServerCredential signed heartbeat, rejected nonce replay, and initialized
  after legacy plugin routes were moved to HMAC flexible auth. Signed `/verify`,
  `/deliveries/claim`, and `/wallet/events` smoke requests returned 200.

## Backend contract status

- CR-PLUGIN-001 (HMAC/scoped credentials): implemented by Backend and Plugin.
- CR-PLUGIN-002/003 (claim lease and delivery receipt): implemented by Backend
  and Plugin.
- CR-PLUGIN-004 (P2P lock): routes exist but confirm is not transactional or
  idempotent and cancel/expiry-return is missing. `/sell` must remain blocked
  from the new lock flow; see `P2P_SAFETY_AUDIT.md`.
- CR-PLUGIN-005 (compatibility): Plugin sends telemetry, but Backend does not
  yet persist it or return minimum/supported protocol versions.

## Sandbox verification

The sandbox is reachable but its localhost certificate is not currently trusted.
For local development only, Server1 currently uses the localhost-only invalid
certificate bypass. For production, install a trusted certificate/CA and set
`Security.AllowInvalidCertificates` back to `false`.

After installing the sandbox CA and obtaining an issued `keyId`/`secret`, run:

```powershell
$env:HEARTSHOP_KEY_ID = '<sandbox-key-id>'
$env:HEARTSHOP_HMAC_SECRET = '<sandbox-secret>'
.\tests\Invoke-BackendSandboxTest.ps1
Remove-Item Env:\HEARTSHOP_KEY_ID, Env:\HEARTSHOP_HMAC_SECRET
```

The test sends a signed heartbeat and proves replay rejection by submitting the
same timestamp, nonce, body hash, and signature twice. Secrets are not written
to disk.

## Remaining gates

- Backend P2P prepare/confirm must become transactional and idempotent and gain
  abort, expiry reconciliation, return jobs, and stable receipts.
- Backend heartbeat must return a compatibility verdict and supported protocol
  range.
- A Backend-issued delivery fixture is required for end-to-end lease-expiry and
  duplicate-completion testing against the live sandbox.
