'use client';

/**
 * Admin list pagination: URL-synced state + react-query fetching.
 *
 *   usePaginationState(options)            state only (page / pageSize / search / filters)
 *   usePaginatedQuery({ ...options, fetcher })   server-paginated list
 *   useClientPagination(items, key, options)     small list sliced in the browser
 *
 * Design notes (read before changing anything here):
 *
 * 1. The URL is the source of truth (?page=&size=&q=&<filter>=, optionally
 *    prefixed for a second table on the same page). Render values are derived
 *    from useSearchParams(), so refresh / back / forward / a nav link to the
 *    bare path all just work. Pages using these hooks MUST be wrapped in
 *    <Suspense> (use <AdminSuspense>) because of useSearchParams().
 *
 * 2. Writes use window.history.replaceState, which Next.js (>=14.1) integrates
 *    with its router and useSearchParams. Unlike router.replace it is
 *    synchronous: window.location is updated before the next click handler
 *    runs, so two quick "next" clicks give page 3, not page 2 twice, and two
 *    tables on one page cannot overwrite each other's params. It also adds no
 *    history entries, does not scroll, and does not refetch the RSC payload.
 *    Every action therefore reads the CURRENT state from window.location,
 *    never from a render closure.
 *
 * 3. Changing search or any filter resets page to 1 in the same write, so
 *    there is exactly one fetch. Search is debounced (300ms); the page reset
 *    happens with the debounced value.
 *
 * 4. pageSize is remembered per table key in localStorage (read through
 *    useSyncExternalStore so SSR/hydration never mismatches). Queries wait
 *    until it has been read (`ready`), so the first fetch already uses the
 *    remembered size — no wasted 25-row fetch followed by a 50-row fetch.
 *    Changing pageSize keeps the first visible row on screen.
 *
 * 5. react-query keys include every request parameter, and results carry the
 *    request they answer, so a slow response for an old page can never be
 *    shown as (or acted on as) the current page. keepPreviousData keeps the
 *    table height while the next page loads.
 *
 * 6. If the server answers with a different (clamped) page — e.g. the last
 *    row of the last page was deleted, or ?page=999 was typed — the hook
 *    adopts that page and rewrites the URL. If a page comes back empty while
 *    page > 1, it steps back. Both only run on settled, non-placeholder data
 *    for the current request, so they cannot loop on stale data.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  computeTotalPages,
  isPageSizeOption,
  normalizePageSize,
  normalizeSearch,
  pageAfterSizeChange,
  paginateLocally,
  parsePage,
  type PageRequest,
  type PageResult,
  type PageSizeOption,
  type PaginationMeta,
} from '@/components/admin/paginationMath';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterSpec {
  /**
   * Allowed values. Anything else in the URL is ignored (treated as "all").
   * Omit for free-form values such as ids. The empty string always means
   * "no filter" and is never written to the URL.
   */
  values?: readonly string[];
  /**
   * Regex source (anchored automatically) a free-form value must match, e.g.
   * '[0-9]{1,9}|none' for an id filter. A non-matching URL value is treated as
   * "all", so the hook state, the request sent and the result agree. A string
   * (not a RegExp) keeps the spec JSON-serializable.
   */
  pattern?: string;
}

export interface PaginationStateOptions {
  /** Unique table key, e.g. 'admin-servers'. Used for the react-query key and the remembered page size. */
  key: string;
  /** Filters this table understands, keyed by URL param name (before prefix). */
  filters?: Record<string, FilterSpec>;
  /** Prefix for URL params when a page has more than one paginated table, e.g. 'logs_' -> ?logs_page=2. */
  paramPrefix?: string;
  /** Sync state to the URL (default true). false = component-local state (e.g. a table inside a dialog). */
  syncUrl?: boolean;
  defaultPageSize?: PageSizeOption;
  /** Search debounce in ms (default 300). */
  debounceMs?: number;
}

interface ListState {
  page: number;
  /** null = not in the URL; fall back to the remembered/default size. */
  size: PageSizeOption | null;
  search: string;
  filters: Record<string, string>;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Shows the subtle 'กำลังโหลด' indicator. */
  isBusy?: boolean;
  /** Before the first response: totals are unknown, controls are disabled. */
  isUnknown?: boolean;
  pageSizeOptions?: readonly number[];
}

