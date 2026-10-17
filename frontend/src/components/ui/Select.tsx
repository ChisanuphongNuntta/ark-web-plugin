import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, controlClasses, fieldDescribedBy } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: React.ReactNode;
  hideLabel?: boolean;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  /** Shorthand for <option> children. */
  options?: SelectOption[];
  /** Adds a first, empty option. */
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  wrapperClassName?: string;
  /** @deprecated */
  success?: boolean;
  /** @deprecated */
  successText?: string;
}

const SIZES = { sm: 'h-8 pl-2.5 pr-8 text-xs', md: 'h-10 pl-3 pr-9', lg: 'h-12 pl-3.5 pr-10' };

/** Native select styled to the system (keyboard + mobile pickers for free). */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    wrapperClassName,
    children,
    label,
    hideLabel,
    helperText,
    error,
    options,
    placeholder,
    size = 'md',
    success,
    successText,
    id,
    required,
    ...props
  },
  ref
) {
  const autoId = React.useId();
  const selectId = id ?? autoId;
  const helper = helperText ?? (success ? successText : undefined);

  return (
    <Field
      id={selectId}
      label={label}
      hideLabel={hideLabel}
      helperText={helper}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(selectId, { error, helperText: helper })}
          className={controlClasses({ invalid: !!error, className: cn('appearance-none', SIZES[size], className) })}
          {...props}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 h-4 w-4 text-fg-subtle"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    </Field>
  );
});

export default Select;
