# Admin transactions contract (2026-10)

Owner request: "Admin must know EVERY transaction." Every money movement in IRIS is a
`LedgerTransaction` posted through `walletService.post` (backend/src/services/wallet.service.ts).
This contract exposes all of them to admins, adds a reconciliation check and a realtime feed.

Code: `services/adminTransactions.service.ts`, `services/ledgerTypes.ts`,
`services/ledgerReconcile.service.ts`, `controllers/adminTransactions.controller.ts`,
`routes/admin.routes.ts`. Tests: `tests/unit/admin-transactions.test.ts`,
`tests/unit/ledger-convergence.test.ts`, `tests/unit/delivery-release.test.ts`.

All amounts are IC as **decimal strings** (BigInt-safe), signed where noted. All timestamps are
ISO-8601 UTC. No schema change and no migration.

## 0. Single writer

- Postings only through `walletService.post`. `User.pointsBalance` is a read-only projection of
  the user's `available` WalletAccount, written in exactly one place inside `post` (same DB
  transaction). A unit test scans `backend/src` and fails if anything else writes it.
- Every path (verified 2026-10-18):

| Path | Ledger `type` | `referenceType` / `referenceId` | Idempotency key | Entries |
|------|---------------|---------------------------------|-----------------|---------|
| Cart checkout commit | `checkout_purchase` | `checkout` / session id | `checkout:commit:<sessionId>` | available -> revenue |
| Legacy `POST /orders` (off unless `ENABLE_LEGACY_SINGLE_ORDER=true`) | `order_purchase` | `order` / order id | `order:purchase:<orderId>` | available -> revenue |
| In-game shop purchase | `game_purchase` | `game_purchase_quote` / quote id | `game-purchase:<quoteId>` | available -> revenue |
| Order refund (admin `POST /admin/orders/:id/refund` or owner `POST /orders/:id/refund`) | `order_refund` | `order` / order id | `order:refund:<orderId>` (shared, so one refund per order) | revenue -> **available** (refund policy 2026-10, see below); `createdBy` = requester |
| Payment top-up (provider webhook) | `payment_topup` | `payment_intent` / intent id | `payment:<intentId>:credit` | issuance -> available |
| Sandbox top-up | `payment_topup_sandbox` | `payment_intent` / intent id | `payment:<intentId>:credit` | issuance -> available |
| Stripe top-up, success-page sync `POST /api/payments/verify-session` | `payment_topup` (same posting as the webhook) | `payment_intent` / intent id | `payment:<intentId>:credit` (same key as the webhook) | issuance -> available; only for a `stripe` intent the caller owns, after mode/currency/amount/reference/livemode checks and a conditional `pending|processing -> completed` flip in the credit transaction. Historic rows: `stripe_topup` with `stripe:<sessionId>:credit` (labels kept) |
| Bank slip approval | `bank_slip_approval` (`_demo` for demo fixtures) | `slip` / intent id | `slip:<intentId>:credit` (demo: `slip:demo:<id>:<ts>:credit`) | issuance -> available; `createdBy` = approving admin |
| Admin manual credit/debit `POST /admin/users/:id/points` | `admin_adjustment` | `admin_adjustment` / target user id | `admin:adjust:<adminUserId>:<caller idempotencyKey>` (always namespaced, so it can never collide with a system key such as `payment:<id>:credit`) or `admin:adjust:<uuid>` | issuance <-> available; reason required (3-500 chars) = `description`; `createdBy` = admin; audited `points_adjust` (success **and** failure). Replay of a caller key (sequential, or the loser of a concurrent double-click: P2002/P2034) answers `{ success, replayed: true, transactionId, newBalance }` with the original posting and **no** new audit row; same key with a different body = 409 |
| Gameplay reward claim | `earn_playtime` | `reward` / user id | `earn:playtime:<userId>:<uuid>` (guarded by the stats reset in the same Serializable tx) | issuance -> available |
| P2P dino buy (escrow hold) | `dino_escrow_hold` | `dino_listing` / listing id | `dino:escrow:hold:<listingId>` | buyer available -> clearing |
| P2P delivery confirmed (escrow release) | `dino_escrow_release` | `dino_listing` / listing id | `dino:escrow:release:<listingId>` | clearing -> seller available + revenue (5% fee) |
| P2P delivery dead-lettered (escrow refund) | `dino_escrow_refund` | `dino_listing` / listing id | `dino:escrow:refund:<listingId>` | clearing -> buyer available |
| Legacy ArkShop balance claim | `legacy_balance_claim` | `legacy_balance_claim` / claim id | `legacy-balance-claim:<claimId>` | issuance -> available |
| Wallet migration | `opening_balance` | — | migration | issuance -> available (postedAt may be null) |

