import type { Metadata } from 'next';
import { AdminGuard } from '@/components/admin/AdminGuard';

export const metadata: Metadata = {
  title: 'Style guide',
  description: 'Internal living style guide for the IRIS Private design system.',
  robots: { index: false, follow: false },
};

/**
 * Internal style guide. Open in development; in production only console roles
 * can see it (others are sent home by AdminGuard), so players never land on
 * demo/fixture content.
 */
export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'production') return children;
  return <AdminGuard>{children}</AdminGuard>;
}
