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
- Auth/Plugin: account linking, sessions, plugin heartbeat/delivery/market

Events (`events/`):

- `wallet.transaction-posted.schema.json` + `wallet.transaction-posted.example.json` — emitted whenever a balanced ledger transaction is posted. Event entries carry BOTH sides of the double-entry; the per-user `GET /wallet/transactions` response only returns the caller's own entries.

Fixtures (`fixtures/`, non-production examples):

- `wallet-balance.json` — `GET /wallet`
- `wallet-transactions.json` — `GET /wallet/transactions`
- `products.json` — `GET /products` (list + pagination)
- `servers.json` — `GET /servers`. `isOnline` is DERIVED from `lastHeartbeat` recency. `mode`/`playerCount`/`maxPlayers` are intentionally absent — the `Server` model does not store them yet.
- `cart.json` — `GET /cart`
- `checkout-session.json` — `POST /checkout/session` (`totalAmount` = sum of snapshot `price * quantity`)
