import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'cyan' | 'orchid' | 'gold' | 'hot' | 'success' | 'error' | 'warning' | 'info' | 'muted';
  outline?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  outline = false,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase transition-colors';

  const variants = {
    default: outline
      ? 'border border-white/20 text-iris-pearl bg-transparent'
      : 'bg-white/10 text-iris-pearl border border-transparent',
    muted: outline
      ? 'border border-white/10 text-iris-muted bg-transparent'
      : 'bg-white/5 text-iris-muted border border-white/10',
    cyan: outline
      ? 'border border-iris-cyan/30 text-iris-cyan bg-transparent hover:bg-iris-cyan/5'
      : 'bg-iris-cyan/15 text-iris-cyan border border-iris-cyan/20 hover:bg-iris-cyan/20',
    orchid: outline
      ? 'border border-iris-orchid/30 text-iris-orchid bg-transparent hover:bg-iris-orchid/5'
      : 'bg-iris-orchid/15 text-iris-orchid border border-iris-orchid/20 hover:bg-iris-orchid/20',
    gold: outline
      ? 'border border-iris-gold/30 text-iris-gold bg-transparent hover:bg-iris-gold/5'
      : 'bg-iris-gold/15 text-iris-gold border border-iris-gold/20 hover:bg-iris-gold/20',
    hot: outline
      ? 'border border-rose-500/40 text-rose-400 bg-transparent'
      : 'bg-gradient-to-r from-rose-500 to-amber-500 text-white border border-transparent shadow-[0_2px_10px_rgba(244,63,94,0.3)]',
    success: outline
      ? 'border border-emerald-500/30 text-emerald-400 bg-transparent'
      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    error: outline
      ? 'border border-rose-500/30 text-rose-400 bg-transparent'
      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    warning: outline
      ? 'border border-amber-500/30 text-amber-400 bg-transparent'
      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    info: outline
      ? 'border border-blue-500/30 text-blue-400 bg-transparent'
      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  };

  return (
    <span
      className={cn(baseStyles, variants[variant], className)}
      {...props}
    />
  );
}

export default Badge;
