import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/** Native checkbox (keyboard + forms for free) tinted with the accent. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, id, disabled, ...props },
  ref
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;

  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-50', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        disabled={disabled}
        aria-describedby={descId}
        className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded-[3px] border-line-strong bg-canvas accent-[rgb(var(--accent))] disabled:cursor-not-allowed"
        {...props}
      />
      {label || description ? (
        <div className="min-w-0">
          {label ? (
            <label htmlFor={inputId} className="cursor-pointer text-sm text-fg">
              {label}
            </label>
          ) : null}
          {description ? (
            <p id={descId} className="text-xs text-fg-subtle">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default Checkbox;
