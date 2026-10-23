'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toVipBadge, type VipBadge } from '@/lib/vip';

const MAX_PER_REQUEST = 100;
const EMPTY: ReadonlyMap<string, VipBadge> = new Map();

/**
 * VIP badges for many users at once (chat, market sellers, rankings):
 * GET /vip/badges?userIds=a,b → { badges: { [userId]: VipBadge } } (non-VIP ids absent).
 * Decoration only: an error yields an empty map, never a broken list.
 */
export function useVipBadges(userIds: readonly (string | null | undefined)[], enabled = true): ReadonlyMap<string, VipBadge> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))].sort();
  const query = useQuery({
    queryKey: ['vip-badges', ids.join(',')],
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const out = new Map<string, VipBadge>();
      for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) {
        const chunk = ids.slice(i, i + MAX_PER_REQUEST);
        try {
          const { data } = await api.get('/vip/badges', { params: { userIds: chunk.join(',') }, signal });
          const badges = data && typeof data === 'object' ? (data as { badges?: unknown }).badges : null;
          if (badges && typeof badges === 'object') {
            for (const [id, raw] of Object.entries(badges as Record<string, unknown>)) {
              const badge = toVipBadge(raw);
              if (badge) out.set(id, badge);
            }
          }
        } catch {
          // decoration only
        }
      }
      return out;
    },
  });
  return query.data ?? EMPTY;
}
