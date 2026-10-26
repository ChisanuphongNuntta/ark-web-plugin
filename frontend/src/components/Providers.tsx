'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore, userFromMe } from '@/lib/store';
import { authApi } from '@/lib/api';
import { applyRealtimeFallbackDefaults } from '@/lib/realtime/queryKeys';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';
import { LoadingBoundary } from '@/components/LoadingBoundary';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
            gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Don't refetch if data is fresh
            retry: 1, // Reduce retry attempts
          },
        },
      });
    // Wallet / orders / servers refresh on focus and every 60 s even if the socket drops.
    applyRealtimeFallbackDefaults(client);
    return client;
  });

  const { setUser, setLoading } = useAuthStore();
  const hasCheckedAuth = useRef(false);

  // Check auth on mount - only once
  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    const checkAuth = async () => {
      try {
        const { data } = await authApi.getMe();
        setUser(userFromMe(data));
      } catch (error) {
        // 401 is expected when not logged in
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []); // Empty dependency - run once on mount

  return (
    <LanguageProvider><QueryClientProvider client={queryClient}>
      <RealtimeProvider><LoadingBoundary>{children}</LoadingBoundary></RealtimeProvider>
    </QueryClientProvider></LanguageProvider>
  );
}
