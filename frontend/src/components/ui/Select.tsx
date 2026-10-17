import * as React from 'react';
import { ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: boolean;
  successText?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      label,
      helperText,
      error,
      success,
      successText,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : helperText || successText ? helperId : undefined
            }
            className={cn(
              'w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-iris-pearl appearance-none transition-all duration-200 outline-none pr-10',
              'border-white/10 hover:border-white/20',
              'focus:border-iris-cyan focus:ring-2 focus:ring-iris-cyan/15',
              disabled && 'opacity-40 cursor-not-allowed bg-black/20',
              error && 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/10',
              success && 'border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/10',
              className
            )}
            {...props}
          >
            {children}
          </select>

          {/* Chevron right custom placement */}
          <div className="absolute right-4 text-iris-muted pointer-events-none flex items-center gap-1.5">
            {error && <AlertCircle className="h-4 w-4 text-rose-400" />}
            {success && !error && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        {error && (
          <p id={errorId} className="text-xs font-semibold text-rose-400" role="alert">
            {error}
          </p>
        )}

        {!error && success && successText && (
          <p id={helperId} className="text-xs font-semibold text-emerald-400">
            {successText}
          </p>
        )}

        {!error && !success && helperText && (
          <p id={helperId} className="text-xs text-iris-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
