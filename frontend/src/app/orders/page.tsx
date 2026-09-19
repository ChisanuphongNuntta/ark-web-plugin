'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Package,
  Server,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { orderContractApi } from '@/lib/contracts/client';
import type { Order, OrderStatus } from '@/lib/contracts/types';
import { isOrderActive, statusOf } from '@/lib/orderStatus';
import { useAuthStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ProductArtwork } from '@/components/ProductArtwork';

const PAGE_SIZE = 20;

const FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'queued', label: 'เตรียมจัดส่ง' },
  { value: 'delivering', label: 'กำลังจัดส่ง' },
  { value: 'delivered', label: 'จัดส่งแล้ว' },
  { value: 'failed', label: 'ล้มเหลว' },
  { value: 'refunded', label: 'คืนเงิน' },
];

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function OrdersContent() {
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam = (searchParams.get('status') ?? 'all') as OrderStatus | 'all';
  const pageParam = Math.max(1, Number(searchParams.get('page')) || 1);

  const [status, setStatus] = React.useState<OrderStatus | 'all'>(statusParam);
  const [page, setPage] = React.useState(pageParam);

  React.useEffect(() => {
    setStatus(statusParam);
    setPage(pageParam);
  }, [statusParam, pageParam]);

  const updateUrl = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      const query = next.toString();
      router.push(query ? `/orders?${query}` : '/orders');
    },
    [router, searchParams]
  );

  const query = useQuery({
    queryKey: ['orders', { status, page }],
    queryFn: () =>
      orderContractApi.list({
        page,
        limit: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
      }),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => {
      const orders = q.state.data?.orders ?? [];
      return orders.some((order) => isOrderActive(order.status)) ? 15_000 : false;
    },
  });

  const orders = query.data?.orders ?? [];
  const pagination = query.data?.pagination;

  const handleFilter = (next: OrderStatus | 'all') => {
    setStatus(next);
    setPage(1);
    updateUrl({ status: next === 'all' ? null : next, page: null });
  };

  const handlePage = (nextPage: number) => {
    setPage(nextPage);
    updateUrl({ page: nextPage <= 1 ? null : String(nextPage) });
  };

  if (!user) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="กรุณาเข้าสู่ระบบ"
          description="ต้องเข้าสู่ระบบด้วย IRIS ID เพื่อดูประวัติคำสั่งซื้อและสถานะการจัดส่งเข้าเกม"
          actionText="เข้าสู่ระบบ"
          onAction={() => {
            router.push('/login');
          }}
          icon={<Package className="h-8 w-8" />}
        />
      </div>
    );
  }

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      <div className="border-b border-white/5 pb-6 space-y-2">
        <span className="eyebrow text-iris-cyan">YOUR ORDERS</span>
        <h1 className="font-display text-4xl font-extrabold text-iris-pearl uppercase tracking-tight flex items-center gap-3">
          <Package className="h-9 w-9 text-iris-cyan" />
          ประวัติคำสั่งซื้อ
        </h1>
        <p className="max-w-2xl text-xs sm:text-sm text-iris-muted">
          ติดตามสถานะการจัดส่งเข้าเกมแบบเรียลไทม์ ยอดเงินและสถานะทั้งหมดอ้างอิงจากระบบหลังบ้านเท่านั้น
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองตามสถานะคำสั่งซื้อ">
        {FILTERS.map((filter) => {
          const active = status === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleFilter(filter.value)}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-iris-cyan ${
                active
                  ? 'border-iris-cyan bg-iris-cyan text-iris-ink'
                  : 'border-white/10 text-iris-muted hover:border-white/20 hover:text-iris-pearl'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {query.isError && (
        <ErrorMessage
          title="โหลดคำสั่งซื้อไม่สำเร็จ"
          message="ระบบดึงรายการคำสั่งซื้อของคุณไม่สำเร็จ โปรดลองใหม่อีกครั้ง"
          onRetry={() => query.refetch()}
        />
      )}

      {query.isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <GlassCard key={index} className="p-5 space-y-4">
              <div className="flex gap-4">
                <Skeleton className="h-16 w-16 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {!query.isLoading && !query.isError && orders.length === 0 && (
        <EmptyState
          title={status === 'all' ? 'ยังไม่มีคำสั่งซื้อ' : 'ไม่มีคำสั่งซื้อในสถานะนี้'}
          description={
            status === 'all'
              ? 'เมื่อชำระเงินสำเร็จ คำสั่งซื้อและสถานะการจัดส่งจะปรากฏที่นี่'
              : 'ลองเปลี่ยนตัวกรองสถานะ หรือกลับไปดูคำสั่งซื้อทั้งหมด'
          }
          actionText={status === 'all' ? 'สำรวจร้านค้า IRIS Store' : 'ดูทั้งหมด'}
          onAction={() => (status === 'all' ? router.push('/shop') : handleFilter('all'))}
        />
      )}

      {orders.length > 0 && (
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity ${
            query.isFetching && !query.isLoading ? 'opacity-60' : 'opacity-100'
          }`}
          aria-busy={query.isFetching}
        >
          {orders.map((order) => (
            <OrderListCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1 || query.isFetching}
            onClick={() => handlePage(Math.max(1, page - 1))}
            leftIcon={<ChevronLeft className="h-4 w-4" />}
            aria-label="หน้าก่อนหน้า"
          >
            ก่อนหน้า
          </Button>
          <span className="font-mono text-xs text-iris-muted">
            หน้า {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pagination.totalPages || query.isFetching}
            onClick={() => handlePage(page + 1)}
            rightIcon={<ChevronRight className="h-4 w-4" />}
            aria-label="หน้าถัดไป"
          >
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-iris-cyan" />
        </div>
      }
    >
      <OrdersContent />
    </React.Suspense>
  );
}

function OrderListCard({ order }: { order: Order }) {
  const status = statusOf(order.status);
  const active = isOrderActive(order.status);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-[1.65rem] outline-none transition focus-visible:ring-2 focus-visible:ring-iris-cyan"
    >
      <GlassCard className={`h-full p-5 transition hover:border-iris-cyan/30 ${status.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <ProductArtwork product={order.product} alt={order.product?.name ?? 'สินค้า'} className="h-full w-full" />
            </div>

            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-bold uppercase text-iris-pearl">
                {order.product?.name ?? `สินค้า #${order.productId}`}
              </h3>
              <div className="mt-1.5 space-y-1 text-[11px] text-iris-muted">
                <p className="flex items-center gap-1.5">
                  <Server className="h-3 w-3 text-iris-cyan" />
                  {order.server?.name ?? `เซิร์ฟเวอร์ #${order.serverId}`}
                  {order.server?.map ? ` (${order.server.map})` : ''}
                </p>
                <p>จำนวน x{order.quantity}</p>
                <p className="font-mono">{formatDate(order.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-3 text-right">
            <div className="relative inline-block">
              <div className={`absolute inset-0 rounded-full blur-md ${status.glow}`} />
              <span
                className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${status.chip} ${status.border} ${
                  active ? 'animate-pulse' : ''
                }`}
              >
                {status.icon}
                {status.label}
              </span>
            </div>

            <div className="flex items-center justify-end gap-1.5 font-mono font-bold text-iris-gold">
              <Coins className="h-4 w-4" />
              <span>{order.totalPrice.toLocaleString()} IC</span>
            </div>
          </div>
        </div>

        {order.status === 'failed' && order.lastError && (
          <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
            {order.lastError}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-iris-muted">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-iris-cyan" />
            สถานะจากระบบหลังบ้าน
          </span>
          <span className="inline-flex items-center gap-1 font-bold text-iris-cyan transition-all">
            ดูไทม์ไลน์การจัดส่ง
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </GlassCard>
    </Link>
  );
}
