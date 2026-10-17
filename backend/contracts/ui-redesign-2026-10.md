# UI Redesign 2026-10 — Backend Contract

Status: implemented in `backend/` (not yet deployed). Base path: `/api`. Owner: Backend team.
Migration: `prisma/migrations/20261017010000_server_directory_site_settings` (additive, hand-written, **not applied**).
Fixtures: `contracts/fixtures/server-directory.json`, `contracts/fixtures/site-settings.json`.

## Conventions (unchanged, existing backend behaviour)

- Auth: JWT cookie `token` or `Authorization: Bearer <jwt>` (`authenticate`). Banned users get 403.
- Errors: `{ "error": string }` with HTTP status (400 validation, 401 unauthenticated, 403 role, 404 missing, 409 state conflict).
- Role guards used below:
  - **public** — no auth.
  - **admin|root** — `requireWebsiteAdmin`: `role` is exactly `admin` or `root` (`server_admin` and plain `isAdmin` users are rejected with 403).
  - **admin (legacy)** — `requireAdmin`: `isAdmin` flag OR role `admin`/`root`. Only used by pre-existing endpoints (`/admin/stats`, slips).
  - **root** — `requireRoot`.
- Responses keep their existing envelopes (`{ servers }`, `{ server }`, `{ stats, recentOrders }`, …). New paginated admin lists use `{ items, total, page, pageSize }`.
- Pagination: `page` (default 1), `pageSize` (default 25, max 100; `limit` is accepted as an alias).
- Rate limit: all `/api/*` routes share the existing general limiter.

## Data model additions

```prisma
enum GameMode { PVE PVE_MOD PVPVE }

model Cluster {   // + additive columns
  gameMode    GameMode?
  description String?
  rates       String?           // extra: "X10" shown on the group header
  isModded    Boolean @default(false)   // extra
  sortOrder   Int     @default(0)
}

model Server {    // + additive columns
  directoryKey String? @unique  // extra: stable seed key "<clusterKey>:<map>"
  displayName  String?          // extra: "The Island"
  gameMode     GameMode @default(PVE)
  connectHost  String?
  connectPort  Int?
  rates        String?
  isModded     Boolean @default(false)
  isListed     Boolean @default(true)
  isAvailable  Boolean @default(true)
  sortOrder    Int     @default(0)
  imageUrl     String?
}

model SiteSetting { key String @id, value Json, updatedAt DateTime, updatedById String? }
```

`directoryKey`, `displayName`, `Cluster.rates` and `Cluster.isModded` are additive extras beyond the brief: the seed needs a stable key, ServerSummary needs a display name, and directory groups need `rates`/`isModded`.

## Shared types

### ServerSummary

```ts
type GameMode = 'PVE' | 'PVE_MOD' | 'PVPVE';
interface ServerSummary {
  id: number;
  name: string;                  // internal/admin name, e.g. "PvE X10 (No Mod) - The Island"
  map: string | null;            // ARK map id, e.g. "TheIsland"
  displayName: string;           // displayName ?? humanized map ("The Island") ?? name
  gameMode: GameMode;
  cluster: { id: string; key: string; name: string } | null;
  connect: { host: string; port: number } | null;   // null unless BOTH host and port are set
  rates: string | null;          // server.rates ?? cluster.rates
  isModded: boolean;
  available: boolean;            // Server.isAvailable (legacy "Not Available" flag)
  online: boolean;               // lastHeartbeat within 3 minutes (HEARTBEAT_ONLINE_WINDOW_MS)
  playerCount: number;
  deliverable: boolean;          // isActive && !drainMode && has >=1 ServerCredential with status "active"
  sortOrder: number;
}
```

`deliverable` is the only flag the shop may use to offer a server as a delivery target. `available`/`online` are display-only.

## 1. GET /servers — public (existing, extended)

Query: `?deliverable=true` (also `1`) → only deliverable servers (filtered in SQL and re-checked).
Without the query: all `isActive` servers (unchanged). Ordered by `id`.

Each item = **legacy ServerStatus fields + ServerSummary**:

