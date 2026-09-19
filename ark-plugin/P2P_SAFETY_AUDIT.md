# P2P Safety Audit

## Current failure windows

- `/sell` creates a sellable listing before removing the live dino. A crash,
  disconnect, response parse error, or invalid player pointer can leave both.
- `Player` and `TargetDino` are raw pointers retained across an asynchronous
  request. The player, ownership, stats, or dino may change before the callback.
- Concurrent `/sell` calls can create multiple listings for the same dino.
- Dino removal is not journalled and has no durable asset fingerprint or
  confirmed game receipt.
- Marketplace delivery recreates only part of the captured dino state. A crash
  after spawn but before durable completion requires manual reconciliation.
- Return HTTP methods exist, but no return poll/worker is registered.

The delivery journal blocks automatic duplicate delivery after an uncertain
spawn. It does not make listing creation, asset removal, or return atomic.

## Backend blockers

`POST /market/prepare-lock` and `POST /market/confirm-lock` exist, but must be
hardened before the plugin switches from the legacy flow:

- Prepare needs a plugin-generated idempotency key and must return the same lock
  for duplicate requests.
- Confirm must be idempotent and atomically create the listing and confirm the
  lock in one database transaction.
- A listing must never become purchasable before confirmed asset removal.
- Abort, expiry, reconciliation, and idempotent return operations are missing.
- Lock ownership must include server, seller, immutable payload hash, expiry,
  and a strong game-asset fingerprint.
- Backend responses must expose stable result states so timeout recovery does
  not require guessing whether prepare or confirm committed.

Until these conditions are met, retrying either mutation can duplicate a
listing, while changing the operation order can permanently lose the asset.

## Acceptance tests

1. Duplicate prepare requests return one `assetLockId`.
2. Concurrent sellers cannot lock or list the same asset fingerprint twice.
3. Crash after prepare but before removal leaves no purchasable listing.
4. Crash after removal but before confirm resumes confirm without removing a
   second asset.
5. Duplicate confirm returns the original listing and creates no second row.
6. Confirm database failure creates neither a listing nor a confirmed lock.
7. Expired or aborted locks generate exactly one return job.
8. Duplicate return requests restore the asset once and return the same receipt.
9. Restart preserves prepared, removed, confirmed, and returned journal states.
10. Dino delivery retry after a lost acknowledgement does not spawn twice.
11. Payload or asset-fingerprint mismatch blocks mutation and raises an audit
    event.
12. Disconnect, ownership transfer, dino death, and server shutdown during each
    transition produce a deterministic recoverable state.

