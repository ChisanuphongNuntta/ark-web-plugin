import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AdminPageHeaderProps {
  /** Small English label above the title, e.g. "SERVERS". */
  eyebrow: string;
  /** Thai page title, e.g. "จัดการเซิร์ฟเวอร์". */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned buttons (AdminButton). */
  actions?: React.ReactNode;
  className?: string;
}

/** Page heading in the site's style: cyan eyebrow + display-font Thai title + muted description. */
export function AdminPageHeader({ eyebrow, title, description, actions, className }: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-white/[0.06] pb-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-2xl font-semibold text-iris-pearl sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-iris-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Root wrapper for an admin page: vertical rhythm only (width/padding come from .frozen-page-admin). */
export function AdminPage({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('space-y-6', className)}>{children}</div>;
}
