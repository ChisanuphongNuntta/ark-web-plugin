'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
            gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Don't refetch if data is fresh
            retry: 1, // Reduce retry attempts
          },
        },
      })
  );

  const { setUser, setLoading } = useAuthStore();
  const hasCheckedAuth = useRef(false);

  // Check auth on mount - only once
  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    const checkAuth = async () => {
      try {
        const { data } = await authApi.getMe();
        if (data.user) {
          setUser({
            ...data.user,
            pointsBalance: Number(data.user.pointsBalance),
          });
        } else {
          setUser(null);
        }
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
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
