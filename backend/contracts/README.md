# Backend Contracts

`openapi.yaml` is the HTTP source of truth. `events/` contains versioned event payload schemas and `fixtures/` contains non-production examples for frontend/plugin consumers.

Compatibility policy:

- Additive optional fields are backward compatible.
- Removing/renaming fields or changing meaning requires a new API/event version.
- Wallet ledger balances/amounts are serialized as decimal strings (`pattern: ^-?[0-9]+$`). Catalog `Product.price` is a plain integer.
- Consumers must ignore unknown additive fields.

## Files

HTTP (`openapi.yaml`):

- Wallet: `GET /wallet`, `GET /wallet/transactions`
- Payments: `GET /payments/packages`, `POST /payments/intents`, `GET /payments/intents/{id}`, signed provider callback `POST /payments/webhooks/{provider}`
- Cart: `GET /cart`, `POST|PUT|DELETE /cart/items`, `POST /cart/sync` (bulk atomic replace, M3)
- Checkout: `POST /checkout/session`, `POST /checkout/session/{id}/commit`
- Orders (user-scoped, M3): `GET /orders` (paginated list), `GET /orders/{id}` (order + delivery timeline), `POST /orders/{id}/refund` (delivered/failed -> refunded via wallet ledger)
- Catalog (public, read-only): `GET /products`, `GET /products/featured`, `GET /products/categories`, `GET /products/{id}`, `GET /servers`
- Auth/IRIS ID: account linking (proof-of-control, no auto-merge by email/name), `GET /auth/me`, `GET /auth/identities` (LinkedIdentitiesResponse), `GET /auth/sessions` (with risk flags), `DELETE /auth/sessions/{id}`, `POST /auth/recovery` (proof-of-control challenge stub)
- Plugin (signed): heartbeat/delivery/market signed with `hmacAuth` — `X-Plugin-Key-Id` is a rotatable key id, separate from the HMAC secret (see `securitySchemes.hmacAuth`). The live verifier resolves `keyId -> secret` server-side (a `ServerCredential` whose keyId != secret) and verifies `X-Signature` against the resolved secret; the credential is bound to one server scope.
- Plugin (companion, signed, read-only, server-scoped) — for the in-game `/iris`: `GET /plugin/player/{steamId}/wallet` (WalletBalance), `GET /plugin/player/{steamId}/pending-deliveries` (`{ pending }`), `GET /plugin/wallet/events?cursor=` (`{ success, events, lastCursor }`, events carry additive `playerSteamId`+`userId`)
- Plugin (legacy, CR-PLUGIN-006): `/plugin/verify`, `/plugin/orders/pending`, `/plugin/stats`, `/plugin/player/{steamId}`, plus `protection/**`, `chat/plugin`, `market/plugin` now declare `hmacAuth` as the target. During the migration overlap window the legacy `X-API-Key` (`legacyApiKeyAuth`) is still accepted and logged as a deprecation (`authenticatePluginFlexible`).

### Issuing / rotating signed-plugin credentials

A signing credential is a pair `{ keyId, secret }` scoped to one server. The plugin sends only `keyId` on the wire (`X-Plugin-Key-Id`); the secret signs `X-Signature` and is stored encrypted-at-rest (never returned by any read endpoint).

```
# from backend/
tsx scripts/issue-plugin-credential.ts issue  <serverId> [label]      # new pair (prints secret once)
tsx scripts/issue-plugin-credential.ts rotate <serverId> <oldKeyId>   # new pair + revoke old keyId
tsx scripts/issue-plugin-credential.ts revoke <keyId>                 # revoke a keyId
```

`npm run db:seed` also issues a dev credential for the seeded server and prints `{ keyId, secret }` once. Rotation supports a zero-downtime overlap window: a new keyId can be issued while the old one stays active until the plugin switches.

Events (`events/`):

- `wallet.transaction-posted.schema.json` + `wallet.transaction-posted.example.json` — emitted whenever a balanced ledger transaction is posted. Event entries carry BOTH sides of the double-entry; the per-user `GET /wallet/transactions` response only returns the caller's own entries.

Fixtures (`fixtures/`, non-production examples):

- `payment-packages.json` — `GET /payments/packages`
- `payment-intent.json` — `POST /payments/intents`; replay returns the same intent with `replayed: true`

