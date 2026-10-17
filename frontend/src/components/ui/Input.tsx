import * as React from 'react';
import { cn } from '@/lib/utils';
import { Field, controlClasses, fieldDescribedBy } from './Field';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  hideLabel?: boolean;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Render the value in IBM Plex Mono (IDs, IPs, amounts). */
  mono?: boolean;
  /** Class for the outer field wrapper. */
  wrapperClassName?: string;
  /** @deprecated success styling is not part of the system; shows `successText` as helper. */
  success?: boolean;
  successText?: string;
}

const SIZES = { sm: 'h-8 px-2.5 text-xs', md: 'h-10 px-3', lg: 'h-12 px-3.5' };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    wrapperClassName,
    type = 'text',
    label,
    hideLabel,
    helperText,
    error,
    leftIcon,
    rightIcon,
    size = 'md',
    mono = false,
    success,
    successText,
    id,
    required,
    ...props
  },
  ref
) {
  // Hooks are always called unconditionally (fixes the old conditional-id bug).
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const helper = helperText ?? (success ? successText : undefined);

  return (
    <Field
      id={inputId}
      label={label}
      hideLabel={hideLabel}
      helperText={helper}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        {leftIcon ? (
          <span className="pointer-events-none absolute left-3 inline-flex text-fg-subtle" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(inputId, { error, helperText: helper })}
          className={controlClasses({
            invalid: !!error,
            className: cn(SIZES[size], leftIcon && 'pl-9', rightIcon && 'pr-9', mono && 'font-mono', className),
          })}
          {...props}
        />
        {rightIcon ? (
          <span className="absolute right-3 inline-flex text-fg-subtle">{rightIcon}</span>
        ) : null}
      </div>
    </Field>
  );
});

export default Input;
