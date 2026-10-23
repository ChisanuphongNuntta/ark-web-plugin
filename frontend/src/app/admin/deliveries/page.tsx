'use client';

/**
 * /admin/deliveries — every delivery job (admin | root): shop orders, dino deliveries
 * and VIP Permissions sync jobs (permission_grant / permission_revoke).
 *
 *   - filters: status, type, server; search: job id / order (reference) id prefix, exact Steam ID
 *   - retry a failed / dead-lettered job (confirm first) via POST /admin/deliveries/:id/retry
 *   - live: delivery and admin events refresh the list
 */
import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import {
  AdminButton,
  AdminFilterSelect,
  AdminIconButton,
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
  ConfirmDialog,
  Pagination,
  SegmentedTabs,
} from '@/components/admin';
import {
  AdminAccessGate,
  CopyValueButton,
  DELIVERY_STATUS_TH,
  DELIVERY_TYPE_TH,
  DeliveryStatusBadge,
  IgnoredFiltersNotice,
} from '@/components/admin/console/ConsoleBits';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useServerOptions } from '@/hooks/useServerOptions';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import {
  DELIVERY_STATUS_FILTERS,
  DELIVERY_TYPE_FILTERS,
  adminConsoleApi,
  apiErrorText,
  shortId,
  type AdminDeliveryRow,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { REALTIME_EVENTS } from '@/lib/realtime/events';

const LIST_KEY = 'admin-deliveries';
const COLS = 8;
const RETRYABLE = new Set(['failed', 'dead_letter']);
const FILTER_LABELS: Record<string, string> = {
  status: 'สถานะ',
  serverId: 'เซิร์ฟเวอร์',
  deliveryType: 'ประเภท',
};

function referenceCell(d: AdminDeliveryRow) {
  if (d.orderId) {
    return (
      <Link href={`/admin/orders?q=${encodeURIComponent(d.orderId)}`} className="font-mono text-xs text-iris-cyan hover:underline">
        {shortId(d.orderId)}
      </Link>
    );
  }
  if (d.deliveryType === 'permission_grant' || d.deliveryType === 'permission_revoke') {
    // referenceId = `vip:<userId>:<group>` (contracts/vip-2026-10.md §4)
    const [, userId, group] = /^vip:([^:]+):(.+)$/.exec(d.referenceId ?? '') ?? [];
    return userId ? (
      <Link href={`/admin/vip?userId=${encodeURIComponent(userId)}`} className="text-xs text-iris-cyan hover:underline">
        สมาชิก VIP · กลุ่ม {group}
      </Link>
    ) : (
      <span className="font-mono text-xs text-iris-muted">{shortId(d.referenceId)}</span>
    );
  }
  return <span className="font-mono text-xs text-iris-muted">{shortId(d.referenceId)}</span>;
}

function DeliveriesAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getDeliveriesPage,
    filters: {
      status: { values: DELIVERY_STATUS_FILTERS },
      deliveryType: { values: DELIVERY_TYPE_FILTERS },
      serverId: {},
    },
  });
  const servers = useServerOptions();
  const [retrying, setRetrying] = useState<AdminDeliveryRow | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);

  useAdminLiveRefresh([REALTIME_EVENTS.deliveryUpdated, 'admin:delivery:failed', REALTIME_EVENTS.orderUpdated], [LIST_KEY]);

  const retry = useMutation({
    mutationFn: (id: string) => adminConsoleApi.retryDelivery(id),
    onSuccess: (res) => {
      setNotice(
        res.retried
          ? { tone: 'success', text: 'ส่งงานกลับเข้าคิวแล้ว ปลั๊กอินจะรับไปส่งใหม่เมื่อผู้เล่นออนไลน์' }
          : { tone: 'info', text: 'งานนี้อยู่ในคิวอยู่แล้ว ไม่ได้สร้างงานซ้ำ' },
      );
      list.invalidate();
    },
  });

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="DELIVERIES"
        title="การส่งของเข้าเกม"
        description="ทุกงานส่งของจากร้านค้า ตลาดผู้เล่น และการซิงก์สิทธิ์ VIP เข้าปลั๊กอิน Permissions ส่งงานที่ล้มเหลวใหม่ได้จากที่นี่"
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="รหัสงาน รหัสคำสั่งซื้อ หรือ Steam ID…">
          <AdminFilterSelect
            label="ประเภท"
            value={list.filters.deliveryType}
            onChange={(v) => list.setFilter('deliveryType', v)}
            options={DELIVERY_TYPE_FILTERS.map((t) => ({ value: t, label: DELIVERY_TYPE_TH[t] ?? t }))}
          />
          <AdminFilterSelect
            label="เซิร์ฟเวอร์"
            value={list.filters.serverId}
            onChange={(v) => list.setFilter('serverId', v)}
            options={(servers.data ?? []).map((sv) => ({ value: String(sv.id), label: sv.name }))}
          />
        </AdminToolbar>
        <div className="border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามสถานะ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={[
              { value: '', label: 'ทั้งหมด' },
              ...DELIVERY_STATUS_FILTERS.map((st) => ({ value: st, label: DELIVERY_STATUS_TH[st] ?? st })),
            ]}
          />
        </div>
        <IgnoredFiltersNotice names={list.data?.ignoredFilters ?? []} labels={FILTER_LABELS} />

        <AdminTable caption="รายการงานส่งของ" busy={list.isFetching} minWidth={980}>
          <AdminTableHead>
            <tr>
              <AdminTh>งาน</AdminTh>
              <AdminTh>ประเภท / อ้างอิง</AdminTh>
              <AdminTh>Steam ID</AdminTh>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh align="right">พยายาม</AdminTh>
              <AdminTh>อัปเดต</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดงานส่งของไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบงานส่งของที่ตรงกับตัวกรอง' : 'ยังไม่มีงานส่งของ'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((d) => (
              <AdminTr key={d.id}>
                <AdminTd mono nowrap>
                  {shortId(d.id)}
                  <CopyValueButton value={d.id} label={`คัดลอกรหัสงาน ${d.id}`} />
                </AdminTd>
                <AdminTd>
                  <div>{DELIVERY_TYPE_TH[d.deliveryType] ?? d.deliveryType}</div>
                  {referenceCell(d)}
                </AdminTd>
                <AdminTd mono muted nowrap>
                  {d.steamId ?? '—'}
                </AdminTd>
                <AdminTd muted>{d.serverName ?? (d.serverId ? `#${d.serverId}` : 'ทุกเซิร์ฟเวอร์')}</AdminTd>
                <AdminTd>
                  <DeliveryStatusBadge status={d.status} />
                  {d.lastError && <div className="mt-1 max-w-[18rem] break-words text-xs text-rose-100">{d.lastError}</div>}
                </AdminTd>
                <AdminTd align="right" mono nowrap>
                  {d.attempts ?? 0}/{d.maxAttempts ?? '—'}
                </AdminTd>
                <AdminTd muted nowrap>
                  {formatBangkokDateTime(d.updatedAt)}
                  {d.nextRetryAt && d.status !== 'completed' && (
                    <div className="text-xs">ลองใหม่ {formatBangkokDateTime(d.nextRetryAt)}</div>
                  )}
                </AdminTd>
                <AdminTd align="right" nowrap>
                  {RETRYABLE.has(d.status) ? (
                    <AdminIconButton aria-label={`ส่งงาน ${d.id} ใหม่`} onClick={() => setRetrying(d)}>
                      <RotateCw />
                    </AdminIconButton>
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

      <ConfirmDialog
        open={retrying !== null}
        onClose={() => {
          setRetrying(null);
          retry.reset();
        }}
        onConfirm={() => retry.mutateAsync(retrying!.id)}
        tone="default"
        title="ส่งงานนี้ใหม่?"
        description={
          retrying
            ? `${DELIVERY_TYPE_TH[retrying.deliveryType] ?? retrying.deliveryType} · ${retrying.steamId ?? 'ไม่ทราบ Steam ID'} — งานจะกลับเข้าคิวและเพิ่มจำนวนครั้งที่ลองได้อีก 5 ครั้ง ระบบไม่สร้างงานซ้ำถ้างานอยู่ในคิวแล้ว`
            : undefined
        }
        confirmText="ส่งใหม่"
      />
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <DeliveriesAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