```json
{
  "servers": [
    {
      "isActive": true,
      "isOnline": true,
      "lastHeartbeat": "2026-10-17T04:59:30.000Z",
      "chatTag": "[ISL]",
      "chatColor": "#37E5D2",
      "chatIcon": null,
      "drainMode": false,
      "supportsDinoDelivery": true,
      "id": 1,
      "name": "Server1",
      "map": "TheIsland",
      "displayName": "The Island",
      "gameMode": "PVE",
      "cluster": null,
      "connect": null,
      "rates": null,
      "isModded": false,
      "available": true,
      "online": true,
      "playerCount": 12,
      "deliverable": true,
      "sortOrder": 0
    }
  ]
}
```

No secrets (`apiKey`, `webhookUrl`, credentials) are ever returned.

## 2. GET /servers/directory — public (new)

Listed servers only: `isListed && isActive`, and the server's cluster (if any) must be `isActive`.
Groups ordered by `cluster.sortOrder` (ties: cluster key); servers by `server.sortOrder` (ties: id).
Servers without a cluster go into a trailing group `key: "unassigned"` (name `"Other servers"`, `gameMode: null`), omitted when empty.
`statusPages` comes from SiteSetting `directory.statusPages` (https URLs only), defaulting to the three legacy status pages.

```json
{
  "groups": [
    {
      "key": "pve-x10",
      "name": "PvE X10 (No Mod)",
      "gameMode": "PVE",
      "rates": "X10",
      "isModded": false,
      "description": null,
      "servers": [
        {
          "id": 101,
          "name": "PvE X10 (No Mod) - The Island",
          "map": "TheIsland",
          "displayName": "The Island",
          "gameMode": "PVE",
          "cluster": { "id": "cl_pve-x10", "key": "pve-x10", "name": "PvE X10 (No Mod)" },
          "connect": { "host": "ark.iris-th.cloud", "port": 28014 },
          "rates": "X10",
          "isModded": false,
          "available": true,
          "online": false,
          "playerCount": 0,
          "deliverable": false,
          "sortOrder": 10
        }
      ]
    }
  ],
  "statusPages": [
    "https://ark-status.iris-th.cloud/status/ark-pve-10",
    "https://ark-status.iris-th.cloud/status/ark-pve-20",
    "https://ark-status.iris-th.cloud/status/ark-pvp-10"
  ]
}
```

The full 4 × 13 example is in `fixtures/server-directory.json`. Group `gameMode` is `GameMode | null`.

## 3. GET /site/settings — public (new)

```json
{ "season": "auto", "activeSeason": "winter", "announcement": { "text": "Winter event is live", "href": "/servers" } }
```

- `season`: `'auto' | 'default' | 'winter' | 'christmas' | 'easter'` (default `auto` when unset or the stored value is malformed).
- `activeSeason`: `'default' | 'winter' | 'christmas' | 'easter'`. Explicit seasons are returned unchanged. `auto` resolves on the **Asia/Bangkok** calendar date (UTC+7):
  - christmas: Dec 1 – Jan 2
  - winter: Oct 15 – Nov 30, and Jan 3 – Feb 28/29
  - easter: 14 days before through 7 days after Western Easter Sunday (2026: Mar 22 – Apr 12; 2027: Mar 14 – Apr 4)
  - default: otherwise
- `announcement`: `{ text, href? } | null`. `href` is omitted when unset.
- The resolver is computed per request; clients should re-fetch on load (it is cheap) rather than cache across days.

## 4. PUT /admin/site/settings — admin|root (new)

Body (strict; at least one key):

```json
{ "season": "christmas", "announcement": { "text": "Merry Christmas - 20% off kits", "href": "/shop?category=kits" } }
```

- `season`: one of the 5 settings.
- `announcement`: `null` clears it; otherwise `text` 1–280 chars (trimmed), optional `href` that is either `https://…` or a same-site path starting with `/` (not `//`). Unknown keys → 400.
- Response: same shape as GET /site/settings (after the write).
- Writes an AuditLog `action: "site_settings_update"`, `resource: "site_settings"` with old/new values.

## 5. Admin servers & clusters — root

### GET /admin/servers (existing, extended)

`{ servers: AdminServer[] }` ordered by `sortOrder, id`. `AdminServer` = every Server column (as before, including `apiKey` — root only) **plus** `cluster: {id,key,name} | null`, `online`, `deliverable`, `activeCredentialCount`. Credential secrets are never included.

