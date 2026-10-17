'use client';
import type { Product } from '@/lib/contracts/types';
import { getProductArtworkSrc } from '@/lib/productVisuals';

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
  const src = getProductArtworkSrc(product);
  const placeholder = src.includes('iris-product-generic.svg');
  return (
    <span className={`frozen-artwork ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={placeholder ? 'ภาพประกอบระหว่างจัดเตรียมรูปสินค้า' : alt ?? product?.name ?? 'ภาพสินค้า'} loading="lazy" decoding="async" className={fit === 'contain' ? 'object-contain' : 'object-cover'} onError={event => { const image=event.currentTarget; if(!image.dataset.fallback){image.dataset.fallback='true';image.src='/images/products/iris-product-generic.svg';} }} />
      <span className={`frozen-artwork-placeholder ${placeholder ? 'is-visible' : ''}`}>กำลังจัดเตรียมรูป</span>
      <span className="frozen-artwork-corner" aria-hidden="true">✧</span>
    </span>
  );
}
