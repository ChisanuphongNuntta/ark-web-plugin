'use client';

import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Package,
  Sparkles,
  Zap,
  ShieldCheck,
  Crown,
  Flame,
  CheckCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { shopApi } from '@/lib/contracts/client';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import type { Product } from '@/lib/contracts/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Skeleton } from '@/components/ui/Skeleton';

// Map product id to curated presentation assets
const PACK_VISUAL_MAP: Record<
  number,
  {
    bgImage: string;
    tierBadge: string;
    tierColor: string;
    valueOriginal?: number;
    savingsPct?: number;
    highlights: string[];
    isFeaturedHero?: boolean;
  }
> = {
  4: {
    bgImage: '/images/packages/pkg-starter.jpg',
    tierBadge: '🟢 SURVIVAL ESSENTIAL',
    tierColor: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
    valueOriginal: 80,
    savingsPct: 37,
    highlights: [
      'บ้านไม้สำเร็จรูป Wood Base Set ครบชุด',
      'อุปกรณ์โลหะ Metal Pick & Hatchet',
      'เตียงนอน Sleeping Bag x 5 พร้อมจุดเกิด',
      'เสบียงอาหารและยาปฐมพยาบาลเบื้องต้น',
    ],
  },
  988: {
    bgImage: '/images/packages/pkg-explorer.jpg',
    tierBadge: '❄️ DUO APEX EXPEDITION',
    tierColor: 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200',
    valueOriginal: 320,
    savingsPct: 38,
    highlights: [
      'Crystal Wyvern Lv.400 (บินเร็ว ตระเวนขั้วโลก)',
      'Therizinosaurus Lv.400 (ยอดนักฟาร์มและสู้ระยะประชิด)',
      'อานขี่คุณภาพสูงแบบพร้อมใช้งาน 2 ชุด',
      'สุ่มเพศพร้อมเพาะพันธุ์สายเลือดแท้',
    ],
  },
  990: {
    bgImage: '/images/store_artwork.png',
    tierBadge: '🔥 POPULAR · COMBAT TRIO',
    tierColor: 'border-amber-400/50 bg-amber-500/20 text-amber-300',
    valueOriginal: 650,
    savingsPct: 39,
    highlights: [
      'Carcharodontosaurus Lv.400 จอมขย้ำเลือดเย็น + อาน',
      'Shadowmane Lv.400 นักล่าล่องหนแดนหิมะ (LionfishLion)',
      'Enforcer Lv.400 หุ่นยนต์ลาดตระเวนความเร็วสูง',
      'สเตตัสพร้อมรบ ลงดันเจี้ยนและถ้ำน้ำแข็งได้ทันที',
    ],
  },
  984: {
    bgImage: '/images/packages/pkg-alpha.png',
    tierBadge: '⚡ TEK & REAPER WARPACK',
    tierColor: 'border-purple-400/50 bg-purple-500/20 text-purple-200',
    valueOriginal: 800,
    savingsPct: 38,
    highlights: [
      'Tek Strider Lv.350 จอมดูดแร่และพลังงานเชื่อมโยง',
      'Xenomorph Reaper King Lv.400 ตัวผู้ x 2 ตัวพร้อมรบ',
      'บัฟเกราะธรรมชาติ ต้านทานความเสียหายมหาศาล',
      'ส่งมอบตรงเข้าตัวละครผ่านระบบ HeartShop Plugin',
    ],
  },
  993: {
    bgImage: '/images/login_wallpaper.png',
    tierBadge: '👑 ASCENDANT VAULT · BEST VALUE',
    tierColor: 'border-amber-300 bg-amber-400/25 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
    valueOriginal: 1600,
    savingsPct: 40,
    highlights: [
      'Space Whale (Astrocetus) Lv.400 + อาน Tek Saddle ยิงปืนใหญ่',
      'Rhyniognatha Lv.400 แมลงยักษ์ยกของและยิงเรซิ่น + อาน',
      'Rock Golem Lv.400 โกเลมหินยักษ์ทนทานกระสุน + อาน',
      'Tek Strider Lv.400 + Brain Slug ลักพาตัวและควบคุม',
      'ครบครันที่สุดสำหรับเผ่าที่ต้องการครองเซิร์ฟเวอร์',
    ],
    isFeaturedHero: true,
  },
};

