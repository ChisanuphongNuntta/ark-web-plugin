'use client';
import { T } from '@/components/i18n/LanguageProvider';


import Image from 'next/image';
import Link from 'next/link';
import { Snowflake } from 'lucide-react';
import { ArrowDown, ArrowUpRight } from '@/components/tek/arrows';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Season = 'default' | 'winter' | 'christmas' | 'easter';
const stories: Record<Season, { label: string; title: string; accent: string; prop: string | null }> = {
  default: { label: 'THE NEXT EXPEDITION', title: 'โลกกว้างกำลังรอ', accent: 'การผจญภัยของคุณ', prop: null },
  winter: { label: 'WINTER EXPEDITION', title: 'การผจญภัยครั้งใหม่', accent: 'เริ่มในแดนเหมันต์', prop: 'winter' },
  christmas: { label: 'CHRISTMAS EXPEDITION', title: 'แบ่งปันช่วงเวลาดี ๆ', accent: 'ในโลกของ IRIS', prop: 'winter' },
  easter: { label: 'EASTER EXPEDITION', title: 'ออกตามหาสิ่งพิเศษ', accent: 'ในการผจญภัยครั้งใหม่', prop: 'easter' },
};

export function FrozenHero() {
  const heroRef = useRef<HTMLElement>(null);
  const { data } = useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => (await api.get<{ activeSeason: Season }>('/site/settings')).data,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const season = data?.activeSeason && Object.hasOwn(stories, data.activeSeason) ? data.activeSeason : 'winter';
  const story = stories[season];

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      const rect = hero.getBoundingClientRect();
      const progress = reduced.matches ? 0 : Math.min(1, Math.max(0, -rect.top / (rect.height * .85)));
      hero.style.setProperty('--hero-art-opacity', String(1 - progress));
      frame = 0;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reduced.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reduced.removeEventListener('change', schedule);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={heroRef} className="frozen-hero" data-season={season} aria-labelledby="winter-title">
      <div className="frozen-hero-visual" aria-hidden="true">
        <Image src={season === 'easter' || season === 'default' ? '/images/servers/the-island.webp' : '/images/backgrounds/winter_hero_frozen.jpg'} alt="" fill priority sizes="100vw" className="frozen-hero-art" />
        <div className="frozen-hero-shade" />
        {story.prop && <Image src={`/images/seasonal/${story.prop}-props-v1.webp`} alt="" width={760} height={story.prop === 'winter' ? 1140 : 608} sizes="(max-width: 640px) 180px, 420px" className={`frozen-hero-props frozen-hero-props-${story.prop}`} />}
      </div>
      <div className="page-shell frozen-hero-copy">
        <span className="frozen-kicker"><Snowflake size={14} /> IRIS / {story.label}</span>
        <h1 id="winter-title"><T text={story.title} /><br /><span><T text={story.accent} /></span></h1>
        <p><T text={"เตรียมไดโนเสาร์คู่ใจและอุปกรณ์ให้พร้อม"} /><br /><T text={"แล้วออกสำรวจโลก ARK ในแบบของคุณ"} /></p>
        <div className="flex flex-wrap gap-3 mt-7">
          <a href="#catalog" className="frozen-cta"><T text={"สำรวจร้านค้า "} /><ArrowDown size={16} /></a>
          <Link href="/event" className="frozen-hero-link"><T text={"ดูกิจกรรมและปฏิทิน "} /><ArrowUpRight size={16} /></Link>
        </div>
      </div>
      <div className="page-shell frozen-hero-caption"><span>ARK · IRIS THAILAND</span><span className="inline-flex items-center gap-2">SCROLL TO EXPLORE <ArrowDown size={12} /></span></div>
    </section>
  );
}
