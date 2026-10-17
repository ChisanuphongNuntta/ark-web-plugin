'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dinoMarketApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  Amount,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Spinner,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { DinoImage, ListingStats, ListingStatusBadge, genderLabel, listingTitle, type MarketListing } from '../marketUi';

type Filter = '' | 'listed' | 'sold' | 'cancelled';

const FILTERS: { value: Filter; label: string }[] = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'listed', label: 'กำลังขาย' },
  { value: 'sold', label: 'ขายแล้ว' },
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
];

function errorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error || e?.response?.data?.message || 'ลองอีกครั้งในอีกสักครู่';
}

export default function MyListingsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = React.useState<Filter>('');
  const [cancelTarget, setCancelTarget] = React.useState<MarketListing | null>(null);

  const listings = useQuery({
    queryKey: ['myDinoListings', filter],
    queryFn: () =>
      dinoMarketApi
        .getMyListings({ status: filter || undefined })
        .then((res) => res.data as { listings?: MarketListing[] }),
    enabled: Boolean(user),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => dinoMarketApi.cancelListing(id),
    onSuccess: (res) => {
      setCancelTarget(null);
      toast.success('ยกเลิกการขายแล้ว', res.data?.message || 'สัตว์จะกลับเข้าตัวละครเมื่อคุณเข้าเซิร์ฟเวอร์');
      void queryClient.invalidateQueries({ queryKey: ['myDinoListings'] });
      void queryClient.invalidateQueries({ queryKey: ['dinoListings'] });
    },
    onError: (error) => toast.error('ยกเลิกการขายไม่สำเร็จ', errorText(error)),
  });

  const header = (
    <PageHeader
      eyebrow="ตลาดผู้เล่น"
      title="รายการขายของฉัน"
      description="สัตว์ที่คุณวางขายด้วยคำสั่ง /sell ในเกม ยกเลิกได้ตราบใดที่ยังไม่มีคนซื้อ"
    >
      {user ? <SegmentedControl aria-label="กรองตามสถานะ" value={filter} onChange={setFilter} options={FILTERS} /> : null}
    </PageHeader>
  );

  if (!user) {
    return (
      <div className="page-shell pb-16">
        {header}
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อดูรายการขาย"
            description="รายการขายผูกกับ IRIS ID และบัญชี Steam ของคุณ"
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

  const items = listings.data?.listings ?? [];

  return (
    <div className="page-shell pb-16">
      {header}

      {listings.isError ? (
        <ErrorMessage
          title="โหลดรายการขายไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void listings.refetch()}
        />
      ) : listings.isLoading ? (
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
          title={filter ? 'ไม่มีรายการในสถานะนี้' : 'ยังไม่มีรายการขาย'}
          description={
            filter ? 'ลองเลือกสถานะอื่น' : 'ใช้คำสั่ง /sell ในเกมเพื่อนำสัตว์มาวางขาย รายการจะแสดงที่นี่'
          }
          action={
            <Link href="/market" className={buttonVariants({ variant: 'secondary' })}>
              ดูตลาด
            </Link>
          }
        />
      ) : (
        <Card padding="none">
          <ul>
            {items.map((listing) => (
              <li
                key={listing.id}
                className="flex flex-col gap-4 border-b border-line p-5 last:border-b-0 md:flex-row md:items-center"
              >
                <DinoImage listing={listing} className="hidden h-16 w-24 shrink-0 rounded-control border border-line sm:block" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/market/${listing.id}`} className="truncate text-base font-semibold text-fg hover:text-accent">
                      {listingTitle(listing)}
                    </Link>
                    <ListingStatusBadge status={listing.status} />
                  </div>
                  <p className="text-xs text-fg-muted">
                    {listing.species} · {genderLabel(listing.gender)}
                  </p>
                </div>
                <div className="md:w-80">
                  <ListingStats listing={listing} />
                </div>
                <div className="flex items-center justify-between gap-4 md:w-48 md:justify-end">
                  <Amount value={listing.price} unit="IC" />
                  {listing.status === 'listed' && (
                    <Button variant="secondary" size="sm" onClick={() => setCancelTarget(listing)}>
                      ยกเลิกการขาย
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={cancelTarget ? `ยกเลิกการขาย ${listingTitle(cancelTarget)}?` : ''}
        description="สัตว์จะถูกถอนจากตลาด และกลับเข้าตัวละครของคุณเมื่อเข้าเซิร์ฟเวอร์ครั้งถัดไป"
        confirmText="ยกเลิกการขาย"
        cancelText="เก็บไว้ขายต่อ"
        variant="danger"
        loading={cancel.isPending}
        onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)}
      />
    </div>
  );
}
