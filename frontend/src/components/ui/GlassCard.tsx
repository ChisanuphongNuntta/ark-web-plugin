import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'prism' | 'gold' | 'flat';
  hoverEffect?: 'none' | 'glow' | 'lift';
  hasGrid?: boolean;
  hasLattice?: boolean;
}

export function GlassCard({
  className,
  children,
  variant = 'default',
  hoverEffect = 'none',
  hasGrid = false,
  hasLattice = false,
  ...props
}: GlassCardProps) {
  const baseCardStyles = 'relative overflow-hidden rounded-[1.65rem] backdrop-blur-xl transition-all duration-300';
  
  const variants = {
    default: 'bg-gradient-to-br from-iris-river/80 to-iris-ink/90 border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.3)]',
    prism: 'bg-gradient-to-br from-iris-river/90 to-iris-ink/90 shadow-[0_24px_80px_rgba(0,0,0,0.35)] prism-border',
    gold: 'bg-gradient-to-br from-iris-river/80 to-iris-ink/90 border border-iris-gold/25 shadow-[0_24px_80px_rgba(221,187,114,0.05)]',
    flat: 'bg-black/40 border border-white/5',
  };

  const hovers = {
    none: '',
    glow: 'hover:shadow-[0_0_40px_rgba(55,229,210,0.15)] hover:border-iris-cyan/35',
    lift: 'hover:-translate-y-1.5 hover:shadow-[0_30px_90px_rgba(0,0,0,0.4)] hover:border-white/15',
  };

  return (
    <div
      className={cn(
        baseCardStyles,
        variants[variant],
        hovers[hoverEffect],
        className
      )}
      {...props}
    >
      {/* Visual background overlays */}
      {hasGrid && (
        <div className="iris-grid absolute inset-0 pointer-events-none opacity-40" />
      )}
      
      {hasLattice && (
        <div className="thai-lattice absolute inset-0 pointer-events-none opacity-10" />
      )}

      {/* Glossy top reflection highlight */}
      {variant !== 'flat' && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.04] to-transparent via-transparent opacity-100" />
      )}

      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