export interface PaginationStateResult {
  /** false until the remembered page size has been read on the client. */
  ready: boolean;
  page: number;
  pageSize: PageSizeOption;
  /** Committed (debounced, trimmed) search — what is sent to the server. */
  search: string;
  /** Raw text in the search box. Bind this to the input. */
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** Commit the search immediately (e.g. on Enter). */
  flushSearch: () => void;
  /** Clear the search box and the committed search immediately. */
  clearSearch: () => void;
  /** Current filter values ('' = all) for every declared filter. */
  filters: Record<string, string>;
  setFilter: (name: string, value: string) => void;
  setFilters: (values: Record<string, string>) => void;
  /** Clear search and all filters, back to page 1. */
  resetAll: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** Normalized request: only non-empty filters. Stable identity while unchanged. */
  request: PageRequest;
  /** True when search or any filter is active. */
  isFiltered: boolean;
}

// ---------------------------------------------------------------------------
// URL <-> state
// ---------------------------------------------------------------------------

interface ParamReader {
  get(name: string): string | null;
}

function normalizeFilterValue(value: string | null, spec: FilterSpec): string {
  if (value === null) return '';
  const v = value.trim().slice(0, 100);
  if (v === '') return '';
  if (spec.values && !spec.values.includes(v)) return '';
  if (spec.pattern && !new RegExp(`^(?:${spec.pattern})$`).test(v)) return '';
  return v;
}

function parseState(
  params: ParamReader,
  prefix: string,
  specs: Record<string, FilterSpec>,
  fallbackSize: PageSizeOption,
): ListState {
  const rawSize = params.get(`${prefix}size`);
  const filters: Record<string, string> = {};
  for (const name of Object.keys(specs)) {
    filters[name] = normalizeFilterValue(params.get(`${prefix}${name}`), specs[name]);
  }
  return {
    page: parsePage(params.get(`${prefix}page`)),
    size: rawSize === null || rawSize === '' ? null : normalizePageSize(rawSize, fallbackSize),
    search: normalizeSearch(params.get(`${prefix}q`) ?? ''),
    filters,
  };
}

function writeState(params: URLSearchParams, state: ListState, prefix: string): void {
  const set = (name: string, value: string | null) => {
    if (value === null || value === '') params.delete(`${prefix}${name}`);
    else params.set(`${prefix}${name}`, value);
  };
  set('page', state.page > 1 ? String(state.page) : null);
  set('size', state.size !== null ? String(state.size) : null);
  set('q', state.search || null);
  for (const [name, value] of Object.entries(state.filters)) set(name, value || null);
}

function replaceUrl(state: ListState, prefix: string): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  writeState(params, state, prefix);
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) window.history.replaceState(null, '', next);
}

// ---------------------------------------------------------------------------
// Remembered page size (localStorage, per table key)
// ---------------------------------------------------------------------------

const PAGE_SIZE_EVENT = 'iris-admin-page-size';
const storageKey = (key: string) => `iris-admin:page-size:${key}`;