**Refund policy (2026-10).** Order refunds credit the buyer's `available` account, the same as
dino escrow refunds: the IC is spendable again and shows in the customer balance (`wallet:updated`
balance, `User.pointsBalance`, the admin row `balanceAfter`). Nothing in the system spends the
`refundable` sub-account. Refunds posted before this change sit in `refundable`; the admin row
shows them with `refundableAfter`, and reconcile reports them (`refundableBalances`). Moving those
legacy balances to `available` is an admin decision (not automated).

Ledger `type` strings are part of the idempotency request hash and are **never renamed**; the
task's names map as: p2p_escrow_hold/release/refund = `dino_escrow_*`. No current posting uses
`referenceType = 'delivery'`; delivery jobs are reached through the order / listing.

Older rows used `referenceType` spellings `admin`, `gameplay` and `external`; the API normalizes
them (`admin` -> `admin_adjustment`, `gameplay` -> `reward`, `external` -> `slip` /
`payment_intent` / `stripe_session` / `legacy_balance_claim` by type) and the `referenceType`
filter matches both spellings. Detail returns the stored value as `storedReferenceType`.

## 1. Vocabulary

`typeLabelTh` / `category` come from `LEDGER_TYPES` in `ledgerTypes.ts`. Unknown types list fine
(label = raw type, category `other`).

| category | Thai | types |
|----------|------|-------|
| `topup` | เติมเงิน | payment_topup, payment_topup_sandbox, stripe_topup, bank_slip_approval, bank_slip_approval_demo |
| `purchase` | ซื้อสินค้า | order_purchase, checkout_purchase, game_purchase |
| `refund` | คืนเงิน | order_refund, dino_escrow_refund |
| `admin` | แอดมินปรับยอด | admin_adjustment |
| `reward` | รางวัล | earn_playtime |
| `p2p` | ตลาดไดโน P2P | dino_escrow_hold, dino_escrow_release |
| `legacy` | ย้ายยอดจากระบบเดิม | legacy_balance_claim |
| `opening` | ยอดยกมา | opening_balance |
| `other` | อื่น ๆ | wallet_hold and anything unregistered |

**Customer side.** Each transaction's customer is the user whose accounts moved the most (absolute
net). Every current posting touches at most one user (P2P settles through the clearing account),
so it is the buyer, seller, top-up owner or adjusted user. System-only rows have `user: null`,
`amount: null`.

## 2. `GET /api/admin/transactions` (admin | root)

Query (all optional; empty or `all` = no filter; junk -> 400):

| param | meaning |
|-------|---------|
| `page`, `pageSize` | shared helper (`utils/pagination.ts`): pageSize snaps to 10/25/50/100 (default 25), page clamped to the last page |
| `search` | <= 100 chars. Exact: transaction id, referenceId, idempotencyKey, user id, Discord id, Steam id. Contains (case-insensitive): description, Discord username. There is no email column on users (Discord OAuth only), so email search is not applicable. |
| `type` | ledger type, or comma-separated list (<= 20) |
| `category` | one of the categories above |
| `userId` | rows where this user's accounts moved (customer side scoped to this user) |
| `referenceType` | canonical reference type (legacy spellings included) |
| `from`, `to` | ISO-8601 instants **with timezone**, `[from, to)`. The UI converts Asia/Bangkok day boundaries (`YYYY-MM-DDT00:00:00+07:00`). Applies to `postedAt` (or `createdAt` for never-posted opening rows). `from` must be < `to`. |
| `direction` | `in` = customer accounts only gained; `out` = only lost (scoped to `userId` when given) |

