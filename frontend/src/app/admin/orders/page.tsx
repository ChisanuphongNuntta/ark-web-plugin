'use client';

/**
 * /admin/orders — every order (admin | root).
 *
 *   - server-paginated list, filters: status, server (+ userId from the URL)
 *   - detail drawer: order fields, delivery timeline, delivery jobs
 *   - refund via the ADMIN endpoint POST /admin/orders/:id/refund:
 *       failed orders    -> reason
 *       delivered orders -> reason + "ยืนยันว่าเก็บของคืนแล้ว" + reclaim note (>= 8 chars)
 *   - live: admin:* events (ledger postings, failed deliveries) refresh the list
 */
import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, RotateCcw, Truck } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminField,
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
  Pagination,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import {
  AdminAccessGate,
  CopyValueButton,
  DeliveryStatusBadge,
  DELIVERY_TYPE_TH,
  DetailField,
  IgnoredFiltersNotice,
  orderTone,
} from '@/components/admin/console/ConsoleBits';
import { VipBadgePill } from '@/components/vip/VipAvatar';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useServerOptions } from '@/hooks/useServerOptions';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import {
  ORDER_STATUS_FILTERS,
  adminConsoleApi,
  apiErrorText,
  formatIcAmount,
  shortId,
  type AdminOrderRow,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { REALTIME_EVENTS } from '@/lib/realtime/events';
import { isRefundable, statusOf, timelineStepOf } from '@/lib/orderStatus';

const LIST_KEY = 'admin-orders';
const DETAIL_KEY = 'admin-order-detail';
const COLS = 8;
const MIN_RECEIPT = 8;

const FILTER_LABELS: Record<string, string> = { status: 'สถานะ', serverId: 'เซิร์ฟเวอร์', userId: 'ผู้ใช้' };

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={orderTone(status)} dot>
      {statusOf(status).label}
    </StatusBadge>
  );
}

/* ------------------------------------------------------------------ */
/* Refund form (inside the drawer, never a second dialog)              */
/* ------------------------------------------------------------------ */