function readStoredSize(key: string): PageSizeOption | null {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw === null) return null;
    const n = Number(raw);
    return isPageSizeOption(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStoredSize(key: string, size: PageSizeOption): void {
  try {
    window.localStorage.setItem(storageKey(key), String(size));
  } catch {
    // private mode / blocked storage: size still applies via the URL
  }
  try {
    window.dispatchEvent(new Event(PAGE_SIZE_EVENT));
  } catch {
    // ignore
  }
}

function subscribeStoredSize(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(PAGE_SIZE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(PAGE_SIZE_EVENT, callback);
  };
}

/** Returns null during SSR/hydration ("not read yet"), '' when nothing is stored, else the size. */
function useStoredPageSize(key: string): string | null {
  return useSyncExternalStore<string | null>(
    subscribeStoredSize,
    () => String(readStoredSize(key) ?? ''),
    () => null,
  );
}

function sameFilters(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

function sameRequest(a: PageRequest, b: PageRequest): boolean {
  return a.page === b.page && a.pageSize === b.pageSize && a.search === b.search && sameFilters(a.filters, b.filters);
}

// ---------------------------------------------------------------------------
// usePaginationState
// ---------------------------------------------------------------------------

export function usePaginationState(options: PaginationStateOptions): PaginationStateResult {
  const {
    key,
    paramPrefix = '',
    syncUrl = true,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    debounceMs = 300,
  } = options;

  // Callers usually pass an object literal; key it by content so callbacks stay stable.
  const specsKey = JSON.stringify(options.filters ?? {});
  const specs = useMemo(() => JSON.parse(specsKey) as Record<string, FilterSpec>, [specsKey]);

  const searchParams = useSearchParams();
  const spString = searchParams?.toString() ?? '';

  // Local (non-URL) mode keeps its own state. A ref-like holder lets actions
  // read the latest value synchronously, mirroring window.location in URL mode.
  const [initialLocal] = useState<ListState>(() =>
    parseState(new URLSearchParams(), paramPrefix, specs, defaultPageSize),
  );
  const localRef = useRef<ListState>(initialLocal);
  const [localState, setLocalState] = useState<ListState>(initialLocal);

  const urlState = useMemo(
    () => parseState(new URLSearchParams(spString), paramPrefix, specs, defaultPageSize),
    [spString, paramPrefix, specs, defaultPageSize],
  );
  const state = syncUrl ? urlState : localState;

  const storedSnapshot = useStoredPageSize(key);
  const ready = storedSnapshot !== null;
  const storedSize = storedSnapshot ? normalizePageSize(storedSnapshot, defaultPageSize) : null;
  const pageSize: PageSizeOption = state.size ?? storedSize ?? defaultPageSize;

  /** Latest state, read at call time (never from a stale render closure). */
  const read = useCallback((): ListState => {
    if (syncUrl && typeof window !== 'undefined') {
      return parseState(new URLSearchParams(window.location.search), paramPrefix, specs, defaultPageSize);
    }
    return localRef.current;
  }, [syncUrl, paramPrefix, specs, defaultPageSize]);

  const write = useCallback(
    (next: ListState) => {
      if (syncUrl) {
        replaceUrl(next, paramPrefix);
      } else {
        localRef.current = next;
        setLocalState(next);
      }
    },
    [syncUrl, paramPrefix],
  );

  const effectiveSize = useCallback(
    (s: ListState): PageSizeOption => s.size ?? (typeof window !== 'undefined' ? readStoredSize(key) : null) ?? defaultPageSize,
    [key, defaultPageSize],
  );

  const setPage = useCallback(
    (page: number) => {
      const cur = read();
      const nextPage = parsePage(page);
      if (cur.page === nextPage) return;
      write({ ...cur, page: nextPage });
    },
    [read, write],
  );

  const setPageSize = useCallback(
    (size: number) => {
      const cur = read();
      const oldSize = effectiveSize(cur);
      const newSize = normalizePageSize(size, defaultPageSize);
      writeStoredSize(key, newSize);
      if (oldSize === newSize && cur.size === newSize) return;
      write({ ...cur, size: newSize, page: oldSize === newSize ? cur.page : pageAfterSizeChange(cur.page, oldSize, newSize) });
    },
    [read, write, effectiveSize, key, defaultPageSize],
  );

  const setFilters = useCallback(
    (values: Record<string, string>) => {
      const cur = read();
      const nextFilters = { ...cur.filters };
      let changed = false;
      for (const [name, value] of Object.entries(values)) {
        const spec = specs[name];
        if (!spec) continue; // undeclared filters are ignored on purpose
        const v = normalizeFilterValue(value ?? '', spec);
        if (nextFilters[name] !== v) {
          nextFilters[name] = v;
          changed = true;
        }
      }
      if (!changed) return;
      write({ ...cur, filters: nextFilters, page: 1 });
    },
    [read, write, specs],
  );

  const setFilter = useCallback((name: string, value: string) => setFilters({ [name]: value }), [setFilters]);

  // --- search box (debounced) ------------------------------------------------
  const [searchInput, setSearchInputState] = useState(state.search);
  const [seenSearch, setSeenSearch] = useState(state.search);
  const [ownSearch, setOwnSearch] = useState<string | null>(null);

  // When the committed search changes from OUTSIDE (back/forward, a link, reset),
  // mirror it into the box. Our own debounced commit is recognised and skipped so
  // characters typed meanwhile are never overwritten. (Render-time adjustment,
  // the React-recommended alternative to a syncing effect.)
  if (state.search !== seenSearch) {
    setSeenSearch(state.search);
    if (ownSearch !== null && state.search === ownSearch) setOwnSearch(null);
    else setSearchInputState(state.search);
  }

  const commitSearch = useCallback(
    (raw: string) => {
      const q = normalizeSearch(raw);
      const cur = read();
      if (cur.search === q) return;
      setOwnSearch(q);
      write({ ...cur, search: q, page: 1 });
    },
    [read, write],
  );

  useEffect(() => {
    if (normalizeSearch(searchInput) === read().search) return;
    const timer = window.setTimeout(() => commitSearch(searchInput), debounceMs);
    return () => window.clearTimeout(timer);
  }, [searchInput, debounceMs, read, commitSearch]);

  const setSearchInput = useCallback((value: string) => setSearchInputState(value), []);
  const flushSearch = useCallback(() => commitSearch(searchInput), [commitSearch, searchInput]);
  const clearSearch = useCallback(() => {
    setSearchInputState('');
    commitSearch('');
  }, [commitSearch]);

  const resetAll = useCallback(() => {
    const cur = read();
    const cleared: Record<string, string> = {};
    for (const name of Object.keys(cur.filters)) cleared[name] = '';
    setSearchInputState('');
    if (cur.search !== '') setOwnSearch('');
    if (cur.search === '' && sameFilters(cur.filters, cleared) && cur.page === 1) return;
    write({ ...cur, search: '', filters: cleared, page: 1 });
  }, [read, write]);

  // --- normalized request ----------------------------------------------------
  const activeFiltersKey = JSON.stringify(
    Object.keys(state.filters)
      .sort()
      .filter((name) => state.filters[name] !== '')
      .map((name) => [name, state.filters[name]]),
  );
  const request = useMemo<PageRequest>(
    () => ({
      page: state.page,
      pageSize,
      search: state.search,
      filters: Object.fromEntries(JSON.parse(activeFiltersKey) as [string, string][]),
    }),
    [state.page, pageSize, state.search, activeFiltersKey],
  );

  return {
    ready,
    page: state.page,
    pageSize,
    search: state.search,
    searchInput,
    setSearchInput,
    flushSearch,
    clearSearch,
    filters: state.filters,
    setFilter,
    setFilters,
    resetAll,
    setPage,
    setPageSize,
    request,
    isFiltered: state.search !== '' || Object.keys(request.filters).length > 0,
  };
}

// ---------------------------------------------------------------------------
// usePaginatedQuery (server-side pagination)
// ---------------------------------------------------------------------------

export interface PaginatedQueryOptions<TResult extends PageResult<unknown>> extends PaginationStateOptions {
  /** Fetch one page. Use the typed adminApi.get*Page methods; pass `signal` through. */
  fetcher: (request: PageRequest, signal: AbortSignal) => Promise<TResult>;
  /** e.g. a permission check. While false nothing is fetched. */
  enabled?: boolean;
  /** Default 15s. */
  staleTime?: number;
  refetchInterval?: number | false;
}

export interface PaginatedQueryResult<TResult extends PageResult<unknown>> extends PaginationStateResult {
  /** Full last result (includes endpoint extras such as `counts`). May be the previous page while loading. */
  data: TResult | undefined;
  items: TResult['items'];
  /** Pagination for the CURRENT request (page/pageSize) with the last known total. */
  pagination: PaginationMeta;
  /** Spread into <Pagination {...list.paginationProps} />. */
  paginationProps: PaginationProps;
  /** No data yet (first load). Render skeleton rows. */
  isInitialLoading: boolean;
  /** Any request in flight (page change, refetch). Render the subtle loading state. */
  isFetching: boolean;
  /** Rows on screen belong to the previous request. */
  isPlaceholderData: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Invalidate every page of this table (call after create/update/delete). */
  invalidate: () => Promise<void>;
  queryKey: readonly unknown[];
}

export function usePaginatedQuery<TResult extends PageResult<unknown>>(
  options: PaginatedQueryOptions<TResult>,
): PaginatedQueryResult<TResult> {
  const { key, fetcher, enabled = true, staleTime = 15_000, refetchInterval } = options;
  const state = usePaginationState(options);
  const { request, setPage } = state;
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => [key, request.page, request.pageSize, request.search, request.filters] as const,
    [key, request],
  );

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetcher(request, signal),
    placeholderData: keepPreviousData,
    enabled: state.ready && enabled,
    staleTime,
    refetchOnMount: true,
    refetchInterval,
  });

  const { data, isPlaceholderData, isFetching } = query;

  // Adopt the server's (clamped) page; step back from an empty page.
  useEffect(() => {
    if (!data || isPlaceholderData || isFetching) return;
    if (!sameRequest(data.request, request)) return;
    const serverPage = data.pagination.page;
    if (serverPage !== request.page) {
      setPage(serverPage);
      return;
    }
    if (data.items.length === 0 && request.page > 1) {
      setPage(Math.max(1, Math.min(request.page - 1, data.pagination.totalPages)));
    }
  }, [data, isPlaceholderData, isFetching, request, setPage]);

  const total = data?.pagination.total ?? 0;
  const pagination: PaginationMeta = {
    page: request.page,
    pageSize: request.pageSize,
    total,
    totalPages: computeTotalPages(total, request.pageSize),
  };

  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: [key] }), [queryClient, key]);
  const { refetch: rqRefetch } = query;
  const refetch = useCallback(() => {
    void rqRefetch();
  }, [rqRefetch]);

  return {
    ...state,
    data,
    items: (data?.items ?? []) as TResult['items'],
    pagination,
    paginationProps: {
      ...pagination,
      onPageChange: state.setPage,
      onPageSizeChange: state.setPageSize,
      isBusy: isFetching,
      isUnknown: !data,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
    },
    isInitialLoading: !data && !query.isError,
    isFetching,
    isPlaceholderData,
    isError: query.isError,
    error: query.error,
    refetch,
    invalidate,
    queryKey,
  };
}

