'use client';

import * as React from 'react';
import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Table primitives in the Frozen palette: iris-midnight surface, hairline
 * borders, iris-pearl text, iris-muted secondary text. Cell padding/size come
 * from .frozen-page td/th (14px 16px, 13px) so admin tables match the site.
 */

type Align = 'left' | 'center' | 'right';
const alignClass: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export interface AdminTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Visually-hidden caption describing the table (screen readers). */
  caption?: string;
  /**
   * Max height of the scroll area; the header row sticks to the top inside it.
   * Default 'min(72vh, 880px)'. Pass 'none' to let the page scroll instead.
   */
  maxHeight?: string;
  /** Min table width before horizontal scrolling kicks in. Default 720px. */
  minWidth?: number | string;
  /** Marks the region busy while a page is loading. */
  busy?: boolean;
  containerClassName?: string;
}

/** Scroll container + <table>. */
export function AdminTable({
  caption,
  maxHeight = 'min(72vh, 880px)',
  minWidth = 720,
  busy = false,
  className,
  containerClassName,
  children,
  ...props
}: AdminTableProps) {
  return (
    <div
      className={cn('relative w-full overflow-auto overscroll-x-contain bg-iris-midnight/40', containerClassName)}
      style={maxHeight === 'none' ? undefined : { maxHeight }}
      aria-busy={busy || undefined}
      // Focusable so keyboard users can scroll a wide table horizontally.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table
        className={cn('w-full border-separate border-spacing-0 text-left text-sm text-iris-pearl', className)}
        style={{ minWidth }}
        {...props}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function AdminTableHead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
}

export interface AdminThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

/** Header cell. Sticky (opaque iris-midnight) so it stays visible while the body scrolls. */
export function AdminTh({ align = 'left', className, scope = 'col', children, ...props }: AdminThProps) {
  return (
    <th
      scope={scope}
      className={cn(
        'sticky top-0 z-10 whitespace-nowrap bg-iris-midnight text-xs font-semibold text-iris-muted',
        'shadow-[inset_0_-1px_0_rgba(183,219,238,0.14)]',
        alignClass[align],
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export interface AdminTableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Number of columns (for full-width state rows). */
  colSpan: number;
  /** First load: render skeleton rows instead of children. */
  isInitialLoading?: boolean;
  /** Rows on screen belong to the previous page while the next one loads: dim slightly. */
  isPlaceholderData?: boolean;
  isError?: boolean;
  /** Retry handler for the error row. */
  onRetry?: () => void;
  errorMessage?: React.ReactNode;
  /** No rows (after loading). */
  isEmpty?: boolean;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** Skeleton row count (default 8). Use the page size, capped, to keep the height. */
  skeletonRows?: number;
}

/**
 * <tbody> that renders the right state:
 *   first load       -> skeleton rows
 *   error, no rows   -> error row with retry
 *   error with rows  -> error row on top + the last rows
 *   empty            -> empty row
 *   otherwise        -> children (dimmed while placeholder data is shown)
 */
export function AdminTableBody({
  colSpan,
  isInitialLoading = false,
  isPlaceholderData = false,
  isError = false,
  onRetry,
  errorMessage,
  isEmpty = false,
  emptyTitle = 'ไม่พบรายการ',
  emptyDescription,
  emptyAction,
  skeletonRows = 8,
  className,
  children,
  ...props
}: AdminTableBodyProps) {
  let content: React.ReactNode;
  if (isInitialLoading) {
    content = <AdminTableSkeletonRows rows={skeletonRows} columns={colSpan} />;
  } else if (isError && isEmpty) {
    content = <AdminTableErrorRow colSpan={colSpan} message={errorMessage} onRetry={onRetry} />;
  } else if (isEmpty) {
    content = (
      <AdminTableEmptyRow colSpan={colSpan} title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  } else {
    content = (
      <>
        {isError && <AdminTableErrorRow colSpan={colSpan} message={errorMessage} onRetry={onRetry} compact />}
        {children}
      </>
    );
  }
  return (
    <tbody
      className={cn('transition-opacity duration-150', isPlaceholderData && 'opacity-60', className)}
      aria-busy={isInitialLoading || isPlaceholderData || undefined}
      {...props}
    >
      {content}
    </tbody>
  );
}

export interface AdminTrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export function AdminTr({ selected = false, className, children, ...props }: AdminTrProps) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-white/[0.025] [&>td]:border-t [&>td]:border-white/[0.06]',
        selected && 'bg-iris-cyan/[0.06] hover:bg-iris-cyan/[0.08]',
        className,
      )}
      aria-selected={selected || undefined}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface AdminTdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  /** Secondary text colour (iris-muted). */
  muted?: boolean;
  /** Monospace (ids, keys, hosts). */
  mono?: boolean;
  nowrap?: boolean;
}

export function AdminTd({ align = 'left', muted, mono, nowrap, className, children, ...props }: AdminTdProps) {
  return (
    <td
      className={cn(
        'align-middle',
        alignClass[align],
        muted ? 'text-iris-muted' : 'text-iris-pearl',
        mono && 'font-mono text-xs',
        nowrap && 'whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

const skeletonWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5'];

/** Static placeholder rows (no shimmer/pulse) with the same height as real rows. */
export function AdminTableSkeletonRows({ rows = 8, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: Math.max(1, rows) }, (_, r) => (
        <tr key={r} aria-hidden="true" className="[&>td]:border-t [&>td]:border-white/[0.06]">
          {Array.from({ length: Math.max(1, columns) }, (_, c) => (
            <td key={c}>
              <span className={cn('block h-3.5 rounded bg-white/[0.06]', skeletonWidths[(r + c) % skeletonWidths.length])} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export interface AdminTableEmptyRowProps {
  colSpan: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function AdminTableEmptyRow({ colSpan, title = 'ไม่พบรายการ', description, action }: AdminTableEmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-white/[0.06]">
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Inbox className="h-6 w-6 text-iris-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-iris-pearl">{title}</p>
          {description && <p className="max-w-md text-xs text-iris-muted">{description}</p>}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

export interface AdminTableErrorRowProps {
  colSpan: number;
  message?: React.ReactNode;
  onRetry?: () => void;
  /** One-line variant shown above existing rows. */
  compact?: boolean;
}

export function AdminTableErrorRow({ colSpan, message, onRetry, compact = false }: AdminTableErrorRowProps) {
  const text = message ?? 'โหลดข้อมูลไม่สำเร็จ โปรดลองอีกครั้ง';
  const retry = onRetry && (
    <button
      type="button"
      onClick={onRetry}
      className="btn-secondary min-h-9 gap-1.5 px-3.5 py-1.5 text-xs"
    >
      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
      ลองอีกครั้ง
    </button>
  );
  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-white/[0.06]">
        {compact ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-rose-100">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {text}
            </span>
            {retry}
          </div>
        ) : (
          <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-rose-200" aria-hidden="true" />
            <p className="text-sm text-iris-pearl">{text}</p>
            {retry}
          </div>
        )}
      </td>
    </tr>
  );
}
