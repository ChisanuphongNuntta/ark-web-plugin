'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { categoryLabel } from '@/lib/catalogLabels';
import { ProductCard } from '@/components/ProductCard';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import { EmptyState, ErrorMessage, Skeleton, buttonVariants } from '@/components/ui';

const LIMIT = 8;

/** Featured products (GET /products/featured) with the category shortcuts above them. */
export function FeaturedProducts() {
  const [buying, setBuying] = React.useState<Product | null>(null);
  const featured = useQuery({ queryKey: ['catalog', 'featured'], queryFn: shopApi.listFeatured, staleTime: 60_000 });
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: shopApi.listCategories, staleTime: 60_000 });

  const products = (featured.data?.products ?? []).slice(0, LIMIT);
  const shortcuts = (categories.data?.categories ?? [])
    .filter((c) => (c._count?.products ?? 1) > 0)
    .slice(0, 8);

  return (
    <section aria-labelledby="featured-title" className="page-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ร้านค้า</p>
          <h2 id="featured-title" className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-fg">
            สินค้าแนะนำ
          </h2>
        </div>
        <Link href="/shop" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          ดูสินค้าทั้งหมด
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      {shortcuts.length > 0 ? (
        <nav aria-label="หมวดหมู่สินค้า" className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {shortcuts.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={`/shop?category=${c.id}`}
                  className="inline-flex h-9 items-center rounded-control border border-line px-3 text-sm text-fg-muted transition-colors duration-fast hover:border-line-strong hover:text-fg"
                >
                  {categoryLabel(c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mt-6">
        {featured.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true" aria-label="กำลังโหลดสินค้าแนะนำ">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
                <Skeleton className="aspect-[5/4] h-auto rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : featured.isError ? (
          <ErrorMessage
            title="โหลดสินค้าแนะนำไม่สำเร็จ"
            message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
            onRetry={() => void featured.refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title="ยังไม่มีสินค้าแนะนำ"
            description="ดูสินค้าทั้งหมดได้ในร้านค้า"
            action={
              <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                เข้าร้านค้า
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onBuy={setBuying} />
            ))}
          </div>
        )}
      </div>

      <ProductBuyModal product={buying} isOpen={!!buying} onClose={() => setBuying(null)} />
    </section>
  );
}

export default FeaturedProducts;
