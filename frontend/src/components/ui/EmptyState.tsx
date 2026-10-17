import * as React from 'react';
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
        'flex flex-col items-center justify-center text-center p-8 rounded-[1.65rem] border border-white/5 bg-black/20 backdrop-blur-md',
        className
      )}
      {...props}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.02] border border-white/10 text-iris-muted mb-4 animate-float-gentle">
        {icon || <Package2 className="h-8 w-8" />}
      </div>
      
      <h3 className="font-display text-lg font-bold text-iris-pearl mb-1.5 uppercase tracking-wide">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-iris-muted max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionText && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
