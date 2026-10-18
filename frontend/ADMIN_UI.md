# IRIS Admin UI kit

How to build an admin list page that matches the rest of the site ("Frozen
Expedition") and paginates correctly. If you're building or reworking any page under
`src/app/admin/**`, read this first.

- Components: `src/components/admin/*` (import from `@/components/admin`)
- Hooks: `src/hooks/usePaginatedQuery.ts`
- Typed list endpoints: `src/lib/api.ts` (`adminApi.get*Page`, `contentApi.getPagesPage`,
  `protectionAdminApi.getProtectionsPage` / `getLogsPage`)
- Pure helpers + tests: `src/components/admin/paginationMath.ts`, `paginationMath.test.mts`

---

## 1. Style rules (owner decision: keep the existing Frozen look)

The owner rejected a full redesign, so admin pages should look like the shop, orders and
profile pages. Don't invent a new visual language.

| Use | Instead of |
| --- | --- |
| `AdminPageHeader` with eyebrow `SERVERS` and Thai title `จัดการเซิร์ฟเวอร์` | English `<h1>Server Management</h1>`, or mixed English/Thai headings |
| `AdminPanel` (= `.glass-card`) | `bg-black/60`, `bg-gray-900`, `bg-black` boxes |
| `AdminTable*` (iris-midnight surface, hairline borders) | plain `<table>` on black, `bg-black/40` thead |
| `AdminButton variant="primary"` (= `.btn-primary`, pearl pill) | `bg-green-600`, `bg-emerald-*`, `bg-blue-*` buttons |
| `AdminButton variant="secondary"` (= `.btn-secondary`) | gray outline buttons |
| `AdminButton variant="danger"` / `AdminIconButton tone="danger"` | `text-red-400` links, `bg-red-600` |
| `StatusBadge tone=…` | `bg-green-600/20 text-green-400` pills |
| `text-iris-pearl` (primary text), `text-iris-muted` (secondary) | `text-gray-300/400/500`, `text-white/60` |
| `className={adminInputClass}` (= `.input`) | `bg-black/40 border-gray-700 focus:border-green-500` |
| `ConfirmDialog` / `AdminDialog` | `window.confirm`, hand-rolled `fixed inset-0` modals |
| `AdminNotice` | ad-hoc green/red message boxes |
| lucide icons (`Pencil`, `Trash2`, `RotateCw`, `Copy`) | emoji buttons (📋 🔄) |

Banned patterns. Remove them when you touch a page:

- Sparkle icons (`Sparkles`, `Wand`), `magic-*` classes, emoji used as decoration
- Glow, pulse, shimmer and float animations: `animate-pulse`, `animate-shimmer`, `animate-pulse-glow`,
  `animate-neon-pulse`, `animate-border-glow`, `animate-float*`, `shadow-[0_0_…]` glows
- New gradients and gradient text (`bg-gradient-*`, `text-gradient-*`) in admin
- Pure black or gray surfaces: `bg-black`, `bg-black/40…80`, `bg-gray-8xx/9xx`, `border-gray-7xx`
- Green or emerald as a brand colour (`bg-green-*`, `bg-emerald-*`, `text-green-*`, `focus:border-green-500`).
  Emerald appears only inside `StatusBadge tone="success"`.
- `font-black` and `font-extrabold` (the frozen CSS flattens them to 600 anyway). Use `font-semibold`.
- Uppercase Thai, and English-only labels. User-facing text is Thai. A small English **eyebrow** is fine.

Status tones: `success` = healthy/online/active, `warning` = drain/pending/needs attention,
`danger` = failed/banned/revoked, `info` = neutral highlight (cyan), `neutral` = off/unknown.
Always pair a colour with a text label.

---

## 2. Pagination: how it behaves

URL params (per table): `?page=2&size=50&q=island&gameMode=PVE&status=online`

- `page` is 1-based and omitted when it is 1. `size` is one of `10 | 25 | 50 | 100`. `q` is the trimmed
  search, capped at 100 characters. Filters use their own names. `''` means "all" and is never written.
- Invalid values in the URL fall back to defaults: `page=abc` → 1, `size=30` → 25 (nearest),
  `gameMode=FOO` → all.
- The URL is the source of truth, so refresh and back/forward keep the position. Writes use
  `window.history.replaceState`, which Next.js syncs with `useSearchParams`. This adds no history
  entries, doesn't scroll, doesn't refetch the RSC payload, and is synchronous. Synchronous matters:
  two quick "next" clicks land on page 3, and two tables on one page can't overwrite each other.
- `pageSize` is remembered per table key in localStorage (`iris-admin:page-size:<key>`). Storage
  failures are ignored. The first fetch waits until the stored size has been read, so there's no
  wasted 25-row fetch.
- Changing the page size keeps the first visible row on screen:
  `newPage = floor((page-1) * oldSize / newSize) + 1`.
- Changing the search or any filter resets to page 1 in the same URL write, so there's one fetch.
  Search is debounced by 300 ms; Enter commits immediately and Escape or ✕ clears it.
- react-query key: `[key, page, pageSize, search, filters]` with `placeholderData: keepPreviousData`.
  The table keeps its rows (slightly dimmed) and the footer shows `· กำลังโหลด…`.
- If the server returns a different, clamped page (for example, the last row of the last page was
  deleted, or `?page=999` was typed), the hook adopts it and rewrites the URL. If a page comes back
  empty while `page > 1`, the hook steps back one page. Both checks run only on settled data for
  the current request, so a slow response for an old page is never acted on.
- After create, update or delete, call `list.invalidate()`. Every page of that table refetches, and
  the server-side clamp handles a page that is now empty.

Backward compatibility: each `*Page` API method sends `page`, `pageSize` and, for endpoints that
used `page`/`limit` before, `limit` as well. If a backend still returns the whole list without a
`pagination` object, the method filters and slices it in the browser, so pages work during a
rolling deploy.

---

## 3. Building a server-paginated list (complete example)

```tsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  AdminButton, AdminFilterSelect, AdminIconButton, AdminPage, AdminPageHeader, AdminPanel,
  AdminSuspense, AdminTable, AdminTableBody, AdminTableHead, AdminTd, AdminTh, AdminToolbar,
  AdminTr, ConfirmDialog, Pagination, SegmentedTabs, StatusBadge,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { adminApi, GAME_MODE_FILTERS, SERVER_STATUS_FILTERS, type AdminServerRow } from '@/lib/api';

const MODE_LABEL: Record<string, string> = { PVE: 'PvE', PVE_MOD: 'PvE Mod', PVPVE: 'PvPvE', NONE: 'ไม่ระบุ' };

function ServersAdmin() {
  const list = usePaginatedQuery({
    key: 'admin-servers',                 // react-query key + remembered page size
    fetcher: adminApi.getServersPage,     // (request, signal) => Promise<PageResult & extras>
    filters: {                            // declared filters -> URL params; values validated
      gameMode: { values: GAME_MODE_FILTERS },
      status: { values: SERVER_STATUS_FILTERS },
      clusterId: {},                      // free-form (ids)
    },
  });

  const [deleting, setDeleting] = useState<AdminServerRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => adminApi.deleteServer(id),
    onSuccess: () => list.invalidate(),   // server clamps the page if it became empty
  });

  const counts = list.data?.counts;       // endpoint extras live on list.data
  const COLS = 5;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="SERVERS"
        title="จัดการเซิร์ฟเวอร์"
        description="รายการเซิร์ฟเวอร์ทั้งหมดในคลัสเตอร์ แยกตามโหมดเกม"
        actions={<AdminButton variant="primary" icon={<Plus />}>เพิ่มเซิร์ฟเวอร์</AdminButton>}
      />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อ แผนที่ หรือโฮสต์…">
          <AdminFilterSelect
            label="สถานะ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={[
              { value: 'online', label: 'ออนไลน์' },
              { value: 'offline', label: 'ออฟไลน์' },
              { value: 'active', label: 'เปิดใช้งาน' },
              { value: 'inactive', label: 'ปิดใช้งาน' },
            ]}
          />
        </AdminToolbar>
        <div className="border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามโหมดเกม"
            value={list.filters.gameMode}
            onChange={(v) => list.setFilter('gameMode', v)}
            options={[
              { value: '', label: 'ทั้งหมด', count: counts?.all },
              ...GAME_MODE_FILTERS.map((m) => ({ value: m, label: MODE_LABEL[m], count: counts?.[m] })),
            ]}
          />
        </div>

        <AdminTable caption="รายการเซิร์ฟเวอร์" busy={list.isFetching}>
          <AdminTableHead>
            <tr>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh>คลัสเตอร์</AdminTh>
              <AdminTh>โหมด</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบเซิร์ฟเวอร์ที่ตรงกับตัวกรอง' : 'ยังไม่มีเซิร์ฟเวอร์'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((s) => (
              <AdminTr key={s.id}>
                <AdminTd>
                  <div className="font-semibold">{s.displayName ?? s.name}</div>
                  <div className="text-xs text-iris-muted">{s.map ?? '—'}</div>
                </AdminTd>
                <AdminTd muted>{s.cluster?.name ?? 'ไม่ระบุ'}</AdminTd>
                <AdminTd>{MODE_LABEL[s.gameMode ?? 'NONE']}</AdminTd>
                <AdminTd>
                  <StatusBadge tone={s.online ? 'success' : 'neutral'} dot>
                    {s.online ? 'ออนไลน์' : 'ออฟไลน์'}
                  </StatusBadge>
                </AdminTd>
                <AdminTd align="right" nowrap>
                  <AdminIconButton aria-label={`แก้ไข ${s.name}`}><Pencil /></AdminIconButton>
                  <AdminIconButton tone="danger" aria-label={`ลบ ${s.name}`} onClick={() => setDeleting(s)}>
                    <Trash2 />
                  </AdminIconButton>
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTableBody>
        </AdminTable>

        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutateAsync(deleting!.id)}   // async: spinner, closes on success, shows error on failure
        title="ลบเซิร์ฟเวอร์นี้?"
        description="การลบไม่สามารถย้อนกลับได้"
        confirmText="ลบเซิร์ฟเวอร์"
        confirmPhrase={deleting?.name}                         // optional type-to-confirm
      />
    </AdminPage>
  );
}

// REQUIRED: the hooks use useSearchParams -> must be under Suspense or `next build` fails.
export default function Page() {
  return (
    <AdminSuspense>
      <ServersAdmin />
    </AdminSuspense>
  );
}
```

This example was typechecked and linted against the kit (tsc + eslint clean).

Checklist for each page:

1. Wrap the default export in `<AdminSuspense>`.
2. Pick a unique `key` (`admin-servers`, `admin-products`, `admin-users`, …). Invalidate with `list.invalidate()`.
   Don't reuse an old key like `['admin-users', page, search]`.
3. Declare every filter in `filters`, with `values` when the set is fixed, so bad URL values can't
   cause a 400 from the backend.
4. `AdminTableBody colSpan` must equal the number of columns.
5. Remove any per-page `useState(page)` or `useState(search)`. The hook owns that state.
6. Remove the old `useEffect` redirect and auth checks only if the page team agrees. The kit doesn't
   change auth.

### Two tables on one page

Give the second table a prefix: `usePaginatedQuery({ key: 'admin-protection-logs', paramPrefix: 'logs_', … })`
gives `?logs_page=2&logs_size=50&logs_q=…`.

### Tables inside a dialog

Pass `syncUrl: false` to keep the state local and leave the URL alone.

---

## 4. Small lists: client-side pagination

For endpoints that return a short, complete list, use the same UI with local slicing:

```tsx
const { data } = useQuery({ queryKey: ['admin-clusters'], queryFn: () => api.get('/admin/clusters').then((r) => r.data.clusters) });
const list = useClientPagination<Cluster>(data /* undefined while loading */, 'admin-clusters', {
  filter: (c, { search }) => !search || c.name.toLowerCase().includes(search.toLowerCase()),
});
// list.items, list.paginationProps, list.searchInput / setSearchInput, list.filteredItems
<AdminToolbar list={list} />
…
<Pagination {...list.paginationProps} />
```

Pass `undefined` while loading, so a `?page=3` in the URL isn't clamped to 1 before the data arrives.

---

## 5. API reference (exact exports)

### `@/hooks/usePaginatedQuery`

| Export | Kind | Notes |
| --- | --- | --- |
| `usePaginatedQuery(options)` | hook | `options`: `key`, `fetcher(request, signal)`, `filters?`, `paramPrefix?`, `syncUrl?`, `defaultPageSize?`, `debounceMs?`, `enabled?`, `staleTime?` (15 s), `refetchInterval?` |
| `useClientPagination(items \| undefined, key, options?)` | hook | `options.filter(item, { search, filters })` plus the state options |
| `usePaginationState(options)` | hook | state only (URL, size, debounce); the two hooks above build on it |
| `PaginationStateOptions`, `PaginatedQueryOptions`, `PaginatedQueryResult`, `ClientPaginationOptions`, `ClientPaginationResult`, `PaginationStateResult`, `PaginationProps`, `FilterSpec` | types | |

`usePaginatedQuery` returns `items`, `data` (full result including extras such as `counts`),
`pagination` `{page,pageSize,total,totalPages}`, `paginationProps`, `isInitialLoading`, `isFetching`,
`isPlaceholderData`, `isError`, `error`, `refetch()`, `invalidate()`, `queryKey`, `page`, `pageSize`,
`search`, `searchInput`, `setSearchInput()`, `flushSearch()`, `clearSearch()`, `filters`, `setFilter()`,
`setFilters()`, `resetAll()`, `setPage()`, `setPageSize()`, `request`, `isFiltered`, `ready`.

### `@/components/admin`

| Export | Purpose |
| --- | --- |
| `AdminPage` | page root (vertical rhythm) |
| `AdminPageHeader` `{eyebrow, title, description?, actions?}` | heading |
| `AdminPanel` `{title?, description?, actions?, flush?}` | `.glass-card` section |
| `AdminNotice` `{tone, title?, onDismiss?}` | inline success/error/warning/info message |
| `AdminToolbar` `{list? \| searchValue/onSearchChange/onSearchSubmit/onSearchClear, searchPlaceholder?, children (filters), end?, variant?}` | search + filter row |
| `AdminSearchInput`, `AdminFilterSelect` `{label, value, onChange, options, allLabel?}` | toolbar controls |
| `AdminField` `{label, hint?, error?, required?, children: (field) => control}` | form field for dialogs |
| `adminInputClass` | `'input'`: the site's field class |
| `AdminTable` `{caption?, maxHeight? ('min(72vh, 880px)' \| 'none'), minWidth? (720), busy?}` | scroll container + table (sticky header) |
| `AdminTableHead`, `AdminTh` `{align?}`, `AdminTr` `{selected?}`, `AdminTd` `{align?, muted?, mono?, nowrap?}` | table parts |
| `AdminTableBody` `{colSpan, isInitialLoading?, isPlaceholderData?, isError?, onRetry?, errorMessage?, isEmpty?, emptyTitle?, emptyDescription?, emptyAction?, skeletonRows?}` | body with loading, empty and error states |
| `AdminTableSkeletonRows`, `AdminTableEmptyRow`, `AdminTableErrorRow` | the individual state rows |
| `StatusBadge` `{tone: 'success'\|'warning'\|'danger'\|'neutral'\|'info', dot?}` | row status pill |
| `AdminButton` `{variant: 'primary'\|'secondary'\|'danger'\|'ghost', size: 'sm'\|'md', loading?, icon?}` | buttons |
| `AdminIconButton` `{'aria-label' (required), tone?}` | 40 px row-action icon button |
| `AdminDialog` `{open, onClose, title, description?, footer?, size?, busy?, initialFocusRef?, role?, placement?}` | themed modal for forms (portal, Escape, focus trap, focus restore, scroll lock). `placement="right"` = full-height side drawer for row details (used by /admin/transactions) |
| `ConfirmDialog` `{open, onClose, onConfirm (may be async), title, description?, confirmText?, cancelText?, tone?, confirmPhrase?, loading?}` | destructive confirmation |
| `SegmentedTabs` `{value, onChange, options: {value,label,count?}[], 'aria-label'}` | single-choice filter (radiogroup, arrow keys) |
| `Pagination` `{page, pageSize, total, onPageChange, onPageSizeChange, isBusy?, isUnknown?, pageSizeOptions?, hidePageSize?}` | footer: range label, rows-per-page, first/prev/numbers/next/last; collapses to `หน้า 2/5` on mobile |
| `AdminSuspense` `{fallback?}` | required Suspense wrapper |
| `PAGE_SIZE_OPTIONS`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `MAX_SEARCH_LENGTH`, `isPageSizeOption`, `normalizePageSize`, `parsePage`, `normalizeSearch`, `computeTotalPages`, `clampPage`, `computeRange`, `pageAfterSizeChange`, `pageItems`, `formatCount`, `formatRangeLabel`, `normalizePageResponse`, `paginateLocally` | pure helpers |
| `PageSizeOption`, `PaginationMeta`, `PageRequest`, `PageResult`, `RawPagination`, `PageItem` + all component prop types | types |

### `@/lib/api` (additions; old methods unchanged)

Every method has the signature `(request: { page, pageSize, search?, filters? }, signal?) => Promise<PageResult<Row>>`.
You can pass it directly as `fetcher`.

| Method | Endpoint | Filters | Row type |
| --- | --- | --- | --- |
| `adminApi.getServersPage` | `GET /admin/servers` | `gameMode` (PVE, PVE_MOD, PVPVE, NONE), `clusterId` (id or `none`), `status` (active, inactive, online, offline) | `AdminServerRow`; result also has `counts: ServerModeCounts \| null` (`AdminServersPage`) |
| `adminApi.getProductsPage` | `GET /admin/products` | `categoryId` (id or `none`), `productType`, `isActive` (`true`/`false`) | `AdminProductRow` |
| `adminApi.getUsersPage` | `GET /admin/users` | none (search only) | `AdminUserRow` |
| `adminApi.getApiKeysPage` | `GET /admin/api-keys` | none | `AdminApiKeyRow` (keys masked) |
| `adminApi.getCategoriesPage` | `GET /admin/categories` | none | `AdminCategoryRow` |
| `adminApi.getChatRanksPage` | `GET /admin/chat-ranks` | `serverId` (`0` = global only) | `AdminChatRankRow` |
| `contentApi.getPagesPage` | `GET /content/admin/pages` | `pageType` | `AdminContentPageRow` |
| `protectionAdminApi.getProtectionsPage` | `GET /admin/protection` | `type`, `isActive` | `AdminProtectionRow` |
| `protectionAdminApi.getLogsPage` | `GET /admin/protection/logs` | `eventType`, `steamId`, `serverId` | `AdminProtectionLogRow` |

Also exported: `AdminListRequest`, `GameMode`, `GameModeFilter`, `GAME_MODE_FILTERS`, `ServerStatusFilter`,
`SERVER_STATUS_FILTERS`, `AdminServerFilter`, `ServerModeCounts`, `AdminServersPage`, `ProductType`,
`PRODUCT_TYPES`, `AdminProductFilter`, and re-exports of `PageRequest` and `PageResult`.

Security note: server list rows never include the full plugin `apiKey`, only `apiKeyLast4`. A
legacy key that an old backend still sends is stripped in `toServerRow`. "Copy API key" in the
servers page has to use the key returned once by `POST /admin/servers/:id/regenerate-key`.

---

## 6. Verifying the helpers

```bash
cd frontend
node --no-warnings --test src/components/admin/paginationMath.test.mts   # 15 tests, pure Node, no runner
npx tsc --noEmit
npx eslint src/components/admin src/hooks/usePaginatedQuery.ts src/lib/api.ts
```

(Never run `next build` or `next dev` on the F: drive. See PROGRESS.md.)

---

## 7. Money / ledger pages (/admin/transactions)

- Amounts are decimal **strings** from the API. Format with `formatIc` (`@/lib/adminTransactionsMath`); never
  `Number()` them. Signed amounts use `<TransactionAmount>` (`text-iris-credit` = money in,
  `text-iris-debit` = money out, mono digits, `sr-only` "เข้า/ออก" so colour is never the only signal).
- Times are shown in Bangkok time (`formatBangkokDateTime`). Date filters keep Bangkok days (`YYYY-MM-DD`)
  in the URL; `adminTransactionsApi` converts them to ISO instants at 00:00 / 23:59:59.999 +07:00.
- Building blocks: `src/components/admin/transactions/*` (`TransactionBits`, `TransactionDetailDrawer`,
  `RecentTransactionsPanel`, `LedgerMismatchBanner`). Helper tests:
  `node --no-warnings --test src/lib/adminTransactionsMath.test.mts`.
