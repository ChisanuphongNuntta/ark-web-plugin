'use client';

import * as React from 'react';
import type { Product } from '@/lib/contracts/types';
import { getProductArtworkSrc } from '@/lib/productVisuals';
import { cn } from '@/lib/utils';

const FALLBACK_SRC = '/images/products/iris-product-generic.svg';

type VisualProduct = Pick<Product, 'id' | 'name' | 'imageUrl' | 'categoryId'> & {
  category?: { id?: number; name?: string | null; icon?: string | null } | null;
};

interface ProductArtworkProps {
  product?: VisualProduct | null;
  alt?: string;
  className?: string;
  fit?: 'cover' | 'contain';
}

/**
 * Product image on a flat surface-2 plate. Falls back to the neutral IRIS
 * placeholder when the catalogue has no image or the file fails to load.
 * Static — no hover zoom, no corner ornaments.
 */
export function ProductArtwork({ product, alt, className = 'h-full w-full', fit = 'contain' }: ProductArtworkProps) {
  const initialSrc = getProductArtworkSrc(product);
  // Remember which src failed so a new product (same instance) gets a fresh try.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const src = failedSrc === initialSrc ? FALLBACK_SRC : initialSrc;
  const placeholder = src === FALLBACK_SRC;
  const label = placeholder ? 'ยังไม่มีภาพสินค้า' : alt ?? product?.name ?? 'ภาพสินค้า';

  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== FALLBACK_SRC) setFailedSrc(initialSrc);
        }}
        className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', placeholder && 'opacity-60')}
      />
      {placeholder ? (
        <span className="absolute inset-x-2 bottom-2 text-center text-2xs text-fg-subtle" aria-hidden="true">
          ยังไม่มีภาพสินค้า
        </span>
      ) : null}
    </span>
  );
}

export default ProductArtwork;
