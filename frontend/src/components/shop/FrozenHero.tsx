import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Snowflake } from 'lucide-react';

export function FrozenHero() {
  return (
    <section className="frozen-hero" aria-labelledby="winter-title">
      <Image src="/images/backgrounds/winter_hero_frozen.jpg" alt="หุบเขาหิมะและเสาโอเบลิสก์น้ำแข็งใต้แสงเหนือ" fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="frozen-hero-art" />
      <div className="frozen-hero-shade" />
      <div className="frozen-hero-copy">
        <span className="frozen-kicker"><Snowflake size={15} /> IRIS / WINTER EXPEDITION</span>
        <h1 id="winter-title">การผจญภัยครั้งใหม่<br /><span>เริ่มในแดนเหมันต์</span></h1>
        <p>เตรียมไดโนเสาร์คู่ใจและอุปกรณ์ให้พร้อม<br />แล้วออกสำรวจโลก ARK ในแบบของคุณ</p>
        <div className="flex flex-wrap gap-3 mt-7">
          <a href="#catalog" className="frozen-cta">สำรวจร้านค้า <ArrowDown size={16} /></a>
          <Link href="/event" className="frozen-hero-link">ดูกิจกรรม <ArrowUpRight size={16} /></Link>
        </div>
      </div>
      <div className="frozen-hero-caption"><span>THE FROZEN FRONTIER</span><span>ARK · IRIS THAILAND</span></div>
    </section>
  );
}
