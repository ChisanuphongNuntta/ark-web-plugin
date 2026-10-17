/**
 * Pure pagination helpers for the admin kit.
 *
 * No React, no DOM, no imports: everything here is deterministic and can be
 * unit-tested with plain Node (see ADMIN_UI.md "Verifying the helpers").
 *
 * Conventions
 * - Pages are 1-based.
 * - `totalPages` is never below 1, even when `total` is 0, so "page 1 of 1"
 *   is always a valid state and clamping never produces page 0.
 * - Every function accepts untrusted numbers (NaN, negatives, strings parsed
 *   from the URL, values from an older backend) and degrades to a safe value
 *   instead of throwing.
 */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;
/** Upper bound for a page number parsed from a URL (protects against ?page=1e308). */
export const MAX_PAGE_NUMBER = 1_000_000;

/** Normalized pagination metadata used by every admin list. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** What the client asked the server for. */
export interface PageRequest {
  page: number;
  pageSize: number;
  search: string;
  /** Only non-empty filter values are present. */
  filters: Record<string, string>;
}

/** A normalized page of rows. Endpoint-specific extras (e.g. `counts`) are added by intersection. */
export interface PageResult<T> {
  items: T[];
  pagination: PaginationMeta;
  /** The request this result answers — lets callers ignore results for an older request. */
  request: PageRequest;
  /** false when the endpoint returned the full list and the client sliced it locally. */
  serverPaginated: boolean;
}

/** Raw pagination object as returned by any version of the backend. */
export interface RawPagination {
  page?: unknown;
  pageSize?: unknown;
  /** Legacy alias of pageSize (users, api-keys, protection, content). */
  limit?: unknown;
  total?: unknown;
  totalPages?: unknown;
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** Is `value` exactly one of the allowed page sizes? */
export function isPageSizeOption(value: unknown): value is PageSizeOption {
  return typeof value === 'number' && (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

/**
 * Map any input to an allowed page size.
 * - not a number          -> fallback (default 25)
 * - a number              -> nearest allowed option (ties go to the smaller one)
 * - above 100 / below 10  -> 100 / 10
 */
export function normalizePageSize(value: unknown, fallback: PageSizeOption = DEFAULT_PAGE_SIZE): PageSizeOption {
  const n = toInt(value);
  if (n === null || n <= 0) return fallback;
  let best: PageSizeOption = PAGE_SIZE_OPTIONS[0];
  for (const option of PAGE_SIZE_OPTIONS) {
    if (Math.abs(option - n) < Math.abs(best - n)) best = option;
  }
  return best;
}

/** Parse a page number from untrusted input. Invalid -> 1. */
export function parsePage(value: unknown): number {
  const n = toInt(value);
  if (n === null || n < 1) return 1;
  return Math.min(n, MAX_PAGE_NUMBER);
}

/** Trim and cap a search string. */
export function normalizeSearch(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

/** totalPages = max(1, ceil(total / pageSize)). */
export function computeTotalPages(total: number, pageSize: number): number {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil(t / size));
}

/** Clamp a page into [1, totalPages]. */
export function clampPage(page: number, totalPages: number): number {
  const max = Number.isFinite(totalPages) && totalPages >= 1 ? Math.floor(totalPages) : 1;
  const p = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, p), max);
}

/**
 * 1-based inclusive row range shown on a page.
 * total = 0 -> { start: 0, end: 0 }. The page is clamped first, so a stale page
 * number never yields a range past the end (e.g. "แสดง 51–41").
 */
export function computeRange(page: number, pageSize: number, total: number): { start: number; end: number } {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (t === 0) return { start: 0, end: 0 };
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const p = clampPage(page, computeTotalPages(t, size));
  const start = (p - 1) * size + 1;
  const end = Math.min(p * size, t);
  return { start, end };
}

/**
 * Page to show after the page size changes so that the FIRST row that was
 * visible stays visible: newPage = floor((page - 1) * oldSize / newSize) + 1.
 * Example: page 3 @ 25 (rows 51–75) -> 50 per page -> page 2 (rows 51–100).
 */
export function pageAfterSizeChange(page: number, oldSize: number, newSize: number): number {
  if (!(oldSize > 0) || !(newSize > 0) || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(((Math.floor(page) - 1) * oldSize) / newSize) + 1;
}

export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page buttons with ellipsis, e.g. pageItems(5, 20) -> [1, '…', 4, 5, 6, '…', 20].
 * The result always has a constant length (2*siblings + 2*boundaries + 3) once
 * totalPages exceeds it, so the control does not jump around while paging.
 * An ellipsis never hides exactly one page (that page number is shown instead).
 */
export function pageItems(current: number, totalPages: number, siblings = 1, boundaries = 1): PageItem[] {
  const count = Math.max(1, Number.isFinite(totalPages) ? Math.floor(totalPages) : 1);
  const page = clampPage(current, count);
  const sib = Math.max(0, Math.floor(siblings));
  const bnd = Math.max(1, Math.floor(boundaries));
  const range = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = from; i <= to; i += 1) out.push(i);
    return out;
  };