- `wallet-balance.json` — `GET /wallet`. `available` is the spendable balance; all amounts are decimal strings.
- `wallet-transactions.json` — `GET /wallet/transactions`
- `products.json` — `GET /products` (list + pagination). Uses `itemBlueprint` (matches schema + live API), and includes `stock`/`maxPerUser`/`isFeatured`. `null` stock/maxPerUser = unlimited.
- `products-featured.json` — `GET /products/featured` (only `isFeatured: true`, no pagination)
- `servers.json` — `GET /servers`. `isOnline` is DERIVED from `lastHeartbeat` recency (3-minute window in the controller). Secrets (`apiKey`, `webhookUrl`) are never exposed. `mode`/`playerCount`/`maxPlayers` are intentionally absent — the `Server` model does not store them yet.
- `cart.json` — `GET /cart`
- `cart-sync.json` — `POST /cart/sync` (`request` = body the FE sends, `response` = the replaced cart, same shape as `GET /cart`)
- `checkout-session.json` — `POST /checkout/session` (`totalAmount` = sum of snapshot `price * quantity`)
- `orders.json` — `GET /orders` (paginated list of the user's orders; `status` uses the order state machine)
- `order-detail.json` — `GET /orders/{id}` (`order` + `delivery` summary + chronological `timeline`)
- `linked-identities.json` — `GET /auth/identities` (LinkedIdentitiesResponse). Every provider is reported; unlinked providers have null fields and `canUnlink: false`. `canUnlink` enforces minimumLinkedProviders=1.
- `sessions.json` — `GET /auth/sessions` with `isCurrent`/`riskFlag`/`riskReasons`
- `player-wallet.json` — `GET /plugin/player/{steamId}/wallet` (WalletBalance; decimal strings)
- `player-pending-deliveries.json` — `GET /plugin/player/{steamId}/pending-deliveries`
- `wallet-events.json` — `GET /plugin/wallet/events` (events carry additive `playerSteamId`+`userId`; pass opaque `lastCursor` back as `?cursor=`)

Money rule (decimal-string): wallet ledger balances/amounts (`GET /wallet`, `GET /wallet/transactions`, `totalSpent`, `totalAmount`) are serialized as decimal strings (`^-?[0-9]+$`). `Product.price`, `quantity`, `quality` are plain integers. The frontend must NOT compute final prices/balances — the backend ledger is authoritative.

## Cart-sync decision (M2 → M3)

DECISION (unchanged): the **server cart is the source of truth** for checkout. `POST /checkout/session` builds the checkout snapshot from the persisted server-side cart (`Cart`/`CartItem`), NOT from a cart object posted in the request body. The frontend never computes the final total — `totalAmount` comes back from the session.

M3 update — `POST /cart/sync` (bulk atomic replace) now exists (the M2 "deferred to M3" item). It accepts the full line set `{ productId, serverId, quantity }[]` the user sees and atomically REPLACES the server cart after re-validating price/stock/server-compatibility + per-user limits server-side. This is the preferred way for the frontend to make the server cart match the local cart in one call.

Frontend contract:

- Build the local cart in the browser, then call `POST /cart/sync` with the full line set BEFORE `POST /checkout/session`. The endpoint merges duplicate `(productId, serverId)` lines (sums quantity), drops `quantity <= 0` lines, and on any validation failure leaves the cart untouched (validate-then-replace). Re-sending the same lines is idempotent.
- The per-line endpoints `POST /cart/items` (add), `PUT /cart/items` (change quantity), `DELETE /cart/items` (remove) remain supported for incremental drawer edits and are still a valid path.
- An anonymous (pre-login) cart held only in the browser is replayed onto the server cart via a single `POST /cart/sync` (or the same `/cart/items` calls) after login, before checkout.
- Cross-device cart revision/merge (§16) remains future work; `POST /cart/sync` is last-write-wins per user.

## Order state machine + delivery (M3, §8 / §18)

Order status follows the state machine (`src/services/orderState.ts`, schema `OrderStatus`):

```
draft -> pending_payment -> paid -> queued -> delivering -> delivered
                                  \-> failed (dead-lettered delivery, refundable)
delivered|failed -> refunded        (terminal)
* -> cancelled                       (terminal, pre-delivery)
```

- `POST /checkout/session/{id}/commit` settles payment through the wallet ledger and creates each order at `queued` (it passes through `paid` atomically), plus a `DeliveryJob` (operational lease/idempotency) and a `Fulfillment` (durable per-order delivery timeline). `deliveryKey == DeliveryJob.id == Order.id`.
- Plugin delivery (`/plugin/deliveries/*`, `hmacAuth`, server-scoped):
  - `claim` leases pending jobs (past their backoff) or jobs whose lease expired; on claim the order moves `queued -> delivering`. dead-letter/completed/failed jobs are never re-claimed.
  - `complete` is **idempotent on `deliveryKey`**: the first success flips the order `delivering -> delivered` and stores the receipt; any duplicate callback returns the ORIGINAL receipt (`duplicate: true`) and does NOT deliver or settle again.
  - `fail` retries with exponential backoff (`nextRetryAt`) while `attempts < maxAttempts` (order `delivering -> queued`); once exhausted the job is dead-lettered and the order moves to `failed` (`retry: false, deadLetter: true`).
  - `release` (player offline) returns the job to `pending` and the order `delivering -> queued` without consuming an attempt.
- `POST /orders/{id}/refund` (delivered|failed -> refunded): money flows ONLY through the wallet ledger — platform revenue debit + buyer `refundable` credit (zero-sum). `pointsBalance` is never written directly. Idempotent via ledger key `order:refund:{id}`; refunding a non-refundable order is `409`.
