'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Coins, ShoppingCart, Check, Sparkles, PawPrint } from 'lucide-react';
import type { Product } from '@/lib/contracts/types';
import { ProductArtwork } from '@/components/ProductArtwork';
import { useCartStore } from '@/lib/store';

type ProductCardProduct = Product & { badge?: 'HOT' | 'NEW' | 'SALE' | null };

const qualityConfig: Record<
  number,
  {
    name: string;
    badgeStyle: string;
    borderAccent: string;
  }
> = {
  0: { name: 'PRIMITIVE', badgeStyle: 'bg-zinc-800 text-zinc-300', borderAccent: 'border-white/[0.06]' },
  1: { name: 'RAMSHACKLE', badgeStyle: 'bg-emerald-900/50 text-emerald-300 border-emerald-500/20', borderAccent: 'border-emerald-500/10' },
  2: { name: 'APPRENTICE', badgeStyle: 'bg-sky-900/50 text-sky-300 border-sky-500/20', borderAccent: 'border-sky-500/10' },
  3: { name: 'JOURNEYMAN', badgeStyle: 'bg-purple-900/50 text-purple-300 border-purple-500/20', borderAccent: 'border-purple-500/10' },
  4: { name: 'MASTERCRAFT', badgeStyle: 'bg-amber-900/50 text-amber-300 border-amber-500/20', borderAccent: 'border-amber-500/20' },
  5: { name: 'ASCENDANT', badgeStyle: 'bg-cyan-900/50 text-cyan-300 border-cyan-500/30', borderAccent: 'border-cyan-500/30' },
};

interface AppleProductCardProps {
  product: ProductCardProduct;
}

export function AppleProductCard({ product }: AppleProductCardProps) {
  const quality = qualityConfig[product.quality] ?? qualityConfig[0];
  const { addItem } = useCartStore();
  const [justAdded, setJustAdded] = React.useState(false);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product.id, 1, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  };

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[#121316] border border-white/[0.08] hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:shadow-black/60">
      
      {/* Clickable Image & Details Wrapper */}
      <Link
        href={`/shop?buy=${product.id}`}
        className="block flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        aria-label={`ดูรายละเอียดสินค้า ${product.name}`}
      >
        {/* Product Visual Container */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/50">
          <ProductArtwork
            product={product}
            alt=""
            fit="cover"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#121316] via-transparent to-black/30" />

          {/* Top Badges */}
          <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5">
            {product.badge && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-rose-500 text-white shadow-sm">
                {product.badge}
              </span>
            )}
            {product.productType === 'dino' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-white/[0.1] text-white backdrop-blur-md flex items-center gap-1">
                <PawPrint className="w-3 h-3" /> DINO
              </span>
            )}
          </div>

          {/* Quality Badge */}
          <div className="absolute top-3.5 right-3.5">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${quality.badgeStyle} flex items-center gap-1 backdrop-blur-md`}>
              <Sparkles className="w-2.5 h-2.5" />
              {quality.name}
            </span>
          </div>

          {/* Multi-quantity pill */}
          {product.quantity > 1 && (
            <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/80 border border-white/10 font-mono text-[10px] font-bold text-white">
              x{product.quantity}
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 flex flex-col flex-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#86868b]">
            {product.category?.name || 'IRIS OFFICIAL'}
          </span>

          <h3 className="mt-1.5 text-base sm:text-lg font-semibold text-white group-hover:text-white/90 transition-colors line-clamp-1">
            {product.name}
          </h3>

          {product.description && (
            <p className="mt-1 text-xs text-[#86868b] line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>
      </Link>

      {/* Bottom Bar: Price & Action */}
      <div className="px-5 sm:px-6 pb-5 pt-2 flex items-center justify-between gap-3 border-t border-white/[0.06]">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-[#86868b] block font-medium">
            ราคาต่อหน่วย
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Coins className="w-3.5 h-3.5 text-iris-gold" />
            <span className="font-mono text-sm sm:text-base font-semibold text-white">
              {product.price.toLocaleString()} IC
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Button */}
          <button
            type="button"
            onClick={handleQuickAdd}
            className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 flex items-center gap-1.5 ${
              justAdded
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : 'bg-white text-black hover:bg-[#e8e8ed]'
            }`}
            aria-label={`ซื้อ ${product.name}`}
          >
            {justAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>เพิ่มแล้ว</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>ซื้อ</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
