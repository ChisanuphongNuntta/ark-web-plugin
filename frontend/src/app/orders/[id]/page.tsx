'use client';

import { ClaimCommand } from '@/components/ClaimCommand';
import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { orderContractApi, toContractError } from '@/lib/contracts/client';
import type { DeliverySummary } from '@/lib/contracts/types';
import { isOrderActive, isRefundable } from '@/lib/orderStatus';
import { useAuthStore } from '@/lib/store';
import {
  Amount,
  Button,
  Card,
  CardHeader,
  CopyField,
  Dialog,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Skeleton,
  Spinner,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { ProductArtwork } from '@/components/ProductArtwork';
import { DeliveryTimeline, Fact, OrderStatusBadge, formatDate, shortId } from '../orderUi';

function paramToOrderId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const DELIVERY_LABEL: Record<DeliverySummary['status'], string> = {
  queued: 'รอในคิว',
  claimed: 'เซิร์ฟเวอร์รับงานแล้ว',
  delivered: 'ส่งสำเร็จ',
  failed: 'ส่งไม่สำเร็จ',
};

export default function OrderDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuthStore();
  const orderId = paramToOrderId(params?.id);
  const [confirmRefund, setConfirmRefund] = React.useState(false);
  const [refundError, setRefundError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => orderContractApi.getById(orderId as string),
    enabled: Boolean(user && orderId),
    refetchInterval: (q) => {
      const status = q.state.data?.order.status;
      return status && isOrderActive(status) ? 10_000 : false;
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => orderContractApi.refund(orderId as string, 'customer_requested_from_order_detail'),
    onSuccess: (result) => {
      setRefundError(null);
      setConfirmRefund(false);
      toast.success(
        result.alreadyRefunded ? 'คำสั่งซื้อนี้คืนเงินไปแล้ว' : 'คืนเงินเรียบร้อย',
        `${result.refundedAmount} IC เข้ากระเป๋าส่วนเงินคืน`
      );
      void queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      const error = toContractError(err, 'คืนเงินคำสั่งซื้อนี้ไม่สำเร็จ');
      setConfirmRefund(false);
      setRefundError(error.status === 409 ? `ยังคืนเงินรายการนี้ไม่ได้: ${error.message}` : error.message);
    },
  });

  if (!orderId) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="คำสั่งซื้อ" title="ไม่พบคำสั่งซื้อ" />
        <EmptyState
          title="ลิงก์คำสั่งซื้อไม่ถูกต้อง"
          description="เปิดรายการจากหน้าคำสั่งซื้ออีกครั้ง"
          action={
            <Link href="/orders" className={buttonVariants({ variant: 'secondary' })}>
              ไปที่คำสั่งซื้อ
            </Link>
          }
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="คำสั่งซื้อ" title="รายละเอียดคำสั่งซื้อ" />
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อดูคำสั่งซื้อนี้"
            description="รายละเอียดและสถานะการส่งของผูกกับ IRIS ID ของคุณ"
            action={
              <Link href="/login" className={buttonVariants()}>
                เข้าสู่ระบบ
              </Link>
            }
          />
        )}
      </div>
    );
  }

  if (query.isLoading) return <OrderDetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="คำสั่งซื้อ" title="รายละเอียดคำสั่งซื้อ" />
        <ErrorMessage
          title="โหลดคำสั่งซื้อไม่สำเร็จ"
          message="คำสั่งซื้ออาจไม่มีอยู่ หรือการเชื่อมต่อขัดข้อง ลองอีกครั้ง"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const { order, delivery, timeline } = query.data;
  const productName = order.product?.name ?? `สินค้า #${order.productId}`;
  const serverName = order.server?.name ?? `เซิร์ฟเวอร์ #${order.serverId}`;
  const canRequestRefund = isRefundable(order.status) && order.status !== 'refunded';
  const supportHref = `/support?orderId=${encodeURIComponent(order.id)}&subject=${encodeURIComponent(`ปัญหาคำสั่งซื้อ #${shortId(order.id)}`)}`;

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow={
          <span>
            คำสั่งซื้อ <span className="font-mono">#{shortId(order.id)}</span>
          </span>
        }
        title={productName}
        actions={
          <div className="flex items-center gap-3" aria-live="polite">
            {query.isFetching ? <Spinner label="กำลังอัปเดตสถานะ" /> : null}
            <OrderStatusBadge status={order.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Timeline */}
        <div className="space-y-6">
          <Card padding="none">
            <CardHeader
              divided
              title="สถานะการส่งของ"
              description={
                isOrderActive(order.status)
                  ? 'อัปเดตเองทุก 10 วินาทีจนกว่าจะส่งเสร็จ'
                  : 'ลำดับเหตุการณ์จากระบบส่งของ'
              }
            />
            <div className="p-5 sm:p-6">
              <DeliveryTimeline orderStatus={order.status} events={timeline} />
            </div>
            {order.lastError ? (
              <div className="border-t border-line px-5 py-4 sm:px-6">
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span>
                    <span className="font-medium">ข้อความจากระบบส่งของ</span>
                    <span className="mt-0.5 block text-fg-muted">{order.lastError}</span>
                  </span>
                </p>
              </div>
            ) : null}
          </Card>

          <Card padding="md">
            <h2 className="text-base font-semibold text-fg">ของยังไม่เข้า?</h2>
            <ol className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                1. เข้าเซิร์ฟเวอร์ <span className="text-fg">{serverName}</span> ด้วยตัวละครที่ผูกกับ Steam ของคุณ
              </li>
              <li>
                2. พิมพ์{' '}
                <ClaimCommand />{' '}
                ในแชทของเกม
              </li>
              <li>3. ถ้ายังไม่ได้รับภายใน 15 นาที แจ้งทีมงานพร้อมหมายเลขคำสั่งซื้อ</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={supportHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                แจ้งปัญหาคำสั่งซื้อนี้
              </Link>
              <Link href="/servers" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                ดูสถานะเซิร์ฟเวอร์
              </Link>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card padding="none">
            <div className="flex gap-4 border-b border-line p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2">
                <ProductArtwork product={order.product} alt="" className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{productName}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  จำนวน <span className="font-mono text-fg">{order.quantity}</span>
                </p>
              </div>
            </div>
            <dl className="divide-y divide-line px-5">
              <Fact label="ยอดที่ชำระ">
                <Amount value={order.totalPrice} />
              </Fact>
              <Fact label="ส่งไปที่">
                <span className="block truncate">{serverName}</span>
                {order.server?.map ? <span className="block font-mono text-xs text-fg-subtle">{order.server.map}</span> : null}
              </Fact>
              <Fact label="สั่งเมื่อ">
                <span className="font-mono text-xs tabular-nums">{formatDate(order.createdAt)}</span>
              </Fact>
              {order.deliveredAt ? (
                <Fact label="ส่งถึงเมื่อ">
                  <span className="font-mono text-xs tabular-nums">{formatDate(order.deliveredAt)}</span>
                </Fact>
              ) : null}
            </dl>
            <div className="border-t border-line p-5">
              <CopyField label="หมายเลขคำสั่งซื้อ" value={order.id} size="sm" />
            </div>
          </Card>

          <DeliveryPanel delivery={delivery} />

          <Card padding="md" className="space-y-3">
            <h2 className="text-base font-semibold text-fg">การดำเนินการ</h2>
            {refundError ? <ErrorMessage variant="inline" message={refundError} /> : null}
            <Button
              variant="secondary"
              fullWidth
              disabled={!canRequestRefund || refundMutation.isPending}
              onClick={() => setConfirmRefund(true)}
            >
              {order.status === 'refunded' ? 'คืนเงินแล้ว' : 'ขอคืนเงิน'}
            </Button>
            {!canRequestRefund && order.status !== 'refunded' ? (
              <p className="text-xs text-fg-subtle">ขอคืนเงินได้เมื่อส่งของเสร็จหรือส่งไม่สำเร็จ</p>
            ) : null}
            {order.productId ? (
              <Link href={`/shop?buy=${order.productId}`} className={buttonVariants({ variant: 'ghost', fullWidth: true })}>
                ซื้อสินค้านี้อีกครั้ง
              </Link>
            ) : null}
          </Card>
        </aside>
      </div>

      <Dialog
        open={confirmRefund}
        onOpenChange={setConfirmRefund}
        title="ขอคืนเงินคำสั่งซื้อนี้?"
        description="ระบบจะตรวจสิทธิ์และคืนยอดเข้ากระเป๋าส่วนเงินคืนของคุณ ยอดที่คืนกำหนดโดยระบบหลังบ้าน"
        variant="warning"
        confirmText="ยืนยันขอคืนเงิน"
        cancelText="ยกเลิก"
        loading={refundMutation.isPending}
        onConfirm={() => refundMutation.mutate()}
      />
    </div>
  );
}

