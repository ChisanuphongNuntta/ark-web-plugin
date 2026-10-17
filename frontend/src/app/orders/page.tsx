'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { orderContractApi } from '@/lib/contracts/client';
import type { Order, OrderStatus } from '@/lib/contracts/types';
import { isOrderActive } from '@/lib/orderStatus';
import { useAuthStore } from '@/lib/store';
import {
  Amount,
  Card,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Pagination,
  SegmentedControl,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
  buttonVariants,
} from '@/components/ui';
import { ProductArtwork } from '@/components/ProductArtwork';
import { OrderStatusBadge, formatDate, shortId } from './orderUi';

const PAGE_SIZE = 20;

type Filter = OrderStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'queued', label: 'รอส่ง' },
  { value: 'delivering', label: 'กำลังส่ง' },
  { value: 'delivered', label: 'ส่งแล้ว' },
  { value: 'failed', label: 'ไม่สำเร็จ' },
  { value: 'refunded', label: 'คืนเงิน' },
];

function OrdersContent() {
  const { user, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawStatus = searchParams.get('status') ?? 'all';
  const status: Filter = FILTERS.some((f) => f.value === rawStatus) ? (rawStatus as Filter) : 'all';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const updateUrl = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    const qs = next.toString();
    router.push(qs ? `/orders?${qs}` : '/orders', { scroll: false });
  };

  const query = useQuery({
    queryKey: ['orders', { status, page }],
    queryFn: () => orderContractApi.list({ page, limit: PAGE_SIZE, status: status === 'all' ? undefined : status }),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => ((q.state.data?.orders ?? []).some((o) => isOrderActive(o.status)) ? 15_000 : false),
  });

  const orders = query.data?.orders ?? [];
  const pagination = query.data?.pagination;

  const setFilter = (next: Filter) => updateUrl({ status: next === 'all' ? null : next, page: null });
  const setPage = (next: number) => updateUrl({ page: next <= 1 ? null : String(next) });

  if (!user) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="บัญชีของฉัน" title="คำสั่งซื้อ" />
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อดูคำสั่งซื้อ"
            description="ประวัติการซื้อและสถานะการส่งของเข้าเกมผูกกับ IRIS ID ของคุณ"
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

  const refreshing = query.isFetching && !query.isLoading;

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="บัญชีของฉัน"
        title="คำสั่งซื้อ"
        description="ติดตามสถานะการส่งของเข้าเกมของทุกคำสั่งซื้อ รายการที่ยังไม่เสร็จจะอัปเดตเองทุก 15 วินาที"
      >
        <SegmentedControl aria-label="กรองตามสถานะ" value={status} onChange={setFilter} options={FILTERS} />
      </PageHeader>

      {query.isError ? (
        <ErrorMessage
          title="โหลดคำสั่งซื้อไม่สำเร็จ"
          message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
          onRetry={() => void query.refetch()}
        />
      ) : !query.isLoading && orders.length === 0 ? (
        <EmptyState
          title={status === 'all' ? 'ยังไม่มีคำสั่งซื้อ' : 'ไม่มีคำสั่งซื้อในสถานะนี้'}
          description={
            status === 'all'
              ? 'เมื่อชำระเงินแล้ว คำสั่งซื้อและสถานะการส่งของจะแสดงที่นี่'
              : 'ลองเลือกสถานะอื่น หรือดูคำสั่งซื้อทั้งหมด'
          }
          action={
            status === 'all' ? (
              <Link href="/shop" className={buttonVariants()}>
                ไปที่ร้านค้า
              </Link>
            ) : (
              <button type="button" onClick={() => setFilter('all')} className={buttonVariants({ variant: 'secondary' })}>
                ดูทั้งหมด
              </button>
            )
          }
        />
      ) : (
        <div aria-busy={query.isFetching || undefined} className={refreshing ? 'opacity-70 transition-opacity duration-fast' : undefined}>
          {/* Mobile: cards */}
          <ul className="space-y-3 md:hidden">
            {query.isLoading
              ? Array.from({ length: 4 }, (_, i) => (
                  <li key={i}>
                    <Card padding="sm" className="flex gap-3">
                      <Skeleton className="h-12 w-12 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </Card>
                  </li>
                ))
              : orders.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} />
                  </li>
                ))}
          </ul>

          {/* Desktop: table */}
          <TableContainer className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>สินค้า</TableHeaderCell>
                  <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                  <TableHeaderCell align="right">จำนวน</TableHeaderCell>
                  <TableHeaderCell align="right">ยอด</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell>สั่งเมื่อ</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">รายละเอียด</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.isLoading ? (
                  <TableLoadingRows columns={7} />
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id} interactive onClick={() => router.push(`/orders/${order.id}`)}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2">
                            <ProductArtwork product={order.product} alt="" className="h-full w-full object-contain p-0.5" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/orders/${order.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block max-w-[260px] truncate font-medium text-fg hover:text-accent"
                            >
                              {order.product?.name ?? `สินค้า #${order.productId}`}
                            </Link>
                            <p className="font-mono text-xs text-fg-subtle">#{shortId(order.id)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell muted>
                        <span className="block max-w-[180px] truncate">
                          {order.server?.name ?? `เซิร์ฟเวอร์ #${order.serverId}`}
                        </span>
                      </TableCell>
                      <TableCell align="right" mono>
                        {order.quantity}
                      </TableCell>
                      <TableCell align="right">
                        <Amount value={order.totalPrice} size="sm" />
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell align="right">
                        <ChevronRight className="ml-auto h-4 w-4 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination ? (
            <Pagination
              className="mt-4"
              page={pagination.page}
              pageSize={pagination.limit || PAGE_SIZE}
              total={pagination.total}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-card border border-line bg-surface p-4 transition-colors duration-fast hover:border-line-strong"
    >
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2">
          <ProductArtwork product={order.product} alt="" className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-fg">{order.product?.name ?? `สินค้า #${order.productId}`}</p>
            <OrderStatusBadge status={order.status} className="shrink-0" />
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {order.server?.name ?? `เซิร์ฟเวอร์ #${order.serverId}`} · <span className="font-mono">×{order.quantity}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-fg-subtle">{formatDate(order.createdAt)}</span>
            <Amount value={order.totalPrice} size="sm" />
          </div>
        </div>
      </div>
      {order.status === 'failed' && order.lastError ? (
        <p className="mt-3 rounded-control border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{order.lastError}</p>
      ) : null}
    </Link>
  );
}

export default function OrdersPage() {
  return (
    <React.Suspense
      fallback={
        <div className="page-shell flex justify-center py-24" aria-busy="true">
          <Spinner label="กำลังโหลด" />
        </div>
      }
    >
      <OrdersContent />
    </React.Suspense>
  );
}
