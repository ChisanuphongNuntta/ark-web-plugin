// Lease-release bookkeeping for the delivery orchestrator (plugin.controller).
//
// The plugin releases a claimed job when the buyer is offline (or a local condition defers the
// delivery). Releases must not consume delivery attempts and must not hammer the buyer with
// realtime updates, so we keep a per-job "release streak" (consecutive claims that ended in a
// release) in Redis:
//   - backoff after a release grows with the streak: 30s, 60s, 120s, 240s, then 5 min cap;
//   - only the first release of a streak is a visible status change (leased -> pending), the
//     re-claims/releases while the player stays offline are silent;
//   - the streak is cleared when the claim ends in complete/fail, and when the player logs in
//     (GET /api/plugin/player/:steamId), which also makes their released jobs claimable now.
// No schema change: the streak lives in Redis with a TTL. If Redis is unavailable the store
// reports `available() === false` and degrades to "streak = 1" (30s backoff). Visibility does
// NOT depend on Redis: plugin.controller marks a silent probe lease in the DB (a probe claim
// keeps nextRetryAt non-null), so a release only emits when the lease it ends was a visible
// claim, and degraded mode is logged (rate-limited) so the outage shows.
import redis from '../config/redis.js';

export const RELEASE_BASE_BACKOFF_MS = 30 * 1000;
export const RELEASE_MAX_BACKOFF_MS = 5 * 60 * 1000;
export const RELEASE_STREAK_TTL_MS = 60 * 60 * 1000;
const REDIS_TIMEOUT_MS = 250;

export const releaseStreakKey = (jobId: string) => `iris:delivery:release-streak:${jobId}`;

/** Backoff after the Nth consecutive release (N >= 1). */
export function releaseBackoffMs(streak: number): number {
  const n = Number.isFinite(streak) ? Math.max(1, Math.floor(streak)) : 1;
  return Math.min(RELEASE_BASE_BACKOFF_MS * 2 ** Math.min(n - 1, 20), RELEASE_MAX_BACKOFF_MS);
}

type RedisLike = {
  status?: string;
  incr: (key: string) => Promise<number>;
  pexpire: (key: string, ms: number) => Promise<unknown>;
  mget: (...keys: string[]) => Promise<Array<string | null>>;
  del: (...keys: string[]) => Promise<unknown>;
};

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis timeout')), REDIS_TIMEOUT_MS);
    timer.unref?.();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export const DEGRADED_WARN_INTERVAL_MS = 5 * 60 * 1000;

export function createReleaseStreakStore(client: () => RedisLike | null) {
  let lastDegradedWarnAt = 0;
  const warnDegraded = (reason: string) => {
    const now = Date.now();
    if (now - lastDegradedWarnAt < DEGRADED_WARN_INTERVAL_MS) return;
    lastDegradedWarnAt = now;
    console.warn(`[delivery] release streak store degraded (${reason}): offline releases use the 30s base backoff; visibility falls back to the DB probe marker`);
  };
  const ready = () => {
    const c = client();
    const ok = c && c.status === 'ready' && typeof c.incr === 'function' ? c : null;
    if (!ok) warnDegraded(`redis status ${c?.status ?? 'missing'}`);
    return ok;
  };

  return {
    /** Whether streaks can be read/written right now (Redis ready). */
    available(): boolean {
      return ready() !== null;
    },

    /** Record a release; returns the streak length including this one (>= 1). */
    async increment(jobId: string): Promise<number> {
      const c = ready();
      if (!c) return 1;
      try {
        const key = releaseStreakKey(jobId);
        const value = await withTimeout(c.incr(key));
        await withTimeout(c.pexpire(key, RELEASE_STREAK_TTL_MS));
        return Number.isFinite(value) && value > 0 ? value : 1;
      } catch (error) {
        console.error('[delivery] release streak increment failed:', error);
        warnDegraded('increment failed');
        return 1;
      }
    },

    /**
     * Current streaks (0 = last claim did not end in a release / unknown). `known` is false when
     * Redis could not be read, so callers can fall back to DB state instead of trusting the 0s.
     */
    async getMany(jobIds: string[]): Promise<Map<string, number> & { known?: boolean }> {
      const out = new Map<string, number>(jobIds.map((id) => [id, 0])) as Map<string, number> & { known?: boolean };
      out.known = false;
      if (jobIds.length === 0) { out.known = true; return out; }
      const c = ready();
      if (!c) return out;
      try {
        const values = await withTimeout(c.mget(...jobIds.map(releaseStreakKey)));
        jobIds.forEach((id, index) => {
          const n = Number(values?.[index] ?? 0);
          out.set(id, Number.isFinite(n) && n > 0 ? n : 0);
        });
        out.known = true;
      } catch (error) {
        console.error('[delivery] release streak read failed:', error);
        warnDegraded('read failed');
      }
      return out;
    },

    async clear(jobIds: string[]): Promise<void> {
      const c = ready();
      if (!c || jobIds.length === 0) return;
      try {
        await withTimeout(c.del(...jobIds.map(releaseStreakKey)));
      } catch (error) {
        console.error('[delivery] release streak clear failed:', error);
      }
    },
  };
}

export type ReleaseStreakStore = ReturnType<typeof createReleaseStreakStore>;

export const releaseStreaks: ReleaseStreakStore = createReleaseStreakStore(() => redis as unknown as RedisLike);
