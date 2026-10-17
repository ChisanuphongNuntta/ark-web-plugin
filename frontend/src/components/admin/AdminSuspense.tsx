'use client';

import * as React from 'react';

/**
 * REQUIRED wrapper for any admin page that uses usePaginatedQuery /
 * useClientPagination / usePaginationState (they call useSearchParams, which
 * Next.js requires to sit under a Suspense boundary or the production build
 * fails with "useSearchParams() should be wrapped in a suspense boundary").
 *
 *   export default function Page() {
 *     return <AdminSuspense><ServersAdmin /></AdminSuspense>;
 *   }
 */
export function AdminSuspense({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        fallback ?? (
          <div className="glass-card px-5 py-10 text-center text-sm text-iris-muted" role="status">
            กำลังโหลด…
          </div>
        )
      }
    >
      {children}
    </React.Suspense>
  );
}
