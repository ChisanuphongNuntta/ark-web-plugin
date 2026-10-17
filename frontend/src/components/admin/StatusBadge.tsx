import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const toneClass: Record<StatusTone, string> = {
  success: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100',
  warning: 'border-amber-200/25 bg-amber-200/[0.08] text-amber-100',
  danger: 'border-rose-300/30 bg-rose-400/10 text-rose-100',
  neutral: 'border-white/10 bg-white/[0.04] text-iris-muted',
  info: 'border-iris-cyan/30 bg-iris-cyan/[0.08] text-iris-pearl',
};

const dotClass: Record<StatusTone, string> = {
  success: 'bg-emerald-300',
  warning: 'bg-amber-200',
  danger: 'bg-rose-300',
  neutral: 'bg-iris-muted',
  info: 'bg-iris-cyan',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Small static dot before the label (no pulse). */
  dot?: boolean;
}

/** Small pill for row status. Colour is never the only signal: always pass a text label. */
export function StatusBadge({ tone = 'neutral', dot = false, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
