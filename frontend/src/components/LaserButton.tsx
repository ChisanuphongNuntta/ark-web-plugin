'use client';

import { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface LaserButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  glow?: boolean;
}

export default function LaserButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  glow = true,
  className = '',
  disabled,
  ...props
}: LaserButtonProps) {
  const sizeStyles = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3',
    lg: 'text-lg px-8 py-4',
  };

  const baseStyles = `relative rounded-xl font-bold transition-all duration-300 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]}`;

  const variantStyles = {
    primary: 'bg-gradient-to-r from-ark-primary to-ark-accent hover:from-ark-primary hover:to-ark-accent/90 text-black shadow-[0_0_20px_rgba(0,229,168,0.2)] hover:shadow-[0_0_30px_rgba(0,229,168,0.4)]',
    secondary: 'bg-ark-panel/85 backdrop-blur-sm border border-white/10 hover:border-ark-primary/50 text-white hover:bg-ark-surface/40',
    gold: 'bg-gradient-to-r from-ark-gold to-yellow-400 hover:from-ark-gold hover:to-yellow-300 text-black shadow-[0_0_20px_rgba(246,196,83,0.15)] hover:shadow-[0_0_30px_rgba(246,196,83,0.3)]',
    danger: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white',
  };

  const glowStyles = {
    primary: 'shadow-lg shadow-ark-primary/20 hover:shadow-ark-primary/40',
    secondary: 'shadow-lg shadow-ark-primary/5 hover:shadow-ark-primary/15',
    gold: 'shadow-lg shadow-ark-gold/20 hover:shadow-ark-gold/40',
    danger: 'shadow-lg shadow-red-500/20 hover:shadow-red-500/40',
  };

  return (
    <div className="relative group inline-block">
      {/* Outer glow on hover */}
      {glow && variant === 'primary' && (
        <div className="absolute -inset-1 bg-gradient-to-r from-ark-primary/0 via-ark-primary/30 to-ark-accent/0 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      )}
      {glow && variant === 'gold' && (
        <div className="absolute -inset-1 bg-gradient-to-r from-ark-gold/0 via-ark-gold/30 to-yellow-400/0 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      )}
      {glow && variant === 'danger' && (
        <div className="absolute -inset-1 bg-gradient-to-r from-red-600/0 via-red-500/30 to-rose-500/0 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      )}

      <button
        className={`${baseStyles} ${variantStyles[variant]} ${glow ? glowStyles[variant] : ''} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    </div>
  );
}
