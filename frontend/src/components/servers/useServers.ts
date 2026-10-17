'use client';

import { useQuery } from '@tanstack/react-query';
import { serverDirectoryApi } from '@/lib/contracts/console';

export const SERVERS_QUERY_KEY = ['servers', 'list'] as const;
export const DELIVERABLE_SERVERS_QUERY_KEY = ['servers', 'deliverable'] as const;
export const SERVER_DIRECTORY_QUERY_KEY = ['servers', 'directory'] as const;

const LIVE = { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true } as const;

/** GET /servers/directory — grouped, listed servers for the public server list. */
export function useServerDirectory(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SERVER_DIRECTORY_QUERY_KEY,
    queryFn: serverDirectoryApi.getDirectory,
    enabled: options.enabled ?? true,
    ...LIVE,
  });
}

/** GET /servers — every active server (ServerSummary[]). Feed this to <ServerPicker/>. */
export function useServers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SERVERS_QUERY_KEY,
    queryFn: () => serverDirectoryApi.listServers(),
    enabled: options.enabled ?? true,
    ...LIVE,
  });
}

/** GET /servers?deliverable=true — only servers shop delivery can target right now. */
export function useDeliverableServers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DELIVERABLE_SERVERS_QUERY_KEY,
    queryFn: () => serverDirectoryApi.listServers({ deliverable: true }),
    enabled: options.enabled ?? true,
    ...LIVE,
  });
}