function DeliveryPanel({ delivery }: { delivery: DeliverySummary | null }) {
  return (
    <Card padding="none">
      <CardHeader divided title="งานส่งของ" />
      {!delivery ? (
        <p className="p-5 text-sm text-fg-muted">ยังไม่มีงานส่งของสำหรับคำสั่งซื้อนี้ จะปรากฏเมื่อเซิร์ฟเวอร์รับงาน</p>
      ) : (
        <dl className="divide-y divide-line px-5">
          <Fact label="สถานะ">
            <span className={delivery.status === 'failed' ? 'text-danger' : delivery.status === 'delivered' ? 'text-success' : 'text-fg'}>
              {DELIVERY_LABEL[delivery.status] ?? delivery.status}
            </span>
          </Fact>
          <Fact label="จำนวนครั้งที่ลอง">
            <span className="font-mono tabular-nums">{delivery.attempts ?? 0}</span>
          </Fact>
          <Fact label="เลขที่รับของ">
            <span className="break-all font-mono text-xs">{delivery.receiptId ?? '—'}</span>
          </Fact>
          {delivery.lastError ? (
            <div className="py-2.5">
              <dt className="text-sm text-fg-muted">ข้อผิดพลาดล่าสุด</dt>
              <dd className="mt-1 text-sm text-danger">{delivery.lastError}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </Card>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="page-shell pb-16" aria-busy="true">
      <div className="space-y-3 pb-6 pt-10">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 rounded-card border border-line p-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton variant="circle" className="h-6 w-6" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-card border border-line p-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
