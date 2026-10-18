'use client';

/**
 * /admin/transactions — every ledger transaction (owner: "admin must know EVERY transaction").
 * admin | root. Contract: backend/contracts/admin-transactions-2026-10.md
 *
 *   - today's summary strip (Bangkok day)
 *   - filters: search, type, Bangkok date range, direction (+ userId / referenceType from the URL)
 *   - server-paginated table, row detail drawer, CSV export
 *   - live: 'admin:transaction' prepends rows on page 1 when the filters certainly match;
 *     otherwise a "มีรายการใหม่ N รายการ" pill refreshes the view.
 */
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ListChecks, Loader2, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react';
import {
  AdminButton,
  AdminFilterSelect,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminSuspense,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminToolbar,
  AdminTr,
  Pagination,
  SegmentedTabs,
  adminInputClass,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store';
import { onSocketEvent, useSocketStatus } from '@/lib/socket';
import { REALTIME_EVENTS, type AdminTransactionEvent } from '@/lib/realtime/events';
import {
  TRANSACTION_DIRECTIONS,
  adminTransactionsApi,
  transactionsErrorText,
  type AdminTransactionRow,
  type AdminTransactionsPage,
} from '@/lib/adminTransactionsApi';
import {
  CATEGORY_LABEL_TH,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
  asDebit,
  bangkokDate,
  formatBangkokDateTime,
  formatBangkokDay,
  formatIc,
  isIsoDate,
  matchLiveEvent,
  referenceTypeLabel,
  toAmountString,
  transactionCategory,
  transactionTypeLabel,
} from '@/lib/adminTransactionsMath';
import {
  IcNumber,
  SummaryTile,
  TransactionAmount,
  TransactionReference,
  TransactionTypeBadge,
} from '@/components/admin/transactions/TransactionBits';
import { TransactionDetailDrawer } from '@/components/admin/transactions/TransactionDetailDrawer';

const LIST_KEY = 'admin-transactions';
const SUMMARY_KEY = 'admin-transactions-summary';
const DATE_PATTERN = '\\d{4}-\\d{2}-\\d{2}';
/** Debounce for refetching after live events (bursts at checkout produce many). */
const LIVE_REFRESH_MS = 2_500;
/** How long a freshly prepended row stays highlighted. */
const FRESH_MS = 8_000;
const COLS = 8;

const DIRECTION_OPTIONS = [
  { value: 'in', label: 'เงินเข้า (+)' },
  { value: 'out', label: 'เงินออก (−)' },
];

function daysAgo(days: number): string {
  return bangkokDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function toLiveRow(event: AdminTransactionEvent): AdminTransactionRow {
  const type = typeof event.type === 'string' ? event.type : '';
  const userId = typeof event.user?.id === 'string' ? event.user.id : null;
  return {
    id: event.id,
    type,
    typeLabelTh: transactionTypeLabel(type, event.typeLabelTh),
    category: transactionCategory(type),
    createdAt: event.createdAt ?? new Date().toISOString(),
    postedAt: event.createdAt ?? null,
    createdBy: null,
    description: null,
    referenceType: typeof event.referenceType === 'string' ? event.referenceType : null,
    referenceId: typeof event.referenceId === 'string' ? event.referenceId : null,
    referenceLink: null,
    user: userId ? { id: userId, name: event.user?.name ?? null, steamId: null } : null,
    amount: toAmountString(event.amount),
    balanceAfter: null,
    refundableAfter: null,
    entriesCount: null,
    live: true,
  };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/* ------------------------------------------------------------------ */

function TodaySummary({ today }: { today: string }) {
  const summary = useQuery({
    queryKey: [SUMMARY_KEY, today],
    queryFn: ({ signal }) => adminTransactionsApi.getSummary(today, signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const s = summary.data;
  const loading = summary.isLoading;
  return (
    <AdminPanel
      title="สรุปวันนี้"
      description={`${formatBangkokDay(today)} · ตามเวลาไทย 00:00–23:59 น.`}
      actions={
        summary.isFetching && !loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-iris-muted" aria-label="กำลังอัปเดต" />
        ) : undefined
      }
    >
      {summary.isError ? (
        <p className="text-sm text-iris-muted">โหลดสรุปวันนี้ไม่สำเร็จ · {transactionsErrorText(summary.error, 'โปรดลองอีกครั้ง')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SummaryTile label="เติมเหรียญ" value={s?.topups.amount} count={s?.topups.count} loading={loading} />
          <SummaryTile label="ซื้อสินค้า" value={s?.purchases.amount} count={s?.purchases.count} loading={loading} />
          <SummaryTile label="คืนเหรียญ" value={s?.refunds.amount} count={s?.refunds.count} loading={loading} />
          <SummaryTile
            label="ปรับยอดโดยผู้ดูแล"
            value={s?.adjustments.amount}
            count={s?.adjustments.count}
            signed
            loading={loading}
          />
          <SummaryTile label="ตลาดผู้เล่น (P2P)" value={s?.p2p.amount} count={s?.p2p.count} loading={loading} />
          <SummaryTile label="สุทธิ" value={s?.net.amount} count={s?.net.count} signed loading={loading} />
        </div>
      )}
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ */

function TransactionsAdmin() {
  const authLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const { isAdmin, isRoot } = usePermissions();
  const queryClient = useQueryClient();

  const list = usePaginatedQuery<AdminTransactionsPage>({
    key: LIST_KEY,
    fetcher: adminTransactionsApi.getPage,
    filters: {
      // Backend accepts a comma list of up to 20 types.
      type: { pattern: '[a-z0-9_]{1,64}(,[a-z0-9_]{1,64}){0,19}' },
      category: { values: TRANSACTION_CATEGORIES },
      userId: { pattern: '[A-Za-z0-9_:.-]{1,128}' },
      referenceType: { pattern: '[a-z0-9_]{1,64}' },
      from: { pattern: DATE_PATTERN },
      to: { pattern: DATE_PATTERN },
      direction: { values: TRANSACTION_DIRECTIONS },
    },
    enabled: isAdmin,
  });

  const today = bangkokDate();
  const [selected, setSelected] = useState<AdminTransactionRow | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  // New events the current view could not show. Tied to the request they were counted for,
  // so a new page / filter / search starts from zero without a state-resetting effect.
  const [pending, setPending] = useState<{ key: string; ids: ReadonlySet<string> }>(() => ({ key: '', ids: new Set() }));
  const requestKey = JSON.stringify(list.request);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ---- live updates ------------------------------------------------------
  const ctxRef = useRef({
    requestKey,
    page: list.page,
    search: list.search,
    filters: list.filters,
    queryKey: list.queryKey,
    pageSize: list.pageSize,
    settled: !list.isPlaceholderData && !list.isError && Boolean(list.data),
  });
  useEffect(() => {
    ctxRef.current = {
      requestKey,
      page: list.page,
      search: list.search,
      filters: list.filters,
      queryKey: list.queryKey,
      pageSize: list.pageSize,
      settled: !list.isPlaceholderData && !list.isError && Boolean(list.data),
    };
  });

  // Trailing refresh at most every LIVE_REFRESH_MS: a steady stream of events cannot starve it,
  // and a list refresh requested by one event is never dropped by a later summary-only one.
  const refreshTimer = useRef<number | null>(null);
  const refreshList = useRef(false);
  const scheduleRefresh = useCallback(
    (includeList: boolean) => {
      if (includeList) refreshList.current = true;
      if (refreshTimer.current !== null) return;
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        const withList = refreshList.current;
        refreshList.current = false;
        void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
        if (withList) void queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
      }, LIVE_REFRESH_MS);
    },
    [queryClient],
  );
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!isAdmin) return;
    return onSocketEvent<AdminTransactionEvent>(REALTIME_EVENTS.adminTransaction, (event) => {
      if (!event || typeof event.id !== 'string' || !event.id) return;
      const ctx = ctxRef.current;
      const match = matchLiveEvent(event, { search: ctx.search, filters: ctx.filters });
      if (match === 'no') {
        scheduleRefresh(false);
        return;
      }
      if (match === 'yes' && ctx.page === 1 && ctx.settled) {
        // Prepend into the cached page now; the debounced refetch replaces it with the full row.
        queryClient.setQueryData<AdminTransactionsPage>(ctx.queryKey, (old) => {
          if (!old || old.items.some((r) => r.id === event.id)) return old;
          const items = [toLiveRow(event), ...old.items].slice(0, ctx.pageSize);
          return {
            ...old,
            items,
            pagination: { ...old.pagination, total: old.pagination.total + 1 },
            totals: old.totals ? { ...old.totals, count: old.totals.count === null ? null : old.totals.count + 1 } : old.totals,
          };
        });
        setFreshIds((prev) => new Set(prev).add(event.id));
        window.setTimeout(() => {
          setFreshIds((prev) => {
            if (!prev.has(event.id)) return prev;
            const next = new Set(prev);
            next.delete(event.id);
            return next;
          });
        }, FRESH_MS);
        scheduleRefresh(true);
        return;
      }
      setPending((prev) => {
        const key = ctxRef.current.requestKey;
        const ids = prev.key === key ? prev.ids : new Set<string>();
        if (ids.has(event.id)) return prev;
        return { key, ids: new Set(ids).add(event.id) };
      });
      scheduleRefresh(false);
    });
  }, [isAdmin, queryClient, scheduleRefresh]);

  // Events may have been missed while the socket was down.
  const connectCount = useSocketStatus((s) => s.connectCount);
  useEffect(() => {
    if (connectCount <= 1) return;
    void queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
    void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
  }, [connectCount, queryClient]);

  const refreshNow = () => {
    setPending({ key: requestKey, ids: new Set() });
    void list.invalidate();
    void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
  };

  // ---- export --------------------------------------------------------------
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await adminTransactionsApi.exportCsv({ search: list.search, filters: list.request.filters });
      saveBlob(blob, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'ส่งออกไฟล์ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  // ---- filter helpers ------------------------------------------------------
  // Types of the selected category (all types when none), plus a type from the URL nobody knows.
  const typeOptions = useMemo(() => {
    const category = list.filters.category;
    const base = TRANSACTION_TYPES.filter((t) => !category || t.category === category).map((t) => ({
      value: t.type,
      label: t.labelTh,
    }));
    if (list.filters.type && !base.some((o) => o.value === list.filters.type)) {
      const label = list.filters.type.includes(',')
        ? `${list.filters.type.split(',').length} ประเภท (จากลิงก์)`
        : transactionTypeLabel(list.filters.type);
      return [...base, { value: list.filters.type, label }];
    }
    return base;
  }, [list.filters.category, list.filters.type]);

  const { from, to } = list.filters;
  const rangeInverted = isIsoDate(from) && isIsoDate(to) && from > to;
  const presetToday = from === today && to === today;
  const preset7 = from === daysAgo(6) && to === today;
  const preset30 = from === daysAgo(29) && to === today;

  const userFilterName = useMemo(() => {
    if (!list.filters.userId) return null;
    const hit = list.items.find((r) => r.user?.id === list.filters.userId);
    return hit?.user?.name ?? null;
  }, [list.filters.userId, list.items]);

  // ---- guards ------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-iris-muted">
        <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" aria-hidden="true" />
        <span className="text-sm">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }
  if (!user || !isAdmin) {
    return (
      <AdminPanel className="text-center">
        <div className="py-8">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-200" aria-hidden="true" />
          <p className="text-base font-semibold text-iris-pearl">
            {user ? 'หน้านี้สำหรับผู้ดูแลระบบ (Admin) และผู้ดูแลสูงสุด (Root) เท่านั้น' : 'กรุณาเข้าสู่ระบบ'}
          </p>
        </div>
      </AdminPanel>
    );
  }

  const totals = list.data?.totals ?? null;
  const pendingCount = pending.key === requestKey ? pending.ids.size : 0;

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="TRANSACTIONS"
        title="ธุรกรรมทั้งหมด"
        description="ทุกการเคลื่อนไหวของเหรียญในสมุดบัญชี (ledger) ทั้งเติมเหรียญ ซื้อสินค้า คืนเหรียญ ปรับยอด และตลาดผู้เล่น อัปเดตแบบเรียลไทม์"
        actions={
          <>
            {isRoot && (
              <Link href="/admin/transactions/reconcile" className="btn-secondary min-h-9 gap-1.5 px-3.5 py-1.5 text-xs">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                ตรวจสอบยอดบัญชี
              </Link>
            )}
            <AdminButton variant="secondary" icon={<ArrowDownToLine />} loading={exporting} onClick={handleExport}>
              ส่งออก CSV
            </AdminButton>
          </>
        }
      />

      {exportError && (
        <AdminNotice tone="danger" title="ส่งออกไฟล์ไม่สำเร็จ" onDismiss={() => setExportError(null)}>
          {exportError}
        </AdminNotice>
      )}

      <TodaySummary today={today} />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อ Discord, Steam ID, Discord ID, รหัสธุรกรรม, รหัสอ้างอิง หรือคำอธิบาย…">
          <AdminFilterSelect
            label="ประเภท"
            value={list.filters.type}
            onChange={(v) => list.setFilter('type', v)}
            options={typeOptions}
          />
          <AdminFilterSelect
            label="ทิศทาง"
            value={list.filters.direction}
            onChange={(v) => list.setFilter('direction', v)}
            options={DIRECTION_OPTIONS}
          />
          <div className="flex min-w-[9.5rem] flex-col gap-1.5">
            <label htmlFor="txn-from" className="text-xs font-semibold text-iris-muted">
              ตั้งแต่วันที่
            </label>
            <input
              id="txn-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => list.setFilter('from', e.target.value)}
              className={adminInputClass}
            />
          </div>
          <div className="flex min-w-[9.5rem] flex-col gap-1.5">
            <label htmlFor="txn-to" className="text-xs font-semibold text-iris-muted">
              ถึงวันที่
            </label>
            <input
              id="txn-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => list.setFilter('to', e.target.value)}
              className={adminInputClass}
            />
          </div>
        </AdminToolbar>

        <div className="overflow-x-auto border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามหมวดธุรกรรม"
            value={list.filters.category}
            onChange={(v) => {
              const keepType = TRANSACTION_TYPES.some((t) => t.type === list.filters.type && (!v || t.category === v));
              list.setFilters({ category: v, type: keepType ? list.filters.type : '' });
            }}
            options={[
              { value: '', label: 'ทั้งหมด' },
              ...TRANSACTION_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL_TH[c] })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3 text-xs">
          <span className="text-iris-muted">ช่วงเวลา:</span>
          <AdminButton
            size="sm"
            variant={presetToday ? 'secondary' : 'ghost'}
            aria-pressed={presetToday}
            onClick={() => list.setFilters({ from: today, to: today })}
          >
            วันนี้
          </AdminButton>
          <AdminButton
            size="sm"
            variant={preset7 ? 'secondary' : 'ghost'}
            aria-pressed={preset7}
            onClick={() => list.setFilters({ from: daysAgo(6), to: today })}
          >
            7 วัน
          </AdminButton>
          <AdminButton
            size="sm"
            variant={preset30 ? 'secondary' : 'ghost'}
            aria-pressed={preset30}
            onClick={() => list.setFilters({ from: daysAgo(29), to: today })}
          >
            30 วัน
          </AdminButton>
          {(from || to) && (
            <AdminButton size="sm" variant="ghost" onClick={() => list.setFilters({ from: '', to: '' })}>
              ทุกช่วงเวลา
            </AdminButton>
          )}
          {list.filters.userId && (
            <span className="inline-flex items-center gap-1 rounded-full border border-iris-cyan/30 bg-iris-cyan/[0.08] py-0.5 pl-2.5 pr-1 text-iris-pearl">
              ลูกค้า: {userFilterName ?? <span className="font-mono">{list.filters.userId}</span>}
              <button
                type="button"
                onClick={() => list.setFilter('userId', '')}
                aria-label="ล้างตัวกรองลูกค้า"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-iris-muted hover:bg-white/[0.08] hover:text-iris-pearl"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {list.filters.referenceType && (
            <span className="inline-flex items-center gap-1 rounded-full border border-iris-cyan/30 bg-iris-cyan/[0.08] py-0.5 pl-2.5 pr-1 text-iris-pearl">
              อ้างอิง: {referenceTypeLabel(list.filters.referenceType)}
              <button
                type="button"
                onClick={() => list.setFilter('referenceType', '')}
                aria-label="ล้างตัวกรองประเภทอ้างอิง"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-iris-muted hover:bg-white/[0.08] hover:text-iris-pearl"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {list.isFiltered && (
            <AdminButton size="sm" variant="ghost" onClick={list.resetAll}>
              ล้างตัวกรองทั้งหมด
            </AdminButton>
          )}
          {rangeInverted && <span className="text-amber-100">วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด</span>}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3 text-xs"
          aria-live="polite"
        >
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-center gap-1.5">
              <dt className="text-iris-muted">ตามตัวกรอง</dt>
              <dd className="font-mono tabular-nums text-iris-pearl">
                {totals?.count != null ? totals.count.toLocaleString('th-TH') : list.isInitialLoading ? '…' : list.pagination.total.toLocaleString('th-TH')}{' '}
                <span className="font-sans text-iris-muted">รายการ</span>
              </dd>
            </div>
            {totals && (
              <>
                <div className="flex items-center gap-1.5">
                  <dt className="text-iris-muted">เข้า</dt>
                  <dd>
                    <TransactionAmount value={totals.in} />
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-iris-muted">ออก</dt>
                  <dd>
                    <TransactionAmount value={asDebit(totals.out)} />
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-iris-muted">สุทธิ</dt>
                  <dd>
                    <TransactionAmount value={totals.net} />
                  </dd>
                </div>
              </>
            )}
          </dl>
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={refreshNow}
              className="inline-flex items-center gap-1.5 rounded-full border border-iris-cyan/30 bg-iris-cyan/[0.08] px-3 py-1 font-semibold text-iris-pearl hover:bg-iris-cyan/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              มีรายการใหม่ {pendingCount.toLocaleString('th-TH')} รายการ
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-iris-muted">
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              {list.page === 1 && !list.search ? 'รายการใหม่จะแสดงอัตโนมัติ' : 'อัปเดตเมื่อกดรีเฟรช'}
            </span>
          )}
        </div>

        <AdminTable caption="รายการธุรกรรม" busy={list.isFetching} minWidth={1040}>
          <AdminTableHead>
            <tr>
              <AdminTh>เวลา (ไทย)</AdminTh>
              <AdminTh>ประเภท</AdminTh>
              <AdminTh>ลูกค้า</AdminTh>
              <AdminTh align="right">จำนวน (IC)</AdminTh>
              <AdminTh align="right">คงเหลือหลังรายการ</AdminTh>
              <AdminTh>อ้างอิง</AdminTh>
              <AdminTh>ทำรายการโดย</AdminTh>
              <AdminTh align="right">
                <span className="sr-only">รายละเอียด</span>
              </AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            errorMessage={list.isError ? transactionsErrorText(list.error, 'โหลดรายการธุรกรรมไม่สำเร็จ โปรดลองอีกครั้ง') : undefined}
            onRetry={list.refetch}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบธุรกรรมที่ตรงกับตัวกรอง' : 'ยังไม่มีธุรกรรม'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างตัวกรอง
                </AdminButton>
              ) : undefined
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((t) => {
              const fresh = freshIds.has(t.id);
              return (
                <AdminTr
                  key={t.id}
                  selected={selected?.id === t.id}
                  className={fresh ? 'bg-iris-cyan/[0.05]' : undefined}
                  onClick={() => setSelected(t)}
                  style={{ cursor: 'pointer' }}
                >
                  <AdminTd nowrap>
                    <div className="font-mono text-xs tabular-nums">{formatBangkokDateTime(t.postedAt ?? t.createdAt)}</div>
                    {fresh && <div className="text-[11px] text-iris-cyan">ใหม่</div>}
                  </AdminTd>
                  <AdminTd>
                    <TransactionTypeBadge type={t.type} label={t.typeLabelTh} category={t.category} />
                    {t.description && (
                      <div className="mt-1 max-w-[16rem] truncate text-[11px] text-iris-muted" title={t.description}>
                        {t.description}
                      </div>
                    )}
                  </AdminTd>
                  <AdminTd>
                    {t.user ? (
                      <>
                        <div className="max-w-[12rem] truncate font-semibold">{t.user.name ?? 'ไม่มีชื่อ'}</div>
                        <div className="font-mono text-[11px] text-iris-muted">{t.user.steamId ?? t.user.id.slice(0, 12)}</div>
                      </>
                    ) : (
                      <span className="text-iris-muted">ระบบ</span>
                    )}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <TransactionAmount value={t.amount} className="text-sm font-semibold" />
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    {t.balanceAfter ? <IcNumber value={t.balanceAfter} /> : <span className="text-iris-muted">{t.live ? '…' : '—'}</span>}
                  </AdminTd>
                  <AdminTd>
                    <TransactionReference
                      referenceType={t.referenceType}
                      referenceId={t.referenceId}
                      referenceLink={t.referenceLink}
                      compact
                    />
                  </AdminTd>
                  <AdminTd muted={!t.createdBy}>
                    {t.createdBy ? (
                      <span className="max-w-[10rem] truncate">{t.createdBy.name ?? t.createdBy.id}</span>
                    ) : t.live ? (
                      '…'
                    ) : (
                      'ระบบ'
                    )}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(t);
                      }}
                      className="rounded-lg px-2 py-1 text-xs text-iris-cyan hover:bg-white/[0.05] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40"
                      aria-label={`ดูรายละเอียดธุรกรรม ${t.typeLabelTh} ${formatIc(t.amount, { signed: true })} IC`}
                    >
                      ดูรายละเอียด
                    </button>
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminTable>

        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <TransactionDetailDrawer
        row={selected}
        onClose={() => setSelected(null)}
        onFilterUser={(userId) => {
          setSelected(null);
          list.setFilter('userId', userId);
        }}
      />
    </AdminPage>
  );
}

export default function AdminTransactionsPage() {
  return (
    <AdminSuspense>
      <TransactionsAdmin />
    </AdminSuspense>
  );
}
