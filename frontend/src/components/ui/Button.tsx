import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** @deprecated legacy variant names; mapped onto the four system variants. */
export type LegacyButtonVariant = 'cyan' | 'orchid' | 'gold' | 'outline' | 'magenta' | 'pink';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_MAP: Record<ButtonVariant | LegacyButtonVariant, ButtonVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  cyan: 'primary',
  orchid: 'primary',
  gold: 'primary',
  magenta: 'primary',
  pink: 'primary',
  outline: 'secondary',
};

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium ' +
  'transition-colors duration-fast ease-out disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-transparent text-fg hover:bg-surface-2',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-transparent text-danger hover:bg-danger/10',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-xs sm:h-8', // 40px touch target on mobile
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
};

/** Class string for a button look — use on <Link>/<a> that should look like a button. */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant | LegacyButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[VARIANT_MAP[variant] ?? 'primary'], SIZES[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | LegacyButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  /** @deprecated use `loading`. */
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** @deprecated use `leftIcon`. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** @deprecated status flashes are replaced by toasts; renders `successText` when true. */
  isSuccess?: boolean;
  /** @deprecated status flashes are replaced by toasts; renders `errorText` when true. */
  isError?: boolean;
  successText?: string;
  errorText?: string;
}

/**
 * Button — primary (solid accent), secondary (hairline outline), ghost (text),
 * danger (outlined danger). Icons: lucide 16px, stroke 1.5.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    icon,
    fullWidth = false,
    isSuccess = false,
    isError = false,
    successText,
    errorText,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  const busy = loading || isLoading;
  const lead = leftIcon ?? icon;
  const label = isSuccess && successText ? successText : isError && errorText ? errorText : children;

  return (
    <button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      ) : lead ? (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {lead}
        </span>
      ) : null}
      {label}
      {!busy && rightIcon ? (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
});

export default Button;