  if (count <= 2 * sib + 2 * bnd + 3) return range(1, count);

  const startPages = range(1, Math.min(bnd, count));
  const endPages = range(Math.max(count - bnd + 1, bnd + 1), count);
  const siblingsStart = Math.max(Math.min(page - sib, count - bnd - sib * 2 - 1), bnd + 2);
  const siblingsEnd = Math.min(
    Math.max(page + sib, bnd + sib * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : count - 1,
  );

  const items: PageItem[] = [...startPages];
  if (siblingsStart > bnd + 2) items.push('ellipsis-start');
  else if (bnd + 1 < count - bnd) items.push(bnd + 1);
  items.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < count - bnd - 1) items.push('ellipsis-end');
  else if (count - bnd > bnd) items.push(count - bnd);
  items.push(...endPages);
  return items;
}

const thaiNumber = new Intl.NumberFormat('th-TH');
export function formatCount(n: number): string {
  return thaiNumber.format(Number.isFinite(n) ? n : 0);
}

/** "แสดง 26–50 จาก 41 รายการ" / "ไม่มีรายการ". */
export function formatRangeLabel(page: number, pageSize: number, total: number): string {
  const { start, end } = computeRange(page, pageSize, total);
  if (end === 0) return 'ไม่มีรายการ';
  return `แสดง ${formatCount(start)}–${formatCount(end)} จาก ${formatCount(total)} รายการ`;
}

/**
 * Turn any backend list response into a PageResult.
 *
 * - With a pagination object (new contract `pageSize` or legacy `limit`):
 *   totalPages is recomputed (never trust a 0 / missing value) and the page is
 *   clamped. If the server already clamped, `pagination.page` is its answer.
 * - Without a pagination object (older backend that returns everything): the
 *   full list is sliced locally with the requested page/pageSize, so the UI
 *   behaves the same. `clientFilter` (optional) applies search/filters locally
 *   in that fallback case only.
 */
export function normalizePageResponse<T>(
  rawItems: unknown,
  rawPagination: RawPagination | null | undefined,
  request: PageRequest,
  clientFilter?: (item: T, request: PageRequest) => boolean,
): PageResult<T> {
  const items = Array.isArray(rawItems) ? (rawItems as T[]) : [];

  if (!rawPagination || typeof rawPagination !== 'object') {
    const filtered = clientFilter ? items.filter((item) => clientFilter(item, request)) : items;
    const total = filtered.length;
    const totalPages = computeTotalPages(total, request.pageSize);
    const page = clampPage(request.page, totalPages);
    const start = (page - 1) * request.pageSize;
    return {
      items: filtered.slice(start, start + request.pageSize),
      pagination: { page, pageSize: request.pageSize, total, totalPages },
      request,
      serverPaginated: false,
    };
  }

  const size = toInt(rawPagination.pageSize) ?? toInt(rawPagination.limit);
  const pageSize = size !== null && size > 0 ? Math.min(size, MAX_PAGE_SIZE) : request.pageSize;
  const rawTotal = toInt(rawPagination.total);
  const total = rawTotal !== null && rawTotal >= 0 ? rawTotal : items.length;
  const totalPages = computeTotalPages(total, pageSize);
  const page = clampPage(toInt(rawPagination.page) ?? request.page, totalPages);

  return {
    // Defensive: never render more rows than one page even if a backend ignores pageSize.
    items: items.length > pageSize ? items.slice(0, pageSize) : items,
    pagination: { page, pageSize, total, totalPages },
    request,
    serverPaginated: true,
  };
}

/**
 * Client-side slice for small lists (useClientPagination).
 */
export function paginateLocally<T>(items: readonly T[], page: number, pageSize: number): {
  items: T[];
  pagination: PaginationMeta;
} {
  const total = items.length;
  const totalPages = computeTotalPages(total, pageSize);
  const p = clampPage(page, totalPages);
  const start = (p - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), pagination: { page: p, pageSize, total, totalPages } };
}
