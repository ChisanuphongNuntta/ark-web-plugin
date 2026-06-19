# Backend Contracts

`openapi.yaml` is the HTTP source of truth. `events/` contains versioned event payload schemas and `fixtures/` contains non-production examples for frontend/plugin consumers.

Compatibility policy:

- Additive optional fields are backward compatible.
- Removing/renaming fields or changing meaning requires a new API/event version.
- Monetary and Iris Coin integer values are serialized as decimal strings.
- Consumers must ignore unknown additive fields.
