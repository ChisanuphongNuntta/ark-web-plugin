import type { Season } from '@/components/season';

export interface HomeArtwork {
  src: string;
  alt: string;
  /** Short Thai caption under the frame. */
  caption: string;
}

/**
 * Home hero artwork per season, picked from images already in /public.
 * `SEASON_COPY[season].artwork` (foundation) takes precedence when it is set,
 * so seasonal art can be swapped centrally without touching the home page.
 * Images are shown framed and slightly desaturated (see HomeHero) so they sit
 * calmly next to the type instead of shouting over it.
 */
export const HOME_SEASON_ART: Record<Season, HomeArtwork> = {
  default: {
    src: '/images/event_banner.png',
    alt: 'Tyrannosaurus ยืนบนผาริมแม่น้ำในป่าดิบชื้นยามเย็น',
    caption: 'The Island · ยามเย็นริมแม่น้ำ',
  },
  winter: {
    src: '/images/backgrounds/winter_hero_frozen.jpg',
    alt: 'คณะสำรวจเดินผ่านหุบเขาหิมะ ท้องฟ้ามีแสงออโรรา',
    caption: 'ฤดูหนาว · หุบเขาหิมะ',
  },
  christmas: {
    src: '/images/packages/pkg-explorer.jpg',
    alt: 'หีบสมบัติเปิดอยู่ในถ้ำน้ำแข็ง ภายในมีคริสตัลและเหรียญ',
    caption: 'คริสต์มาส · ของขวัญในถ้ำน้ำแข็ง',
  },
  easter: {
    src: '/images/login_wallpaper.png',
    alt: 'ซากวิหารโบราณกลางป่าทึบยามค่ำ',
    caption: 'อีสเตอร์ · ป่าฤดูใบไม้ผลิ',
  },
};
