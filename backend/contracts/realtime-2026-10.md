# Realtime contract (2026-10)

Owner request: balance must update without refresh after buying; "everything realtime"; server list
page with per-server player dropdown and Join buttons. This file is the final shape implemented by
the backend. Types live in `src/realtime/events.ts`.

## 1. Socket.IO connection

Same server and path as chat: `io(<API origin>, { path: '/socket.io', withCredentials: true })`.

### Authentication (same rules as REST `middlewares/auth.ts`)

The web session JWT lives in the **httpOnly `token` cookie**, which page JS cannot read. The client
must connect with `withCredentials: true` so the cookie rides on the handshake. The server also
accepts, in priority order:

1. `handshake.auth.token` (string)
2. `Authorization: Bearer <jwt>` header
3. `token` cookie

Verification = JWT signature + `UserSession` (sha256 of the token) active and not expired + user not
banned — identical to REST.

| Token                                    | Result                                                    |
|------------------------------------------|-----------------------------------------------------------|
| none                                     | guest: public rooms only                                  |
| valid                                    | joins `user:<userId>`; admins (`isAdmin` or role `admin`/`root`, same as `requireAdmin`) also join `admin` |
| invalid/revoked via `auth.token`/Bearer  | connection refused (`connect_error: Authentication error`) |
| invalid/expired **cookie**               | downgraded to guest (logged-out browsers keep chat/servers) |
| cookie from an untrusted **Origin**      | ignored -> guest. Trusted = no Origin header, `FRONTEND_URL`, comma-separated `SOCKET_ALLOWED_ORIGINS`, or same-origin (Origin host == forwarded `Host`). CORS does not cover websocket upgrades, so this stops sibling same-site origins riding the SameSite=Lax cookie. |

Socket payloads are untrusted: chat handlers accept `serverId` only as a positive safe integer
(anything else = global room) and never throw on missing/null payloads; the backend also logs
`unhandledRejection` instead of exiting.

Rooms are fixed at connect time. After login/logout the client must reconnect
(`socket.disconnect().connect()`) to change identity.

### Rooms

| Room            | Who                                   | Events                                   |
|-----------------|---------------------------------------|------------------------------------------|
| `user:<userId>` | the authenticated user's own sockets  | `wallet:updated`, `order:updated`, `delivery:updated` |
| `admin`         | admin sockets                          | `admin:slip:created`, `admin:delivery:failed` |
| `servers`       | anyone after `servers:subscribe`       | `servers:status`                          |
| (broadcast)     | every socket                          | `catalog:updated`                         |
| `chat:*`        | unchanged                              | chat events                              |

### Client -> server

| Event                 | Payload | Effect                                                                 |
|-----------------------|---------|------------------------------------------------------------------------|
| `servers:subscribe`   | none    | join `servers`; the server immediately replies with one `servers:status` (full snapshot) to this socket |
| `servers:unsubscribe` | none    | leave `servers`                                                         |

Re-emit `servers:subscribe` after every reconnect (rooms are not restored automatically).

## 2. Server -> client events

All events are emitted **after the database transaction commits** (`src/realtime/afterCommit.ts`
wraps interactive `prisma.$transaction`; a rolled-back purchase emits nothing). Emits from the
`plugin-gateway` process reach browsers through the Socket.IO Redis adapter. Payloads never carry
secrets, steam ids, or other users' data. `at` is an ISO-8601 timestamp.

### `wallet:updated` -> `user:<id>`

```ts
{
  balance: string;            // available IC (bigint as string) == GET /api/wallet accounts.available == User.pointsBalance
  currency: 'IC';
  accounts: Record<'available'|'held'|'promotional'|'refundable', string>; // == GET /api/wallet accounts
  total: string;              // == GET /api/wallet total
  reason: 'purchase'|'refund'|'topup'|'admin'|'reward'|'transfer'|string;
  at: string;
}
```

Emitted from the single place ledger postings happen (`walletService.post`), for every user whose
account moved, once per posting. Idempotent replays emit nothing. Reason mapping (`walletReasonFor`):
`*purchase*`/`*hold*`/`checkout*` -> purchase, `*refund*` -> refund, `*topup*`/`*slip*`/`*payment*`
-> topup, `admin*` -> admin, `earn*`/`*reward*` -> reward, `*release*`/`*transfer*`/`*legacy*` ->
transfer, otherwise the raw ledger type. The balance is re-read after commit, so it is always the
committed value. Clients should treat it as authoritative (also update `User.pointsBalance` in the
store) and may invalidate `['wallet']` / history queries.

### `order:updated` -> `user:<id>`

```ts
{ orderId: string; status: OrderStatus | 'pending'; at: string }
```