### POST /admin/servers, PUT /admin/servers/:id (existing, extended)

Body (strict, all optional; `name` + `map` required on POST):

| field | type |
|---|---|
| name, map | string 1–120 |
| apiKey | string 16–256 (POST only; ignored on PUT — use `POST /admin/servers/:id/regenerate-key`) |
| isActive | boolean |
| chatTag, chatColor, chatIcon | string ≤32 \| null |
| clusterId | string \| null (must exist) |
| displayName | string ≤120 \| null |
| gameMode | `PVE` \| `PVE_MOD` \| `PVPVE` |
| connectHost | hostname/IPv4 ≤253 \| null |
| connectPort | int 1–65535 \| null |
| rates | string ≤32 \| null |
| isModded, isListed, isAvailable | boolean |
| sortOrder | int |
| imageUrl | `https://…` or `/path` ≤1024 \| null |

Empty strings clear nullable text fields. `drainMode` and credentials are **not** writable here (operational safety; see open issues). Response `{ server: AdminServer }` (201 on create). Both write AuditLog `server_create` / `server_update`.

### GET /admin/clusters (new)

```json
{ "clusters": [ { "id": "ckx…", "key": "pve-x10", "name": "PvE X10 (No Mod)", "isActive": true, "gameMode": "PVE", "description": null, "rates": "X10", "isModded": false, "sortOrder": 10, "createdAt": "…", "updatedAt": "…", "serverCount": 13 } ] }
```

### POST /admin/clusters (new) → 201 `{ cluster }`

Body (strict): `key` (`^[a-z0-9][a-z0-9-]{1,63}$`, unique → 409 on clash), `name` (1–120), optional `gameMode | null`, `description` (≤1000) | null, `rates` (≤32) | null, `isModded`, `isActive`, `sortOrder`.

### PUT /admin/clusters/:id (new) → `{ cluster }`

Same fields, all optional. 404 unknown id, 409 key clash. AuditLog `cluster_create` / `cluster_update`.

## 6. Deliveries — admin|root (new)

### GET /admin/deliveries?status=&serverId=&page=&pageSize=

`status` ∈ `pending | leased | completed | failed | dead_letter` (else 400). Ordered by `updatedAt desc`.

```json
{
  "items": [
    {
      "id": "0b3c…",
      "status": "dead_letter",
      "deliveryType": "order",
      "referenceId": "0b3c…",
      "orderId": "0b3c…",
      "serverId": 2,
      "serverName": "Server2",
      "steamId": "7656119…",
      "attempts": 5,
      "maxAttempts": 5,
      "lastError": "Player offline",
      "nextRetryAt": null,
      "createdAt": "2026-10-01T00:00:00.000Z",
      "updatedAt": "2026-10-01T01:00:00.000Z"
    }
  ],
  "total": 41, "page": 1, "pageSize": 25
}
```

`orderId` is set for `deliveryType` `order` / `dino_catalog` (referenceId is the Order id), else `null` (`dino_marketplace` → referenceId is a DinoListing id).

### POST /admin/deliveries/:id/retry

No body. Response `{ "success": true, "retried": boolean, "alreadyQueued": boolean, "item": DeliveryItem }`.

Rules (single Serializable transaction, reuses the existing plugin lease/complete/fail orchestrator — no new delivery path):

- `failed` / `dead_letter` + order-backed job whose order is not `refunded`/`cancelled`/`delivered` → job back to `pending` (lease cleared, `nextRetryAt` null, `maxAttempts = attempts + 5`), order `failed → queued`, fulfillment `failed → queued`. `retried: true`, AuditLog `delivery_retry`.
- `pending` / `leased` → no-op, `retried: false, alreadyQueued: true` (idempotent double-click / concurrent retry).
- `completed` → 409. Order refunded/cancelled/delivered/missing → 409.
- `dino_marketplace` → 409 always (dead-lettering already refunded the buyer escrow; re-delivery would double-pay).
- Unknown id → 404.

## 7. GET /admin/audit-logs?action=&actorId=&resource=&page=&pageSize= — admin|root (new)

(The older `GET /api/audit/logs` stays as-is; it uses the legacy `isAdmin` flag and a `{ logs, pagination }` envelope.)

