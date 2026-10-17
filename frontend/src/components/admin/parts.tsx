import * as React from 'react';
import { Lock } from 'lucide-react';
import { EmptyState, formatAmount } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Filter row above an admin table. Wraps on mobile; aligns controls to their baseline. */
export function AdminToolbar({ children, actions, className }: { children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex min-w-0 flex-wrap items-end gap-3">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface DetailItem {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  /** Span both columns (long text, errors, JSON). */
  wide?: boolean;
}

/** Two-column description list for detail drawers. */
export function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2', className)}>
      {items.map((item, i) => (
        <div key={i} className={cn('min-w-0', item.wide && 'sm:col-span-2')}>
          <dt className="text-xs text-fg-muted">{item.label}</dt>
          <dd className={cn('mt-1 break-words text-sm text-fg', item.mono && 'font-mono text-[13px] tabular-nums')}>
            {item.value === null || item.value === undefined || item.value === '' ? <span className="text-fg-subtle">—</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Section inside a drawer: small heading + content, hairline above. */
export function DrawerSection({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line px-5 py-5 first:border-t-0', className)}>
      <h3 className="mb-4 text-xs font-medium text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Thai baht: "฿" before the number, mono, grouped without arithmetic. */
export function Baht({ value, className }: { value: number | string | null | undefined; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap font-mono font-medium tabular-nums text-fg', className)}>
      <span className="mr-0.5 text-fg-subtle">฿</span>
      {formatAmount(value)}
    </span>
  );
}

/** Monospace id with the full value in a tooltip. */
export function MonoId({ value, length = 8, className }: { value: string | number | null | undefined; length?: number; className?: string }) {
  if (value === null || value === undefined || value === '') return <span className="text-fg-subtle">—</span>;
  const s = String(value);
  return (
    <span className={cn('font-mono text-[13px] tabular-nums', className)} title={s}>
      {s.length > length ? s.slice(0, length) : s}
    </span>
  );
}

/** Shown inside the console when a role can open the shell but not this screen. */
export function AdminNoAccess({ description }: { description?: string }) {
  return (
    <EmptyState
      className="mt-8"
      icon={<Lock strokeWidth={1.5} />}
      title="บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้"
      description={description ?? 'หากต้องใช้งานหน้านี้ ให้ผู้ดูแลสูงสุดปรับบทบาทของบัญชีให้'}
    />
  );
}

/** Pre-formatted mono block (error text, JSON). */
export function CodeBlock({ children, tone = 'default', className }: { children: React.ReactNode; tone?: 'default' | 'danger'; className?: string }) {
  return (
    <pre
      className={cn(
        'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control border p-3 font-mono text-xs leading-relaxed',
        tone === 'danger' ? 'border-danger/25 bg-danger/[0.06] text-fg' : 'border-line bg-canvas text-fg-muted',
        className
      )}
    >
      {children}
    </pre>
  );
}
