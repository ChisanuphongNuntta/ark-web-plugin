'use client';

/**
 * /admin/payments — every real-money payment (admin | root): IC top-ups and VIP purchases,
 * Stripe and bank slip (and sandbox, when it was ever used). Read-only;
 * bank slips are approved / rejected on the dashboard's slip tab (/admin?tab=slips).
 * GET /admin/payments?provider=&status=&kind=&userId=&search=
 */
import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Receipt } from 'lucide-react';
import {
  AdminButton,
  AdminFilterSelect,
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
  type StatusTone,
} from '@/components/admin';
import { AdminAccessGate, CopyValueButton, IgnoredFiltersNotice } from '@/components/admin/console/ConsoleBits';
import { VipBadgePill } from '@/components/vip/VipAvatar';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import {
  PAYMENT_KIND_FILTERS,
  PAYMENT_PROVIDER_FILTERS,
  PAYMENT_STATUS_FILTERS,
  adminConsoleApi,
  apiErrorText,
  formatIcAmount,
  shortId,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { REALTIME_EVENTS } from '@/lib/realtime/events';
import { formatThb } from '@/lib/vip';

const LIST_KEY = 'admin-payments';
const COLS = 8;

const PROVIDER_TH: Record<string, string> = { stripe: 'บัตร (Stripe)', bank_slip: 'โอน / สลิป', sandbox: 'ทดสอบ (Sandbox)' };
const STATUS_TH: Record<string, string> = {
  pending: 'รอชำระ / รอตรวจ',
  processing: 'กำลังตรวจสอบ',
  completed: 'สำเร็จ',
  failed: 'ไม่สำเร็จ / ปฏิเสธ',
  expired: 'หมดอายุ',
  refunded: 'คืนเงินแล้ว',
};
const KIND_TH: Record<string, string> = { topup: 'เติมเหรียญ', vip: 'ซื้อ VIP' };

function paymentTone(status: string): StatusTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'pending':
    case 'processing':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

function PaymentsAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getPaymentsPage,
    filters: {
      kind: { values: PAYMENT_KIND_FILTERS },
      provider: { values: PAYMENT_PROVIDER_FILTERS },
      status: { values: PAYMENT_STATUS_FILTERS },
      userId: {},
    },
  });

  // New slips, top-up credits (ledger postings) and VIP grants.
  useAdminLiveRefresh(['admin:slip:created', REALTIME_EVENTS.adminTransaction, REALTIME_EVENTS.adminVip], [LIST_KEY], {
    filter: (event, payload) =>
      event !== REALTIME_EVENTS.adminTransaction || (payload as { referenceType?: unknown } | null)?.referenceType === 'payment',
  });

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="PAYMENTS"
        title="การชำระเงินทั้งหมด"
        description="ทุกรายการจ่ายเงินจริง ทั้งเติมเหรียญและซื้อ VIP ผ่านบัตรและโอนเงิน (อ่านอย่างเดียว อนุมัติสลิปได้ที่หน้าภาพรวม)"
        actions={
          <Link href="/admin?tab=slips" className="btn-secondary min-h-9 gap-1.5 px-3.5 py-1.5 text-xs">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            ตรวจสลิปที่รออนุมัติ
          </Link>
        }
      />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="รหัสรายการ เลขอ้างอิง ผู้เล่น หรือ Steam ID…">
          <AdminFilterSelect
            label="ช่องทาง"
            value={list.filters.provider}
            onChange={(v) => list.setFilter('provider', v)}
            options={PAYMENT_PROVIDER_FILTERS.map((p) => ({ value: p, label: PROVIDER_TH[p] ?? p }))}
          />
          <AdminFilterSelect
            label="สถานะ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={PAYMENT_STATUS_FILTERS.map((st) => ({ value: st, label: STATUS_TH[st] ?? st }))}
          />
          {list.filters.userId && (
            <AdminButton size="sm" variant="ghost" onClick={() => list.setFilter('userId', '')}>
              ล้างตัวกรองผู้ใช้
            </AdminButton>
          )}
        </AdminToolbar>
        <div className="border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="ประเภทรายการ"
            value={list.filters.kind}
            onChange={(v) => list.setFilter('kind', v)}
            options={[{ value: '', label: 'ทั้งหมด' }, ...PAYMENT_KIND_FILTERS.map((k) => ({ value: k, label: KIND_TH[k] }))]}
          />
        </div>
        <IgnoredFiltersNotice
          names={list.data?.ignoredFilters ?? []}
          labels={{ provider: 'ช่องทาง', status: 'สถานะ', kind: 'ประเภท', userId: 'ผู้ใช้' }}
        />

        <AdminTable caption="รายการชำระเงิน" busy={list.isFetching} minWidth={1000}>
          <AdminTableHead>
            <tr>
              <AdminTh>รายการ</AdminTh>
              <AdminTh>ผู้เล่น</AdminTh>
              <AdminTh>สิ่งที่ซื้อ</AdminTh>
              <AdminTh>ช่องทาง</AdminTh>
              <AdminTh align="right">ยอดเงิน</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>เวลา</AdminTh>
              <AdminTh align="right">สลิป</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดรายการชำระเงินไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการชำระเงิน'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((p) => (
              <AdminTr key={p.id}>
                <AdminTd nowrap>
                  <span className="font-mono text-xs">{shortId(p.id)}</span>
                  <CopyValueButton value={p.id} label={`คัดลอกรหัสรายการ ${p.id}`} />
                  {p.reference && <div className="max-w-[12rem] truncate font-mono text-[11px] text-iris-muted">{p.reference}</div>}
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{p.user?.name ?? '—'}</span>
                    <VipBadgePill vip={p.user?.vip} />
                  </div>
                  {p.user?.steamId && <div className="font-mono text-xs text-iris-muted">{p.user.steamId}</div>}
                </AdminTd>
                <AdminTd>
                  {p.kind === 'vip' ? (
                    <>
                      <div>VIP · {p.vipPackageName ?? '—'}</div>
                      {p.vipMembership && (
                        <Link href={`/admin/vip?tab=members&q=${encodeURIComponent(p.id)}`} className="text-xs text-iris-cyan hover:underline">
                          ดูสมาชิกภาพ
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <div>{p.packageName ?? 'เติมเหรียญ'}</div>
                      <div className="text-xs text-iris-muted">{formatIcAmount(p.pointsAmount)} IC</div>
                    </>
                  )}
                </AdminTd>
                <AdminTd muted>{PROVIDER_TH[p.provider] ?? p.provider}</AdminTd>
                <AdminTd align="right" mono nowrap>
                  {formatThb(p.amountThb)}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={paymentTone(p.status)} dot>
                    {STATUS_TH[p.status] ?? p.status}
                  </StatusBadge>
                  {p.rejectReason && <div className="mt-1 max-w-[14rem] text-xs text-rose-100">{p.rejectReason}</div>}
                </AdminTd>
                <AdminTd muted nowrap>
                  {formatBangkokDateTime(p.createdAt)}
                  {p.completedAt && <div className="text-xs">สำเร็จ {formatBangkokDateTime(p.completedAt)}</div>}
                </AdminTd>
                <AdminTd align="right" nowrap>
                  {p.slipImageUrl ? (
                    <a
                      href={p.slipImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl"
                      aria-label={`เปิดสลิปของรายการ ${p.id}`}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-xs text-iris-muted">—</span>
                  )}
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
        <PaymentsAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
