'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/** On/off toggle (role="switch"). Space/Enter toggle via the native button. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, description, disabled, className, id, ...props },
  ref
) {
  const autoId = React.useId();
  const switchId = id ?? autoId;
  const labelId = label ? `${switchId}-label` : undefined;
  const descId = description ? `${switchId}-desc` : undefined;

  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50', className)}>
      {label || description ? (
        <div className="min-w-0">
          {label ? (
            <span id={labelId} className="block text-sm text-fg">
              {label}
            </span>
          ) : null}
          {description ? (
            <span id={descId} className="block text-xs text-fg-subtle">
              {description}
            </span>
          ) : null}
        </div>
      ) : null}
      <button
        ref={ref}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-fast',
          'disabled:cursor-not-allowed',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-2'
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full transition-transform duration-fast',
            checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-[2px] bg-fg-muted'
          )}
        />
      </button>
    </div>
  );
});

export default Switch;