```json
{
  "items": [
    {
      "id": 9,
      "action": "delivery_retry",
      "resource": "delivery_job",
      "resourceId": "0b3c…",
      "actorId": "user-uuid",
      "actorEmail": null,
      "ipAddress": "1.2.3.4",
      "status": "success",
      "errorMessage": null,
      "oldValue": "{\"status\":\"dead_letter\"}",
      "newValue": "{\"status\":\"pending\",\"maxAttempts\":10}",
      "metadata": "{\"orderId\":\"0b3c…\",\"serverId\":2}",
      "createdAt": "2026-10-17T00:00:00.000Z"
    }
  ],
  "total": 1, "page": 1, "pageSize": 25
}
```

`oldValue` / `newValue` / `metadata` are JSON-encoded strings (as stored) or null. Ordered by `createdAt desc`.

Actions written by this release: `site_settings_update`, `server_create`, `server_update`, `cluster_create`, `cluster_update`, `delivery_retry`, `payment_slip_approve`, `payment_slip_reject`.

## 8. GET /admin/market/listings?status=&page=&pageSize= — admin|root (new, read-only)

`status` ∈ `listed | sold | cancelled | expired` (else 400). `cryopodData` (native snapshot bytes) is never returned.

```json
{
  "items": [
    {
      "id": "clx…", "species": "Rex", "dinoName": "Bitey", "level": 224, "gender": "Female",
      "price": 1500, "status": "listed", "imageUrl": null, "deliveryStatus": null,
      "originServerId": 1, "deliveryServerId": null,
      "createdAt": "…", "updatedAt": "…", "soldAt": null, "expiresAt": null, "deliveredAt": null,
      "seller": { "id": "u1", "discordUsername": "krit", "steamId": "7656…" },
      "buyer": null
    }
  ],
  "total": 1, "page": 1, "pageSize": 25
}
```

No admin cancel endpoint: there is no escrow-safe cancel **service** (the only cancel is the owner-scoped controller and dino trading is disabled in production). See open issues.

## 9. GET /admin/stats — admin (legacy guard, existing, extended)

```json
{
  "stats": {
    "totalUsers": 10, "totalOrders": 20, "totalRevenue": 5000, "pendingOrders": 2,
    "pendingSlips": 3,
    "failedDeliveries": 4,
    "onlineServers": 2,
    "todayRevenue": 300,
    "todayTopupThb": 598,
    "todayStartsAt": "2026-10-16T17:00:00.000Z"
  },
  "recentOrders": []
}
```

- `pendingSlips`: PaymentIntent `provider=bank_slip, status=pending`.
- `failedDeliveries`: DeliveryJob `status in (failed, dead_letter)`.
- `onlineServers`: active servers with a heartbeat within 3 minutes.
- `todayRevenue` (IC): sum of `Order.totalPrice` created since Bangkok midnight with status in `paid, queued, delivering, delivered, failed`.
- `todayTopupThb`: sum of completed PaymentIntent `amountThb` completed since Bangkok midnight.

## Extra endpoints added (admin console gap audit)

| Method | Path | Role | Response |
|---|---|---|---|
| GET | /admin/categories | admin\|root | `{ categories: Category & { _count: { products } }[] }` incl. inactive, ordered by sortOrder, name |
| GET | /admin/promotions?status=&page=&pageSize= | admin\|root | `{ items, total, page, pageSize }` — PromotionCampaign rows; `discountValue`/`maxDiscount`/`minSubtotal` as decimal strings; `voucherCount`, `redemptionCount` |

## Behaviour changes to existing endpoints (security hardening)

- `GET /admin/payments/pending-slips` no longer returns two **fake demo slips** when there are none; it returns `{ topups: [], count: 0 }`. Demo fixtures only when `ENABLE_ADMIN_DEMO_FIXTURES=true` and `NODE_ENV!=production`.
- `POST /admin/payments/approve/:id` previously credited the **approving admin** for any unknown id (a points-minting hole). Now: unknown id → 404; only `provider=bank_slip` intents in `pending|processing` can be approved (409 otherwise; `completed` → idempotent `alreadyApproved: true`); status flip is conditional inside a Serializable transaction; audited `payment_slip_approve`.
- `POST /admin/payments/reject/:id`: unknown id → 404; only pending/processing bank slips (a credited slip can no longer be flipped to `failed`); already-rejected → `alreadyRejected: true`; audited `payment_slip_reject`.

