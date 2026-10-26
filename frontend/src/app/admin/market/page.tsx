'use client';

/**
 * /admin/market — every P2P dino listing (admin | root), read-only.
 * GET /admin/market/listings?status=. Native cryopod bytes are never returned.
 * There is no admin cancel: the backend has no escrow-safe cancel service yet.
 */
import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from '@/components/tek/arrows';
import {
  AdminButton,
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
  StatusBadge,
} from '@/components/admin';
import {
  AdminAccessGate,
  IgnoredFiltersNotice,
  LISTING_STATUS_TH,
  listingTone,
} from '@/components/admin/console/ConsoleBits';
import { VipBadgePill } from '@/components/vip/VipAvatar';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import {
  LISTING_STATUS_FILTERS,
  adminConsoleApi,
  apiErrorText,
  formatIcAmount,
  type PersonRow,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';

const LIST_KEY = 'admin-market-listings';
const COLS = 8;

function Person({ p }: { p: PersonRow | null }) {
  if (!p) return <span className="text-iris-muted">—</span>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{p.name ?? '—'}</span>
        <VipBadgePill vip={p.vip} />
      </div>
      {p.steamId && <div className="font-mono text-xs text-iris-muted">{p.steamId}</div>}
    </div>
  );
}

function MarketAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getListingsPage,
    filters: { status: { values: LISTING_STATUS_FILTERS } },
  });

  // Purchases / escrow refunds post ledger transactions with referenceType 'listing'.
  useAdminLiveRefresh(['admin:transaction', 'admin:delivery:failed'], [LIST_KEY], {
    filter: (event, payload) =>
      event !== 'admin:transaction' || (payload as { referenceType?: unknown } | null)?.referenceType === 'listing',
  });

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="P2P MARKET"
        title="ตลาดผู้เล่น"
        description="ประกาศขายไดโนระหว่างผู้เล่นทั้งหมด ทั้งที่วางขายอยู่ ขายแล้ว ยกเลิก และหมดอายุ (อ่านอย่างเดียว)"
      />
      <AdminNotice tone="info">
        การยกเลิกประกาศจากฝั่งแอดมินยังไม่เปิดใช้ เพราะต้องคืนเงินมัดจำ (escrow) อย่างปลอดภัยก่อน หากต้องคืนเหรียญผู้ซื้อ ให้ดูที่หน้าธุรกรรม
      </AdminNotice>

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="รหัสประกาศ สายพันธุ์ ชื่อไดโน ผู้ขาย/ผู้ซื้อ หรือ Steam ID ผู้ขาย…" />
        <div className="border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามสถานะประกาศ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={[
              { value: '', label: 'ทั้งหมด' },
              ...LISTING_STATUS_FILTERS.map((st) => ({ value: st, label: LISTING_STATUS_TH[st] ?? st })),
            ]}
          />
        </div>
        <IgnoredFiltersNotice names={list.data?.ignoredFilters ?? []} labels={{ status: 'สถานะ' }} />

        <AdminTable caption="ประกาศขายในตลาดผู้เล่น" busy={list.isFetching} minWidth={980}>
          <AdminTableHead>
            <tr>
              <AdminTh>ไดโน</AdminTh>
              <AdminTh>ผู้ขาย</AdminTh>
              <AdminTh>ผู้ซื้อ</AdminTh>
              <AdminTh align="right">ราคา (IC)</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>การส่ง</AdminTh>
              <AdminTh>ลงขาย</AdminTh>
              <AdminTh align="right">ดู</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดประกาศขายไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบประกาศที่ตรงกับตัวกรอง' : 'ยังไม่มีประกาศขาย'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((l) => (
              <AdminTr key={l.id}>
                <AdminTd>
                  <div className="font-semibold">{l.dinoName || l.species || '—'}</div>
                  <div className="text-xs text-iris-muted">
                    {[l.species, l.level !== null ? `Lv.${l.level}` : null, l.gender].filter(Boolean).join(' · ')}
                  </div>
                </AdminTd>
                <AdminTd>
                  <Person p={l.seller} />
                </AdminTd>
                <AdminTd>
                  <Person p={l.buyer} />
                </AdminTd>
                <AdminTd align="right" mono nowrap>
                  {formatIcAmount(l.price)}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={listingTone(l.status)} dot>
                    {LISTING_STATUS_TH[l.status] ?? l.status}
                  </StatusBadge>
                </AdminTd>
                <AdminTd muted>
                  {l.deliveryStatus ?? '—'}
                  {l.deliveredAt && <div className="text-xs">{formatBangkokDateTime(l.deliveredAt)}</div>}
                </AdminTd>
                <AdminTd muted nowrap>
                  {formatBangkokDateTime(l.createdAt)}
                  {l.soldAt && <div className="text-xs">ขาย {formatBangkokDateTime(l.soldAt)}</div>}
                </AdminTd>
                <AdminTd align="right" nowrap>
                  <Link
                    href={`/market/${encodeURIComponent(l.id)}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl"
                    aria-label={`เปิดหน้าประกาศ ${l.dinoName || l.species || l.id}`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTableBody>
        </AdminTable>
        <Pagination {...list.paginationProps} />
      </AdminPanel>
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <MarketAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
