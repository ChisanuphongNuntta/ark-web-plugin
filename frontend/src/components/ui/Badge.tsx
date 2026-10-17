import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'seasonal';
/** @deprecated legacy names, mapped to tones. */
export type LegacyBadgeVariant = 'default' | 'muted' | 'cyan' | 'orchid' | 'gold' | 'hot' | 'error';

const TONE_MAP: Record<BadgeTone | LegacyBadgeVariant, BadgeTone> = {
  neutral: 'neutral',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  seasonal: 'seasonal',
  default: 'neutral',
  muted: 'neutral',
  cyan: 'accent',
  orchid: 'accent',
  gold: 'accent',
  hot: 'danger',
  error: 'danger',
};

const SOFT: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-2 text-fg-muted',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  seasonal: 'border-seasonal/40 bg-seasonal/15 text-fg',
};

const OUTLINE: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  accent: 'border-accent/40 text-accent',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
  danger: 'border-danger/40 text-danger',
  info: 'border-info/40 text-info',
  seasonal: 'border-seasonal/60 text-fg',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** @deprecated use `tone`. */
  variant?: BadgeTone | LegacyBadgeVariant;
  outline?: boolean;
  /** Render the content in mono (codes, counts). */
  mono?: boolean;
  icon?: React.ReactNode;
}

/** Small status/label chip. 6px radius, hairline border, no glow. */
export function Badge({ className, tone, variant, outline = false, mono = false, icon, children, ...props }: BadgeProps) {
  const t = TONE_MAP[tone ?? variant ?? 'neutral'] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-control border px-2 text-xs font-medium leading-none',
        outline ? cn('bg-transparent', OUTLINE[t]) : SOFT[t],
        mono && 'font-mono',
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export default Badge;
