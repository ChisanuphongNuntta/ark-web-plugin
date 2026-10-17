'use client';

import Link from 'next/link';
import type { Product } from '@/lib/contracts/types';
import { categoryLabel } from '@/lib/catalogLabels';
import { ProductArtwork } from '@/components/ProductArtwork';
import { Amount, Badge, Button, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';

type ProductCardProduct = Product & { badge?: 'HOT' | 'NEW' | 'SALE' | null };

export interface ProductCardProps {
  product: ProductCardProduct;
  /** Opens the buy dialog in place. Without it the action links to /shop?buy=<id>. */
  onBuy?: (product: Product) => void;
  className?: string;
}

/**
 * Catalogue card: artwork, category, name, mono price and one action.
 * The card body links to the product page; "ซื้อ" opens the buy dialog
 * (server picker + quantity), so there is exactly one way to buy.
 */
export function ProductCard({ product, onBuy, className }: ProductCardProps) {
  const isDino = product.productType === 'dino';
  const category = product.category?.name ? categoryLabel(product.category.name) : null;
  const actionClass = 'h-10 px-4 sm:h-8 sm:px-3';

  return (
    <article
      className={cn(
        'group flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors duration-fast hover:border-line-strong',
        className
      )}
    >
      <Link href={`/shop/${product.id}`} className="flex flex-1 flex-col outline-offset-[-2px]">
        <div className="relative aspect-[5/4] border-b border-line bg-surface-2">
          <ProductArtwork product={product} alt={product.name} fit="contain" className="h-full w-full p-5" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {product.badge === 'NEW' ? <Badge tone="accent">ใหม่</Badge> : null}
            {product.badge === 'SALE' ? <Badge tone="accent">ราคาพิเศษ</Badge> : null}
            {isDino ? <Badge tone="neutral">สัตว์</Badge> : null}
            {product.isBlueprint ? <Badge tone="info" outline>พิมพ์เขียว</Badge> : null}
          </div>
          {product.quantity > 1 ? (
            <span className="absolute bottom-3 left-3 rounded-control border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              ×{product.quantity}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col px-4 pb-3 pt-4">
          {category ? <p className="truncate text-xs text-fg-subtle">{category}</p> : null}
          <h3 className="mt-1 line-clamp-2 break-words text-sm font-medium leading-snug text-fg transition-colors duration-fast group-hover:text-accent">
            {product.name}
          </h3>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <Amount value={product.price} />
        {onBuy ? (
          <Button
            size="sm"
            variant="secondary"
            className={actionClass}
            onClick={() => onBuy(product)}
            aria-label={`ซื้อ ${product.name}`}
          >
            ซื้อ
          </Button>
        ) : (
          <Link
            href={`/shop?buy=${product.id}`}
            className={buttonVariants({ size: 'sm', variant: 'secondary', className: actionClass })}
            aria-label={`ซื้อ ${product.name}`}
          >
            ซื้อ
          </Link>
        )}
      </div>
    </article>
  );
}

export default ProductCard;
