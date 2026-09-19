'use client';

import { ArrowUpRight } from 'lucide-react';
import { categoryLabel } from '@/lib/catalogLabels';
import type { Product } from '@/lib/contracts/types';
import { ProductArtwork } from '@/components/ProductArtwork';

export function PalworldProductCard({
  product,
  onQuickBuy,
}: {
  product: Product;
  onQuickBuy?: (product: Product) => void;
}) {
  const handleClick = () => {
    if (onQuickBuy) {
      onQuickBuy(product);
    }
  };

  return (
    <article
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="frozen-product group cursor-pointer"
      aria-label={`ดูรายละเอียดและซื้อ ${product.name}`}
    >
      <div className="flex-1">
        <div className="frozen-product-art">
          <ProductArtwork
            product={product}
            alt=""
            fit="contain"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] tracking-wider text-iris-muted mb-1.5">
            {categoryLabel(product.category?.name || 'Items')}
            {product.isBlueprint ? ' · พิมพ์เขียว' : ''}
          </p>
          <h3 className="font-semibold text-iris-pearl">{product.name}</h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-2">
        <div>
          <span className="sr-only">ราคาต่อหน่วย</span>
          <span className="text-lg font-semibold tabular-nums text-iris-pearl">
            {product.price.toLocaleString()}
          </span>
          <span className="ml-1.5 text-xs text-iris-muted">IC</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="frozen-product-buy cursor-pointer"
          aria-label={`เลือกเซิร์ฟเวอร์และซื้อ ${product.name}`}
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
    </article>
  );
}
