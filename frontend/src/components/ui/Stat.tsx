import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Unit after the value (IC, ฿, คน). */
  unit?: React.ReactNode;
  /** Change vs a previous period. `tone` defaults from `direction`. */
  delta?: { value: React.ReactNode; direction?: 'up' | 'down' | 'flat'; tone?: 'success' | 'danger' | 'neutral' };
  /** One short line of context under the value. */
  hint?: React.ReactNode;
  /** Optional link/area to make the whole tile actionable. */
  href?: string;
  /** Emphasize when the number needs attention (e.g. failed deliveries > 0). */
  attention?: boolean;
  className?: string;
  /** Render the value as loading. */
  loading?: boolean;
}

/** KPI tile: label, mono value, delta. Flat, hairline, no glow. */
export function Stat({ label, value, unit, delta, hint, href, attention = false, className, loading = false }: StatProps) {
  const direction = delta?.direction ?? 'flat';
  const tone = delta?.tone ?? (direction === 'up' ? 'success' : direction === 'down' ? 'danger' : 'neutral');
  const body = (
    <>
      <p className="text-xs text-fg-muted">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        {loading ? (
          <span className="inline-block h-7 w-20 rounded-[4px] bg-surface-2" aria-hidden="true" />
        ) : (
          <span className={cn('font-mono text-2xl font-medium tabular-nums', attention ? 'text-warning' : 'text-fg')}>{value}</span>
        )}
        {unit && !loading ? <span className="text-xs text-fg-subtle">{unit}</span> : null}
      </div>
      {delta || hint ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-mono',
                tone === 'success' && 'text-success',
                tone === 'danger' && 'text-danger',
                tone === 'neutral' && 'text-fg-muted'
              )}
            >
              {direction === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" /> : null}
              {direction === 'down' ? <ArrowDownRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" /> : null}
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-fg-subtle">{hint}</span> : null}
        </div>
      ) : null}
    </>
  );
  const frame = cn(
    'block min-w-0 rounded-card border bg-surface p-5',
    attention ? 'border-warning/40' : 'border-line',
    className
  );
  if (href) {
    return (
      <Link href={href} className={cn(frame, 'transition-colors duration-fast hover:border-line-strong')}>
        {body}
      </Link>
    );
  }
  return <div className={frame}>{body}</div>;
}

export default Stat;
