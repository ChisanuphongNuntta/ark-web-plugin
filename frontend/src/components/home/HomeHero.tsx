'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button, Input, buttonVariants } from '@/components/ui';
import { SeasonGlyph, SeasonOrnament, useSeason } from '@/components/season';
import { HOME_SEASON_ART } from './seasonArt';

/**
 * Seasonal editorial hero: copy on the left, a framed artwork plate on the
 * right, a static ornament line underneath. Copy and art follow the active
 * season (SeasonProvider); colours re-theme through tokens automatically.
 */
export function HomeHero() {
  const router = useRouter();
  const { season, copy } = useSeason();
  const [query, setQuery] = React.useState('');

  const art = copy.artwork
    ? { ...copy.artwork, caption: copy.label }
    : HOME_SEASON_ART[season];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  };

  return (
    <section aria-labelledby="home-hero-title" className="page-shell pt-10 sm:pt-14 lg:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-16">
        <div className="max-w-xl">
          <p className="eyebrow flex items-center gap-2">
            <SeasonGlyph season={season} className="text-seasonal" />
            <span>{copy.hero.eyebrow}</span>
          </p>
          <h1
            id="home-hero-title"
            className="mt-4 text-3xl font-semibold leading-[1.28] tracking-[-0.02em] text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.22]"
          >
            {copy.hero.title}
          </h1>
          <p className="mt-5 text-base text-fg-muted">{copy.hero.subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={copy.hero.primaryCta.href} className={buttonVariants({ size: 'lg' })}>
              {copy.hero.primaryCta.label}
            </Link>
            <Link href={copy.hero.secondaryCta.href} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              {copy.hero.secondaryCta.label}
            </Link>
          </div>

          <form role="search" onSubmit={submit} className="mt-10 flex max-w-md items-end gap-2">
            <Input
              label="ค้นหาสินค้า"
              hideLabel
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาสินค้า เช่น Rex, Saddle"
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
              wrapperClassName="flex-1"
            />
            <Button type="submit" variant="secondary">
              ค้นหา
            </Button>
          </form>
        </div>

        <figure className="min-w-0">
          <div className="relative aspect-[16/11] overflow-hidden rounded-card border border-line bg-surface">
            <Image
              key={art.src}
              src={art.src}
              alt={art.alt}
              fill
              priority
              sizes="(min-width: 1240px) 640px, (min-width: 1024px) 52vw, 100vw"
              className="object-cover brightness-[.88] saturate-[.72]"
            />
          </div>
          <figcaption className="mt-3 flex items-center justify-between gap-4 text-xs text-fg-subtle">
            <span>{art.caption}</span>
            <span className="font-mono tracking-[0.12em]">IRIS · TH</span>
          </figcaption>
        </figure>
      </div>

      <SeasonOrnament className="mt-14 sm:mt-20" />
    </section>
  );
}

export default HomeHero;