Response:

```ts
{
  items: Array<{
    id: string;
    type: string;
    typeLabelTh: string;
    category: string;
    createdAt: string;
    postedAt: string | null;
    createdBy: { id: string; name: string | null } | null;   // admin / requester when recorded
    description: string | null;
    referenceType: string | null;                             // normalized
    referenceId: string | null;
    referenceLink: string | null;                             // admin URL, see below
    user: { id: string; name: string | null; steamId: string | null } | null; // customer side
    amount: string | null;          // signed IC net for the customer side
    balanceAfter: string | null;    // customer's available balance after this txn
    refundableAfter: string | null; // customer's refundable balance after, only when the txn
                                    // touched `refundable` (legacy refunds); otherwise null
    entriesCount: number;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  totals: { in: string; out: string; net: string; count: number };  // whole filter, not the page
}
```

- Order: `postedAt desc` (nulls last), then `id desc`.
- `totals.in` / `totals.out` are positive magnitudes of customer-account credits / debits over every
  row matching the filter; `net = in - out`; `count` = matching transactions.
- `balanceAfter` comes from the transaction's own `available` entry; when it did not touch
  `available` (e.g. a legacy refund into `refundable`) it is the latest available entry posted at
  or before it, ordered by the transaction's `postedAt` (then entry id). `postedAt` is stamped
  after the account row lock is held, so it is monotonic per account; entry `createdAt` and cuid
  ids are not and are never used for this ordering.
