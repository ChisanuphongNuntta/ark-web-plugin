'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subscribeRoom } from '@/lib/socket';
import { SERVERS_SUBSCRIBE, SERVERS_UNSUBSCRIBE } from '@/lib/realtime/events';
import { SERVERS_DIRECTORY_KEY, SERVERS_STATUS_KEY, serverPlayersKey } from '@/lib/realtime/queryKeys';
import { serversDirectoryApi } from '@/lib/realtime/serverStatus';

/** Join the public 'servers' room while the calling component is mounted. */
export function useServersRoom(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeRoom('servers', SERVERS_SUBSCRIBE, { leaveEvent: SERVERS_UNSUBSCRIBE });
  }, [enabled]);
}

export function useServerDirectoryQuery() {
  return useQuery({
    queryKey: SERVERS_DIRECTORY_KEY,
    queryFn: serversDirectoryApi.directory,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

/**
 * Live status snapshot. The socket keeps it current; the 60 s interval is
 * only a fallback when the socket is down.
 */
export function useServerStatusQuery() {
  return useQuery({
    queryKey: SERVERS_STATUS_KEY,
    queryFn: serversDirectoryApi.status,
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,
  });
}

/** Player list of one server; polled every 20 s while the dropdown is open. */
export function useServerPlayersQuery(serverId: number, enabled: boolean) {
  return useQuery({
    queryKey: serverPlayersKey(serverId),
    queryFn: () => serversDirectoryApi.players(serverId),
    enabled,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: enabled ? 20_000 : false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400 && status < 500) return false;
      return count < 1;
    },
  });
}