export default function PacksPage() {
  const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'starter' | 'combat' | 'mythic'>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog-kits'],
    queryFn: async () => {
      const { categories } = await shopApi.listCategories();
      const kits = categories.find((c) => c.name === 'Kits');
      return kits ? shopApi.listProducts({ categoryId: kits.id, limit: 100 }) : null;
    },
  });

  const products = data?.products ?? [];

  // Sort: Ascendant / Featured first, then by sortOrder or price
  const sortedProducts = [...products].sort((a, b) => {
    if (a.id === 993) return -1;
    if (b.id === 993) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const filteredProducts = sortedProducts.filter((p) => {
    if (activeFilter === 'starter') return p.price <= 100;
    if (activeFilter === 'combat') return p.price > 100 && p.price <= 500;
    if (activeFilter === 'mythic') return p.price > 500;
    return true;
  });

  return (
    <>
      <div className="page-shell pb-20 space-y-12">
        {/* 1. Cinematic Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-[#061726] via-[#0b2135] to-[#040d16] p-8 sm:p-12 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-950/60 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>FROZEN EXPEDITION SUPPLIES · SEASON 1</span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            คลังยุทธภัณฑ์และ{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300">
              ชุดแพ็กเกจสำรวจ
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed">
            รวมชุดคิทและบันเดิลยุทโธปกรณ์สุดคุ้ม จัดเซ็ตไอเทมสำคัญและไดโนเสาร์ระดับสูงพร้อมลุยแดนเยือกแข็ง
            ประหยัดกว่าซื้อแยกสูงสุดถึง <strong className="text-amber-300 font-bold">40%</strong> พร้อมระบบส่งมอบอัตโนมัติเข้าตัวละครในเกมทันที
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span>ส่งมอบ RCON ภายใน 5 วินาที</span>
            </div>
            <span className="text-slate-600">●</span>
            <div className="flex items-center gap-1.5 text-emerald-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>รับประกันสินค้าไม่สูญหาย</span>
            </div>
            <span className="text-slate-600">●</span>
            <div className="flex items-center gap-1.5 text-amber-300">
              <Crown className="h-4 w-4 text-amber-400" />
              <span>ใช้ได้ทุกเซิร์ฟเวอร์ในคลัสเตอร์</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Filter Pills & Category Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: 'ทั้งหมด (All Packs)' },
            { id: 'starter', label: 'ชุดเริ่มต้น (Starter)' },
            { id: 'combat', label: 'ชุดรบและไดโนเสาร์ (Combat & Taming)' },
            { id: 'mythic', label: 'บันเดิลสูงสุด (Mythic & Vault)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                activeFilter === tab.id
                  ? 'bg-gradient-to-r from-cyan-500 to-sky-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-cyan-400/50'
                  : 'bg-slate-900/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
        >
          <span>เลือกดูไอเทมและสัตว์แยกชิ้นในร้านค้า</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 3. Products Showcase Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorMessage
          title="โหลดแพ็กเกจไม่สำเร็จ"
          message="ไม่สามารถเชื่อมต่อฐานข้อมูลสินค้า กรุณาลองใหม่อีกครั้ง"
          onRetry={refetch}
        />
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-[#081827] p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-slate-600 mb-3" />
          <h2 className="text-xl font-bold text-white">ไม่พบแพ็กเกจในหมวดหมู่นี้</h2>
          <p className="text-xs text-slate-400 mt-2">โปรดเลือกดูหมวดหมู่อื่น หรือดูสินค้าทั้งหมดในร้านค้า</p>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 transition"
          >
            ดูแพ็กเกจทั้งหมด
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {filteredProducts.map((p) => {
            const visual = PACK_VISUAL_MAP[p.id] || {
              bgImage: '/images/packages/pkg-tribesman.png',
              tierBadge: '⭐ SPECIAL KIT',
              tierColor: 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200',
              highlights: [p.description || 'ชุดแพ็กเกจพิเศษจากร้านค้า IRIS'],
            };

            const isHero = visual.isFeaturedHero;

            return (
              <div
                key={p.id}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-500 hover:-translate-y-1.5 ${
                  isHero
                    ? 'border-amber-400/60 bg-[#0c1f30] shadow-[0_0_35px_rgba(251,191,36,0.2)] md:col-span-2 lg:col-span-2'
                    : 'border-slate-700/60 bg-[#091b2c] hover:border-cyan-400/60 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]'
                }`}
              >
                {/* Visual Header with Thematic Background Artwork */}
                <div className={`relative w-full overflow-hidden ${isHero ? 'h-56 sm:h-64' : 'h-48'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visual.bgImage}
                    alt={p.name}
                    className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  {/* Cinematic gradient overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#091b2c] via-[#091b2c]/60 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#091b2c]/80 via-transparent to-transparent" />

                  {/* Badges Top Bar */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider backdrop-blur-md border ${visual.tierColor}`}
                    >
                      {visual.tierBadge}
                    </span>

                    {visual.savingsPct && (
                      <span className="rounded-full bg-rose-500/90 border border-rose-400/50 px-2.5 py-0.5 text-[10px] font-black uppercase text-white shadow-lg backdrop-blur-md">
                        ประหยัด {visual.savingsPct}%
                      </span>
                    )}
                  </div>

                  {/* Title Floating over Art Base */}
                  <div className="absolute bottom-3 left-4 right-4 space-y-1">
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-white tracking-wide drop-shadow-md">
                      {p.name}
                    </h3>
                    <p className="text-xs text-cyan-200/90 line-clamp-1 drop-shadow">
                      {p.description}
                    </p>
                  </div>
                </div>

                {/* Body Content & Inclusions */}
                <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-cyan-400" />
                      <span>รายการของและสิทธิประโยชน์ในแพ็กเกจ</span>
                    </div>

                    <div className="space-y-2">
                      {visual.highlights.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs text-slate-300 bg-black/25 px-3 py-2 rounded-xl border border-white/5"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                          <span className="leading-snug">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing & CTA Button */}
                  <div className="pt-4 border-t border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      {visual.valueOriginal && (
                        <div className="text-[11px] text-slate-500 line-through font-mono">
                          มูลค่าปกติ {visual.valueOriginal.toLocaleString()} IC
                        </div>
                      )}
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]">
                          {p.price.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-amber-300/80">IRIS COINS</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBuyingProduct(p)}
                      aria-label={`สั่งซื้อแพ็กเกจ ${p.name}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all duration-200 hover:brightness-110 active:scale-95"
                    >
                      <Sparkles className="h-4 w-4 text-cyan-200" />
                      <span>สั่งซื้อชุดนี้</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Trust & Delivery Guarantee Cockpit */}
      <section className="rounded-3xl border border-slate-700/50 bg-[#071725]/80 backdrop-blur-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <h3 className="font-display text-lg sm:text-xl font-bold text-white">
            มาตรฐานการส่งมอบสินค้าและความปลอดภัย (Delivery Protocols)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
          <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2">
            <div className="font-bold text-cyan-300 flex items-center gap-1.5">
              <Zap className="h-4 w-4" />
              <span>ส่งมอบ RCON ภายใน 5-10 วินาที</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              ระบบ HeartShop Plugin เชื่อมต่อตรงกับเซิร์ฟเวอร์ ARK เมื่อสั่งซื้อสำเร็จ ไอเทมและไดโนเสาร์จะถูกส่งเข้าตัวละครทันทีไม่ต้องรอแอดมิน
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" />
              <span>ระบบป้องกันของตกหล่น (Anti-Lost Cache)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              หากช่องเก็บของในตัวละครเต็มขณะรับของ ระบบจะสร้างกล่องนิรภัยพิเศษตกที่เท้าของผู้เล่นโดยไม่สูญหาย พร้อมแจ้งเตือนพิกัดในแชทเกม
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <Crown className="h-4 w-4" />
              <span>บันทึกประวัติการสั่งซื้อครบถ้วน</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              ตรวจสอบสถานะการรับของและคำสั่งซื้อย้อนหลังได้ตลอดเวลาที่หน้าคำสั่งซื้อ หรือติดต่อทีมงานซัพพอร์ตผ่าน Discord Ticket ได้ตลอด 24 ชั่วโมง
            </p>
          </div>
        </div>
      </section>

      </div>
      <ProductBuyModal
        product={buyingProduct}
        isOpen={!!buyingProduct}
        onClose={() => setBuyingProduct(null)}
      />
    </>
  );
}

