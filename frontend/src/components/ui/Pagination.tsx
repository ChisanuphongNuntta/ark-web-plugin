import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Hide the "แสดง x–y จาก z" summary. */
  hideSummary?: boolean;
  className?: string;
}

function pageWindow(current: number, last: number): Array<number | 'gap'> {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const pages = new Set([1, last, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

const fmt = (n: number) => n.toLocaleString('th-TH');

/** Page navigation with a mono summary. Renders nothing when there is one page or less. */
export function Pagination({ page, pageSize, total, onPageChange, hideSummary = false, className }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'inline-grid h-8 min-w-8 place-items-center rounded-control px-2 font-mono text-xs transition-colors duration-fast disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav aria-label="เลขหน้า" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {!hideSummary ? (
        <p className="text-xs text-fg-muted">
          แสดง <span className="font-mono text-fg">{fmt(from)}–{fmt(to)}</span> จาก{' '}
          <span className="font-mono text-fg">{fmt(total)}</span>
        </p>
      ) : (
        <span />
      )}
      {last > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(btn, 'text-fg-muted hover:bg-surface-2 hover:text-fg')}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="หน้าก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {pageWindow(page, last).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-fg-subtle" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={cn(
                  btn,
                  p === page ? 'border border-line-strong bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                )}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`หน้า ${p}`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className={cn(btn, 'text-fg-muted hover:bg-surface-2 hover:text-fg')}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= last}
            aria-label="หน้าถัดไป"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      ) : null}
    </nav>
  );
}

export default Pagination;