- `referenceLink` (only admin frontend routes that exist; list pages use the kit's `?q=`):
  `order` / `checkout` / `game_purchase_quote` / `dino_listing` / `delivery` / `stripe_session` /
  `legacy_balance_claim` -> `/admin/transactions?q=<id>` (the ledger searched by that reference id,
  i.e. the whole money trail: purchase -> refund, escrow hold -> release/refund; there is no admin
  orders/market/deliveries page), `payment_intent` / `slip` -> `/admin?tab=slips&intent=<id>`
  (opens the slip tab; `intent` is not yet used to select the slip), `admin_adjustment` / `reward` /
  `user` -> `/admin/users?q=<userId>` (admin users search matches the exact user id);
  otherwise null. The frontend also refuses any link to a route it does not have.

## 3. `GET /api/admin/transactions/:id` (admin | root)

```ts
{
  transaction: <list row> & {
    idempotencyKey: string;
    storedReferenceType: string | null;
    metadata: unknown;           // secret-looking keys (secret, token, password, signature, api key,
                                 // authorization, cookie, card, cvv, qr payload, private...) stripped
                                 // at any depth; bigint -> string; long strings truncated
    balanced: boolean;           // entries sum to zero
    entries: Array<{
      id: string; accountId: string; accountKey: string; accountType: string;
      accountLabelTh: string;    // ยอดใช้ได้ / ยอดถูกกัน / ยอดคืนเงิน / ระบบ: รายได้ร้าน ...
      owner: { id: string; name: string | null; steamId: string | null } | null; // null = system
      amount: string; balanceAfter: string; createdAt: string;
    }>;
  };
  related: {                     // JSON-safe; keys present depending on referenceType
    order?: {...}; orderGroup?: {...}; quote?: {...}; paymentIntent?: {...}; listing?: {...};
    deliveries?: Array<{ id, deliveryType, referenceId, serverId, status, attempts, maxAttempts,
                         nextRetryAt, error, receiptId, createdAt, updatedAt }>;
  };
}
```

404 for unknown or malformed ids. A failing related lookup never hides the transaction.

## 4. `GET /api/admin/transactions/summary?date=YYYY-MM-DD` (admin | root)

`date` defaults to today in Asia/Bangkok. Covers `[date 00:00+07:00, next day 00:00+07:00)`,
customer-side (user-owned account) movements only.

```ts
{
  date: string; timezone: 'Asia/Bangkok'; from: string; to: string;
  topups:    { count: number; amount: string };   // credited to customers
  purchases: { count: number; amount: string };   // spent by customers
  refunds:   { count: number; amount: string };
  adminAdjustments: { count: number; credit: string; debit: string; net: string };
  rewards:   { count: number; amount: string };
  p2p:       { count: number; volume: string; releasedToSellers: string }; // volume = buyer holds
  legacy:    { count: number; amount: string };
  other:     { count: number; credit: string; debit: string };
  totals:    { count: number; in: string; out: string; net: string };
  byType: Array<{ type; typeLabelTh; category; count; credit; debit }>;
}
```

## 5. `GET /api/admin/transactions/export.csv` (admin | root)

- Same filters as the list (no pagination). 400 before any byte on bad filters.
- Streamed in batches of 1,000 with **keyset** pagination on (`postedAt desc nulls last`, `id
  desc`) against a snapshot: `postedAt <= request time - 5s` (rows without `postedAt`:
  `createdAt`). The 5 s settle window leaves out postings stamped but not yet committed, and the
  keyset cursor means a posting that commits mid-export can never shift a window, so no row is
  duplicated or skipped. Max **50,000** rows. `X-Export-Max-Rows: 50000`.
- When the cap cuts the export, the file's last line is a marker row
  `*** ข้อมูลถูกตัดที่ 50,000 แถว (truncated at 50,000 rows) — กรุณากรองช่วงวันที่ให้แคบลงแล้วส่งออกใหม่ ***`
  (also `truncated: true` in the audit).
- UTF-8 with BOM (Excel opens Thai correctly), CRLF, RFC 4180 quoting; text cells starting with
  `= + - @ tab CR` are prefixed with `'` (formula-injection guard). Numbers are not prefixed.
- Columns: วันเวลา (เวลาไทย), เวลา UTC, รหัสธุรกรรม, ประเภท, รหัสประเภท, หมวด, ผู้ใช้, Steam ID,
  User ID, จำนวน (IC), ยอดใช้ได้หลังทำรายการ (IC), ประเภทอ้างอิง, รหัสอ้างอิง, รายละเอียด,
  ผู้ทำรายการ, จำนวนรายการบัญชี.
- Rate limit: 5 exports per admin per 10 minutes (429, Thai message).
- Audited `transactions_export` with filters, row count, `truncated` and `aborted`; a mid-stream
  failure is audited as `failure` and the connection is destroyed (download reported as failed).

## 6. `GET /api/admin/ledger/reconcile` (root)

Read-only, one RepeatableRead snapshot:

```ts
{
  ok: boolean;
  checkedAt: string;
  checkedAccounts: number;
  checkedUsers: number;
  mismatches: Array<{ accountId; accountKey; accountType; userId: string | null;
                      cachedBalance: string; ledgerSum: string; difference: string }>;  // WalletAccount.balance vs Σ entries
  mismatchCount: number;
  legacyPointsMismatches: Array<{ userId; pointsBalance: string; availableAccountId: string | null;
                                  availableBalance: string | null; ledgerSum: string; difference: string }>; // User.pointsBalance vs Σ available entries
  legacyPointsMismatchCount: number;
  unbalancedTransactions: Array<{ transactionId: string; sum: string }>; // double-entry violations
  unbalancedTransactionCount: number;
  // Informational, does not affect `ok`: IC parked in user `refundable` sub-accounts (legacy
  // refunds before the 2026-10 refund policy; the customer cannot spend it).
  refundableBalances: Array<{ accountId: string; userId: string | null; balance: string }>;
  refundableBalanceCount: number;
  refundableTotal: string;
}
```

Arrays are capped at 500; the `*Count` fields are the full numbers. Audited `ledger_reconcile`.

**Scheduled check.** The web process (`SERVICE_ROLE` serving web) runs the same check every
15 minutes (`LEDGER_RECONCILE_INTERVAL_MS`, first run <= 60s after boot; disable with
`LEDGER_RECONCILE_ENABLED=false`). A Redis `SET NX PX` lock (`iris:ledger:reconcile:lock`)
lets one replica run per window. When anything drifts it emits `admin:ledger:mismatch` to room
`admin` and writes audit `ledger_mismatch_detected` (status failure); a clean run is silent.

Redis outage: a window skipped because the lock store is not ready logs a warning every time.
After `LEDGER_RECONCILE_MAX_SKIPPED_WINDOWS` (default 2) consecutive skipped windows the replica
runs the read-only reconcile **without** the lock (so mismatches keep reaching admins; duplicate
runs across replicas are harmless, at worst a duplicate alert) and writes audit
`ledger_reconcile_degraded` (status failure) once per outage. The counter resets when the lock
works again or another replica holds it.

## 7. Realtime

```ts
'admin:transaction' -> room 'admin'
{ id: string; type: string; typeLabelTh: string;
  amount: string | null;                     // signed customer-side IC
  user: { id: string; name: string | null } | null;
  referenceType: string | null; referenceId: string | null;
  createdAt: string }                        // postedAt

'admin:ledger:mismatch' -> room 'admin'
{ at: string; checkedAccounts: number; mismatchCount: number; legacyPointsMismatchCount: number;
  unbalancedTransactionCount: number;
  sample: Array<{ accountId: string; userId: string | null; cachedBalance: string; ledgerSum: string }> }
```

Room `admin` membership uses the REST rule of `requireWebsiteAdmin`: role `admin` or `root`
only. The legacy `isAdmin` flag alone (role `user` / `server_admin`) never joins it. A socket in
the room re-checks its session + role every 60 s and leaves (role lost) or is disconnected
(session revoked/expired, user banned). Immediate effects: logout and `DELETE /auth/sessions/:id`
disconnect the sockets of that session (room `session:<sessionId>`); a role change away from
admin|root removes the user's sockets from `admin`; a ban or PDPA delete disconnects the user's
sockets.

`admin:transaction` is emitted in one place, `walletService.post`, via `afterCommit`: exactly once
per newly posted transaction, only after the enclosing DB transaction commits. Rolled-back
transactions and idempotent replays emit nothing. Clients treat it as a hint and refetch (the
event is not a substitute for the list).

## 8. Delivery release changes (plugin gateway, same release)

- `POST /api/plugin/deliveries/:key/release` no longer consumes an attempt: the claim's
  `attempts` increment is undone, so a long offline streak cannot dead-letter the first real
  failure.
- Release backoff grows with consecutive releases (Redis streak key
  `iris:delivery:release-streak:<jobId>`, TTL 1h): 30s, 60s, 120s, 240s, then 5 min. Reset when
  the claim completes/fails and when the player logs in (`GET /api/plugin/player/:steamId`,
  which also makes their released jobs claimable now). Without Redis: 30s backoff every time.
- Response adds `nextRetryAt` and `retryInMs`.
- `delivery:updated` / `order:updated` are emitted only when the buyer-visible status changes:
  a release emits only when the lease it ends was a visible claim. A re-claim after a release is
  a silent probe and keeps `nextRetryAt` stamped on the leased job; that DB marker (not Redis)
  decides the release's visibility, so a Redis outage cannot bring back the every-30s re-emit.
  When Redis is unreadable, a pending job with a backoff stamp is treated as a probe (a retry
  after a failure is then silent too; complete/fail/dead-letter always emit) and the degraded
  mode is logged (rate-limited). The streak is incremented only after the release wins its
  conditional update (a 409 "lease changed concurrently" leaves it untouched). See
  `realtime-2026-10.md`.
- Attempt accounting: every claim counts as one attempt unless it ends in a release. An expired
  lease (plugin crash, or a poison payload that kills the plugin before complete/fail/release)
  **keeps** its attempt. When the claim loop finds an expired lease whose `attempts >=
  maxAttempts`, it dead-letters the job instead of re-claiming it: `status dead_letter`, error
  `Lease expired with no complete/fail/release after N attempt(s) ...`, order -> `failed`
  (refundable) and fulfillment `failed` for order-backed jobs, escrow refund to the buyer for dino
  jobs, `delivery:updated dead_letter` and `admin:delivery:failed` - the same outcome as
  `failDelivery` at the limit. Conditional on the expired lease token, so a late
  complete/fail/release from the plugin wins.
