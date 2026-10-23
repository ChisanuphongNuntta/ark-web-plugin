'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSocketEvent, useSocketStatus } from '@/lib/socket';

/**
 * Debounced react-query refresh of `queryKeys` when any of `events` arrives
 * (bursts at checkout produce many), and after a socket reconnect (events may
 * have been missed). `filter` can drop irrelevant payloads.
 */
export function useAdminLiveRefresh(
  events: readonly string[],
  queryKeys: readonly string[],
  options: { enabled?: boolean; debounceMs?: number; filter?: (event: string, payload: unknown) => boolean } = {},
) {
  const { enabled = true, debounceMs = 1_500 } = options;
  const queryClient = useQueryClient();
  const timer = useRef<number | null>(null);
  const latest = useRef({ queryKeys, filter: options.filter });
  useEffect(() => {
    latest.current = { queryKeys, filter: options.filter };
  });
  const eventsKey = events.join('|');

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        for (const key of latest.current.queryKeys) void queryClient.invalidateQueries({ queryKey: [key] });
      }, debounceMs);
    };
    const offs = eventsKey.split('|').filter(Boolean).map((name) =>
      onSocketEvent<unknown>(name, (payload) => {
        const f = latest.current.filter;
        if (f && !f(name, payload)) return;
        refresh();
      }),
    );
    return () => {
      offs.forEach((off) => off());
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [enabled, eventsKey, debounceMs, queryClient]);

  const connectCount = useSocketStatus((st) => st.connectCount);
  useEffect(() => {
    if (!enabled || connectCount <= 1) return;
    for (const key of latest.current.queryKeys) void queryClient.invalidateQueries({ queryKey: [key] });
  }, [connectCount, enabled, queryClient]);
}
