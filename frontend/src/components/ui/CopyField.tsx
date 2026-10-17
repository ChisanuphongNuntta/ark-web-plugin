'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export interface CopyFieldProps {
  /** Text that is copied. */
  value: string;
  /** Optional label above the field. */
  label?: React.ReactNode;
  /** What is displayed (defaults to `value`). */
  display?: React.ReactNode;
  /** Render in mono (default true — IPs, IDs, commands). */
  mono?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Accessible name for the copy button. */
  copyLabel?: string;
}

/** Read-only value with a copy button that confirms with "คัดลอกแล้ว". */
export function CopyField({ value, label, display, mono = true, size = 'md', className, copyLabel = 'คัดลอก' }: CopyFieldProps) {
  const { copied, copy } = useCopyToClipboard();
  const labelId = React.useId();
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <p id={labelId} className="mb-1.5 text-xs font-medium text-fg-muted">
          {label}
        </p>
      ) : null}
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-control border border-line-strong bg-canvas pl-3',
          size === 'sm' ? 'h-8' : 'h-10'
        )}
      >
        <span
          aria-labelledby={label ? labelId : undefined}
          className={cn('min-w-0 flex-1 truncate text-sm text-fg', mono && 'font-mono text-[13px]')}
          title={value}
        >
          {display ?? value}
        </span>
        <button
          type="button"
          onClick={() => void copy(value)}
          className={cn(
            'inline-flex h-full shrink-0 items-center gap-1.5 border-l border-line px-3 text-xs font-medium transition-colors duration-fast',
            copied ? 'text-success' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
          )}
          aria-label={copied ? 'คัดลอกแล้ว' : copyLabel}
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
          <span aria-live="polite">{copied ? 'คัดลอกแล้ว' : copyLabel}</span>
        </button>
      </div>
    </div>
  );
}

export default CopyField;
