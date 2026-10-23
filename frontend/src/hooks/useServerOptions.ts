'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ServerOption {
  id: number;
  name: string;
}

/**
 * Server picker options for admin filters. Uses the public GET /servers list so
 * admins (not only root, who can read /admin/servers) get the same options.
 */
export function useServerOptions(enabled = true) {
  return useQuery({
    queryKey: ['admin-console-server-options'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<ServerOption[]> => {
      const { data } = await api.get('/servers', { signal });
      const rows: unknown = data && typeof data === 'object' && 'servers' in data ? (data as { servers: unknown }).servers : data;
      if (!Array.isArray(rows)) return [];
      return rows
        .map((r): ServerOption | null => {
          if (!r || typeof r !== 'object') return null;
          const row = r as { id?: unknown; displayName?: unknown; name?: unknown };
          const id = Number(row.id);
          if (!Number.isInteger(id) || id <= 0) return null;
          const name = typeof row.displayName === 'string' && row.displayName ? row.displayName : String(row.name ?? `#${id}`);
          return { id, name };
        })
        .filter((o): o is ServerOption => o !== null);
    },
  });
}
