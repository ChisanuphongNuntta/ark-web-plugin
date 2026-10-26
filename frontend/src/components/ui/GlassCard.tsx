import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'prism' | 'gold' | 'flat' | 'danger' | 'cyan' | 'glow';
  hoverEffect?: 'none' | 'glow' | 'lift';
  glowOnHover?: boolean;
  withBeam?: boolean;
  hasGrid?: boolean;
  hasLattice?: boolean;
}

export function GlassCard({
  className,
  children,
  variant = 'default',
  hoverEffect = 'none',
  glowOnHover = false,
  withBeam = false,
  hasGrid = false,
  hasLattice = false,
  ...props
}: GlassCardProps) {
  const baseCardStyles = 'tek-panel relative overflow-hidden rounded-[1.65rem] backdrop-blur-xl transition-all duration-300';
  
  const variants = {
    default: 'bg-gradient-to-br from-surface-2 to-surface-1 border border-slate-700/70 shadow-[0_24px_80px_rgba(0,0,0,0.5)]',
    prism: 'bg-gradient-to-br from-surface-3 to-surface-1 shadow-[0_24px_80px_rgba(0,0,0,0.6)] prism-border',
    gold: 'bg-gradient-to-br from-surface-3 to-surface-1 border border-amber-500/35 shadow-[0_24px_80px_rgba(221,187,114,0.08)]',
    cyan: 'bg-gradient-to-br from-surface-3 to-surface-1 border border-cyan-500/35 shadow-[0_24px_80px_rgba(55,229,210,0.12)]',
    glow: 'bg-gradient-to-br from-surface-3 to-surface-1 border border-cyan-400/50 shadow-[0_0_50px_rgba(55,229,210,0.18)]',
    danger: 'bg-gradient-to-br from-surface-1 to-surface-0 border border-rose-500/40 shadow-[0_24px_80px_rgba(244,63,94,0.12)]',
    flat: 'bg-surface-1 border border-slate-800',
  };

  const hovers = {
    none: '',
    glow: 'hover:shadow-[0_0_40px_rgba(55,229,210,0.15)] hover:border-iris-cyan/35',
    lift: 'hover:-translate-y-1.5 hover:shadow-[0_30px_90px_rgba(0,0,0,0.4)] hover:border-white/15',
  };

  const effectiveHover = glowOnHover ? 'glow' : hoverEffect;

  return (
    <div
      className={cn(
        baseCardStyles,
        variants[variant],
        hovers[effectiveHover],
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

      {/* Optional beam effect */}
      {withBeam && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-iris-cyan to-transparent animate-pulse" />
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

export default GlassCard;
