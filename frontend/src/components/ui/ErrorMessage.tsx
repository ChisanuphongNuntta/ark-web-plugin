import * as React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface ErrorMessageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  message: React.ReactNode;
  /** Short machine code shown in mono (e.g. HTTP status or backend code). */
  errorCode?: string;
  onRetry?: () => void;
  retryText?: string;
  /** `inline` = single compact line for forms and table cells. */
  variant?: 'block' | 'inline';
}

/** Error block: what failed, what to do next, optional retry. */
export function ErrorMessage({
  className,
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message,
  errorCode,
  onRetry,
  retryText = 'ลองอีกครั้ง',
  variant = 'block',
  ...props
}: ErrorMessageProps) {
  if (variant === 'inline') {
    return (
      <div role="alert" className={cn('flex items-start gap-2 text-sm text-danger', className)} {...props}>
        <AlertCircle className="mt-[3px] h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start justify-between gap-4 rounded-card border border-danger/30 bg-danger/[0.06] p-4 sm:flex-row sm:items-center sm:p-5',
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{title}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{message}</p>
          {errorCode ? <p className="mt-1.5 font-mono text-xs text-fg-subtle">รหัส {errorCode}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />}>
          {retryText}
        </Button>
      ) : null}
    </div>
  );
}

export default ErrorMessage;