// ---------------------------------------------------------------------------
// useClientPagination (small, non-paginated endpoints)
// ---------------------------------------------------------------------------

export interface ClientPaginationOptions<T> extends Omit<PaginationStateOptions, 'key'> {
  /** Local search/filter predicate. Receives the committed search and active filters. */
  filter?: (item: T, query: { search: string; filters: Record<string, string> }) => boolean;
}

export interface ClientPaginationResult<T> extends PaginationStateResult {
  /** Rows for the current page. */
  items: T[];
  /** Rows after search/filter, before slicing (e.g. for counts). */
  filteredItems: T[];
  pagination: PaginationMeta;
  paginationProps: PaginationProps;
}

/**
 * Same UI and URL behaviour as usePaginatedQuery for a list that is already in
 * memory. Pass `undefined` while the list is loading so a ?page=3 in the URL is
 * not clamped to page 1 before the data arrives.
 */
export function useClientPagination<T>(
  allItems: readonly T[] | undefined,
  key: string,
  options: ClientPaginationOptions<T> = {},
): ClientPaginationResult<T> {
  const state = usePaginationState({ ...options, key });
  const { filter } = options;
  const { search, request, setPage } = state;

  const filteredItems = useMemo(() => {
    const list = allItems ?? [];
    if (!filter) return [...list];
    return list.filter((item) => filter(item, { search, filters: request.filters }));
  }, [allItems, filter, search, request.filters]);

  const sliced = paginateLocally(filteredItems, state.page, state.pageSize);
  const loaded = allItems !== undefined;
  const clampedPage = sliced.pagination.page;

  useEffect(() => {
    if (loaded && clampedPage !== request.page) setPage(clampedPage);
  }, [loaded, clampedPage, request.page, setPage]);

  const pagination: PaginationMeta = { ...sliced.pagination, page: loaded ? sliced.pagination.page : state.page };

  return {
    ...state,
    items: sliced.items,
    filteredItems,
    pagination,
    paginationProps: {
      ...pagination,
      onPageChange: state.setPage,
      onPageSizeChange: state.setPageSize,
      isUnknown: !loaded,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
    },
  };
}
