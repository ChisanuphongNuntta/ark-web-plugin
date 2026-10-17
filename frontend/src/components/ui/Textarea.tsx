import * as React from 'react';
import { cn } from '@/lib/utils';
import { Field, controlClasses, fieldDescribedBy } from './Field';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hideLabel?: boolean;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  wrapperClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, wrapperClassName, label, hideLabel, helperText, error, id, required, rows = 4, ...props },
  ref
) {
  const autoId = React.useId();
  const textareaId = id ?? autoId;

  return (
    <Field
      id={textareaId}
      label={label}
      hideLabel={hideLabel}
      helperText={helperText}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(textareaId, { error, helperText })}
        className={controlClasses({ invalid: !!error, className: cn('min-h-[80px] px-3 py-2 leading-relaxed', className) })}
        {...props}
      />
    </Field>
  );
});

export default Textarea;
