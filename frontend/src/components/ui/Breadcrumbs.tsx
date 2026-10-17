import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

/** Trail of links; the last item is the current page (aria-current). */
export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="เส้นทางหน้า" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex min-w-0 items-center gap-1.5">
              {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" /> : null}
              {current || !item.href ? (
                <span aria-current={current ? 'page' : undefined} className={cn('truncate', current && 'text-fg-muted')}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="truncate transition-colors duration-fast hover:text-fg">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
