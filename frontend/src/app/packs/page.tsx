'use client';

import { CLAIM_COMMAND, withClaimCommand } from '@/components/ClaimCommand';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import {
  Amount,
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  PageHeader,
  SegmentedControl,
  Skeleton,
  buttonVariants,
} from '@/components/ui';

/** Cover art for known kits; other kits rotate through the package images. */
const PACK_COVER: Record<number, string> = {
  4: '/images/packages/pkg-starter.jpg',
  984: '/images/packages/pkg-alpha.png',
  988: '/images/packages/pkg-explorer.jpg',
  990: '/images/store_artwork.png',
  993: '/images/packages/pkg-ascendant.jpg',
};
const FALLBACK_COVERS = [
  '/images/packages/pkg-survivor.jpg',
  '/images/packages/pkg-tribesman.png',
  '/images/packages/pkg-master.png',
  '/images/packages/pkg-explorer.jpg',
];

type Tier = 'all' | 'entry' | 'mid' | 'high';
const TIERS: Array<{ value: Tier; label: string; match: (price: number) => boolean }> = [
  { value: 'all', label: 'ทั้งหมด', match: () => true },
  { value: 'entry', label: 'ไม่เกิน 100 IC', match: (p) => p <= 100 },
  { value: 'mid', label: '101–500 IC', match: (p) => p > 100 && p <= 500 },
  { value: 'high', label: 'มากกว่า 500 IC', match: (p) => p > 500 },
];

const FACTS = [
  { title: 'ส่งเข้าเซิร์ฟเวอร์ที่เลือก', body: 'เลือกเซิร์ฟเวอร์ตอนซื้อ ระบบส่งของทั้งชุดเข้าเซิร์ฟเวอร์นั้นโดยตรง' },
  { title: 'ติดตามได้ทุกรายการ', body: 'ดูสถานะการส่งของแต่ละคำสั่งซื้อได้ที่หน้าคำสั่งซื้อ' },
  { title: 'ยังไม่ได้รับของ', body: `พิมพ์ ${CLAIM_COMMAND} ในแชทเกม หรือติดต่อทีมงานพร้อมเลขคำสั่งซื้อ` },
] as const;

export default function PacksPage() {
  const [buying, setBuying] = React.useState<Product | null>(null);
  const [tier, setTier] = React.useState<Tier>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog-kits'],
    queryFn: async () => {
      const { categories } = await shopApi.listCategories();
      const kits = categories.find((c) => c.name === 'Kits');
      return kits ? shopApi.listProducts({ categoryId: kits.id, limit: 100 }) : null;
    },
  });

  const packs = React.useMemo(() => {
    const list = [...(data?.products ?? [])];
    // Backend order hints only: featured first, then the admin sort order.
    list.sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return list;
  }, [data]);

  const match = TIERS.find((t) => t.value === tier)?.match ?? (() => true);
  const visible = packs.filter((p) => match(p.price));
  const counts = Object.fromEntries(TIERS.map((t) => [t.value, packs.filter((p) => t.match(p.price)).length])) as Record<Tier, number>;

  return (
    <>
      <div className="page-shell pb-20">
        <PageHeader
          eyebrow="แพ็กเกจ"
          title="แพ็กเกจรวมของ"
          description="ชุดไอเทมและสัตว์ที่จัดไว้ให้แล้ว ซื้อครั้งเดียว ส่งเข้าเซิร์ฟเวอร์ที่คุณเลือก"
          actions={
            <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
              ซื้อแยกชิ้นในร้านค้า
            </Link>
          }
        />

        {packs.length > 0 ? (
          <SegmentedControl<Tier>
            aria-label="ช่วงราคา"
            value={tier}
            onChange={setTier}
            options={TIERS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] }))}
            className="mb-6"
          />
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="กำลังโหลดแพ็กเกจ">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
                <Skeleton className="aspect-[16/9] h-auto rounded-none" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorMessage title="โหลดแพ็กเกจไม่สำเร็จ" message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง" onRetry={() => void refetch()} />
        ) : packs.length === 0 ? (
          <EmptyState
            title="ยังไม่มีแพ็กเกจวางขาย"
            description="เลือกซื้อไอเทมและสัตว์แยกชิ้นได้ในร้านค้า"
            action={
              <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                ไปที่ร้านค้า
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="ไม่มีแพ็กเกจในช่วงราคานี้"
            description="ลองเลือกช่วงราคาอื่น"
            action={
              <Button variant="secondary" onClick={() => setTier('all')}>
                ดูแพ็กเกจทั้งหมด
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((pack, index) => (
              <li key={pack.id} className="min-w-0">
                <PackCard
                  pack={pack}
                  cover={PACK_COVER[pack.id] ?? FALLBACK_COVERS[index % FALLBACK_COVERS.length]}
                  onBuy={() => setBuying(pack)}
                />
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="packs-facts" className="mt-16 border-t border-line pt-10">
          <h2 id="packs-facts" className="text-lg font-semibold text-fg">
            การส่งของ
          </h2>
          <dl className="mt-5 grid gap-6 sm:grid-cols-3">
            {FACTS.map((fact) => (
              <div key={fact.title}>
                <dt className="text-sm font-medium text-fg">{fact.title}</dt>
                <dd className="mt-1 text-sm text-fg-muted">{withClaimCommand(fact.body)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <ProductBuyModal product={buying} isOpen={!!buying} onClose={() => setBuying(null)} detailed />
    </>
  );
}

function PackCard({ pack, cover, onBuy }: { pack: Product; cover: string; onBuy: () => void }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors duration-fast hover:border-line-strong">
      <Link href={`/shop/${pack.id}`} className="flex flex-1 flex-col outline-offset-[-2px]">
        <span className="relative block aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover brightness-[.85] saturate-[.7]" />
          {pack.isFeatured ? (
            <span className="absolute left-3 top-3">
              <Badge tone="accent">แนะนำ</Badge>
            </span>
          ) : null}
        </span>
        <span className="flex flex-1 flex-col p-5">
          <span className="text-base font-semibold text-fg transition-colors duration-fast group-hover:text-accent">{pack.name}</span>
          {pack.description ? (
            <span className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-fg-muted">{pack.description}</span>
          ) : null}
        </span>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
        <Amount value={pack.price} size="lg" />
        <Button size="sm" className="h-10 px-4 sm:h-8 sm:px-3" onClick={onBuy} aria-label={`ซื้อแพ็กเกจ ${pack.name}`}>
          ซื้อแพ็กเกจ
        </Button>
      </div>
    </article>
  );
}
