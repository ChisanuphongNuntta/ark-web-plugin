import { cn } from '@/lib/utils';

/**
 * Group digits of an integer or decimal string WITHOUT arithmetic, so large
 * ledger values (decimal strings) are never rounded. Non-numeric input is
 * returned unchanged.
 */
export function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '—') : value.trim();
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, int, frac = ''] = match;
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`;
}

export interface AmountProps {
  value: number | string | null | undefined;
  /** Unit after the number. Default "IC" (Iris Coin). Pass null for none. */
  unit?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Tone of the number. */
  tone?: 'default' | 'muted' | 'accent';
  className?: string;
}

const SIZE = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-3xl' };
const TONE = { default: 'text-fg', muted: 'text-fg-muted', accent: 'text-accent' };

/** Money / coin amount in IBM Plex Mono with tabular numerals. Display only — never compute totals client-side. */
export function Amount({ value, unit = 'IC', size = 'md', tone = 'default', className }: AmountProps) {
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className={cn('font-mono font-medium tabular-nums', SIZE[size], TONE[tone])}>{formatAmount(value)}</span>
      {unit ? <span className="text-xs font-medium text-fg-subtle">{unit}</span> : null}
    </span>
  );
}

export default Amount;
