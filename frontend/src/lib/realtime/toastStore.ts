import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  href?: string;
}

export type ToastInput = Omit<Toast, 'id'> & {
  /** Drops repeats of the same key within DEDUPE_WINDOW_MS. */
  dedupeKey?: string;
  /** With dedupeKey: show this key at most once per page session (lifecycle events that repeat). */
  once?: boolean;
};

interface ToastState {
  toasts: Toast[];
  push: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
}

const MAX_TOASTS = 4;
const DEDUPE_WINDOW_MS = 10_000;
const MAX_ONCE_KEYS = 500;
const recent = new Map<string, number>();
const shownOnce = new Set<string>();
let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ dedupeKey, once, ...toast }) => {
    if (dedupeKey && once) {
      if (shownOnce.has(dedupeKey)) return;
      shownOnce.add(dedupeKey);
      if (shownOnce.size > MAX_ONCE_KEYS) {
        const oldest = shownOnce.values().next().value;
        if (oldest !== undefined) shownOnce.delete(oldest);
      }
    }
    if (dedupeKey) {
      const now = Date.now();
      const last = recent.get(dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      recent.set(dedupeKey, now);
      if (recent.size > 200) recent.clear();
    }
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function pushToast(toast: ToastInput): void {
  useToastStore.getState().push(toast);
}
