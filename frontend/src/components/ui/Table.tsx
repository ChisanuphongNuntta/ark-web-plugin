import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

/**
 * Dense-but-calm data table for admin and account pages.
 *
 *   <TableContainer>
 *     <Table>
 *       <TableHead><TableRow>
 *         <TableHeaderCell sortDirection={dir} onSort={…}>สร้างเมื่อ</TableHeaderCell>
 *       </TableRow></TableHead>
 *       <TableBody>
 *         {loading ? <TableLoadingRows columns={5} /> :
 *          rows.length === 0 ? <TableEmptyRow colSpan={5} title="ยังไม่มีรายการ" /> :
 *          rows.map(r => <TableRow key={r.id}><TableCell>…</TableCell></TableRow>)}
 *       </TableBody>
 *     </Table>
 *   </TableContainer>
 */

/** Horizontal scroll wrapper with hairline frame. */
export function TableContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-card border border-line bg-surface', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />;
}

export function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line bg-surface-2/60', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />;
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /**
   * Row is clickable — adds hover fill. The row itself is not focusable: put a
   * real <button>/<Link> in the first cell that does the same thing as the row
   * click, so keyboard and screen-reader users can open it too.
   */
  interactive?: boolean;
  /** Row whose detail is currently open (exposed as `aria-current`). */
  selected?: boolean;
}

export function TableRow({ className, interactive, selected, ...props }: TableRowProps) {
  return (
    <tr
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'transition-colors duration-fast',
        interactive && 'cursor-pointer hover:bg-surface-2/70',
        selected && 'bg-surface-2',
        className
      )}
      {...props}
    />
  );
}

export type SortDirection = 'asc' | 'desc' | null;

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Current sort of this column; `null` = sortable but unsorted; `undefined` = not sortable. */
  sortDirection?: SortDirection;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}

export function TableHeaderCell({
  className,
  children,
  sortDirection,
  onSort,
  align = 'left',
  ...props
}: TableHeaderCellProps) {
  const sortable = !!onSort;
  const ariaSort = sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : sortable ? 'none' : undefined;
  const Icon = sortDirection === 'asc' ? ArrowUp : sortDirection === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'h-10 whitespace-nowrap px-4 text-xs font-medium text-fg-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] transition-colors duration-fast hover:text-fg',
            sortDirection ? 'text-fg' : undefined,
            align === 'right' && 'flex-row-reverse'
          )}
        >
          {children}
          <Icon className={cn('h-3.5 w-3.5', !sortDirection && 'opacity-50')} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
  /** Mono + tabular numbers (amounts, IDs, IPs, counts). */
  mono?: boolean;
  /** Secondary text color. */
  muted?: boolean;
}

export function TableCell({ className, align = 'left', mono, muted, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-fg',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        mono && 'font-mono text-[13px]',
        muted && 'text-fg-muted',
        className
      )}
      {...props}
    />
  );
}

/** Single full-width row for "no results". */
export function TableEmptyRow({
  colSpan,
  title = 'ไม่พบรายการ',
  description,
  action,
}: {
  colSpan: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </td>
    </tr>
  );
}

/** Placeholder rows while data loads (static, no shimmer). */
export function TableLoadingRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-4 py-3.5">
              <Skeleton className={cn('h-3.5', c === 0 ? 'w-2/3' : 'w-1/2')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default Table;
