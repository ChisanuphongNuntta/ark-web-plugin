import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Action node (Button / Link styled with buttonVariants). */
  action?: React.ReactNode;
  /** @deprecated use `action`. */
  actionText?: string;
  /** @deprecated use `action`. */
  onAction?: () => void;
  /** Drop the frame when placed inside a Card/Panel. */
  bare?: boolean;
}

/** Calm "nothing here yet" block: icon, title, one line of guidance, optional action. */
export function EmptyState({
  className,
  title,
  description,
  icon,
  action,
  actionText,
  onAction,
  bare = false,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        !bare && 'rounded-card border border-dashed border-line-strong',
        className
      )}
      {...props}
    >
      <div className="mb-4 text-fg-subtle [&>svg]:h-6 [&>svg]:w-6" aria-hidden="true">
        {icon ?? <Inbox strokeWidth={1.5} />}
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action ? (
        <div className="mt-5">{action}</div>
      ) : actionText && onAction ? (
        <Button variant="secondary" className="mt-5" onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </div>
  );
}

export default EmptyState;
