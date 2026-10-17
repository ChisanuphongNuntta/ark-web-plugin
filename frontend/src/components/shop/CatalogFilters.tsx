'use client';

import * as React from 'react';
import type { Category } from '@/lib/contracts/types';
import { categoryLabel } from '@/lib/catalogLabels';
import { Button, Input, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface CatalogFiltersProps {
  categories: Category[];
  loading?: boolean;
  /** Selected category id (string from the URL) or null for all. */
  category: string | null;
  onCategoryChange: (id: string | null) => void;
  minPrice: string;
  maxPrice: string;
  onPriceChange: (min: string | null, max: string | null) => void;
  className?: string;
}

/**
 * Category list + IC price range. Rendered as the left column on desktop and
 * inside the filter sheet on mobile (same component, same behaviour).
 */
export function CatalogFilters({
  categories,
  loading = false,
  category,
  onCategoryChange,
  minPrice,
  maxPrice,
  onPriceChange,
  className,
}: CatalogFiltersProps) {
  const uid = React.useId();
  const row = (active: boolean) =>
    cn(
      'flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm transition-colors duration-fast',
      active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
    );

  return (
    <div className={cn('space-y-8', className)}>
      <section aria-labelledby={`${uid}-cat`}>
        <h2 id={`${uid}-cat`} className="px-3 text-xs font-medium text-fg-subtle">
          หมวดหมู่
        </h2>
        <ul className="mt-2 space-y-0.5">
          <li>
            <button type="button" className={row(!category)} aria-pressed={!category} onClick={() => onCategoryChange(null)}>
              <span>ทุกหมวดหมู่</span>
              {!category ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
            </button>
          </li>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="px-3 py-2.5">
                  <Skeleton className="h-3.5 w-3/4" />
                </li>
              ))
            : categories.map((c) => {
                const active = category === String(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={row(active)}
                      aria-pressed={active}
                      onClick={() => onCategoryChange(String(c.id))}
                    >
                      <span className="min-w-0 truncate">{categoryLabel(c.name)}</span>
                      {c._count?.products !== undefined ? (
                        <span className="font-mono text-xs text-fg-subtle">{c._count.products}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
        </ul>
      </section>

      <section aria-labelledby={`${uid}-price`} className="px-3">
        <h2 id={`${uid}-price`} className="text-xs font-medium text-fg-subtle">
          ช่วงราคา (IC)
        </h2>
        {/* Keyed by the URL values so back/forward and "ล้างตัวกรอง" reset the inputs. */}
        <PriceRange key={`${minPrice}|${maxPrice}`} minPrice={minPrice} maxPrice={maxPrice} onPriceChange={onPriceChange} />
      </section>
    </div>
  );
}

function PriceRange({
  minPrice,
  maxPrice,
  onPriceChange,
}: Pick<CatalogFiltersProps, 'minPrice' | 'maxPrice' | 'onPriceChange'>) {
  const [min, setMin] = React.useState(minPrice);
  const [max, setMax] = React.useState(maxPrice);
  const [error, setError] = React.useState<string | null>(null);

  const applyPrice = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lo = min.trim();
    const hi = max.trim();
    if ((lo && Number(lo) < 0) || (hi && Number(hi) < 0)) {
      setError('ราคาต้องไม่ติดลบ');
      return;
    }
    if (lo && hi && Number(lo) > Number(hi)) {
      setError('ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด');
      return;
    }
    setError(null);
    onPriceChange(lo || null, hi || null);
  };

  return (
    <form onSubmit={applyPrice} className="mt-3 space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="ต่ำสุด"
          type="number"
          inputMode="numeric"
          min={0}
          mono
          size="sm"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="0"
        />
        <Input
          label="สูงสุด"
          type="number"
          inputMode="numeric"
          min={0}
          mono
          size="sm"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="ไม่จำกัด"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" className="flex-1">
          ใช้ช่วงราคา
        </Button>
        {minPrice || maxPrice ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onPriceChange(null, null)}>
            ล้าง
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export default CatalogFilters;
