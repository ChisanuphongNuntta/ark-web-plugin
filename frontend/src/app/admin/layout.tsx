import type { Metadata } from 'next';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'คอนโซลผู้ดูแล',
  // Never index the console (also emits <meta name="robots" content="noindex, nofollow">).
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/**
 * /admin tree: the guard resolves the session first and renders nothing
 * admin-related (no rail, no fetches) until the role is confirmed.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
