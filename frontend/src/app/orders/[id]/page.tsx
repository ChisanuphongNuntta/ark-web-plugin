'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Coins,
  Copy,
  FileText,
  Package,
  ReceiptText,
  RotateCcw,
  Server,
  ShieldCheck,
  Truck,
  ShoppingCart,
  HelpCircle,
} from 'lucide-react';
import { orderContractApi, toContractError } from '@/lib/contracts/client';
import type { DeliverySummary, TimelineEvent } from '@/lib/contracts/types';
import { isOrderActive, isRefundable, statusOf, timelineStepOf } from '@/lib/orderStatus';
import { useAuthStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

function paramToOrderId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orderId = paramToOrderId(params?.id);
  const [copied, setCopied] = React.useState(false);
  const [refundMessage, setRefundMessage] = React.useState<string | null>(null);
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
      setRefundMessage(
        result.alreadyRefunded
          ? `รายการนี้ถูกคืนเงินแล้ว ยอดคืนเงิน ${result.refundedAmount} IC`
          : `ส่งคำขอคืนเงินสำเร็จ ยอดคืนเงินจากระบบ ${result.refundedAmount} IC`
      );
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      const error = toContractError(err, 'ไม่สามารถคืนเงินคำสั่งซื้อนี้ได้');
      setRefundMessage(null);
      setRefundError(
        error.status === 409
          ? `ระบบหลังบ้านยังไม่อนุญาตให้คืนเงินรายการนี้: ${error.message}`
          : error.message
      );
    },
  });

  const copyOrderId = async () => {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  if (!orderId) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="ลิงก์คำสั่งซื้อไม่ถูกต้อง"
          description="ไม่พบรหัสคำสั่งซื้อใน URL โปรดกลับไปหน้า Orders แล้วเปิดรายการอีกครั้ง"
          actionText="กลับไปคำสั่งซื้อของฉัน"
          onAction={() => {
            window.location.href = '/orders';
          }}
          icon={<ReceiptText className="h-8 w-8" />}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="กรุณาเข้าสู่ระบบ"
          description="ต้องเข้าสู่ระบบด้วย IRIS ID เพื่อดูรายละเอียดคำสั่งซื้อและไทม์ไลน์การจัดส่ง"
          actionText="เข้าสู่ระบบ"
          onAction={() => {
            window.location.href = '/login';
          }}
          icon={<ShieldCheck className="h-8 w-8" />}
        />
      </div>
    );
  }

  if (query.isLoading) return <OrderDetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="page-shell py-12 space-y-6">
        <BackLink />
        <ErrorMessage
          title="โหลดรายละเอียดคำสั่งซื้อไม่สำเร็จ"
          message="ไม่สามารถดึงข้อมูลจาก order detail contract endpoint ได้ โปรดลองใหม่อีกครั้ง"
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const { order, delivery, timeline } = query.data;
  const status = statusOf(order.status);
  const productName = order.product?.name ?? `สินค้า #${order.productId}`;
  const serverName = order.server?.name ?? `เซิร์ฟเวอร์ #${order.serverId}`;
  const canRequestRefund = isRefundable(order.status);

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      <BackLink />

      <section className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.9fr] gap-8">
        <GlassCard variant="prism" hasLattice className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <span className="eyebrow text-iris-cyan">Order Detail / Delivery Timeline</span>
                <h1 className="font-display text-3xl sm:text-5xl font-extrabold uppercase tracking-tight text-iris-pearl">
                  {productName}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-iris-muted">
                  <span className="font-mono">#{shortId(order.id)}</span>
                  <button
                    type="button"
                    onClick={copyOrderId}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 font-bold text-iris-cyan transition hover:border-iris-cyan/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
                    aria-label="คัดลอกรหัสคำสั่งซื้อ"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3" aria-live="polite">
                <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold ${status.chip} ${status.border}`}>
                  {status.icon}
                  {status.label}
                </span>
                {query.isFetching && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-iris-cyan/20 bg-iris-cyan/5 px-4 py-2 text-xs font-bold text-iris-cyan">
                    กำลังอัปเดตสถานะ
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-iris-gold/20 bg-iris-gold/[0.06] p-5 lg:min-w-[230px]">
              <p className="text-[10px] uppercase tracking-[0.3em] text-iris-gold">Backend charged amount</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-3xl font-black text-iris-gold">
                <Coins className="h-7 w-7" />
                {order.totalPrice.toLocaleString()} IC
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-iris-muted">
                ยอดนี้เป็นค่าที่ Backend ส่งกลับมา หน้าเว็บไม่คำนวณราคาสุดท้ายเอง
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
            <FactCard icon={<Package className="h-4 w-4" />} label="จำนวน" value={`x${order.quantity}`} />
            <FactCard icon={<Server className="h-4 w-4" />} label="ปลายทาง" value={serverName} hint={order.server?.map ?? undefined} />
            <FactCard icon={<FileText className="h-4 w-4" />} label="สร้างรายการ" value={formatDate(order.createdAt)} />
          </div>

          {order.lastError && (
            <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-300" />
                <div>
                  <p className="font-bold">ระบบจัดส่งแจ้งข้อผิดพลาด</p>
                  <p className="mt-1 text-xs text-rose-100/80">{order.lastError}</p>
                </div>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6 space-y-5" variant="gold">
          <div>
            <span className="eyebrow text-iris-gold">Fulfillment Control</span>
            <h2 className="font-display text-2xl font-bold uppercase text-iris-pearl">
              สถานะการส่งของเข้าเกม
            </h2>
          </div>

          <DeliveryPanel delivery={delivery} />

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-relaxed text-iris-muted">
            Backend เป็นผู้ตัดสิน transition, wallet ledger, refund และ retry delivery ทั้งหมด
            หน้าเว็บนี้แสดงผลและส่งคำขอตาม contract เท่านั้น
          </div>

          {refundMessage && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-200" role="status">
              {refundMessage}
            </div>
          )}

          {refundError && (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
              {refundError}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              variant="gold"
              disabled={!canRequestRefund || refundMutation.isPending || order.status === 'refunded'}
              isLoading={refundMutation.isPending}
              onClick={() => refundMutation.mutate()}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              {order.status === 'refunded'
                ? 'คืนเงินแล้ว'
                : canRequestRefund
                  ? 'ส่งคำขอคืนเงิน'
                  : 'ยังคืนเงินไม่ได้ในสถานะนี้'}
            </Button>
            {order.productId && (
              <Link
                href={`/shop?buy=${order.productId}`}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-iris-cyan/30 bg-iris-cyan/15 px-6 py-2.5 text-sm font-bold tracking-wide text-iris-cyan transition hover:bg-iris-cyan/25 hover:border-iris-cyan/50"
              >
                <ShoppingCart className="h-4 w-4" />
                สั่งซื้อสินค้านี้ซ้ำอีกครั้ง (Re-order)
              </Link>
            )}

            <Link
              href={`/support?orderId=${order.id}&subject=${encodeURIComponent(`ปัญหาคำสั่งซื้อ #${shortId(order.id)}`)}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-amber-300 transition hover:bg-amber-500/20 hover:border-amber-500/40"
            >
              <HelpCircle className="h-4 w-4" />
              แจ้งปัญหาเกี่ยวกับคำสั่งซื้อนี้
            </Link>

            <Link
              href="/orders"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-6 py-2.5 text-sm font-bold tracking-wide text-iris-pearl transition hover:border-iris-cyan/40 hover:bg-iris-cyan/10"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับไปประวัติคำสั่งซื้อ
            </Link>
          </div>
        </GlassCard>
      </section>

      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <span className="eyebrow text-iris-cyan">Live Delivery Timeline</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-iris-pearl">
              ไทม์ไลน์คำสั่งซื้อ
            </h2>
          </div>
          <p className="max-w-md text-xs text-iris-muted">
            ลำดับเหตุการณ์มาจาก Backend timeline endpoint โดยตรง ใช้ตรวจสอบ audit trail ระหว่างเว็บกับเกม
          </p>
        </div>

        <Timeline events={timeline} />
      </GlassCard>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-iris-cyan transition hover:text-iris-pearl"
    >
      <ArrowLeft className="h-4 w-4" />
      กลับไปคำสั่งซื้อของฉัน
    </Link>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="page-shell py-10 space-y-8">
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.9fr] gap-8">
        <GlassCard className="p-8 space-y-6">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-8 w-44 rounded-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </GlassCard>
        <GlassCard className="p-6 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-11 rounded-full" />
        </GlassCard>
      </div>
      <GlassCard className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-2xl" />
      </GlassCard>
    </div>
  );
}

function FactCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-iris-muted">
        <span className="text-iris-cyan">{icon}</span>
        {label}
      </div>
      <p className="mt-2 truncate font-display text-lg font-bold text-iris-pearl">{value}</p>
      {hint && <p className="mt-1 text-xs text-iris-muted">{hint}</p>}
    </div>
  );
}

function DeliveryPanel({ delivery }: { delivery: DeliverySummary | null }) {
  if (!delivery) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-relaxed text-iris-muted">
        ยังไม่มี fulfillment record สำหรับรายการนี้ อาจเป็นคำสั่งซื้อเก่าหรือยังไม่ถูก claim โดยเซิร์ฟเวอร์
      </div>
    );
  }

  const deliveryTone =
    delivery.status === 'delivered'
      ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
      : delivery.status === 'failed'
        ? 'text-rose-300 border-rose-500/25 bg-rose-500/10'
        : 'text-iris-cyan border-iris-cyan/20 bg-iris-cyan/10';

  return (
    <div className={`rounded-2xl border p-4 ${deliveryTone}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] opacity-80">Delivery status</p>
          <p className="mt-1 inline-flex items-center gap-2 font-display text-xl font-bold uppercase">
            <Truck className="h-5 w-5" />
            {delivery.status}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="opacity-70">Attempts</p>
          <p className="font-mono text-lg font-bold">{delivery.attempts ?? 0}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="opacity-70">Receipt</dt>
          <dd className="font-mono">{delivery.receiptId ?? '—'}</dd>
        </div>
        {delivery.lastError && (
          <div className="rounded-xl bg-black/20 p-3">
            <dt className="font-bold">Last error</dt>
            <dd className="mt-1 opacity-90">{delivery.lastError}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-sm text-iris-muted">
        Backend ยังไม่ส่ง timeline event สำหรับรายการนี้
      </div>
    );
  }

  return (
    <ol className="mt-8 space-y-0" aria-label="ไทม์ไลน์การจัดส่ง">
      {events.map((event, index) => {
        const meta = timelineStepOf(event.status);
        const isLast = index === events.length - 1;
        const tone =
          meta.tone === 'good'
            ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
            : meta.tone === 'bad'
              ? 'border-rose-400/40 bg-rose-400/15 text-rose-200'
              : 'border-iris-cyan/30 bg-iris-cyan/10 text-iris-cyan';

        return (
          <li key={`${event.status}-${event.at}-${index}`} className="relative pl-12">
            {!isLast && <div className="absolute left-[15px] top-8 h-full w-px bg-gradient-to-b from-iris-cyan/40 to-white/5" />}
            <div className={`absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border ${tone}`}>
              {meta.icon}
            </div>
            <div className="pb-7">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-bold text-iris-pearl">{meta.label}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-iris-muted">{meta.hint}</p>
                  </div>
                  <time dateTime={event.at} className="font-mono text-xs text-iris-gold">
                    {formatDate(event.at)}
                  </time>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
