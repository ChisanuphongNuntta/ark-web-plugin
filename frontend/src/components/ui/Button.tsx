import * as React from 'react';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'cyan' | 'orchid' | 'gold' | 'ghost' | 'outline' | 'danger' | 'magenta' | 'pink';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  successText?: string;
  errorText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loading = false,
      isSuccess = false,
      isError = false,
      successText,
      errorText,
      leftIcon,
      rightIcon,
      icon,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isActuallyLoading = isLoading || loading;
    // Base styles implementing visual alignment, scale-up animations and typography rules
    const baseStyles = 'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-200 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-iris-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

    const variants = {
      primary: 'bg-iris-pearl text-iris-ink hover:bg-white hover:shadow-[0_0_20px_rgba(245,241,232,0.4)]',
      secondary: 'border border-white/10 bg-white/[0.035] text-iris-pearl hover:border-iris-cyan/40 hover:bg-iris-cyan/10 hover:shadow-[0_0_15px_rgba(55,229,210,0.15)]',
      outline: 'border border-white/10 bg-transparent text-iris-pearl hover:border-iris-cyan/40 hover:bg-white/5',
      danger: 'border border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500/50',
      cyan: 'bg-iris-cyan text-iris-ink hover:bg-iris-cyan/90 hover:shadow-[0_0_25px_rgba(55,229,210,0.5)]',
      orchid: 'bg-iris-orchid text-iris-ink hover:bg-iris-orchid/90 hover:shadow-[0_0_25px_rgba(167,123,255,0.5)]',
      gold: 'bg-iris-gold text-iris-ink hover:bg-iris-gold/90 hover:shadow-[0_0_25px_rgba(221,187,114,0.4)]',
      ghost: 'bg-transparent text-iris-pearl hover:bg-white/5',
      magenta: 'bg-iris-cyan text-iris-ink hover:bg-iris-pearl border border-iris-cyan/30',
      pink: 'bg-iris-cyan text-iris-ink hover:bg-iris-pearl border border-iris-cyan/30',
    };

    const sizes = {
      sm: 'px-4 py-2 text-xs min-h-[44px]',
      md: 'px-6 py-2.5 text-sm min-h-[44px]',
      lg: 'px-8 py-3.5 text-base min-h-[52px]',
    };

    const statusStyles = {
      success: 'bg-emerald-500 text-white hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] border-none',
      error: 'bg-rose-500 text-white hover:bg-rose-500 hover:shadow-[0_0_20px_rgba(244,63,94,0.4)] border-none',
    };

    const isPending = isActuallyLoading || isSuccess || isError;
    const isActuallyDisabled = disabled || isPending;
    const effectiveLeftIcon = leftIcon || icon;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          isSuccess && statusStyles.success,
          isError && statusStyles.error,
          className
        )}
        disabled={isActuallyDisabled}
        aria-busy={isActuallyLoading ? 'true' : undefined}
        {...props}
      >
        {isActuallyLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-current" aria-hidden="true" />
        )}

        {!isLoading && isSuccess && (
          <CheckCircle className="mr-2 h-4 w-4 text-current animate-bounce" aria-hidden="true" />
        )}

        {!isLoading && isError && (
          <AlertTriangle className="mr-2 h-4 w-4 text-current animate-pulse" aria-hidden="true" />
        )}

        {!isLoading && !isSuccess && !isError && effectiveLeftIcon && (
          <span className="mr-2 inline-flex items-center" aria-hidden="true">{effectiveLeftIcon}</span>
        )}

        <span>
          {isSuccess && successText ? successText : isError && errorText ? errorText : children}
        </span>

        {!isLoading && !isSuccess && !isError && rightIcon && (
          <span className="ml-2 inline-flex items-center" aria-hidden="true">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
