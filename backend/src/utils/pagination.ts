// Shared admin list pagination (UI redesign 2026-10, "Admin pagination" contract).
//
// Rules:
//  - page is 1-based. Missing / NaN / <= 0 -> 1. Values above MAX_REQUEST_PAGE are capped so
//    skip can never overflow; the real upper bound is applied AFTER counting (clampPage).
//  - pageSize snaps to the nearest allowed size (10, 25, 50, 100). Ties snap down. Anything
//    above 100 -> 100. Missing / NaN / <= 0 -> default (25). `limit` is accepted as an alias.
//  - totalPages = max(1, ceil(total / pageSize)); page is clamped to [1, totalPages] and the
//    clamped page is returned so the client can correct itself.

export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;
// Upper bound on the *requested* page before counting. 1e6 * 100 = 1e8 < 2^31, so skip stays a
// safe int32 for Prisma even for absurd inputs like page=999999999999.
export const MAX_REQUEST_PAGE = 1_000_000;
// How many times paginateQuery re-runs the query for a clamped page before giving up.
const MAX_CLAMP_REQUERIES = 3;

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ParsePaginationOptions {
  /** Default size when none/invalid is given. Should be one of ALLOWED_PAGE_SIZES when snapping. */
  defaultPageSize?: number;
  /** false = only clamp to [1, MAX_PAGE_SIZE] (e.g. media grids that use 24); default true. */
  snap?: boolean;
}

type Query = Record<string, unknown> | undefined | null;

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** Strict positive-integer parse: "2" -> 2, "2abc"/"1.5"/""/"-1"/NaN -> undefined. */
export function parsePositiveInt(value: unknown): number | undefined {
  const raw = firstValue(value);
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;
  }
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function snapPageSize(requested: number | undefined, defaultPageSize = DEFAULT_PAGE_SIZE): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return defaultPageSize;
  if (requested >= MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  let best: number = ALLOWED_PAGE_SIZES[0];
  for (const size of ALLOWED_PAGE_SIZES) {
    // strict "<" keeps the smaller size on ties (e.g. 75 -> 50)
    if (Math.abs(size - requested) < Math.abs(best - requested)) best = size;
  }
  return best;
}

/** True when the request asked for paginated output (backward-compat switch). */
export function wantsPagination(query: Query): boolean {
  const raw = firstValue(query?.page);
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

export function parsePagination(query: Query, options: ParsePaginationOptions = {}): PaginationParams {
  const snap = options.snap ?? true;
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  const requestedPage = parsePositiveInt(query?.page) ?? 1;
  const page = Math.min(requestedPage, MAX_REQUEST_PAGE);

  const rawSize = query?.pageSize !== undefined ? query?.pageSize : query?.limit;
  const requestedSize = parsePositiveInt(rawSize);
  const pageSize = snap
    ? snapPageSize(requestedSize, defaultPageSize)
    : Math.min(requestedSize ?? defaultPageSize, MAX_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function totalPagesFor(total: number, pageSize: number): number {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  return Math.max(1, Math.ceil(safeTotal / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const totalPages = totalPagesFor(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), totalPages);
}

export function buildPagination(total: number, page: number, pageSize: number): PaginationMeta {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = totalPagesFor(safeTotal, pageSize);
  return { page: clampPage(page, safeTotal, pageSize), pageSize, total: safeTotal, totalPages };
}

/** Trimmed search term capped at MAX_SEARCH_LENGTH; undefined when empty / not a string. */
export function parseSearch(value: unknown, maxLength = MAX_SEARCH_LENGTH): string | undefined {
  const raw = firstValue(value);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().slice(0, maxLength).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Free-form string filter (e.g. protection type, log eventType, content pageType): first value
 * when the param is repeated, trimmed and capped; '' / 'all' mean "no filter". Non-string input
 * (e.g. ?type[a]=b parsed as an object) is ignored instead of reaching Prisma as a 500.
 */
export function parseStringFilter(value: unknown, maxLength = MAX_SEARCH_LENGTH): string | undefined {
  const raw = firstValue(value);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().slice(0, maxLength);
  if (trimmed === '' || trimmed.toLowerCase() === 'all') return undefined;
  return trimmed;
}

/**
 * Count + page query with server-side page clamping.
 *
 * `run(skip, take)` must return a Prisma `$transaction([count, findMany, ...])` result whose
 * first element is the total, so count and rows come from one snapshot. The requested page is
 * tried first (one round trip in the normal case). If the count shows the page is past the end,
 * the query is re-run for the clamped page; the loop is bounded so a list that keeps shrinking
 * concurrently cannot spin.
 */
export async function paginateQuery<R extends [number, ...unknown[]]>(
  params: PaginationParams,
  run: (skip: number, take: number) => Promise<R>,
): Promise<{ result: R; pagination: PaginationMeta }> {
  let page = params.page;
  let result = await run((page - 1) * params.pageSize, params.pageSize);
  for (let attempt = 0; attempt < MAX_CLAMP_REQUERIES; attempt += 1) {
    const clamped = clampPage(page, result[0], params.pageSize);
    if (clamped === page) break;
    page = clamped;
    result = await run((page - 1) * params.pageSize, params.pageSize);
  }
  // Invariant for the client: 1 <= page <= totalPages. In the pathological case where the list
  // kept shrinking through every re-query, the rows may belong to an earlier page guess (they
  // are then empty); the clamped page tells the client which page to ask for next.
  return { result, pagination: buildPagination(result[0], page, params.pageSize) };
}
