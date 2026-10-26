import * as React from 'react';
import { T } from '@/components/i18n/LanguageProvider';
import { Package2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  className,
  title,
  description,
  actionText,
  onAction,
  icon,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-64 flex-col items-center justify-center text-center px-6 py-12 sm:px-10 rounded-[1.65rem] border border-white/10 bg-gradient-to-b from-iris-river/40 to-iris-midnight/40',
        className
      )}
      {...props}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-iris-cyan/5 border border-iris-cyan/20 text-iris-cyan/70 mb-5" aria-hidden="true">
        {icon || <Package2 className="h-8 w-8" />}
      </div>
      
      <h3 className="font-display text-xl font-semibold text-iris-pearl mb-2">
        <T text={title} />
      </h3>
      
      {description && (
        <p className="text-sm text-iris-muted max-w-sm mb-6 leading-relaxed">
          <T text={description} />
        </p>
      )}

      {actionText && onAction && (
        <Button variant="secondary" onClick={onAction}>
          <T text={actionText} />
        </Button>
      )}
    </div>
  );
}
