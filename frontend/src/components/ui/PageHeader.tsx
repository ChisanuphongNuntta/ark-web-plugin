import * as React from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (wrap below the title on mobile). */
  actions?: React.ReactNode;
  /** Optional in-page breadcrumbs (PageFrame already renders a site trail). */
  breadcrumbs?: BreadcrumbItem[];
  /** Extra row under the description (filters, tabs, meta). */
  children?: React.ReactNode;
  /** Draw a hairline under the header. */
  divided?: boolean;
  className?: string;
}

/**
 * The top of every page: eyebrow, one h1, a single-sentence description, actions.
 *
 *   <PageHeader eyebrow="ร้านค้า" title="ไอเทมทั้งหมด" description="…"
 *               actions={<Button>…</Button>} />
 */
export function PageHeader({ eyebrow, title, description, actions, breadcrumbs, children, divided = false, className }: PageHeaderProps) {
  return (
    <header className={cn('pb-6 pt-8 sm:pt-10', divided && 'mb-8 border-b border-line', className)}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} className="mb-4" /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-fg sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-fg-muted sm:text-base">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

export default PageHeader;