function RefundSection({ order, onDone }: { order: AdminOrderRow; onDone: (amount: string | null) => void }) {
  const delivered = order.status === 'delivered';
  const [reason, setReason] = useState('');
  const [reclaimed, setReclaimed] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [touched, setTouched] = useState(false);

  const refund = useMutation({
    mutationFn: () =>
      adminConsoleApi.refundOrder(order.id, {
        reason: reason.trim(),
        ...(delivered ? { inventoryReclaimed: true, reclaimReceipt: receipt.trim() } : {}),
      }),
    onSuccess: (res) => onDone(res.refundedAmount),
  });

  const reasonError = touched && reason.trim().length < 3 ? 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' : undefined;
  const receiptError =
    touched && delivered && receipt.trim().length < MIN_RECEIPT
      ? `กรุณาบันทึกรายละเอียดการเก็บของคืนอย่างน้อย ${MIN_RECEIPT} ตัวอักษร`
      : undefined;
  const reclaimError = touched && delivered && !reclaimed ? 'ต้องยืนยันว่าเก็บของคืนจากในเกมแล้ว' : undefined;
  const valid = reason.trim().length >= 3 && (!delivered || (reclaimed && receipt.trim().length >= MIN_RECEIPT));

  return (
    <section className="space-y-4 rounded-2xl border border-rose-300/20 bg-rose-400/[0.04] p-4" aria-labelledby="refund-title">
      <div>
        <h3 id="refund-title" className="text-sm font-semibold text-iris-pearl">
          คืนเหรียญ {formatIcAmount(order.totalPrice)} IC เข้ายอดใช้ได้ของผู้เล่น
        </h3>
        <p className="mt-1 text-xs text-iris-muted">
          {delivered
            ? 'คำสั่งซื้อนี้ส่งของเข้าเกมแล้ว ต้องเก็บของคืนจากตัวละครหรือกระเป๋าในเกมก่อน แล้วบันทึกหลักฐานไว้ จึงจะคืนเหรียญได้'
            : 'คำสั่งซื้อนี้ส่งของไม่สำเร็จ ระบบจะยกเลิกงานส่งที่ค้างอยู่และคืนเหรียญทันที'}
        </p>
      </div>

      <AdminField label="เหตุผลการคืนเหรียญ" required error={reasonError}>
        {(field) => (
          <textarea
            {...field}
            className={adminInputClass}
            rows={2}
            maxLength={240}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ผู้เล่นได้รับไอเทมผิดชนิด / ส่งไม่สำเร็จเพราะเซิร์ฟเวอร์ปิด"
          />
        )}
      </AdminField>

      {delivered && (
        <>
          <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-iris-pearl">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#37E5D2]"
              checked={reclaimed}
              onChange={(e) => setReclaimed(e.target.checked)}
              aria-invalid={reclaimError ? true : undefined}
            />
            <span>
              ยืนยันว่าเก็บของคืนแล้ว
              <span className="mt-0.5 block text-xs text-iris-muted">
                ฉันตรวจสอบและนำไอเทม/ไดโนของคำสั่งซื้อนี้ออกจากเกมเรียบร้อยแล้ว
              </span>
            </span>
          </label>
          {reclaimError && <p className="-mt-2 text-xs text-rose-200">{reclaimError}</p>}
          <AdminField
            label="บันทึกการเก็บของคืน"
            required
            hint="เช่น ชื่อตัวละคร เวลา และไอเทมที่เก็บคืน หรือเลขอ้างอิงหลักฐาน"
            error={receiptError}
          >
            {(field) => (
              <input
                {...field}
                className={adminInputClass}
                maxLength={240}
                value={receipt}
                onChange={(e) => setReceipt(e.target.value)}
              />
            )}
          </AdminField>
        </>
      )}

      {refund.isError && (
        <AdminNotice tone="danger" title="คืนเหรียญไม่สำเร็จ">
          {apiErrorText(refund.error, 'ลองใหม่อีกครั้ง หรือรีเฟรชสถานะคำสั่งซื้อ')}
        </AdminNotice>
      )}

      <div className="flex justify-end">
        <AdminButton
          variant="danger"
          icon={<RotateCcw />}
          loading={refund.isPending}
          onClick={() => {
            setTouched(true);
            if (valid) refund.mutate();
          }}
        >
          คืนเหรียญ
        </AdminButton>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Detail drawer                                                       */
/* ------------------------------------------------------------------ */

function OrderDrawer({
  row,
  startWithRefund,
  onClose,
}: {
  row: AdminOrderRow | null;
  startWithRefund: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showRefund, setShowRefund] = useState(startWithRefund);
  const [refundedAmount, setRefundedAmount] = useState<string | null | undefined>(undefined);
  const id = row?.id ?? '';

  const detail = useQuery({
    queryKey: [DETAIL_KEY, id],
    enabled: Boolean(id),
    staleTime: 5_000,
    queryFn: ({ signal }) => adminConsoleApi.getOrderDetail(id, signal),
  });
  // Delivery jobs for this order when the detail endpoint does not include them.
  const jobs = useQuery({
    queryKey: ['admin-deliveries', 'order', id],
    enabled: Boolean(id) && detail.isSuccess && detail.data.deliveries.length === 0,
    staleTime: 5_000,
    queryFn: ({ signal }) =>
      adminConsoleApi.getDeliveriesPage({ page: 1, pageSize: 25, search: id }, signal),
  });

  const order = detail.data?.order ?? row;
  const deliveries =
    detail.data && detail.data.deliveries.length > 0
      ? detail.data.deliveries
      : (jobs.data?.items ?? []).filter((d) => (d.orderId ?? d.referenceId) === id);
  const canRefund = Boolean(order && isRefundable(order.status)) && refundedAmount === undefined;

  return (
    <AdminDialog
      open={row !== null}
      onClose={onClose}
      placement="right"
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          คำสั่งซื้อ <span className="font-mono text-sm text-iris-muted">{shortId(id)}</span>
          {order && <OrderStatusBadge status={order.status} />}
        </span>
      }
      description={order?.productName ?? undefined}
    >
      {!order ? null : (
        <div className="space-y-6">
          {refundedAmount !== undefined && (
            <AdminNotice tone="success" title="คืนเหรียญสำเร็จ">
              คืน {formatIcAmount(refundedAmount ?? order.totalPrice)} IC เข้ายอดใช้ได้ของผู้เล่นแล้ว และบันทึกลงบันทึกการทำงาน
            </AdminNotice>
          )}

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="รหัสคำสั่งซื้อ">
              <span className="font-mono text-xs">{order.id}</span>
              <CopyValueButton value={order.id} label="คัดลอกรหัสคำสั่งซื้อ" />
            </DetailField>
            <DetailField label="ผู้เล่น">
              {order.user?.name ?? '—'} <VipBadgePill vip={order.user?.vip} />
              {order.user?.steamId && <span className="block font-mono text-xs text-iris-muted">{order.user.steamId}</span>}
            </DetailField>
            <DetailField label="สินค้า">
              {order.productName ?? '—'}
              {order.quantity !== null && <span className="text-iris-muted"> × {order.quantity}</span>}
            </DetailField>
            <DetailField label="ยอดชำระ">
              <span className="font-mono tabular-nums">{formatIcAmount(order.totalPrice)} IC</span>
            </DetailField>
            <DetailField label="เซิร์ฟเวอร์">{order.serverName ?? (order.serverId ? `#${order.serverId}` : '—')}</DetailField>
            <DetailField label="สร้างเมื่อ">{formatBangkokDateTime(order.createdAt)}</DetailField>
            {order.lastError && (
              <DetailField label="ข้อผิดพลาดล่าสุด" className="sm:col-span-2">
                <span className="text-rose-100">{order.lastError}</span>
              </DetailField>
            )}
          </dl>

          <section aria-labelledby="timeline-title">
            <h3 id="timeline-title" className="mb-3 text-sm font-semibold text-iris-pearl">
              ไทม์ไลน์การส่งของ
            </h3>
            {detail.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-iris-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> กำลังโหลด…
              </p>
            ) : detail.isError ? (
              <p className="text-sm text-iris-muted">{apiErrorText(detail.error, 'โหลดไทม์ไลน์ไม่สำเร็จ')}</p>
            ) : (detail.data?.timeline.length ?? 0) === 0 ? (
              <p className="text-sm text-iris-muted">ยังไม่มีเหตุการณ์</p>
            ) : (
              <ol className="space-y-3 border-l border-white/10 pl-4">
                {detail.data!.timeline.map((ev) => {
                  const step = timelineStepOf(ev.status);
                  return (
                    <li key={`${ev.status}-${ev.at}`} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${
                          step.tone === 'bad' ? 'bg-rose-300' : step.tone === 'good' ? 'bg-emerald-300' : 'bg-iris-cyan'
                        }`}
                        aria-hidden="true"
                      />
                      <p className="text-sm text-iris-pearl">{step.label}</p>
                      <p className="text-xs text-iris-muted">{formatBangkokDateTime(ev.at)}</p>
                    </li>
                  );
                })}
              </ol>
            )}
            {detail.data?.delivery && (
              <p className="mt-3 text-xs text-iris-muted">
                สถานะงานส่ง: {detail.data.delivery.status ?? '—'} · พยายาม {detail.data.delivery.attempts ?? 0} ครั้ง
                {detail.data.delivery.lastError ? ` · ${detail.data.delivery.lastError}` : ''}
              </p>
            )}
          </section>

          <section aria-labelledby="jobs-title">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="jobs-title" className="text-sm font-semibold text-iris-pearl">
                งานส่งของเข้าเกม
              </h3>
              <Link href={`/admin/deliveries?q=${encodeURIComponent(order.id)}`} className="text-xs text-iris-cyan hover:underline">
                เปิดในหน้าการส่งของ
              </Link>
            </div>
            {jobs.isLoading ? (
              <p className="text-sm text-iris-muted">กำลังโหลด…</p>
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-iris-muted">ไม่พบงานส่งของของคำสั่งซื้อนี้</p>
            ) : (
              <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
                {deliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block text-iris-pearl">
                        {DELIVERY_TYPE_TH[d.deliveryType] ?? d.deliveryType} · {d.serverName ?? (d.serverId ? `#${d.serverId}` : '—')}
                      </span>
                      <span className="block text-xs text-iris-muted">
                        พยายาม {d.attempts ?? 0}/{d.maxAttempts ?? '—'} · อัปเดต {formatBangkokDateTime(d.updatedAt)}
                      </span>
                      {d.lastError && <span className="block text-xs text-rose-100">{d.lastError}</span>}
                    </span>
                    <DeliveryStatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canRefund &&
            (showRefund ? (
              <RefundSection
                order={order}
                onDone={(amount) => {
                  setRefundedAmount(amount);
                  setShowRefund(false);
                  void queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
                  void queryClient.invalidateQueries({ queryKey: [DETAIL_KEY, order.id] });
                }}
              />
            ) : (
              <div className="flex justify-end">
                <AdminButton variant="secondary" icon={<RotateCcw />} onClick={() => setShowRefund(true)}>
                  คืนเหรียญคำสั่งซื้อนี้
                </AdminButton>
              </div>
            ))}
        </div>
      )}
    </AdminDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function OrdersAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getOrdersPage,
    filters: {
      status: { values: ORDER_STATUS_FILTERS },
      serverId: {},
      userId: {},
    },
  });
  const servers = useServerOptions();
  const [selected, setSelected] = useState<{ row: AdminOrderRow; refund: boolean } | null>(null);

  useAdminLiveRefresh(
    [REALTIME_EVENTS.adminTransaction, 'admin:delivery:failed', REALTIME_EVENTS.orderUpdated],
    [LIST_KEY, DETAIL_KEY],
    {
      filter: (event, payload) => {
        if (event !== REALTIME_EVENTS.adminTransaction) return true;
        const ref = (payload as { referenceType?: unknown } | null)?.referenceType;
        return ref === 'order' || ref === 'checkout';
      },
    },
  );

  const searchIgnored =
    Boolean(list.search) &&
    list.items.length > 0 &&
    list.items.every((o) => {
      const q = list.search.toLowerCase();
      return ![o.id, o.user?.name, o.user?.steamId, o.productName].some((v) => v?.toLowerCase().includes(q));
    });

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="ORDERS"
        title="คำสั่งซื้อทั้งหมด"
        description="ทุกคำสั่งซื้อจากร้านค้า ดูไทม์ไลน์การส่งของ และคืนเหรียญผ่านระบบแอดมิน (ทุกการคืนเหรียญถูกบันทึกในบันทึกการทำงาน)"
        actions={
          <Link href="/admin/deliveries?status=dead_letter" className="btn-secondary min-h-9 gap-1.5 px-3.5 py-1.5 text-xs">
            <Truck className="h-4 w-4" aria-hidden="true" />
            การส่งที่ล้มเหลว
          </Link>
        }
      />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหารหัสคำสั่งซื้อ ผู้เล่น หรือ Steam ID…">
          <AdminFilterSelect
            label="สถานะ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={ORDER_STATUS_FILTERS.map((st) => ({ value: st, label: statusOf(st).label }))}
          />
          <AdminFilterSelect
            label="เซิร์ฟเวอร์"
            value={list.filters.serverId}
            onChange={(v) => list.setFilter('serverId', v)}
            options={(servers.data ?? []).map((sv) => ({ value: String(sv.id), label: sv.name }))}
          />
          {list.filters.userId && (
            <AdminButton size="sm" variant="ghost" onClick={() => list.setFilter('userId', '')}>
              ล้างตัวกรองผู้ใช้
            </AdminButton>
          )}
        </AdminToolbar>
        <IgnoredFiltersNotice names={list.data?.ignoredFilters ?? []} labels={FILTER_LABELS} />
        {searchIgnored && (
          <div className="px-5 pt-4">
            <AdminNotice tone="warning" title="ระบบหลังบ้านยังไม่รองรับการค้นหาคำสั่งซื้อ">
              รายการด้านล่างไม่ได้กรองตามคำค้น ใช้ตัวกรองสถานะหรือเซิร์ฟเวอร์แทน
            </AdminNotice>
          </div>
        )}

        <AdminTable caption="รายการคำสั่งซื้อ" busy={list.isFetching} minWidth={960}>
          <AdminTableHead>
            <tr>
              <AdminTh>คำสั่งซื้อ</AdminTh>
              <AdminTh>ผู้เล่น</AdminTh>
              <AdminTh>สินค้า</AdminTh>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh align="right">ยอด (IC)</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>เวลา</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดคำสั่งซื้อไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบคำสั่งซื้อที่ตรงกับตัวกรอง' : 'ยังไม่มีคำสั่งซื้อ'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((o) => (
              <AdminTr key={o.id}>
                <AdminTd mono nowrap>
                  {shortId(o.id)}
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{o.user?.name ?? '—'}</span>
                    <VipBadgePill vip={o.user?.vip} />
                  </div>
                  {o.user?.steamId && <div className="font-mono text-xs text-iris-muted">{o.user.steamId}</div>}
                </AdminTd>
                <AdminTd>
                  <div className="max-w-[16rem] truncate">{o.productName ?? (o.productId ? `#${o.productId}` : '—')}</div>
                  {o.quantity !== null && o.quantity > 1 && <div className="text-xs text-iris-muted">× {o.quantity}</div>}
                </AdminTd>
                <AdminTd muted>{o.serverName ?? (o.serverId ? `#${o.serverId}` : '—')}</AdminTd>
                <AdminTd align="right" mono nowrap>
                  {formatIcAmount(o.totalPrice)}
                </AdminTd>
                <AdminTd>
                  <OrderStatusBadge status={o.status} />
                </AdminTd>
                <AdminTd muted nowrap>
                  {formatBangkokDateTime(o.createdAt)}
                </AdminTd>
                <AdminTd align="right" nowrap>
                  <AdminIconButton aria-label={`ดูรายละเอียดคำสั่งซื้อ ${o.id}`} onClick={() => setSelected({ row: o, refund: false })}>
                    <Eye />
                  </AdminIconButton>
                  {isRefundable(o.status) && (
                    <AdminIconButton
                      tone="danger"
                      aria-label={`คืนเหรียญคำสั่งซื้อ ${o.id}`}
                      onClick={() => setSelected({ row: o, refund: true })}
                    >
                      <RotateCcw />
                    </AdminIconButton>
                  )}
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTableBody>
        </AdminTable>
        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <OrderDrawer
        key={selected ? `${selected.row.id}:${selected.refund}` : 'none'}
        row={selected?.row ?? null}
        startWithRefund={selected?.refund ?? false}
        onClose={() => setSelected(null)}
      />
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <OrdersAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
