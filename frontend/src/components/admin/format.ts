/**
 * Display-only formatters for the admin console. No arithmetic on money:
 * amounts go through <Amount/> / formatAmount, which only group digits.
 */

const DATE_TIME = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const DATE_TIME_SECONDS = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' });

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "17 ต.ค. 2569 14:05" — or an em dash when missing/invalid. */
export function formatDateTime(value: string | number | Date | null | undefined, withSeconds = false): string {
  const d = toDate(value);
  if (!d) return '—';
  return (withSeconds ? DATE_TIME_SECONDS : DATE_TIME).format(d);
}

/** First 8 characters of an id (UUID/cuid) for dense tables. Full id goes in `title`. */
export function shortId(id: string | number | null | undefined, length = 8): string {
  if (id === null || id === undefined || id === '') return '—';
  const s = String(id);
  return s.length > length ? s.slice(0, length) : s;
}

/** Pretty-print a JSON-encoded string (audit old/new values). Falls back to the raw text. */
export function prettyJson(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/** Thai number grouping for plain counts (not money). */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('th-TH');
}