## Admin console endpoint map (existing + new)

| Area | Endpoints | Role |
|---|---|---|
| Dashboard | GET /admin/stats | admin (legacy) |
| Orders | GET /admin/orders?page=&limit=&status=, POST /admin/orders/:id/refund `{reason?, inventoryReclaimed?, reclaimReceipt?}` | admin\|root |
| Slips | GET /admin/payments/pending-slips, POST /admin/payments/approve/:id `{notes?}`, POST /admin/payments/reject/:id `{reason?}` | admin (legacy) |
| Users | GET /admin/users?page=&limit=&search=, GET /admin/users/:id, PUT /admin/users/:id `{isBanned?, isAdmin?}`, POST /admin/users/:id/points `{amount, reason?, idempotencyKey?}` | server_admin\|root |
| Roles | PUT /admin/users/:id/role `{role}` | root |
| Products | GET/POST /admin/products, PUT/DELETE /admin/products/:id | admin\|root |
| Categories | GET /admin/categories (new), POST /admin/categories, PUT/DELETE /admin/categories/:id | admin\|root |
| Promotions | GET /admin/promotions (new, read-only) | admin\|root |
| Content | /content/admin/pages…, /content/admin/blocks…, /content/admin/media… | admin (legacy) |
| Protection | /admin/protection (GET /, POST /grant, DELETE /:steamId, GET /logs, GET /stats) | admin (legacy) |
| Chat ranks | GET/POST /admin/chat-ranks, PUT/DELETE /admin/chat-ranks/:id | root |
| Chat channels | GET/POST /chat/channels, DELETE /chat/channels/:id | admin (legacy) |
| API keys | GET /admin/api-keys, GET /admin/api-keys/:userId, POST …/reset-ip, DELETE …/:userId | server_admin\|root |
| Servers | GET/POST /admin/servers, PUT/DELETE /admin/servers/:id, POST …/regenerate-key | root |
| Clusters | GET/POST /admin/clusters, PUT /admin/clusters/:id (new) | root |
| Deliveries | GET /admin/deliveries, POST /admin/deliveries/:id/retry (new) | admin\|root |
| Audit | GET /admin/audit-logs (new); legacy GET /audit/logs, /audit/security, /audit/security/stats | admin\|root / isAdmin |
| Market | GET /admin/market/listings (new, read-only) | admin\|root |
| Site | PUT /admin/site/settings (new) | admin\|root |
| PDPA | GET /pdpa/admin/requests, PATCH /pdpa/admin/requests/:id, POST /pdpa/admin/policy | admin\|root |

## Server directory seed

```
cd backend
npm run seed:servers -- --dry-run   # prints the plan, no DB connection
npm run seed:servers                # idempotent upsert (NOT run by the backend team)
```

- Upserts 4 clusters (`pve-x10`, `pve-mod-x10`, `pvpve-x10`, `pvpve-pre-aqua`; sortOrder 10/20/30/40) and 52 servers keyed by `directoryKey = "<clusterKey>:<map>"`.
- New rows: random unique `apiKey`, `isActive=true`, **`drainMode=true`** (checkout already refuses drained servers, so no purchase can be routed to a server without a plugin), `isListed=true`, `isAvailable` from the data (`available:false` or no address → false), `displayName` = human name.
- Re-runs refresh listing fields only. Never touches rows without a `directoryKey` (the existing Server1/Server2), skips any row with a credential/heartbeat/plugin telemetry, never creates/rotates/revokes ServerCredentials.
- Writes SiteSetting `directory.statusPages` only if it does not exist.
- Data anomalies (printed on every run, admin must confirm): PvPvE Genesis Part 2 port 28013 duplicates PvE Mod Genesis Part 2; PvPvE Aquatica labelled "PvEvE" on the legacy site; Pre-Aqua Scorched Earth/Aquatica have no address; Pre-Aqua Valguero/Lost Island marked Not Available.

To make a directory server deliverable: issue a credential (`tsx scripts/issue-plugin-credential.ts issue <serverId>`), install the plugin, confirm heartbeats, smoke-test delivery, then clear `drainMode` operationally.
