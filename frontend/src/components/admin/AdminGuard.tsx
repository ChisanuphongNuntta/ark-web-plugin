'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui';
import { isAdminConsoleRole } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store';

/**
 * Client gate for the whole /admin tree.
 *
 * - While the session resolves (`isLoading`, set by Providers after GET /auth/me)
 *   it renders a neutral skeleton — no sidebar, no admin labels, no data fetches.
 *   The persisted user from localStorage is NOT trusted until /auth/me answers.
 * - Logged-out users and roles outside admin | server_admin | root are sent to
 *   '/' with router.replace and nothing admin-related is rendered.
 *
 * The backend enforces every role on its own routes; this only hides the UI.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const allowed = !isLoading && isAdminConsoleRole(user?.role);
  const denied = !isLoading && !allowed;

  React.useEffect(() => {
    if (denied) router.replace('/');
  }, [denied, router]);

  if (!allowed) return <NeutralSkeleton />;
  return <>{children}</>;
}

/** Generic page placeholder — intentionally says nothing about the admin console. */
function NeutralSkeleton() {
  return (
    <div className="page-shell py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">กำลังโหลด</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 rounded-card" />
    </div>
  );
}

export default AdminGuard;
