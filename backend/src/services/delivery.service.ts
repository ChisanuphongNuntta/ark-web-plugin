// Delivery orchestrator helpers (ENTERPRISE_REDESIGN_PLAN_TH.md §18).
//
// Pure, side-effect-free policy functions so the retry/backoff/dead-letter rules are
// unit-testable without a database. The plugin.controller wires these into DeliveryJob
// + Order/Fulfillment state writes.

export const LEASE_DURATION_MS = 60 * 1000; // 60s short-term lease
export const DEFAULT_MAX_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 5 * 1000; // 5s base, doubled per attempt
export const MAX_BACKOFF_MS = 10 * 60 * 1000; // cap at 10 minutes

// Exponential backoff with a hard cap. `attempts` is the number of attempts already made
// (1 after the first failure). attempts=1 -> 5s, 2 -> 10s, 3 -> 20s, ... capped at 10m.
export function backoffMs(attempts: number): number {
  const n = Math.max(1, attempts);
  const raw = BASE_BACKOFF_MS * 2 ** (n - 1);
  return Math.min(raw, MAX_BACKOFF_MS);
}

export function nextRetryAt(attempts: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + backoffMs(attempts));
}

// After a transient failure, decide whether the job retries (back to pending with backoff)
// or is exhausted and routed to the dead-letter queue. `attempts` is the post-increment
// attempt count (i.e. attempts already consumed including the one that just failed).
export function classifyFailure(
  attempts: number,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): { status: 'pending' | 'dead_letter'; retry: boolean; nextRetryAt: Date | null } {
  if (attempts >= maxAttempts) {
    return { status: 'dead_letter', retry: false, nextRetryAt: null };
  }
  return { status: 'pending', retry: true, nextRetryAt: nextRetryAt(attempts) };
}

// A job is eligible for claiming when it is pending (and past any backoff window) OR it is
// a leased job whose lease has expired (the worker crashed / went offline). dead_letter,
// completed, and failed jobs are never re-claimed.
export function claimWhere(serverId: number, now: Date = new Date()) {
  return {
    serverId,
    OR: [
      {
        status: 'pending' as const,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      { status: 'leased' as const, leaseExpiresAt: { lt: now } },
    ],
  };
}
