/**
 * Persistent "ledger mismatch" alert for admin pages.
 *
 * Set by RealtimeProvider when 'admin:ledger:mismatch' arrives (the web
 * process reconciles every 15 min). Kept in localStorage so it survives a
 * refresh, and stays until a root reconcile comes back clean or someone hides
 * it; a new event shows it again.
 */
import { create } from 'zustand';
import type { AdminLedgerMismatchEvent } from './events';

const STORAGE_KEY = 'iris-admin:ledger-mismatch';

export interface LedgerAlert {
  at: string;
  mismatchCount: number | null;
  legacyCount: number | null;
  unbalancedCount: number | null;
  dismissed: boolean;
}

interface LedgerAlertState {
  alert: LedgerAlert | null;
  report: (event: AdminLedgerMismatchEvent | null | undefined) => void;
  dismiss: () => void;
  clear: () => void;
}

function countOf(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function read(): LedgerAlert | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LedgerAlert>;
    if (typeof parsed?.at !== 'string') return null;
    return {
      at: parsed.at,
      mismatchCount: typeof parsed.mismatchCount === 'number' ? parsed.mismatchCount : null,
      legacyCount: typeof parsed.legacyCount === 'number' ? parsed.legacyCount : null,
      unbalancedCount: typeof parsed.unbalancedCount === 'number' ? parsed.unbalancedCount : null,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return null;
  }
}

function write(alert: LedgerAlert | null): void {
  try {
    if (alert) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alert));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage: the alert still shows for this tab
  }
}

export const useLedgerAlert = create<LedgerAlertState>((set, get) => ({
  alert: null,
  report: (event) => {
    const alert: LedgerAlert = {
      at: typeof event?.at === 'string' ? event.at : new Date().toISOString(),
      mismatchCount: countOf(event?.mismatchCount ?? event?.mismatches),
      legacyCount: countOf(event?.legacyPointsMismatchCount ?? event?.legacyPointsMismatches),
      unbalancedCount: countOf(event?.unbalancedTransactionCount ?? event?.unbalancedTransactions),
      dismissed: false,
    };
    write(alert);
    set({ alert });
  },
  dismiss: () => {
    const current = get().alert;
    if (!current) return;
    const alert = { ...current, dismissed: true };
    write(alert);
    set({ alert });
  },
  clear: () => {
    write(null);
    set({ alert: null });
  },
}));

/** Load the stored alert once on the client (call from an effect). */
export function hydrateLedgerAlert(): void {
  if (useLedgerAlert.getState().alert) return;
  const stored = read();
  if (stored) useLedgerAlert.setState({ alert: stored });
}
