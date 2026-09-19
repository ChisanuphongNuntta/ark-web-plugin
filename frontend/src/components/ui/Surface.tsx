import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive' | 'gold' | 'danger';
  glowOnHover?: boolean;
}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  (
    {
      className,
      children,
      variant = 'default',
      glowOnHover = false,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'relative overflow-hidden rounded-2xl border transition-all duration-200';

    const variants = {
      default: 'bg-iris-river/60 border-white/10 text-iris-pearl',
      elevated: 'bg-iris-river/90 border-white/15 shadow-xl text-iris-pearl',
      glass: 'bg-gradient-to-b from-white/[0.07] to-white/[0.02] border-white/10 backdrop-blur-xl text-iris-pearl shadow-2xl',
      interactive: 'bg-iris-river/70 border-white/10 text-iris-pearl hover:border-iris-cyan/40 hover:bg-iris-river/90 cursor-pointer',
      gold: 'bg-iris-river/80 border-iris-gold/30 text-iris-pearl shadow-[0_0_20px_rgba(221,187,114,0.1)]',
      danger: 'bg-rose-950/20 border-rose-500/30 text-iris-pearl',
    };

    const glowStyles = glowOnHover
      ? 'hover:shadow-[0_0_25px_rgba(55,229,210,0.15)] hover:border-iris-cyan/30'
      : '';

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], glowStyles, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Surface.displayName = 'Surface';

export { Surface };
export default Surface;
