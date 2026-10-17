import Link from 'next/link';
import { ArrowUpRight, Coins, PawPrint, Sparkles } from 'lucide-react';
import type { Product } from '@/lib/contracts/types';
import { ProductArtwork } from '@/components/ProductArtwork';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';

type ProductCardProduct = Product & { badge?: 'HOT' | 'NEW' | 'SALE' | null };

const qualityConfig: Record<
  number,
  {
    name: string;
    badgeVariant: 'default' | 'cyan' | 'orchid' | 'gold' | 'success' | 'info';
    cardVariant: 'default' | 'prism' | 'gold' | 'flat';
  }
> = {
  0: { name: 'PRIMITIVE', badgeVariant: 'default', cardVariant: 'flat' },
  1: { name: 'RAMSHACKLE', badgeVariant: 'success', cardVariant: 'default' },
  2: { name: 'APPRENTICE', badgeVariant: 'info', cardVariant: 'default' },
  3: { name: 'JOURNEYMAN', badgeVariant: 'orchid', cardVariant: 'default' },
  4: { name: 'MASTERCRAFT', badgeVariant: 'gold', cardVariant: 'gold' },
  5: { name: 'ASCENDANT', badgeVariant: 'cyan', cardVariant: 'prism' },
};

export function ProductCard({ product }: { product: ProductCardProduct }) {
  const quality = qualityConfig[product.quality] ?? qualityConfig[0];

  return (
    <article className="frozen-product group h-full">
      <Link
        href={`/shop?buy=${product.id}`}
        className="flex-1 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
        aria-label={`ดูรายละเอียดสินค้า ${product.name}`}
      >
        <div className="frozen-product-art relative">
          <ProductArtwork product={product} alt="" fit="contain" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" />
          
          <div className="absolute left-3 top-3 flex gap-1.5 z-10">
            {product.badge ? (
              <Badge variant={product.badge === 'HOT' ? 'hot' : product.badge === 'NEW' ? 'cyan' : 'orchid'}>
                {product.badge}
              </Badge>
            ) : null}
            {product.productType === 'dino' ? (
              <Badge variant="success" className="flex items-center gap-1">
                <PawPrint className="h-3 w-3" /> DINO
              </Badge>
            ) : null}
          </div>

          <div className="absolute right-3 top-3 z-10">
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border border-white/10 bg-black/40 text-iris-muted">
              {quality.name}
            </span>
          </div>

          {product.quantity > 1 ? (
            <span className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/80 px-2 py-0.5 font-mono text-[9px] font-bold text-iris-cyan">
              x{product.quantity}
            </span>
          ) : null}
        </div>

        <div className="px-4 pt-4 pb-2 flex-1 flex flex-col">
          <p className="text-[10px] tracking-wider text-iris-muted uppercase mb-1.5">
            {product.category?.name || 'IRIS Store'}
          </p>
          <h3 className="font-semibold text-iris-pearl group-hover:text-iris-cyan transition-colors line-clamp-2">
            {product.name}
          </h3>
          {product.description ? (
            <p className="mt-1 text-xs text-iris-muted line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          ) : null}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-2 border-t border-slate-700/30">
        <div>
          <span className="sr-only">ราคาต่อหน่วย</span>
          <div className="flex items-center gap-1.5">
            <Coins className="h-4 w-4 text-iris-gold" />
            <span className="text-lg font-semibold tabular-nums text-iris-pearl">
              {product.price.toLocaleString()}
            </span>
            <span className="text-xs text-iris-muted">IC</span>
          </div>
        </div>
        <Link
          href={`/shop?buy=${product.id}`}
          className="frozen-product-buy"
          aria-label={`เลือกเซิร์ฟเวอร์และซื้อ ${product.name}`}
        >
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </article>
  );
}
