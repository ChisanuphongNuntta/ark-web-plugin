'use client';

import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSeason } from './SeasonProvider';
import { SeasonGlyph } from './SeasonOrnament';

const DISMISS_KEY = 'iris.ribbon.dismissed.v1';

/** Stable short key for "this exact notice" so a new announcement shows again. */
function noticeKey(season: string, text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${season}:${(h >>> 0).toString(36)}`;
}

/**
 * Thin static notice above the header. Shows the admin announcement when set,
 * otherwise the season's ribbon line (none for the default season).
 * Dismissal is remembered per season + text (localStorage, best effort).
 */
export function SeasonRibbon({ className }: { className?: string }) {
  const { season, copy, announcement } = useSeason();
  const [dismissed, setDismissed, hydrated] = useLocalStorage<string>(DISMISS_KEY, '');

  const text = announcement?.text ?? copy.ribbon;
  if (!hydrated || !text) return null;
  const key = noticeKey(season, text);
  if (dismissed === key) return null;

  const href = announcement?.href;
  const external = !!href && /^https?:\/\//.test(href);

  return (
    <div className={cn('relative border-b border-line bg-surface', className)} role="region" aria-label="ประกาศ">
      {/* Static seasonal hairline. Christmas splits crimson / pine. */}
      <div className="absolute inset-x-0 top-0 flex h-[2px]" aria-hidden="true">
        <span className="h-full flex-1 bg-seasonal" />
        {season === 'christmas' ? <span className="h-full flex-1 bg-seasonal-2" /> : null}
      </div>
      <div className="page-shell flex min-h-9 items-center gap-3 py-1.5">
        <SeasonGlyph season={season} className="text-accent" />
        <p className="line-clamp-2 min-w-0 flex-1 text-xs text-fg-muted sm:line-clamp-none sm:truncate sm:text-[13px]">{text}</p>
        {href ? (
          external ? (
            <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-fg underline-offset-4 hover:underline sm:text-[13px]">
              ดูรายละเอียด
              <ArrowRight className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : (
            <Link href={href} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-fg underline-offset-4 hover:underline sm:text-[13px]">
              ดูรายละเอียด
              <ArrowRight className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          )
        ) : null}
        <button
          type="button"
          onClick={() => setDismissed(key)}
          className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-control text-fg-subtle transition-colors duration-fast hover:bg-surface-2 hover:text-fg sm:-mr-1.5 sm:h-7 sm:w-7"
          aria-label="ซ่อนประกาศนี้"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export default SeasonRibbon;
