/**
 * Season model, date resolver and copy.
 *
 * The backend resolves `activeSeason` (GET /site/settings). This module mirrors
 * the SAME rule for the offline fallback and the pre-paint bootstrap script:
 *   christmas  Dec 1 – Jan 2
 *   winter     Oct 15 – Nov 30, Jan 3 – Feb 28/29
 *   easter     14 days before → 7 days after Western Easter Sunday
 *   default    otherwise
 * All dates are evaluated in Asia/Bangkok.
 */
import type { ActiveSeason, SeasonSetting } from '@/lib/contracts/types';

export type Season = ActiveSeason;
export type { SeasonSetting };

export const SEASONS: readonly Season[] = ['default', 'winter', 'christmas', 'easter'] as const;
export const SEASON_SETTINGS: readonly SeasonSetting[] = ['auto', 'default', 'winter', 'christmas', 'easter'] as const;

export function isSeason(value: unknown): value is Season {
  return typeof value === 'string' && (SEASONS as readonly string[]).includes(value);
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. Month is 1-based. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Calendar date (1-based month) in Asia/Bangkok (UTC+7, no DST). */
export function bangkokDate(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const DAY_MS = 86_400_000;

/** Resolve the automatic season for an instant, evaluated in Asia/Bangkok. */
export function resolveAutoSeason(date: Date): Season {
  const { year, month, day } = bangkokDate(date);
  if (month === 12 || (month === 1 && day <= 2)) return 'christmas';

  const today = Date.UTC(year, month - 1, day);
  const easter = easterSunday(year);
  const easterDay = Date.UTC(year, easter.month - 1, easter.day);
  if (today >= easterDay - 14 * DAY_MS && today <= easterDay + 7 * DAY_MS) return 'easter';

  if ((month === 10 && day >= 15) || month === 11) return 'winter';
  if (month === 1 || month === 2) return 'winter';
  return 'default';
}

/** Resolve a stored setting ('auto' or a fixed season) to the active season. */
export function resolveSeason(setting: SeasonSetting, date: Date): Season {
  return setting === 'auto' ? resolveAutoSeason(date) : setting;
}

/**
 * Canvas color per season, for <meta name="theme-color"> (mobile browser chrome).
 * Must match `--canvas` for each [data-season] block in app/globals.css.
 */
export const SEASON_CANVAS: Record<Season, string> = {
  default: '#0B0C0E',
  winter: '#0A0E12',
  christmas: '#0C0E0C',
  easter: '#0E0D10',
};

/** Point every <meta name="theme-color"> at the season's canvas (creates one if missing). */
export function applySeasonThemeColor(season: Season): void {
  const color = SEASON_CANVAS[season];
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => {
    meta.content = color;
  });
}

/** localStorage key for the last settings seen from the API (read by the bootstrap script). */
export const SEASON_CACHE_KEY = 'iris.season.v1';

/**
 * Inline pre-paint script for <head>. Sets `data-season` before first paint
 * from the cached API setting (fixed seasons) or the date rule ('auto' / no
 * cache), so returning visitors never see a palette flash. Also points
 * <meta name="theme-color"> at the season canvas. Self-contained ES5;
 * keep it in sync with `resolveAutoSeason` above.
 */
export const SEASON_BOOTSTRAP_SCRIPT = `(function(){try{
var d=document.documentElement,c=null;
try{c=JSON.parse(localStorage.getItem('${SEASON_CACHE_KEY}')||'null');}catch(e){}
var ok={'default':1,winter:1,christmas:1,easter:1},s='default';
if(c&&c.setting&&c.setting!=='auto'&&ok[c.active]){s=c.active;}else{
var t=new Date(Date.now()+252e5),y=t.getUTCFullYear(),m=t.getUTCMonth()+1,day=t.getUTCDate();
var a=y%19,b=Math.floor(y/100),cc=y%100,dd=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-dd-g+15)%30,i=Math.floor(cc/4),k=cc%4,l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451),em=Math.floor((h+l-7*mm+114)/31),ed=((h+l-7*mm+114)%31)+1;
var today=Date.UTC(y,m-1,day),ez=Date.UTC(y,em-1,ed),D=864e5;
if(m===12||(m===1&&day<=2))s='christmas';
else if(today>=ez-14*D&&today<=ez+7*D)s='easter';
else if((m===10&&day>=15)||m===11||m===1||m===2)s='winter';}
if(s!=='default')d.setAttribute('data-season',s);
var tc=${JSON.stringify(SEASON_CANVAS)}[s],mt=document.querySelector('meta[name="theme-color"]');
if(!mt){mt=document.createElement('meta');mt.setAttribute('name','theme-color');document.head.appendChild(mt);}
mt.setAttribute('content',tc);
}catch(e){}})();`;

/* ------------------------------------------------------------------------ */
/* Copy                                                                     */
/* ------------------------------------------------------------------------ */

/*
 * Copy rule: seasonal lines set the mood only. They never promise stock or a
 * seasonal collection that the catalogue does not have — CTAs go to real pages.
 * To promote an actual seasonal drop, admins set the announcement (text + link)
 * in /admin/settings, which replaces the ribbon line.
 */
export interface SeasonCopy {
  /** Short Thai name of the season, for labels and admin UI. */
  label: string;
  /** Header ribbon line. `null` = no ribbon for this season. */
  ribbon: string | null;
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  /**
   * Optional hero artwork. `null` renders the static <SeasonArtwork/> plate.
   * To add art, place an image under /public/images/seasons/ and set it here.
   */
  artwork: { src: string; alt: string } | null;
}

export const SEASON_COPY: Record<Season, SeasonCopy> = {
  default: {
    label: 'ปกติ',
    ribbon: null,
    hero: {
      eyebrow: 'IRIS Thailand · ARK: Survival Evolved',
      title: 'ร้านค้าและชุมชน ARK ของคนไทย',
      subtitle: 'เลือกเซิร์ฟเวอร์ที่คุณเล่น ซื้อของ แล้วรับในเกมผ่านระบบส่งของของ IRIS ทุกรายการผูกกับ IRIS ID ของคุณ',
      primaryCta: { label: 'เข้าร้านค้า', href: '/shop' },
      secondaryCta: { label: 'รายชื่อเซิร์ฟเวอร์', href: '/servers' },
    },
    artwork: null,
  },
  winter: {
    label: 'ฤดูหนาว',
    ribbon: 'ฤดูหนาวมาถึงแล้ว เตรียมเสบียงให้พร้อมก่อนออกสำรวจแผนที่หิมะ',
    hero: {
      eyebrow: 'ฤดูหนาว',
      title: 'ฤดูหนาวบนเกาะเริ่มต้นแล้ว',
      subtitle: 'เลือกของที่ต้องใช้จากร้านค้า แล้วส่งเข้าเซิร์ฟเวอร์ที่คุณเล่นอยู่โดยตรง ทุกรายการผูกกับ IRIS ID ของคุณ',
      primaryCta: { label: 'เข้าร้านค้า', href: '/shop' },
      secondaryCta: { label: 'รายชื่อเซิร์ฟเวอร์', href: '/servers' },
    },
    artwork: null,
  },
  christmas: {
    label: 'คริสต์มาส',
    ribbon: 'สุขสันต์เทศกาลคริสต์มาส ขอบคุณที่เล่นกับ IRIS มาตลอดปี',
    hero: {
      eyebrow: 'เทศกาลคริสต์มาส',
      title: 'ของขวัญสำหรับเพื่อนร่วมเผ่า',
      subtitle: 'เลือกแพ็กเกจที่เปิดขายอยู่ตอนนี้ แล้วส่งเข้าเซิร์ฟเวอร์ที่คุณเล่นโดยตรง',
      primaryCta: { label: 'ดูแพ็กเกจ', href: '/packs' },
      secondaryCta: { label: 'ร้านค้าทั้งหมด', href: '/shop' },
    },
    artwork: null,
  },
  easter: {
    label: 'อีสเตอร์',
    ribbon: 'เทศกาลอีสเตอร์มาถึงแล้ว ติดตามกิจกรรมช่วงเทศกาลได้ที่หน้ากิจกรรม',
    hero: {
      eyebrow: 'เทศกาลอีสเตอร์',
      title: 'ฤดูใบไม้ผลิ ล่าไข่ทั่วเกาะ',
      subtitle: 'ติดตามกิจกรรมช่วงเทศกาล และเลือกซื้อของสำหรับเซิร์ฟเวอร์ที่คุณเล่นอยู่',
      primaryCta: { label: 'เข้าร้านค้า', href: '/shop' },
      secondaryCta: { label: 'กิจกรรม', href: '/event' },
    },
    artwork: null,
  },
};

/** Thai labels for the admin season selector (includes 'auto'). */
export const SEASON_SETTING_LABELS: Record<SeasonSetting, string> = {
  auto: 'อัตโนมัติตามวันที่',
  default: 'ปกติ',
  winter: 'ฤดูหนาว',
  christmas: 'คริสต์มาส',
  easter: 'อีสเตอร์',
};
