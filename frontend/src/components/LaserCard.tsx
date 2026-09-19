'use client';

import React, { ReactNode } from 'react';
import { Surface } from '@/components/ui/Surface';

interface LaserCardProps {
  children: ReactNode;
  className?: string;
  withBeam?: boolean;
  glowOnHover?: boolean;
  variant?: 'primary' | 'gold' | 'cyan' | 'default';
}

/**
 * @deprecated LaserCard is deprecated in favor of canonical Surface component.
 */
export default function LaserCard({
  children,
  className = '',
  glowOnHover = false,
  variant = 'default',
}: LaserCardProps) {
  const mappedVariant = variant === 'gold' ? 'gold' : 'glass';

  return (
    <Surface
      variant={mappedVariant}
      glowOnHover={glowOnHover}
      className={className}
    >
      {children}
    </Surface>
  );
}
