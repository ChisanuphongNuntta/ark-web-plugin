import * as React from 'react';
import { Badge, type BadgeTone } from '@/components/ui';
import { getProductImageUrl } from '@/lib/productVisuals';
import { cn } from '@/lib/utils';

/* Presentation helpers for the player market. The backend owns escrow, prices and state. */

export interface MarketListing {
  id: string;
  species: string;
  dinoName?: string | null;
  level: number;
  gender?: string | null;
  price: number;
  status: string;
  imageUrl?: string | null;
  health?: number | null;
  melee?: number | null;
  baseHealth?: number | null;
  baseStamina?: number | null;
  baseOxygen?: number | null;
  baseFood?: number | null;
  baseWeight?: number | null;
  baseDamage?: number | null;
  addedHealth?: number | null;
  addedStamina?: number | null;
  addedOxygen?: number | null;
  addedFood?: number | null;
  addedWeight?: number | null;
  addedDamage?: number | null;
  imprintQuality?: number | null;
  mutationsMatrilineal?: number | null;
  mutationsPatrilineal?: number | null;
  colorRegions?: Record<string, number | string> | null;
  seller?: { discordUsername?: string | null } | null;
  deliveryStatus?: string | null;
  soldAt?: string | null;
  createdAt?: string | null;
}

export function listingTitle(l: Pick<MarketListing, 'dinoName' | 'species'>): string {
  return l.dinoName || l.species || 'ไม่ทราบชื่อ';
}

export function genderLabel(gender?: string | null): string {
  if (gender === 'Male') return 'ตัวผู้';
  if (gender === 'Female') return 'ตัวเมีย';
  return 'ไม่ระบุเพศ';
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('th-TH');
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

const LISTING_STATUS: Record<string, { label: string; tone: BadgeTone; outline?: boolean }> = {
  listed: { label: 'กำลังขาย', tone: 'info' },
  pending: { label: 'กำลังทำรายการ', tone: 'warning' },
  sold: { label: 'ขายแล้ว', tone: 'success' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'neutral', outline: true },
  expired: { label: 'หมดอายุ', tone: 'neutral', outline: true },
};

export function ListingStatusBadge({ status }: { status: string }) {
  const meta = LISTING_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={meta.tone} outline={meta.outline}>
      {meta.label}
    </Badge>
  );
}

const DELIVERY_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  delivered: { label: 'ส่งเข้าเกมแล้ว', tone: 'success' },
  failed: { label: 'ส่งไม่สำเร็จ', tone: 'danger' },
  delivering: { label: 'กำลังส่ง', tone: 'info' },
};

export function DeliveryStatusBadge({ status }: { status?: string | null }) {
  const meta = (status && DELIVERY_STATUS[status]) || { label: 'รอส่งเข้าเกม', tone: 'warning' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function DinoImage({
  listing,
  className,
}: {
  listing: Pick<MarketListing, 'species' | 'dinoName' | 'imageUrl'>;
  className?: string;
}) {
  const src = getProductImageUrl({ name: listing.species || listing.dinoName || 'Dinosaur', imageUrl: listing.imageUrl });
  return (
    <div className={cn('overflow-hidden bg-surface-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-center" />
    </div>
  );
}

/** Compact stat row used by list views. */
export function ListingStats({ listing }: { listing: MarketListing }) {
  const items: Array<[string, string]> = [
    ['เลเวล', formatNumber(listing.level)],
    ['พลังชีวิต', formatNumber(listing.baseHealth ?? listing.health)],
    ['โจมตี', formatNumber(listing.baseDamage)],
    ['Imprint', formatPercent(listing.imprintQuality)],
  ];
  return (
    <dl className="grid grid-cols-4 gap-4">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-fg-subtle">{label}</dt>
          <dd className="mt-0.5 font-mono text-sm tabular-nums text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
