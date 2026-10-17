import * as React from 'react';
import { cn } from '@/lib/utils';

/** Shared control surface for Input / Select / Textarea. */
export const controlClasses = (opts: { invalid?: boolean; className?: string } = {}) =>
  cn(
    'w-full rounded-control border bg-canvas text-sm text-fg placeholder:text-fg-subtle',
    'transition-colors duration-fast outline-none',
    'hover:border-line-strong focus:border-accent focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-50',
    opts.invalid ? 'border-danger/70 focus:border-danger' : 'border-line-strong',
    opts.className
  );

export interface FieldProps {
  id: string;
  label?: React.ReactNode;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function fieldDescribedBy(id: string, opts: { error?: unknown; helperText?: unknown }) {
  if (opts.error) return `${id}-error`;
  if (opts.helperText) return `${id}-helper`;
  return undefined;
}

/** Label + control + helper/error text, wired for aria-describedby. */
export function Field({ id, label, hideLabel, helperText, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className={cn('text-xs font-medium text-fg-muted', hideLabel && 'sr-only')}>
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="text-xs text-fg-subtle">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
