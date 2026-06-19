# HeartShop Plugin Integration Audit

Status: current contract inventory and change requests  
Canonical implementation: `ark-plugin/` (`HeartShop.dll`)  
Legacy implementation: `HeartShop/` (`ArkShop.dll`)

## Current in-game commands

| Command | Current behavior | API dependency |
|---|---|---|
| `/claim` | Fetches all pending item orders for the server, filters by Steam ID, gives items, then acknowledges each order | `GET /api/plugin/orders/pending`, `POST /api/plugin/orders/{id}/deliver` |
| `/points` | Displays the linked account wallet balance | `GET /api/plugin/player/{steamId}` |
| `/shop` | Displays the configured store URL | None |
| `/link` | Displays the player's Steam ID for account linking | None |
| `/protection` | Displays player protection status | `GET /api/plugin/protection/player/{steamId}` |
| `/sell <price>` | Captures dino attributes, creates a listing, then destroys the live dino | `POST /api/plugin/market/plugin/listings` |
| `/market` | Displays marketplace instructions | None |
| `/claimdino` | Fetches pending dino deliveries, spawns each dino, then acknowledges delivery | `GET /api/plugin/market/plugin/deliveries`, `POST /api/plugin/market/plugin/deliveries/{id}/delivered` |

## Background integrations

| Integration | Current behavior | API dependency |
|---|---|---|
| License verification | Runs during plugin initialization | `GET /api/plugin/verify` |
| Item order polling | Polls server orders and delivers when the player is online | `GET /api/plugin/orders/pending` |
| Heartbeat | Reports player count | `POST /api/plugin/heartbeat` |
| Player stats | Reports playtime, kills, and resources | `POST /api/plugin/stats` |
| Player join | Looks up pending orders | `GET /api/plugin/player/{steamId}` |
| Cross-chat receive/send | Polls and publishes messages | `GET/POST /api/plugin/chat/plugin/messages` |
| Protection lifecycle | Registers players, tribes, leave/join, and blocked damage | `/api/plugin/protection/**` |
| Dino returns | Polls cancelled listings and acknowledges return | `/api/plugin/market/plugin/returns/**` |

The backend mount points currently match these paths. No backend route change is
required for the existing behavior.

## Remediated in the canonical plugin

- `ApiUrl` is loaded from configuration and must use HTTPS.
- Production TLS uses the Windows trust store. Invalid-certificate bypass is
  restricted to an explicit localhost-only development setting.
- HTTP results are marshalled to the game thread; unload waits for workers.
- Item and dino delivery use a durable local journal. A completed request is
  acknowledged again without repeating the game mutation. An unresolved
  prepared record is blocked for manual reconciliation.
- Canonical builds are fresh, tested, packaged, and byte-reproducible.

## Remaining operational risks

### Critical

1. `/sell` creates the database listing before destroying the dino. A crash in
   between can leave both the live dino and a sellable listing. The inverse
   order without a durable local journal could permanently lose the dino.
2. `/claimdino` uses a console `SpawnDino` command and acknowledges without a
   verifiable asset fingerprint or spawn receipt.

### High

1. HTTP work still has no bounded queue, retry/backoff policy, or circuit
   breaker. Blind retry is unsafe for listing creation until idempotency keys
   are accepted by the backend contract.
2. API keys are bearer secrets without per-request signature, timestamp, nonce,
   or key ID. Captured requests can be replayed until the key is revoked.
3. Pending marketplace deliveries are returned broadly and filtered by the
   plugin/player rather than claimed atomically for a target server/player.

### Medium

1. Error response bodies and provider request IDs are discarded, reducing
   incident diagnostics.
2. URL query construction does not encode values.
3. Plugin version and supported capabilities are not reported in heartbeat or
   verification.
4. `HeartShop.dll` and legacy `ArkShop.dll` are built from different source
   trees, which can cause deployment drift.

## Backend contract change requests

These are proposals for the Backend chat. The plugin must not switch to these
routes until the contract is accepted and available in the sandbox.

### CR-PLUGIN-001: signed plugin requests

Add versioned scoped credentials and verify:

```text
X-Plugin-Key-Id: <rotatable key id>
X-Plugin-Version: <semantic version>
X-Request-Timestamp: <unix milliseconds>
X-Request-Nonce: <unique random value>
X-Content-SHA256: <lowercase hex>
X-Signature: HMAC-SHA256(canonical request, secret)
```

Canonical input:

```text
METHOD\nPATH_AND_QUERY\nTIMESTAMP\nNONCE\nCONTENT_SHA256
```

Backend requirements: five-minute clock window, nonce replay cache, constant
time comparison, key rotation overlap, server/plugin scopes, and audit events.

### CR-PLUGIN-002: delivery claim lease

Proposed operations:

```text
POST /api/plugin/deliveries/claim
POST /api/plugin/deliveries/{deliveryKey}/complete
POST /api/plugin/deliveries/{deliveryKey}/fail
POST /api/plugin/deliveries/{deliveryKey}/release
```

The claim response must contain `deliveryKey`, `leaseToken`, `leaseExpiresAt`,
target server/player, immutable payload hash, and delivery type. Only one active
lease may exist. Duplicate completion must return the original completed result.

### CR-PLUGIN-003: delivery receipt

Completion request should contain:

- delivery and lease identifiers
- plugin/server/version identifiers
- player Steam ID
- payload hash
- local journal receipt ID
- item quantity/blueprint or dino asset fingerprint
- game timestamp and outcome

The backend must settle an order or P2P escrow only after accepting the receipt.

### CR-PLUGIN-004: P2P asset lock protocol

Replace create-then-destroy with a state machine:

```text
prepare lock -> persist local asset journal -> remove asset -> confirm lock
```

The prepare response supplies an `assetLockId` and expiry. Confirm includes an
asset fingerprint. Abort/expiry returns the asset through an idempotent return
job. A listing cannot become purchasable before lock confirmation.

### CR-PLUGIN-005: compatibility heartbeat

Extend verification and heartbeat with backward-compatible fields:

- plugin semantic version and build SHA-256
- ArkApi version and game build
- supported capabilities/protocol versions
- queue depth, circuit state, last successful delivery
- configuration fingerprint without secrets

Backend should return minimum/supported protocol versions and feature flags.

## Verification gates

- Two fresh builds from identical inputs produce the same DLL SHA-256.
- Invalid production certificates are rejected.
- A duplicate item or dino delivery request mutates the game once.
- Network loss after game mutation does not redeliver the asset.
- Plugin restart preserves completed delivery and asset-lock journals.
- All Unreal object access from HTTP results occurs on the game thread.
- Shutdown waits for or safely cancels outstanding work.
- Sandbox proves request signing, nonce replay rejection, lease expiry, retry,
  duplicate completion, P2P return, and compatibility negotiation.
