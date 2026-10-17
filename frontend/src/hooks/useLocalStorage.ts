'use client';

import * as React from 'react';

/** Read a JSON value from localStorage. Never throws (private mode, blocked storage). */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage. Never throws. Returns false when storage is unavailable. */
export function writeStorage<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * SSR-safe persisted state for per-viewer conveniences (remembered tab,
 * dismissed notice, last server). Renders `initial` on the server and the
 * first client paint, then hydrates from storage after mount.
 * Do NOT use for anything that must persist reliably.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(initial);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount (SSR-safe)
    setValue(readStorage(key, initial));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is a fallback only
  }, [key]);

  const update = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        writeStorage(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  return [value, update, hydrated] as const;
}
