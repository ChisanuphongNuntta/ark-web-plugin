// Seasonal theme resolver (UI redesign 2026-10).
//
// Pure, side-effect-free so the calendar rules are unit-testable. All calendar maths is done
// on the Asia/Bangkok civil date. Bangkok is a fixed UTC+07:00 offset with no DST, so the
// local date is derived by shifting the instant by +7h and reading UTC fields; this avoids
// depending on the host's ICU/timezone data.

export const SEASON_SETTINGS = ['auto', 'default', 'winter', 'christmas', 'easter'] as const;
export type SeasonSetting = (typeof SEASON_SETTINGS)[number];

export const ACTIVE_SEASONS = ['default', 'winter', 'christmas', 'easter'] as const;
export type ActiveSeason = (typeof ACTIVE_SEASONS)[number];

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isSeasonSetting(value: unknown): value is SeasonSetting {
  return typeof value === 'string' && (SEASON_SETTINGS as readonly string[]).includes(value);
}

// The Asia/Bangkok calendar date for an instant.
export function bangkokDate(now: Date): CivilDate {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

// The UTC instant of 00:00 Asia/Bangkok on the Bangkok civil date of `now`.
export function bangkokStartOfDay(now: Date): Date {
  const { year, month, day } = bangkokDate(now);
  return new Date(Date.UTC(year, month - 1, day) - BANGKOK_OFFSET_MS);
}

// Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function westernEasterSunday(year: number): CivilDate {
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
  return { year, month, day };
}

// Day number (days since epoch) of a civil date, for inclusive range comparisons.
function dayNumber(date: CivilDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS);
}

export const EASTER_DAYS_BEFORE = 14;
export const EASTER_DAYS_AFTER = 7;

export function isEasterWindow(date: CivilDate): boolean {
  const easter = dayNumber(westernEasterSunday(date.year));
  const today = dayNumber(date);
  return today >= easter - EASTER_DAYS_BEFORE && today <= easter + EASTER_DAYS_AFTER;
}

// 'auto' rules (Asia/Bangkok date):
//   christmas  Dec 1 – Jan 2
//   winter     Oct 15 – Nov 30, and Jan 3 – end of February (28/29)
//   easter     14 days before through 7 days after Western Easter Sunday
//   default    otherwise
export function resolveAutoSeason(now: Date = new Date()): ActiveSeason {
  const date = bangkokDate(now);
  const { month, day } = date;

  if (month === 12 || (month === 1 && day <= 2)) return 'christmas';
  if ((month === 10 && day >= 15) || month === 11) return 'winter';
  if (month === 1 || month === 2) return 'winter';
  if (isEasterWindow(date)) return 'easter';
  return 'default';
}

export function resolveActiveSeason(setting: SeasonSetting, now: Date = new Date()): ActiveSeason {
  if (setting === 'auto') return resolveAutoSeason(now);
  return setting;
}
