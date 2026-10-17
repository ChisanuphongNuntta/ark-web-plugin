'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dinoMarketApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  Amount,
  Card,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Skeleton,
  Spinner,
  buttonVariants,
} from '@/components/ui';
import {
  DeliveryStatusBadge,
  DinoImage,
  ListingStats,
  formatDate,
  genderLabel,
  listingTitle,
  type MarketListing,
} from '../marketUi';

export default function MyPurchasesPage() {
  const { user, isLoading: authLoading } = useAuthStore();

  const purchases = useQuery({
    queryKey: ['myDinoPurchases'],
    queryFn: () => dinoMarketApi.getMyPurchases().then((res) => res.data as { purchases?: MarketListing[] }),
    enabled: Boolean(user),
    refetchInterval: (q) =>
      (q.state.data?.purchases ?? []).some((p) => p.deliveryStatus !== 'delivered' && p.deliveryStatus !== 'failed')
        ? 20_000
        : false,
  });

  const header = (
    <PageHeader
      eyebrow="ตลาดผู้เล่น"
      title="รายการซื้อของฉัน"
      description="สัตว์ที่คุณซื้อจากผู้เล่นคนอื่น และสถานะการส่งเข้าเซิร์ฟเวอร์"
    />
  );

  if (!user) {
    return (
      <div className="page-shell pb-16">
        {header}
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อดูรายการซื้อ"
            description="ประวัติการซื้อในตลาดผูกกับ IRIS ID ของคุณ"
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

  const items = purchases.data?.purchases ?? [];

  return (
    <div className="page-shell pb-16">
      {header}

      {purchases.isError ? (
        <ErrorMessage
          title="โหลดรายการซื้อไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void purchases.refetch()}
        />
      ) : purchases.isLoading ? (
        <Card padding="none" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 border-b border-line p-5 last:border-b-0">
              <Skeleton className="h-16 w-24 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการซื้อ"
          description="เมื่อคุณซื้อสัตว์จากตลาด สถานะการส่งเข้าเซิร์ฟเวอร์จะแสดงที่นี่"
          action={
            <Link href="/market" className={buttonVariants()}>
              ดูตลาด
            </Link>
          }
        />
      ) : (
        <Card padding="none">
          <ul>
            {items.map((purchase) => (
              <li
                key={purchase.id}
                className="flex flex-col gap-4 border-b border-line p-5 last:border-b-0 md:flex-row md:items-center"
              >
                <DinoImage listing={purchase} className="hidden h-16 w-24 shrink-0 rounded-control border border-line sm:block" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/market/${purchase.id}`} className="truncate text-base font-semibold text-fg hover:text-accent">
                      {listingTitle(purchase)}
                    </Link>
                    <DeliveryStatusBadge status={purchase.deliveryStatus} />
                  </div>
                  <p className="text-xs text-fg-muted">
                    {purchase.species} · {genderLabel(purchase.gender)}
                  </p>
                </div>
                <div className="md:w-80">
                  <ListingStats listing={purchase} />
                </div>
                <div className="flex items-end justify-between gap-4 md:w-40 md:flex-col md:items-end">
                  <Amount value={purchase.price} unit="IC" />
                  <span className="text-xs text-fg-subtle">ซื้อเมื่อ {formatDate(purchase.soldAt || purchase.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
