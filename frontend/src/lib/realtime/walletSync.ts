/**
 * Keeps the navbar IC pill (auth store `user.pointsBalance`) and every wallet
 * cache in step with the backend ledger. Display only — the backend wallet
 * stays authoritative for affordability (see lib/store.ts).
 */
import type { QueryClient } from '@tanstack/react-query';
import { walletApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { isWalletQuery } from './queryKeys';

/** Apply a backend-provided balance string to the navbar pill. */
export function applyWalletBalance(balance: string | number | null | undefined): void {
  if (balance === null || balance === undefined) return;
  const value = Number(balance);
  if (!Number.isFinite(value)) return;
  const { user, setUser } = useAuthStore.getState();
  if (!user || user.pointsBalance === value) return;
  setUser({ ...user, pointsBalance: value });
}

export function invalidateWalletQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ predicate: isWalletQuery });
}

let inFlight: Promise<void> | null = null;

/**
 * Re-read GET /wallet right now (after a purchase, checkout or top-up) so the
 * pill changes without waiting for the socket event. Safe to call often:
 * concurrent calls share one request.
 */
export function syncWalletNow(client: QueryClient): Promise<void> {
  if (!useAuthStore.getState().user) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data } = await walletApi.getBalance();
      applyWalletBalance(data?.accounts?.available ?? data?.balance ?? null);
    } catch {
      // The socket event or the 60 s fallback will catch up.
    } finally {
      await invalidateWalletQueries(client);
      inFlight = null;
    }
  })();
  return inFlight;
}