Emitted on: order creation (`POST /orders` -> `pending`; checkout commit and in-game purchase ->
`queued`), plugin lease (`delivering`), completion (`delivered`), retry (`queued`), dead-letter
(`failed`), lease release (`queued`), refunds (`refunded`, user and admin paths), admin delivery
retry (`queued`), legacy `/plugin/orders/:id/delivered|failed`.

### `delivery:updated` -> `user:<id>` (owner of the order / marketplace buyer)

```ts
{
  deliveryId: string;          // DeliveryJob.id (== orderId for order-backed jobs)
  orderId?: string;            // present for order-backed types ('order', 'dino_catalog')
  deliveryType: string;        // 'order' | 'dino_catalog' | 'dino_marketplace'
  status: 'pending'|'leased'|'completed'|'failed'|'dead_letter';
  at: string;
}
```

Emitted on plugin claim (`leased`), complete (`completed`), fail (`pending` retry or `dead_letter`),
release (`pending`) and admin retry (`pending`).

### `servers:status` -> room `servers`

```ts
{
  at: string;
  servers: Array<{
    id: number;
    online: boolean;
    players: number | null;     // current players (A2S_INFO count, or plugin heartbeat playerCount)
    maxPlayers: number | null;  // A2S only; null when unknown
    version?: string | null;    // e.g. "361.7" parsed from the server name "(v361.7)"
    map?: string | null;        // A2S map, e.g. "TheIsland"
    name?: string;              // A2S session name, build suffix stripped, e.g.
                                // "Iris Thailand - The Island - PvE X10 NO MOD" (omitted when never queried)
    source: 'a2s' | 'heartbeat';
    playersRev?: string;        // opaque hash of the player roster; changes when someone joins/leaves
  }>;
}
```

Always the **full** list of active servers (41 rows today), sent only when a visible field changed
(including `playersRev`). A dropdown that is open should refetch `/players` when its server's
`playersRev` changes. Player names are never in this event.

### `catalog:updated` -> everyone

```ts
{ at: string; scope: 'products' | 'categories' | 'stock' | 'all' }
```

Admin product/category create/update/delete, and stock decrements on purchase of stock-limited
products. Coalesced to at most one event per second per process. Clients invalidate product
queries.

### Admin (room `admin`)

```ts
'admin:slip:created'     { intentId: string; at: string }                                  // new bank slip submitted
'admin:delivery:failed'  { deliveryId: string; deliveryType: string; serverId: number; at: string } // job dead-lettered
```

## 3. REST

### `GET /api/servers/status` (public, `Cache-Control: public, max-age=5`, 120 req/min/IP)

Same payload as `servers:status` (full snapshot). Served from Redis `iris:servers:status`; if the
poller has not produced a snapshot yet, a heartbeat-only view built from the DB.

### `GET /api/servers/:id/players` (public, `Cache-Control: public, max-age=10`, 60 req/min/IP)

```ts
{
  serverId: number;
  players: Array<{ name: string; durationSec: number }>;  // empty names -> "ไม่ระบุชื่อ"
  fetchedAt: string | null;   // last successful A2S query, null if never
  online: boolean;
  source: 'a2s' | 'heartbeat';
}
```

`400` invalid id, `404` unknown/inactive server. Heartbeat-only servers (no query target) return
`players: []` with `source: 'heartbeat'` (the plugin heartbeat carries no names). When the cached
list is older than 20s and the server has a query target, one live A2S query refreshes it
(deduplicated per server for 10s per process).

### `GET /api/servers/directory` (extended)

Each `ServerSummary` in `groups[].servers[]` is now a `LiveServerSummary`:

```ts
ServerSummary & {
  online: boolean;            // NOW from the live snapshot (A2S for listed servers), heartbeat fallback
  playerCount: number;        // live player count
  maxPlayers: number | null;
  version: string | null;
  statusSource: 'a2s' | 'heartbeat';
  playersRev: string | null;
}
```

`connect` is unchanged: `{ host, port }` where `port` is the **Steam query port**. Join links:
`steam://connect/<host>:<port>` (Steam client resolves the game port through the query port).
`GET /api/servers` is unchanged (its `online` is still heartbeat-derived; `deliverable` is the only
delivery gate).

## 4. A2S poller

- `src/services/a2s.ts`: A2S_INFO + A2S_PLAYER, S2C_CHALLENGE (0x41) handling for both, Source
  split-packet reassembly, per-request timeout.
- `src/services/serverQuery.service.ts`: runs in `SERVICE_ROLE=web` (and `all`) only, one replica at a
  time via Redis lock `iris:servers:status:lock` (SET NX PX + Lua renew; released on SIGTERM/SIGINT).
  Each round queries all active servers that have a target with concurrency 8 and timeout 2.5s,
  merges heartbeat data, writes `iris:servers:status` (with player lists, TTL >= 120s), emits
  `servers:status` on visible change. A server that answered before is shown offline only after 2
  consecutive failed rounds (anti-flap); if its plugin heartbeat is fresh it falls back to heartbeat.
