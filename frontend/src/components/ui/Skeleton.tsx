import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `glow` is a deprecated alias of `default`. */
  variant?: 'default' | 'circle' | 'card' | 'glow';
}

/**
 * Static placeholder block (no shimmer, no pulse — by design).
 * Pair loading regions with aria-busy on the container.
 */
export function Skeleton({ className, variant = 'default', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-2',
        variant === 'circle' && 'rounded-full',
        variant === 'card' && 'h-48 w-full rounded-card border border-line',
        (variant === 'default' || variant === 'glow') && 'h-4 w-full rounded-[4px]',
        className
      )}
      {...props}
    />
  );
}

export default Skeleton;
