'use client';

import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export interface LaserButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  glow?: boolean;
}

/**
 * @deprecated LaserButton is deprecated in favor of canonical Button component.
 */
export default function LaserButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}: LaserButtonProps) {
  const mappedVariant =
    variant === 'danger'
      ? 'secondary'
      : variant === 'gold'
      ? 'gold'
      : variant === 'secondary'
      ? 'secondary'
      : 'cyan';

  return (
    <Button
      variant={mappedVariant}
      size={size}
      isLoading={loading}
      leftIcon={icon}
      disabled={disabled}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}
