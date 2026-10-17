'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AdminPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons on the right of the panel header. */
  actions?: React.ReactNode;
  /** No inner padding — use when the panel holds a toolbar + table + pagination. */
  flush?: boolean;
}

/** .glass-card surface (the site's card) with an optional hairline-separated header. */
export function AdminPanel({ title, description, actions, flush = false, className, children, ...props }: AdminPanelProps) {
  const headingId = React.useId();
  return (
    <section className={cn('glass-card', className)} aria-labelledby={title ? headingId : undefined} {...props}>
      {(title || actions) && (
        <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-base font-semibold text-iris-pearl">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-xs text-iris-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('relative', !flush && 'p-5')}>{children}</div>
    </section>
  );
}

export interface AdminNoticeProps {
  tone?: 'success' | 'danger' | 'warning' | 'info';
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const noticeTone: Record<NonNullable<AdminNoticeProps['tone']>, string> = {
  success: 'border-emerald-300/25 bg-emerald-300/[0.06]',
  danger: 'border-rose-300/30 bg-rose-400/[0.08]',
  warning: 'border-amber-200/25 bg-amber-200/[0.06]',
  info: 'border-iris-cyan/25 bg-iris-cyan/[0.06]',
};

/** Inline message banner (replaces ad-hoc green/red boxes). */
export function AdminNotice({ tone = 'info', title, children, onDismiss, className }: AdminNoticeProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm', noticeTone[tone], className)}
    >
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold text-iris-pearl">{title}</p>}
        {children && <div className="text-iris-muted">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-iris-muted hover:bg-white/[0.05] hover:text-iris-pearl"
        >
          ปิด
        </button>
      )}
    </div>
  );
}
