'use client';

import * as React from 'react';
import Link from 'next/link';
import { Coins, Sparkles, Eye, ExternalLink } from 'lucide-react';
import ProductDetailPopup from './ProductDetailPopup';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';

interface Product {
  id: number;
  name: string;
  description: string | null;
  blueprint: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  quality: number;
  badge?: 'HOT' | 'NEW' | 'SALE' | null;
  category?: {
    name: string;
    icon: string | null;
  } | null;
}

const qualityConfig: Record<number, {
  name: string;
  badgeVariant: 'default' | 'cyan' | 'orchid' | 'gold' | 'hot' | 'success' | 'warning' | 'info';
  cardVariant: 'default' | 'prism' | 'gold' | 'flat';
  textColor: string;
}> = {
  0: { name: 'PRIMITIVE', badgeVariant: 'default', cardVariant: 'flat', textColor: 'text-gray-400' },
  1: { name: 'RAMSHACKLE', badgeVariant: 'success', cardVariant: 'default', textColor: 'text-emerald-400' },
  2: { name: 'APPRENTICE', badgeVariant: 'info', cardVariant: 'default', textColor: 'text-blue-400' },
  3: { name: 'JOURNEYMAN', badgeVariant: 'orchid', cardVariant: 'default', textColor: 'text-purple-400' },
  4: { name: 'MASTERCRAFT', badgeVariant: 'gold', cardVariant: 'gold', textColor: 'text-iris-gold' },
  5: { name: 'ASCENDANT', badgeVariant: 'cyan', cardVariant: 'prism', textColor: 'text-iris-cyan' },
};

export function ProductCard({ product }: { product: Product }) {
  const [showPopup, setShowPopup] = React.useState(false);
  const quality = qualityConfig[product.quality] || qualityConfig[0];

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="block text-left w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan rounded-[1.65rem] transition active:scale-[0.99] group"
        aria-haspopup="dialog"
        aria-expanded={showPopup}
      >
        <GlassCard
          variant={quality.cardVariant}
          hoverEffect="glow"
          className="h-full flex flex-col justify-between"
        >
          {/* 1. Image viewport */}
          <div className="relative aspect-square bg-black/40 border-b border-white/5 overflow-hidden">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl">
                <span className="relative drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition group-hover:scale-105">
                  {product.category?.icon || '📦'}
                </span>
              </div>
            )}

            {/* Custom overlays for rarity light refraction */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent" />

            {/* HOT/NEW/SALE Badge - Top Left */}
            {product.badge && (
              <div className="absolute top-3.5 left-3.5 z-20">
                <Badge variant={product.badge === 'HOT' ? 'hot' : product.badge === 'NEW' ? 'cyan' : 'orchid'}>
                  {product.badge}
                </Badge>
              </div>
            )}

            {/* Rarity Level Badge - Top Right */}
            <div className="absolute top-3.5 right-3.5 z-20">
              <Badge variant={quality.badgeVariant} className="flex items-center gap-1 font-black">
                <Sparkles className="h-3 w-3" />
                {quality.name}
              </Badge>
            </div>

            {/* Quantity indicators */}
            {product.quantity > 1 && (
              <div className="absolute bottom-3.5 left-3.5 z-20">
                <span className="px-2 py-0.5 rounded-full bg-black/80 border border-white/10 font-mono text-[9px] font-bold text-iris-cyan">
                  x{product.quantity}
                </span>
              </div>
            )}
          </div>

          {/* 2. Text / Info Body */}
          <div className="p-5 flex-1 flex flex-col justify-between">
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-iris-muted">
                {product.category?.name || 'IRIS Official Store'}
              </p>
              <h3 className="font-display font-extrabold text-sm text-iris-pearl uppercase tracking-wide truncate group-hover:text-iris-cyan transition-colors">
                {product.name}
              </h3>
              {product.description && (
                <p className="text-xs text-iris-muted line-clamp-2 leading-relaxed">
                  {product.description}
                </p>
              )}
            </div>

            {/* 3. Footer price & inspect trigger */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/5">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="absolute inset-0 bg-iris-gold/25 rounded-full blur-md" />
                  <Coins className="h-4.5 w-4.5 text-iris-gold relative" />
                </div>
                <span className="font-mono font-black text-sm text-gradient-gold">
                  {product.price.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold text-iris-gold/60 uppercase">IC</span>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/shop/${product.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-bold text-iris-muted hover:text-iris-gold transition-colors flex items-center gap-1 uppercase tracking-wider"
                  aria-label={`ดูหน้าสินค้า ${product.name}`}
                  title={`ดูหน้าสินค้า ${product.name}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <span className="text-[10px] font-bold text-iris-muted group-hover:text-iris-cyan transition-colors flex items-center gap-1 uppercase tracking-wider">
                  ตรวจสอบ <Eye className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </GlassCard>
      </button>

      <ProductDetailPopup
        product={product}
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
      />
    </>
  );
}
