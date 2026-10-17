'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { shopApi, type ProductQuery } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { categoryLabel } from '@/lib/catalogLabels';
import { ProductCard } from '@/components/ProductCard';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import { CatalogFilters } from '@/components/shop/CatalogFilters';
import {
  CATALOG_SORT_OPTIONS,
  isCatalogSort,
  sortProducts,
  type CatalogSort,
} from '@/components/shop/productLabels';
import {
  Button,
  Drawer,
  EmptyState,
  ErrorMessage,
  Input,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  buttonVariants,
} from '@/components/ui';

const PAGE_SIZE = 24;
const DINO_CATEGORY = /Dinos|Creatures/i;

type TypeFilter = 'all' | 'dino' | 'item';

function Catalog() {
  const params = useSearchParams();
  const router = useRouter();

  const category = params.get('category');
  const typeParam = params.get('type');
  const type: TypeFilter = typeParam === 'dino' || typeParam === 'item' ? typeParam : 'all';
  const search = params.get('search') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const sortParam = params.get('sort');
  const sort: CatalogSort = isCatalogSort(sortParam) ? sortParam : 'featured';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [buying, setBuying] = React.useState<Product | null>(null);

  const update = React.useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      router.push(qs ? `/shop?${qs}` : '/shop', { scroll: false });
    },
    [params, router]
  );

  const categoriesQuery = useQuery({ queryKey: ['catalog-categories'], queryFn: shopApi.listCategories, staleTime: 60_000 });

  // `sort` is forwarded so the backend can order across pages once it supports it;
  // until then the loaded page is reordered for display only (see sortProducts).
  const productQuery: ProductQuery & { sort?: CatalogSort } = {
    categoryId: category ? Number(category) : undefined,
    type: type === 'all' ? undefined : type,
    search: search || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    sort: sort === 'featured' ? undefined : sort,
    page,
    limit: PAGE_SIZE,
  };
  const productsQuery = useQuery({
    queryKey: ['contract', 'products', productQuery],
    queryFn: () => shopApi.listProducts(productQuery),
    placeholderData: (previous) => previous,
  });

  const categories = (categoriesQuery.data?.categories ?? [])
    .filter((c) => (c._count?.products ?? 1) > 0)
    .filter((c) => (type === 'all' ? true : type === 'dino' ? DINO_CATEGORY.test(c.name) : !DINO_CATEGORY.test(c.name)));
  const activeCategory = categoriesQuery.data?.categories.find((c) => String(c.id) === category) ?? null;

  /* ?buy=<id> opens the buy dialog (links from cards, home, product page). */
  const buyParam = params.get('buy');
  const buyId = buyParam && /^\d+$/.test(buyParam) ? Number(buyParam) : null;
  const listedMatch = buyId !== null ? productsQuery.data?.products.find((p) => p.id === buyId) ?? null : null;
  const buyLookup = useQuery({
    queryKey: ['contract', 'product', buyId],
    queryFn: () => shopApi.getProduct(buyId as number),
    enabled: buyId !== null && !listedMatch && !productsQuery.isLoading,
    retry: false,
  });
  const paramProduct = buyId !== null ? listedMatch ?? buyLookup.data?.product ?? null : null;
  const dialogProduct = buying ?? paramProduct;

  const closeBuy = () => {
    setBuying(null);
    if (buyParam) {
      const next = new URLSearchParams(params.toString());
      next.delete('buy');
      const qs = next.toString();
      router.replace(qs ? `/shop?${qs}` : '/shop', { scroll: false });
    }
  };

  const products = sortProducts(productsQuery.data?.products ?? [], sort);
  const total = productsQuery.data?.pagination.total ?? 0;
  const activeFilterCount = (category ? 1 : 0) + (minPrice || maxPrice ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || !!search || type !== 'all';

  const filters = (
    <CatalogFilters
      categories={categories}
      loading={categoriesQuery.isLoading}
      category={category}
      onCategoryChange={(id) => {
        update({ category: id, page: null });
        setFiltersOpen(false);
      }}
      minPrice={minPrice}
      maxPrice={maxPrice}
      onPriceChange={(min, max) => {
        update({ minPrice: min, maxPrice: max, page: null });
        setFiltersOpen(false);
      }}
    />
  );

  return (
    <>
      <div className="page-shell pb-20">
        <PageHeader
          eyebrow="ร้านค้า"
          title="สินค้าทั้งหมด"
          description="ไอเทม สัตว์ และแพ็กเกจ ส่งเข้าเซิร์ฟเวอร์ที่คุณเลือกโดยตรง"
          actions={
            <>
              <Link href="/packs" className={buttonVariants({ variant: 'ghost' })}>
                แพ็กเกจ
              </Link>
              <Link href="/orders" className={buttonVariants({ variant: 'secondary' })}>
                คำสั่งซื้อของฉัน
              </Link>
            </>
          }
        />

        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-y border-line py-4 md:flex-row md:items-end">
          <SegmentedControl<TypeFilter>
            aria-label="ประเภทสินค้า"
            value={type}
            onChange={(value) => update({ type: value === 'all' ? null : value, category: null, page: null })}
            options={[
              { value: 'all', label: 'ทั้งหมด' },
              { value: 'dino', label: 'สัตว์' },
              { value: 'item', label: 'ไอเทม' },
            ]}
            className="self-start md:self-auto"
          />
          <form
            key={search}
            role="search"
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get('search') ?? '').trim();
              update({ search: value || null, page: null });
            }}
          >
            <Input
              name="search"
              label="ค้นหาสินค้า"
              hideLabel
              defaultValue={search}
              placeholder="ค้นหาชื่อสินค้า เช่น Rex, Saddle"
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
              wrapperClassName="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary">
              ค้นหา
            </Button>
          </form>
          <div className="flex items-end gap-2">
            <Select
              label="เรียงตาม"
              hideLabel
              value={sort}
              onChange={(event) => update({ sort: event.target.value === 'featured' ? null : event.target.value, page: null })}
              options={CATALOG_SORT_OPTIONS}
              wrapperClassName="w-full md:w-44"
            />
            <Button
              variant="secondary"
              className="shrink-0 lg:hidden"
              onClick={() => setFiltersOpen(true)}
              leftIcon={<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
            >
              ตัวกรอง
              {activeFilterCount > 0 ? <span className="font-mono text-xs text-accent">{activeFilterCount}</span> : null}
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside aria-label="ตัวกรองสินค้า" className="hidden lg:block">
            <div className="sticky top-[calc(var(--header-h,64px)+24px)]">{filters}</div>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg-muted" aria-live="polite">
                {productsQuery.isLoading ? (
                  'กำลังโหลดสินค้า'
                ) : productsQuery.isError ? (
                  'โหลดรายการไม่สำเร็จ'
                ) : (
                  <>
                    <span className="font-mono text-fg">{total.toLocaleString('th-TH')}</span> รายการ
                  </>
                )}
              </p>
              {hasAnyFilter ? (
                <ul className="flex flex-wrap items-center gap-2" aria-label="ตัวกรองที่ใช้อยู่">
                  {search ? <FilterChip label={`“${search}”`} onRemove={() => update({ search: null, page: null })} /> : null}
                  {activeCategory ? (
                    <FilterChip label={categoryLabel(activeCategory.name)} onRemove={() => update({ category: null, page: null })} />
                  ) : null}
                  {minPrice || maxPrice ? (
                    <FilterChip
                      label={`${minPrice || '0'}–${maxPrice || '∞'} IC`}
                      mono
                      onRemove={() => update({ minPrice: null, maxPrice: null, page: null })}
                    />
                  ) : null}
                  <li>
                    <Link href="/shop" className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                      ล้างตัวกรอง
                    </Link>
                  </li>
                </ul>
              ) : null}
            </div>

            <div className="mt-5">
              {productsQuery.isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="กำลังโหลดสินค้า">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
                      <Skeleton className="aspect-[5/4] h-auto rounded-none" />
                      <div className="space-y-2 p-4">
                        <Skeleton className="h-3 w-1/3" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="mt-4 h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : productsQuery.isError ? (
                <ErrorMessage
                  title="โหลดสินค้าไม่สำเร็จ"
                  message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
                  onRetry={() => void productsQuery.refetch()}
                />
              ) : products.length === 0 ? (
                <EmptyState
                  title="ไม่พบสินค้าที่ตรงกับตัวกรอง"
                  description="ลองใช้คำค้นที่สั้นลง เปลี่ยนหมวดหมู่ หรือล้างช่วงราคา"
                  action={
                    hasAnyFilter ? (
                      <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                        ล้างตัวกรองทั้งหมด
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <div
                  className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
                  aria-busy={productsQuery.isFetching || undefined}
                >
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} onBuy={setBuying} />
                  ))}
                </div>
              )}
            </div>

            <Pagination
              className="mt-10"
              page={page}
              pageSize={productsQuery.data?.pagination.limit || PAGE_SIZE}
              total={total}
              onPageChange={(next) => {
                update({ page: next > 1 ? String(next) : null });
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        </div>
      </div>

      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} side="right" size="sm" title="ตัวกรอง">
        <div className="px-2 py-5">{filters}</div>
      </Drawer>

      <ProductBuyModal product={dialogProduct} isOpen={!!dialogProduct} onClose={closeBuy} />
    </>
  );
}

function FilterChip({ label, onRemove, mono = false }: { label: string; onRemove: () => void; mono?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line-strong px-2.5 text-xs text-fg transition-colors duration-fast hover:bg-surface-2"
        aria-label={`เอาตัวกรอง ${label} ออก`}
      >
        <span className={mono ? 'font-mono' : undefined}>{label}</span>
        <X className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </li>
  );
}

function CatalogFallback() {
  return (
    <div className="page-shell pb-20 pt-10" aria-busy="true">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
    </div>
  );
}

export default function ShopPage() {
  return (
    <React.Suspense fallback={<CatalogFallback />}>
      <Catalog />
    </React.Suspense>
  );
}
