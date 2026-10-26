'use client';
import Link from 'next/link';
import { Gift, ShoppingBag, Snowflake } from 'lucide-react';
import { T } from '@/components/i18n/LanguageProvider';

/** Owner-supplied Christmas scene with accessible, translated live controls. */
export function TekShopHero() {
  return (
    <section className="tk-shop-hero" aria-labelledby="tk-shop-title">
      <picture className="tk-shop-scene" aria-hidden="true">
        <source media="(max-width: 640px)" srcSet="/images/seasonal/christmas-depot-v2-mobile.webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/seasonal/christmas-depot-v2.webp" alt="" width={2132} height={738} fetchPriority="high" />
      </picture>
      <div className="tk-shop-scene-shade" aria-hidden="true" />
      <div className="tk-wrap tk-shop-hero-in">
        <span className="tk-kicker"><Snowflake size={19} aria-hidden="true" /> SUPPLY DEPOT</span>
        <h1 id="tk-shop-title" className="tk-display"><T text="คลังสินค้า" en="Supply depot" /> <span>IRIS</span></h1>
        <p className="tk-muted">
          <T text="รวมไอเทมจำเป็นและไอเทมพิเศษในบรรยากาศคริสต์มาส พร้อมออกเดินทางสู่การผจญภัยครั้งใหม่ไปด้วยกัน" en="Essential gear and special supplies in a Christmas wonderland. Prepare for your next adventure together." />
        </p>
        <div className="tk-cta">
          <a href="#catalog" className="tk-btn"><ShoppingBag className="tk-i" aria-hidden="true" /><T text="เลือกซื้อสินค้า" en="Shop supplies" /></a>
          <Link href="/event" className="tk-btn ghost"><Gift className="tk-i" aria-hidden="true" /><T text="กิจกรรมและปฏิทิน" /></Link>
        </div>
      </div>
    </section>
  );
}
