import * as React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: boolean;
  successText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      label,
      helperText,
      error,
      success,
      successText,
      leftIcon,
      rightIcon,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-4 text-iris-muted pointer-events-none">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            type={type}
            id={inputId}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : helperText || successText ? helperId : undefined
            }
            className={cn(
              'w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-iris-pearl placeholder:text-white/20 transition-all duration-200 outline-none',
              'border-white/10 hover:border-white/20',
              'focus:border-iris-cyan focus:ring-2 focus:ring-iris-cyan/15',
              disabled && 'opacity-40 cursor-not-allowed bg-black/20',
              leftIcon && 'pl-11',
              rightIcon && 'pr-11',
              error && 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/10',
              success && 'border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/10',
              className
            )}
            {...props}
          />

          {rightIcon && !error && !success && (
            <div className="absolute right-4 text-iris-muted pointer-events-none">
              {rightIcon}
            </div>
          )}

          {error && (
            <div className="absolute right-4 text-rose-400 pointer-events-none">
              <AlertCircle className="h-4 w-4" />
            </div>
          )}

          {success && !error && (
            <div className="absolute right-4 text-emerald-400 pointer-events-none">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          )}
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

Input.displayName = 'Input';

export { Input };
