'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { categoryLabel } from '@/lib/catalogLabels';
import { ProductArtwork } from '@/components/ProductArtwork';
import { ProductCard } from '@/components/ProductCard';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import { PRODUCT_TYPE_LABEL, QUALITY_LABEL } from '@/components/shop/productLabels';
import {
  Amount,
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Skeleton,
  buttonVariants,
} from '@/components/ui';

const STEPS = [
  'กด “เลือกเซิร์ฟเวอร์และซื้อ” แล้วเลือกเซิร์ฟเวอร์ที่ตัวละครของคุณอยู่',
  'ตรวจยอดในตะกร้า ยอดสุดท้ายรวมส่วนลดยืนยันในขั้นตอนชำระเงิน',
  'ระบบส่งของเข้าเกมให้อัตโนมัติ ถ้ายังไม่ได้รับ พิมพ์ /iris claim ในแชทเกม',
] as const;

/**
 * Product page — the same facts as the buy dialog, laid out as a page:
 * artwork, name, mono price, specs, one primary action that opens the dialog
 * (server picker + quantity), then related products from the same category.
 */
export function ProductDetail({ id }: { id: number }) {
  const [buying, setBuying] = React.useState<Product | null>(null);
  const valid = Number.isInteger(id) && id > 0;

  const productQuery = useQuery({
    queryKey: ['contract', 'product', id],
    queryFn: () => shopApi.getProduct(id),
    enabled: valid,
    retry: 1,
  });
  const product = productQuery.data?.product ?? null;
  const categoryId = product?.category?.id ?? product?.categoryId ?? null;

  const relatedQuery = useQuery({
    queryKey: ['contract', 'products', { categoryId, limit: 5, related: id }],
    queryFn: () => shopApi.listProducts({ categoryId: categoryId ?? undefined, limit: 5 }),
    enabled: categoryId !== null,
    staleTime: 60_000,
  });
  const related = (relatedQuery.data?.products ?? []).filter((p) => p.id !== id).slice(0, 4);

  if (!valid || (productQuery.isSuccess && !product)) {
    return (
      <div className="page-shell py-16">
        <EmptyState
          title="ไม่พบสินค้านี้"
          description="สินค้าอาจถูกปิดการขายแล้ว ลองค้นหาสินค้าที่ใกล้เคียงในร้านค้า"
          action={
            <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
              กลับไปที่ร้านค้า
            </Link>
          }
        />
      </div>
    );
  }

  if (productQuery.isLoading) {
    return (
      <div className="page-shell pb-20 pt-8" aria-busy="true" aria-label="กำลังโหลดสินค้า">
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-square h-auto rounded-card" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-8 h-10 w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (productQuery.isError || !product) {
    const notFound = (productQuery.error as { status?: number } | null)?.status === 404;
    return (
      <div className="page-shell py-16">
        {notFound ? (
          <EmptyState
            title="ไม่พบสินค้านี้"
            description="สินค้าอาจถูกปิดการขายแล้ว"
            action={
              <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                กลับไปที่ร้านค้า
              </Link>
            }
          />
        ) : (
          <ErrorMessage
            title="โหลดสินค้าไม่สำเร็จ"
            message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
            onRetry={() => void productQuery.refetch()}
          />
        )}
      </div>
    );
  }

  const isDino = product.productType === 'dino';
  const category = product.category?.name ? categoryLabel(product.category.name) : null;
  const typeLabel = PRODUCT_TYPE_LABEL[product.productType ?? 'item'] ?? 'ไอเทม';

  return (
    <div className="page-shell pb-20 pt-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="overflow-hidden rounded-card border border-line bg-surface-2">
          <ProductArtwork product={product} alt={product.name} fit="contain" className="aspect-square w-full p-10 sm:p-14" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{typeLabel}</Badge>
            {category && categoryId !== null ? (
              <Link href={`/shop?category=${categoryId}`} className="rounded-control">
                <Badge tone="neutral" outline className="transition-colors duration-fast hover:text-fg">
                  {category}
                </Badge>
              </Link>
            ) : null}
            {product.isBlueprint ? <Badge tone="info" outline>พิมพ์เขียว</Badge> : null}
          </div>
          <h1 className="mt-4 break-words text-2xl font-semibold leading-snug tracking-[-0.015em] text-fg sm:text-3xl">
            {product.name}
          </h1>
          {product.description ? <p className="mt-3 whitespace-pre-line text-base text-fg-muted">{product.description}</p> : null}

          <div className="mt-8 flex items-baseline gap-3 border-t border-line pt-6">
            <span className="text-sm text-fg-subtle">ราคาต่อชิ้น</span>
            <Amount value={product.price} size="xl" />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => setBuying(product)}>
              เลือกเซิร์ฟเวอร์และซื้อ
            </Button>
            <Link href="/shop" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
              ดูสินค้าอื่น
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            <Spec label="ประเภท" value={typeLabel} />
            <Spec label="จำนวนต่อชุด" value={<span className="font-mono">{product.quantity ?? 1}</span>} />
            <Spec label="คุณภาพ" value={isDino ? '—' : QUALITY_LABEL[product.quality ?? 0] ?? '—'} />
            <Spec label="จำกัดต่อคน" value={product.maxPerUser ? <span className="font-mono">{product.maxPerUser}</span> : 'ไม่จำกัด'} />
          </dl>

          <section aria-labelledby="delivery-steps" className="mt-10">
            <h2 id="delivery-steps" className="text-sm font-semibold text-fg">
              การรับของ
            </h2>
            <ol className="mt-3 space-y-2.5">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-fg-muted">
                  <span className="font-mono text-xs leading-[1.7rem] text-accent">{String(index + 1).padStart(2, '0')}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {isDino ? (
              <p className="mt-4 text-xs text-fg-subtle">สัตว์ซื้อได้ครั้งละ 1 ตัว และส่งได้เฉพาะเซิร์ฟเวอร์ที่รองรับการส่งสัตว์</p>
            ) : null}
          </section>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-20">
          <div className="flex items-end justify-between gap-4">
            <h2 id="related-title" className="text-lg font-semibold text-fg">
              สินค้าในหมวดเดียวกัน
            </h2>
            {categoryId !== null ? (
              <Link href={`/shop?category=${categoryId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                ดูทั้งหมด
              </Link>
            ) : null}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} onBuy={setBuying} />
            ))}
          </div>
        </section>
      ) : null}

      <ProductBuyModal product={buying} isOpen={!!buying} onClose={() => setBuying(null)} detailed={buying?.id !== product.id} />
    </div>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{value}</dd>
    </div>
  );
}

export default ProductDetail;
