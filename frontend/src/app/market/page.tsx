'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { dinoMarketApi } from '@/lib/api';
import { useDebouncedValue } from '@/hooks';
import {
  Amount,
  Card,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { DinoImage, genderLabel, formatNumber, formatPercent, listingTitle, type MarketListing } from './marketUi';

const PAGE_SIZE = 12;

type SortField = 'createdAt' | 'price' | 'level';

const SORTS: { value: SortField; label: string }[] = [
  { value: 'createdAt', label: 'ล่าสุด' },
  { value: 'price', label: 'ราคา' },
  { value: 'level', label: 'เลเวล' },
];

const QUICK_SEARCHES = ['Rex', 'Shadowmane', 'Wyvern', 'Golem', 'Giganto'];

function ListingCard({ listing }: { listing: MarketListing }) {
  return (
    <li>
      <Link
        href={`/market/${listing.id}`}
        className="group block h-full rounded-card border border-line bg-surface transition-colors duration-fast hover:border-line-strong"
      >
        <DinoImage listing={listing} className="aspect-[16/10] rounded-t-card border-b border-line" />
        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-fg group-hover:text-accent">{listingTitle(listing)}</h3>
            <p className="truncate text-xs text-fg-muted">
              {listing.species} · {genderLabel(listing.gender)}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
            <div>
              <dt className="text-xs text-fg-subtle">เลเวล</dt>
              <dd className="font-mono text-sm tabular-nums text-fg">{formatNumber(listing.level)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">พลังชีวิต</dt>
              <dd className="font-mono text-sm tabular-nums text-fg">{formatNumber(listing.health ?? listing.baseHealth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Imprint</dt>
              <dd className="font-mono text-sm tabular-nums text-fg">{formatPercent(listing.imprintQuality)}</dd>
            </div>
          </dl>
          <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
            <span className="min-w-0 truncate text-xs text-fg-subtle">{listing.seller?.discordUsername || 'ผู้ขาย'}</span>
            <Amount value={listing.price} unit="IC" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function MarketplaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get('search') ?? '';
  const species = searchParams.get('species') ?? '';
  const gender = searchParams.get('gender') ?? '';
  const rawSort = searchParams.get('sortBy');
  const sortBy: SortField = SORTS.some((s) => s.value === rawSort) ? (rawSort as SortField) : 'createdAt';
  const sortOrder: 'asc' | 'desc' = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const updateUrl = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      const qs = next.toString();
      router.replace(qs ? `/market?${qs}` : '/market', { scroll: false });
    },
    [router, searchParams]
  );

  // Search box is local; the URL follows after a short pause so typing stays smooth.
  const [searchInput, setSearchInput] = React.useState(searchParam);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  // Follow external URL changes (back/forward, quick links) without an effect.
  const [syncedParam, setSyncedParam] = React.useState(searchParam);
  if (syncedParam !== searchParam) {
    setSyncedParam(searchParam);
    setSearchInput(searchParam);
  }
  React.useEffect(() => {
    if (debouncedSearch !== searchParam) updateUrl({ search: debouncedSearch || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const listings = useQuery({
    queryKey: ['dinoListings', searchParam, species, gender, sortBy, sortOrder, page],
    queryFn: () =>
      dinoMarketApi
        .getListings({
          search: searchParam || undefined,
          species: species || undefined,
          gender: gender || undefined,
          sortBy,
          sortOrder,
          page,
          limit: PAGE_SIZE,
        })
        .then(
          (res) =>
            res.data as {
              listings?: MarketListing[];
              pagination?: { page: number; totalPages: number; total?: number; limit?: number };
            }
        ),
    placeholderData: keepPreviousData,
  });

  const speciesList = useQuery({
    queryKey: ['dinoSpecies'],
    queryFn: () => dinoMarketApi.getSpeciesList().then((res) => res.data as { species?: { name: string; count: number }[] }),
  });

  const stats = useQuery({
    queryKey: ['marketStats'],
    queryFn: () =>
      dinoMarketApi.getStats().then((res) => res.data as { stats?: { totalListings?: number; totalVolume?: number } }),
  });

  const items = listings.data?.listings ?? [];
  const pagination = listings.data?.pagination;
  const total = pagination?.total ?? (pagination ? pagination.totalPages * PAGE_SIZE : 0);
  const hasFilters = Boolean(searchParam || species || gender);

  const SortIcon = sortOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="ตลาดผู้เล่น"
        title="ตลาดสัตว์เลี้ยง"
        description="ซื้อสัตว์จากผู้เล่นคนอื่นผ่านระบบกลาง เงินถูกกันไว้จนกว่าสัตว์จะส่งถึงเซิร์ฟเวอร์ของคุณ"
        actions={
          <dl className="flex gap-6">
            <div>
              <dt className="text-xs text-fg-subtle">กำลังขาย</dt>
              <dd className="mt-1 font-mono text-lg tabular-nums text-fg">
                {stats.isLoading ? '—' : formatNumber(stats.data?.stats?.totalListings ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">มูลค่าซื้อขายสะสม</dt>
              <dd className="mt-1">
                {stats.isLoading ? (
                  <span className="font-mono text-lg text-fg">—</span>
                ) : (
                  <Amount value={stats.data?.stats?.totalVolume ?? 0} unit="IC" size="lg" />
                )}
              </dd>
            </div>
          </dl>
        }
      />

      <Card padding="md" className="mb-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_160px]">
          <Input
            label="ค้นหา"
            placeholder="ชื่อหรือสายพันธุ์ เช่น Rex"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          />
          <Select
            label="สายพันธุ์"
            value={species}
            onChange={(e) => updateUrl({ species: e.target.value || null, page: null })}
            options={[
              { value: '', label: 'ทุกสายพันธุ์' },
              ...(speciesList.data?.species ?? []).map((s) => ({ value: s.name, label: `${s.name} (${s.count})` })),
            ]}
          />
          <Select
            label="เพศ"
            value={gender}
            onChange={(e) => updateUrl({ gender: e.target.value || null, page: null })}
            options={[
              { value: '', label: 'ทุกเพศ' },
              { value: 'Male', label: 'ตัวผู้' },
              { value: 'Female', label: 'ตัวเมีย' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-fg-subtle">ค้นหาบ่อย</span>
            {QUICK_SEARCHES.map((term) => {
              const active = searchParam.toLowerCase() === term.toLowerCase();
              return (
                <button
                  key={term}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSearchInput(active ? '' : term)}
                  className={cn(
                    'rounded-control border px-2.5 py-1 text-xs transition-colors duration-fast',
                    active
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
                  )}
                >
                  {term}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-label="เรียงตาม"
              value={sortBy}
              onChange={(field) => updateUrl({ sortBy: field === 'createdAt' ? null : field, page: null })}
              options={SORTS}
            />
            <IconButton
              aria-label={sortOrder === 'asc' ? 'เรียงน้อยไปมาก กดเพื่อสลับ' : 'เรียงมากไปน้อย กดเพื่อสลับ'}
              onClick={() => updateUrl({ sortOrder: sortOrder === 'desc' ? 'asc' : null, page: null })}
            >
              <SortIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </IconButton>
          </div>
        </div>
      </Card>

      {listings.isError ? (
        <ErrorMessage
          title="โหลดรายการในตลาดไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void listings.refetch()}
        />
      ) : listings.isLoading ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <Card padding="none">
                <Skeleton className="aspect-[16/10] rounded-b-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'ไม่พบสัตว์ที่ตรงกับตัวกรอง' : 'ยังไม่มีสัตว์วางขาย'}
          description={
            hasFilters
              ? 'ลองเปลี่ยนสายพันธุ์ เพศ หรือคำค้นหา'
              : 'ผู้เล่นวางขายได้ด้วยคำสั่ง /sell ในเกม รายการใหม่จะแสดงที่นี่'
          }
          action={
            hasFilters ? (
              <button
                type="button"
                className="text-sm text-accent underline-offset-4 hover:underline"
                onClick={() => {
                  setSearchInput('');
                  updateUrl({ search: null, species: null, gender: null, page: null });
                }}
              >
                ล้างตัวกรอง
              </button>
            ) : undefined
          }
        />
      ) : (
        <div
          aria-busy={listings.isFetching || undefined}
          className={cn(listings.isFetching && 'opacity-70 transition-opacity duration-fast')}
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </ul>
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              className="mt-8"
              page={pagination.page || page}
              pageSize={pagination.limit || PAGE_SIZE}
              total={total}
              hideSummary={pagination.total === undefined}
              onPageChange={(p) => updateUrl({ page: p <= 1 ? null : String(p) })}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <React.Suspense
      fallback={
        <div className="page-shell py-16">
          <Spinner label="กำลังโหลดตลาด" />
        </div>
      }
    >
      <MarketplaceContent />
    </React.Suspense>
  );
}
