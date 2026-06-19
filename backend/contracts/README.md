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
- Cart: `GET /cart`, `POST|PUT|DELETE /cart/items`
- Checkout: `POST /checkout/session`, `POST /checkout/session/{id}/commit`
- Catalog (public, read-only): `GET /products`, `GET /products/featured`, `GET /products/categories`, `GET /products/{id}`, `GET /servers`
- Auth/IRIS ID: account linking (proof-of-control, no auto-merge by email/name), `GET /auth/me`, `GET /auth/identities` (LinkedIdentitiesResponse), `GET /auth/sessions` (with risk flags), `DELETE /auth/sessions/{id}`, `POST /auth/recovery` (proof-of-control challenge stub)
- Plugin (signed): heartbeat/delivery/market signed with `hmacAuth` — `X-Plugin-Key-Id` is a rotatable key id, separate from the HMAC secret (see `securitySchemes.hmacAuth`). The live verifier resolves `keyId -> secret` server-side (a `ServerCredential` whose keyId != secret) and verifies `X-Signature` against the resolved secret; the credential is bound to one server scope.
- Plugin (companion, signed, read-only, server-scoped) — for the in-game `/iris`: `GET /plugin/player/{steamId}/wallet` (WalletBalance), `GET /plugin/player/{steamId}/pending-deliveries` (`{ pending }`), `GET /plugin/wallet/events?since=` (`{ success, events, lastTimestamp }`, events carry additive `playerSteamId`+`userId`)
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

- `wallet-balance.json` — `GET /wallet`. `available` is the spendable balance; all amounts are decimal strings.
- `wallet-transactions.json` — `GET /wallet/transactions`
- `products.json` — `GET /products` (list + pagination). Uses `itemBlueprint` (matches schema + live API), and includes `stock`/`maxPerUser`/`isFeatured`. `null` stock/maxPerUser = unlimited.
- `products-featured.json` — `GET /products/featured` (only `isFeatured: true`, no pagination)
- `servers.json` — `GET /servers`. `isOnline` is DERIVED from `lastHeartbeat` recency (3-minute window in the controller). Secrets (`apiKey`, `webhookUrl`) are never exposed. `mode`/`playerCount`/`maxPlayers` are intentionally absent — the `Server` model does not store them yet.
- `cart.json` — `GET /cart`
- `checkout-session.json` — `POST /checkout/session` (`totalAmount` = sum of snapshot `price * quantity`)
- `linked-identities.json` — `GET /auth/identities` (LinkedIdentitiesResponse). Every provider is reported; unlinked providers have null fields and `canUnlink: false`. `canUnlink` enforces minimumLinkedProviders=1.
- `sessions.json` — `GET /auth/sessions` with `isCurrent`/`riskFlag`/`riskReasons`
- `player-wallet.json` — `GET /plugin/player/{steamId}/wallet` (WalletBalance; decimal strings)
- `player-pending-deliveries.json` — `GET /plugin/player/{steamId}/pending-deliveries`
- `wallet-events.json` — `GET /plugin/wallet/events` (events carry additive `playerSteamId`+`userId`; `lastTimestamp` is the cursor to pass back as `?since=`)

Money rule (decimal-string): wallet ledger balances/amounts (`GET /wallet`, `GET /wallet/transactions`, `totalSpent`, `totalAmount`) are serialized as decimal strings (`^-?[0-9]+$`). `Product.price`, `quantity`, `quality` are plain integers. The frontend must NOT compute final prices/balances — the backend ledger is authoritative.

## Cart-sync decision (M2 → M3)

DECISION: the **server cart is the source of truth** for checkout. `POST /checkout/session` builds the checkout snapshot from the persisted server-side cart (`Cart`/`CartItem`), NOT from a cart object posted in the request body. There is no bulk "sync cart" endpoint and none is planned for M2 — the per-line endpoints `POST|PUT|DELETE /cart/items` already exist and are sufficient.

Frontend contract:

- Before calling `POST /checkout/session`, the frontend MUST push every local cart line to the server via `POST /cart/items` (add), `PUT /cart/items` (change quantity), `DELETE /cart/items` (remove) so the server cart matches what the user sees.
- `POST /checkout/session` then snapshots the server cart and re-validates price/stock/server-compatibility server-side. The frontend never computes the final total — `totalAmount` comes back from the session.
- An anonymous (pre-login) cart held only in the browser must be replayed onto the server cart via the same `/cart/items` calls after login, before checkout.

M3 note: a single atomic "replace cart" / bulk-sync endpoint (and cross-device cart revision/merge per §16) is deferred to M3. Until then, the line-by-line replay above is the supported path and keeps the server cart authoritative without a new contract surface.
