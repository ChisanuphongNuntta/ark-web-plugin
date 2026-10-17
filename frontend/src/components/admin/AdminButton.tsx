'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type AdminButtonSize = 'sm' | 'md';

export interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  /** Disables the button and shows a small spinner in place of the icon. */
  loading?: boolean;
  /** Leading icon (lucide, rendered 16px). */
  icon?: React.ReactNode;
}

/**
 * Same shapes as the site's .btn-primary / .btn-secondary (pill, pearl or
 * hairline). `danger` keeps the pill shape in a muted rose. No glow.
 */
const variantClass: Record<AdminButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/10 px-5 py-2.5 text-sm font-bold text-rose-100 transition hover:border-rose-300/55 hover:bg-rose-400/20 disabled:pointer-events-none disabled:opacity-50',
  ghost:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-iris-muted transition hover:bg-white/[0.05] hover:text-iris-pearl disabled:pointer-events-none disabled:opacity-50',
};

// Utilities are emitted after @layer components, so these override the
// .btn-* min-height / padding / font-size for the compact size.
const sizeClass: Record<AdminButtonSize, string> = {
  sm: 'min-h-9 gap-1.5 px-3.5 py-1.5 text-xs',
  md: '',
};

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  { variant = 'secondary', size = 'md', loading = false, icon, disabled, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(variantClass[variant], sizeClass[size], 'whitespace-nowrap', className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : icon ? (
        <span className="inline-flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});

export interface AdminIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need a Thai accessible name, e.g. 'แก้ไขเซิร์ฟเวอร์ Island'. */
  'aria-label': string;
  tone?: 'default' | 'danger';
}

/** Square icon button for table row actions (40px target). */
export const AdminIconButton = React.forwardRef<HTMLButtonElement, AdminIconButtonProps>(function AdminIconButton(
  { tone = 'default', className, children, type = 'button', title, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={title ?? props['aria-label']}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-iris-muted transition',
        'disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4',
        tone === 'danger'
          ? 'hover:border-rose-300/30 hover:bg-rose-400/10 hover:text-rose-100'
          : 'hover:border-white/10 hover:bg-white/[0.05] hover:text-iris-pearl',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
