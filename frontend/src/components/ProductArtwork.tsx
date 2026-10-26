'use client';
import type { Product } from '@/lib/contracts/types';
import { getProductArtworkCandidates, PRODUCT_ARTWORK_FALLBACK } from '@/lib/productVisuals';

type VisualProduct = Pick<Product, 'id' | 'name' | 'imageUrl' | 'categoryId'> & {
  category?: { id?: number; name?: string | null; icon?: string | null } | null;
};
interface ProductArtworkProps {
  product?: VisualProduct | null;
  alt?: string;
  className?: string;
  fit?: 'cover' | 'contain';
}
export function ProductArtwork({product,alt,className='h-full w-full',fit='contain'}: ProductArtworkProps) {
  const candidates = getProductArtworkCandidates(product);
  const src = candidates[0];
  const placeholder = src === PRODUCT_ARTWORK_FALLBACK;
  return (
    <span className={`frozen-artwork ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={candidates.join('|')} src={src} alt={placeholder ? 'ภาพประกอบระหว่างจัดเตรียมรูปสินค้า' : alt ?? product?.name ?? 'ภาพสินค้า'} loading="lazy" decoding="async" className={fit === 'contain' ? 'object-contain' : 'object-cover'} onError={event => {
        const image = event.currentTarget;
        const index = Number(image.dataset.candidateIndex || 0) + 1;
        if (index >= candidates.length) return;
        image.dataset.candidateIndex = String(index);
        image.src = candidates[index];
        if (candidates[index] === PRODUCT_ARTWORK_FALLBACK) {
          image.dataset.fallback = 'true';
          image.alt = 'ภาพประกอบระหว่างจัดเตรียมรูปสินค้า';
        }
      }} />
      <span className={`frozen-artwork-placeholder ${placeholder ? 'is-visible' : ''}`}>กำลังจัดเตรียมรูป</span>
    </span>
  );
}
