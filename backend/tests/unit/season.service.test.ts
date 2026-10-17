import { describe, expect, it } from 'vitest';
import {
  bangkokDate,
  bangkokStartOfDay,
  isEasterWindow,
  resolveActiveSeason,
  resolveAutoSeason,
  westernEasterSunday,
} from '../../src/services/season.service.js';

// Build the UTC instant for a given Asia/Bangkok wall-clock time (UTC+7, no DST).
const bkk = (y: number, m: number, d: number, hh = 12, mm = 0, ss = 0) =>
  new Date(Date.UTC(y, m - 1, d, hh - 7, mm, ss));

describe('westernEasterSunday', () => {
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2028, 4, 16],
    [2038, 4, 25], // latest-possible style date
    [2008, 3, 23],
  ])('Easter %i is %i/%i', (year, month, day) => {
    expect(westernEasterSunday(year)).toEqual({ year, month, day });
  });
});

describe('Asia/Bangkok date handling', () => {
  it('derives the Bangkok civil date (UTC+7)', () => {
    expect(bangkokDate(new Date('2026-11-30T16:59:59.000Z'))).toEqual({ year: 2026, month: 11, day: 30 });
    expect(bangkokDate(new Date('2026-11-30T17:00:00.000Z'))).toEqual({ year: 2026, month: 12, day: 1 });
  });

  it('computes the Bangkok start of day as a UTC instant', () => {
    expect(bangkokStartOfDay(new Date('2026-10-17T03:00:00.000Z')).toISOString()).toBe('2026-10-16T17:00:00.000Z');
    expect(bangkokStartOfDay(new Date('2026-10-16T18:00:00.000Z')).toISOString()).toBe('2026-10-16T17:00:00.000Z');
  });

  it('switches to christmas exactly at Bangkok midnight on Dec 1', () => {
    expect(resolveAutoSeason(new Date('2026-11-30T16:59:59.000Z'))).toBe('winter');
    expect(resolveAutoSeason(new Date('2026-11-30T17:00:00.000Z'))).toBe('christmas');
  });

  it('leaves christmas at Bangkok midnight on Jan 3 even though UTC is still Jan 2', () => {
    expect(resolveAutoSeason(new Date('2027-01-02T16:59:59.000Z'))).toBe('christmas');
    expect(resolveAutoSeason(new Date('2027-01-02T17:00:00.000Z'))).toBe('winter');
  });
});

describe('resolveAutoSeason boundaries', () => {
  it.each([
    ['Oct 14 is default', bkk(2026, 10, 14), 'default'],
    ['Oct 15 starts winter', bkk(2026, 10, 15, 0, 0, 0), 'winter'],
    ['today (2026-10-17) is winter', bkk(2026, 10, 17), 'winter'],
    ['Nov 30 is winter', bkk(2026, 11, 30, 23, 59, 59), 'winter'],
    ['Dec 1 is christmas', bkk(2026, 12, 1, 0, 0, 0), 'christmas'],
    ['Dec 25 is christmas', bkk(2026, 12, 25), 'christmas'],
    ['Dec 31 is christmas', bkk(2026, 12, 31, 23, 59, 59), 'christmas'],
    ['Jan 1 is christmas', bkk(2027, 1, 1), 'christmas'],
    ['Jan 2 is christmas', bkk(2027, 1, 2, 23, 59, 59), 'christmas'],
    ['Jan 3 is winter', bkk(2027, 1, 3, 0, 0, 0), 'winter'],
    ['Feb 28 (non-leap) is winter', bkk(2027, 2, 28, 23, 59, 59), 'winter'],
    ['Mar 1 (non-leap) is default', bkk(2027, 3, 1, 0, 0, 0), 'default'],
    ['Feb 29 (leap 2028) is winter', bkk(2028, 2, 29, 23, 59, 59), 'winter'],
    ['Mar 1 2028 is default', bkk(2028, 3, 1), 'default'],
    ['Jul 1 is default', bkk(2026, 7, 1), 'default'],
  ] as const)('%s', (_label, instant, expected) => {
    expect(resolveAutoSeason(instant)).toBe(expected);
  });
});

describe('Easter window (14 days before .. 7 days after Easter Sunday)', () => {
  it('2026: Mar 22 .. Apr 12 (Easter Apr 5)', () => {
    expect(resolveAutoSeason(bkk(2026, 3, 21, 23, 59, 59))).toBe('default');
    expect(resolveAutoSeason(bkk(2026, 3, 22, 0, 0, 0))).toBe('easter');
    expect(resolveAutoSeason(bkk(2026, 4, 5))).toBe('easter');
    expect(resolveAutoSeason(bkk(2026, 4, 12, 23, 59, 59))).toBe('easter');
    expect(resolveAutoSeason(bkk(2026, 4, 13, 0, 0, 0))).toBe('default');
  });

  it('2027: Mar 14 .. Apr 4 (Easter Mar 28)', () => {
    expect(resolveAutoSeason(bkk(2027, 3, 13))).toBe('default');
    expect(resolveAutoSeason(bkk(2027, 3, 14))).toBe('easter');
    expect(resolveAutoSeason(bkk(2027, 3, 28))).toBe('easter');
    expect(resolveAutoSeason(bkk(2027, 4, 4))).toBe('easter');
    expect(resolveAutoSeason(bkk(2027, 4, 5))).toBe('default');
  });

  it('uses the Bangkok date at the window edges', () => {
    // 2026-03-21T17:00Z is 2026-03-22 00:00 in Bangkok -> inside the window.
    expect(resolveAutoSeason(new Date('2026-03-21T17:00:00.000Z'))).toBe('easter');
    expect(resolveAutoSeason(new Date('2026-03-21T16:59:59.000Z'))).toBe('default');
  });

  it('isEasterWindow is pure on civil dates', () => {
    expect(isEasterWindow({ year: 2026, month: 3, day: 22 })).toBe(true);
    expect(isEasterWindow({ year: 2026, month: 4, day: 13 })).toBe(false);
  });
});

describe('resolveActiveSeason', () => {
  it('returns explicit seasons unchanged and resolves auto', () => {
    const july = bkk(2026, 7, 1);
    expect(resolveActiveSeason('easter', july)).toBe('easter');
    expect(resolveActiveSeason('christmas', july)).toBe('christmas');
    expect(resolveActiveSeason('default', bkk(2026, 12, 25))).toBe('default');
    expect(resolveActiveSeason('auto', bkk(2026, 12, 25))).toBe('christmas');
  });
});
