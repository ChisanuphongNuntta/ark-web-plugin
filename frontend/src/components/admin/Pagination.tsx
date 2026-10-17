'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PAGE_SIZE_OPTIONS,
  clampPage,
  computeTotalPages,
  formatCount,
  formatRangeLabel,
  pageItems,
} from './paginationMath';

export interface PaginationComponentProps {
  page: number;
  pageSize: number;
  total: number;
  /** Accepted for convenience when spreading paginationProps; always re-derived from total/pageSize. */
  totalPages?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Request in flight: shows a subtle 'กำลังโหลด…' next to the range. */
  isBusy?: boolean;
  /** Totals unknown (before the first response): controls disabled. */
  isUnknown?: boolean;
  pageSizeOptions?: readonly number[];
  /** Hide the rows-per-page select. */
  hidePageSize?: boolean;
  className?: string;
}

const navButton =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] px-2 text-sm text-iris-pearl transition-colors ' +
  'hover:border-iris-cyan/40 hover:bg-iris-cyan/[0.08] disabled:pointer-events-none disabled:opacity-35';

/**
 * Footer for a paginated table:
 *   "แสดง 26–50 จาก 41 รายการ"   แสดงหน้าละ [25] แถว   « ‹ 1 … 4 5 6 … 20 › »
 * On small screens the numbered buttons collapse to "หน้า 2/5".
 * Spread `list.paginationProps` from usePaginatedQuery / useClientPagination.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  isBusy = false,
  isUnknown = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  hidePageSize = false,
  className,
}: PaginationComponentProps) {
  const selectId = React.useId();
  const totalPages = computeTotalPages(total, pageSize);
  const current = clampPage(page, totalPages);
  const atStart = isUnknown || current <= 1;
  const atEnd = isUnknown || current >= totalPages;
  const items = pageItems(current, totalPages);

  const go = (target: number) => {
    const next = clampPage(target, totalPages);
    if (next !== page) onPageChange(next);
  };

  const options = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 border-t border-white/[0.06] px-5 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="min-w-0 text-iris-muted" aria-live="polite" aria-atomic="true">
        {isUnknown ? 'กำลังโหลด…' : formatRangeLabel(current, pageSize, total)}
        {isBusy && !isUnknown && <span className="ml-2 text-xs text-iris-muted/80">· กำลังโหลด…</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {!hidePageSize && (
          <div className="flex items-center gap-2 text-iris-muted">
            <label htmlFor={selectId} className="whitespace-nowrap">
              แสดงหน้าละ
            </label>
            <select
              id={selectId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="input w-auto py-2 pl-3 pr-8 tabular-nums"
            >
              {options.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span aria-hidden="true">แถว</span>
          </div>
        )}

        <nav aria-label="เลือกหน้า" className="flex items-center gap-1.5">
          <button type="button" className={cn(navButton, 'hidden sm:inline-flex')} onClick={() => go(1)} disabled={atStart} aria-label="หน้าแรก">
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={navButton} onClick={() => go(current - 1)} disabled={atStart} aria-label="หน้าก่อนหน้า">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Compact (mobile): "หน้า 2/5" */}
          <span className="px-2 tabular-nums text-iris-muted sm:hidden" aria-hidden={isUnknown || undefined}>
            หน้า {formatCount(current)}/{formatCount(totalPages)}
          </span>

          {/* Numbered (sm and up) */}
          <ul className="hidden items-center gap-1.5 sm:flex">
            {items.map((item) =>
              typeof item === 'number' ? (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => go(item)}
                    disabled={isUnknown}
                    aria-label={`ไปหน้า ${item}`}
                    aria-current={item === current ? 'page' : undefined}
                    className={cn(
                      navButton,
                      'tabular-nums',
                      item === current && 'border-iris-cyan/40 bg-iris-cyan/[0.12] font-semibold hover:bg-iris-cyan/[0.12]',
                    )}
                  >
                    {formatCount(item)}
                  </button>
                </li>
              ) : (
                <li key={item} aria-hidden="true" className="px-1 text-iris-muted">
                  …
                </li>
              ),
            )}
          </ul>

          <button type="button" className={navButton} onClick={() => go(current + 1)} disabled={atEnd} aria-label="หน้าถัดไป">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={cn(navButton, 'hidden sm:inline-flex')} onClick={() => go(totalPages)} disabled={atEnd} aria-label="หน้าสุดท้าย">
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
}
