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
- Auth/IRIS ID: account linking (proof-of-control, no auto-merge by email/name), `GET /auth/sessions` (with risk flags), `DELETE /auth/sessions/{id}`, `POST /auth/recovery` (proof-of-control challenge stub)
- Plugin: heartbeat/delivery/market signed with `hmacAuth` — `X-Plugin-Key-Id` is a rotatable key id, separate from the HMAC secret (see `securitySchemes.hmacAuth`)

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
- `linked-identities.json` — IRIS ID linked-providers view for the Account Center (proof-of-control rules embedded)
- `sessions.json` — `GET /auth/sessions` with `isCurrent`/`riskFlag`/`riskReasons`

Money rule (decimal-string): wallet ledger balances/amounts (`GET /wallet`, `GET /wallet/transactions`, `totalSpent`, `totalAmount`) are serialized as decimal strings (`^-?[0-9]+$`). `Product.price`, `quantity`, `quality` are plain integers. The frontend must NOT compute final prices/balances — the backend ledger is authoritative.
