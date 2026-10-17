'use client';

import { cn } from '@/lib/utils';
import { useSeason } from './SeasonProvider';
import type { Season } from './seasons';

/**
 * Small, static, single-colour season glyph (stroke 1.25, currentColor).
 * default: diamond · winter: six-spoke flake · christmas: star · easter: egg.
 */
export function SeasonGlyph({ season, size = 12, className }: { season: Season; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 12 12',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: cn('shrink-0', className),
  };
  switch (season) {
    case 'winter':
      return (
        <svg {...common}>
          <path d="M6 1v10M1.67 3.5l8.66 5M1.67 8.5l8.66-5" />
          <path d="M4.8 1.9 6 3.1l1.2-1.2M4.8 10.1 6 8.9l1.2 1.2" />
        </svg>
      );
    case 'christmas':
      return (
        <svg {...common}>
          <path d="M6 1.2 7.3 4.6 10.8 4.8 8.1 7.1 9 10.6 6 8.6 3 10.6 3.9 7.1 1.2 4.8 4.7 4.6Z" />
        </svg>
      );
    case 'easter':
      return (
        <svg {...common}>
          <path d="M6 1.2C8.1 1.2 9.6 4.4 9.6 6.9c0 2.2-1.6 3.9-3.6 3.9S2.4 9.1 2.4 6.9C2.4 4.4 3.9 1.2 6 1.2Z" />
          <path d="M3 6.6c1 .6 2 .6 3 0s2-.6 3 0" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" />
        </svg>
      );
  }
}

const GLYPH_TONE: Record<Season, string> = {
  default: 'text-accent',
  winter: 'text-seasonal-2',
  christmas: 'text-accent',
  easter: 'text-seasonal',
};

/**
 * Static ornament divider: hairline — glyph — hairline. Use between hero and
 * content or as a section break. Christmas adds two tiny crimson/pine marks.
 */
export function SeasonOrnament({ className, season: override }: { className?: string; season?: Season }) {
  const { season: current } = useSeason();
  const season = override ?? current;
  return (
    <div className={cn('flex items-center gap-3', className)} role="presentation">
      <span className="h-px flex-1 bg-line" />
      {season === 'christmas' ? <span className="h-1 w-1 rounded-full bg-seasonal" /> : null}
      <SeasonGlyph season={season} className={GLYPH_TONE[season]} />
      {season === 'christmas' ? <span className="h-1 w-1 rounded-full bg-seasonal-2" /> : null}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * Hero artwork slot. Renders the season image from SEASON_COPY when set,
 * otherwise a calm static plate (monogram + glyph) — never particles or motion.
 */
export function SeasonArtwork({ className }: { className?: string }) {
  const { season, copy } = useSeason();
  if (copy.artwork) {
    return (
      <div className={cn('relative overflow-hidden rounded-card border border-line bg-surface', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={copy.artwork.src} alt={copy.artwork.alt} className="h-full w-full object-cover" loading="eager" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card border border-line bg-surface',
        className
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-6 rounded-[6px] border border-line" />
      <div className="relative flex flex-col items-center gap-4">
        <SeasonGlyph season={season} size={28} className={GLYPH_TONE[season]} />
        <span className="text-[13px] font-medium tracking-[0.42em] text-fg-muted">IRIS</span>
        <span className="h-px w-16 bg-seasonal/70" />
        <span className="text-2xs tracking-[0.3em] text-fg-subtle">{copy.label === 'ปกติ' ? 'THAILAND' : copy.label}</span>
      </div>
    </div>
  );
}
