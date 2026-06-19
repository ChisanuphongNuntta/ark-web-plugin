import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circle' | 'card' | 'glow';
}

export function Skeleton({
  className,
  variant = 'default',
  ...props
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-gradient-to-r from-iris-river/80 via-white/[0.04] to-iris-river/80 bg-[length:200%_100%]';

  const variants = {
    default: 'rounded-md h-4 w-full',
    circle: 'rounded-full',
    card: 'rounded-[1.65rem] h-48 w-full border border-white/5',
    glow: 'rounded-md h-6 w-full shadow-[0_0_15px_rgba(55,229,210,0.15)] border border-iris-cyan/10',
  };

  return (
    <div
      className={cn(baseStyles, variants[variant], className)}
      style={{
        animationDuration: '2s',
      }}
      {...props}
    />
  );
}
