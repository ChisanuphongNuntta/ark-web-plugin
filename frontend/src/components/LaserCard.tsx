'use client';

import { ReactNode } from 'react';

interface LaserCardProps {
  children: ReactNode;
  className?: string;
  withBeam?: boolean;
  glowOnHover?: boolean;
  variant?: 'primary' | 'gold' | 'cyan' | 'default';
}

export default function LaserCard({
  children,
  className = '',
  withBeam = false,
  glowOnHover = false,
  variant = 'default',
}: LaserCardProps) {
  const glowGradients = {
    primary: 'from-ark-primary/0 via-ark-primary/30 to-ark-accent/0',
    gold: 'from-ark-gold/0 via-ark-gold/30 to-yellow-500/0',
    cyan: 'from-ark-accent/0 via-ark-accent/30 to-blue-500/0',
    default: 'from-white/0 via-white/15 to-transparent',
  };

  const hoverBorders = {
    primary: 'group-hover:border-ark-primary/30',
    gold: 'group-hover:border-ark-gold/30',
    cyan: 'group-hover:border-ark-accent/30',
    default: 'group-hover:border-white/20',
  };

  const activeBeamColors = {
    primary: 'via-ark-primary/70',
    gold: 'via-ark-gold/70',
    cyan: 'via-ark-accent/70',
    default: 'via-white/30',
  };

  const ambientGradients = {
    primary: 'from-ark-primary/10',
    gold: 'from-ark-gold/10',
    cyan: 'from-ark-accent/10',
    default: 'from-white/5',
  };

  const innerShadows = {
    primary: 'group-hover:shadow-[inset_0_0_20px_rgba(0,229,168,0.06)]',
    gold: 'group-hover:shadow-[inset_0_0_20px_rgba(246,196,83,0.06)]',
    cyan: 'group-hover:shadow-[inset_0_0_20px_rgba(0,243,255,0.06)]',
    default: 'group-hover:shadow-[inset_0_0_15px_rgba(255,255,255,0.02)]',
  };

  const selectedGlow = glowGradients[variant];
  const selectedHoverBorder = hoverBorders[variant];
  const selectedBeam = activeBeamColors[variant];
  const selectedAmbient = ambientGradients[variant];
  const selectedInnerShadow = innerShadows[variant];

  return (
    <div className={`relative ${glowOnHover ? 'group' : ''}`}>
      {/* Subtle outer ambient glow on hover */}
      {glowOnHover && (
        <div className={`absolute -inset-[1px] bg-gradient-to-r ${selectedGlow} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
      )}

      {/* Main card panel */}
      <div 
        className={`relative bg-[#07111F]/70 backdrop-blur-3xl rounded-2xl border border-white/5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] hover:shadow-[0_30px_70px_-10px_rgba(0,0,0,0.95)] transition-all duration-500 ${className.includes('overflow') ? '' : 'overflow-hidden'} ${glowOnHover ? `${selectedHoverBorder} ${selectedInnerShadow}` : ''} ${className}`}
      >
        {/* Soft internal ambient glowing light */}
        <div 
          className={`absolute -top-12 -right-12 w-40 h-40 bg-gradient-to-br ${selectedAmbient} to-transparent blur-3xl rounded-full opacity-40 group-hover:opacity-75 transition-opacity duration-500 pointer-events-none`}
        ></div>

        {/* Top beam */}
        {withBeam && (
          <div className={`relative h-[2px] bg-gradient-to-r from-transparent ${selectedBeam} to-transparent`}>
            <div className={`absolute inset-0 bg-gradient-to-r from-transparent ${selectedBeam} to-transparent blur-sm`}></div>
          </div>
        )}

        {/* Content wrapper */}
        <div className="relative z-10">
          {children}
        </div>

        {/* Bottom beam */}
        {withBeam && (
          <div className={`relative h-[1px] bg-gradient-to-r from-transparent ${selectedBeam} to-transparent opacity-60`}>
            <div className={`absolute inset-0 bg-gradient-to-r from-transparent ${selectedBeam} to-transparent blur-sm`}></div>
          </div>
        )}
      </div>
    </div>
  );
}