- The plugin heartbeat (`POST /api/plugin/heartbeat`, gateway) updates heartbeat-sourced entries
  immediately and emits.

| Env                          | Default | Meaning                                                    |
|------------------------------|---------|------------------------------------------------------------|
| `SERVER_QUERY_ENABLED`       | `true`  | `false` disables the poller                                |
| `SERVER_QUERY_INTERVAL_MS`   | `30000` | poll interval (min 5000)                                   |
| `SERVER_QUERY_TIMEOUT_MS`    | `2500`  | per-request UDP timeout                                    |
| `SERVER_QUERY_CONCURRENCY`   | `8`     | parallel server queries                                    |
| `SERVER_QUERY_TARGETS`       | empty   | `id=host:port,...` query targets that override `connectHost/connectPort` without publishing a Join address, e.g. `1=151.141.23.59:1001,2=151.141.23.59:1004` |

Targets: `SERVER_QUERY_TARGETS` entry, else `Server.connectHost` + `Server.connectPort`, else
heartbeat-only.

### Plugin servers 1 and 2

From the ASM profiles / `RunServer.cmd` under `C:\asmdata\Servers\Server1|2` (read-only):
Server1 (The Island) `MultiHome=151.141.23.59`, game `Port=999`, `QueryPort=1001`; Server2
(Ragnarok) game `Port=1002`, `QueryPort=1004`. Both answer A2S at `151.141.23.59:1001` / `:1004`
(verified from the host and from inside the web container). They bind only the MultiHome address,
so `127.0.0.1` does not answer.

## 5. Integration notes (2026-10-18)

### Frontend consumer (`frontend/src/lib/socket.ts`, `components/realtime/RealtimeProvider.tsx`)

- One shared socket: `io(new URL(NEXT_PUBLIC_API_URL).origin, { path: '/socket.io', withCredentials: true,
  transports: ['websocket', 'polling'] })`. No `auth.token` is sent; the httpOnly `token` cookie
  (Express default `Path=/`, `SameSite=Lax`, same host as the API) authenticates the handshake.
  `NEXT_PUBLIC_SOCKET_URL` overrides the origin.
- On login/logout (auth-store user id changes) the client disconnects and reconnects so the
  server re-reads the cookie. Rooms registered via `subscribeRoom()` (`servers`, chat) are
  re-joined on every connect.
- `wallet:updated` -> sets the navbar IC pill from `balance` and invalidates wallet/profile queries.
  `order:updated` / `delivery:updated` -> invalidate order/delivery queries + Thai toasts.
  `catalog:updated` -> invalidate product queries. `servers:status` -> upsert by id into the
  `['servers','status']` cache; an open player dropdown refetches `/players` when that server's
  `players`, `online` or `playersRev` changes. Any `admin:*` -> invalidate admin queues.
- Fallbacks when the socket is down: wallet/order/server queries refetch on focus and every 60 s;
  the wallet is re-read immediately after checkout, popup purchase, market purchase and top-ups.

### Verified

- Real `setupSocketIO` + the frontend's `socket.io-client` options (prisma lookups stubbed):
  cookie session joins `user:<id>`; admin role joins `admin`; guest, stale-cookie, banned and
  inactive-session cookies connect as guests; an invalid explicit `auth.token` is refused;
  `servers:subscribe` returns the snapshot immediately; `servers:unsubscribe` stops updates;
  `order:updated` / `admin:slip:created` reach only their rooms.
- `queryA2S` against every directory server from the host: 39/39 directory servers + plugin servers
  1 and 2 (`151.141.23.59:1001/1004`) answered in < 1 s total with concurrency 8.

### Data findings from A2S

- ASE truncates the A2S server name to 63 bytes, so long names end in `(v361` / `(v361.` and the
  A2S version field is always `1.0.0.0`. `parseArkVersion` now returns the surviving digits
  (`"361"`) and ignores `1.0.0.0` (null).
- The legacy site listed PvE-Mod Genesis Part 2 on query port 28013, the same as PvPvE Genesis
  Part 2. A2S shows 28013 = "Genesis: Part 2 - PvPvE X10 MOD" and 28032 = "Genesis Part 2 - PvE X20
  MOD +Additions". `prisma/seed-data/server-directory.json` is corrected (PvE-Mod Gen2 -> 28032);
  the **production DB row still has 28013** until an admin edits it (or the seed is re-run).
- The PvE-Mod servers advertise themselves as "PvE X20 MOD +Additions" while the directory labels
  that cluster `pve-mod-x10`.
