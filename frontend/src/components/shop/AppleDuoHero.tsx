'use client';

import * as React from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Sparkles, ChevronRight, Check } from 'lucide-react';
import { useCartStore } from '@/lib/store';

export interface DuoModel {
  id: string;
  productId: number; // For cart integration
  name: string;
  tagline: string;
  priceIC: number;
  priceTHB: number;
  image: string;
  badge: string;
  summary: string;
  finishes: {
    id: string;
    name: string;
    colorHex: string;
    accentGlow: string;
    trait: string;
  }[];
  specs: {
    label: string;
    value: string;
    subtext: string;
  }[];
  attributes: {
    health: string;
    stamina: string;
    melee: string;
    weight: string;
  };
}

export const DUO_MODELS: DuoModel[] = [
  {
    id: 'carcha',
    productId: 1,
    name: 'Glacial Carcharodontosaurus',
    tagline: 'มหาไททันจอมทำลายล้าง. หนาวเหน็บสะท้านปฐพี.',
    priceIC: 4200,
    priceTHB: 1490,
    image: '/images/products/frost_carcha_duo.jpg',
    badge: 'FLAGSHIP APEX',
    summary: 'สายพันธุ์จอมคลั่งที่ถูกดัดแปลงด้วยผลึก Glacial Implant เพิ่มอัตราคูณดาเมจ Bloodrage สูงสุด 350% พร้อมเกล็ดน้ำแข็งสะท้อนดาเมจ',
    finishes: [
      { id: 'glacial', name: 'Glacial Titanium', colorHex: '#38bdf8', accentGlow: 'rgba(56, 189, 248, 0.25)', trait: 'ทนทานต่ออุณหภูมิติดลบ 100%' },
      { id: 'obsidian', name: 'Deep Obsidian', colorHex: '#27272a', accentGlow: 'rgba(255, 255, 255, 0.1)', trait: 'พรางตัวในความมืด ลดรัศมีตรวจจับ 40%' },
      { id: 'aurora', name: 'Aurora Amethyst', colorHex: '#c084fc', accentGlow: 'rgba(192, 132, 252, 0.25)', trait: 'อัตราฟื้นฟู Stamina +30%' },
      { id: 'amber', name: 'Solar Amber', colorHex: '#fbbf24', accentGlow: 'rgba(251, 191, 36, 0.25)', trait: 'พลังโจมตีคริติคอล Bleed +25%' },
    ],
    specs: [
      { label: 'ระดับเลเวลสูงสุด', value: '540+', subtext: 'Full Mutation 254/254' },
      { label: 'อัตราความเร็วส่งมอบ', value: '0.02s', subtext: 'Instant Cryopod Delivery' },
      { label: 'ความบริสุทธิ์สายเลือด', value: '100%', subtext: 'Verified Zero-Waste Stats' },
      { label: 'การันตีความปลอดภัย', value: 'Zero-Loss', subtext: 'Ledger Rollback Guard' },
    ],
    attributes: {
      health: '185,000 HP',
      stamina: '3,800 STAM',
      melee: '2,450% DMG',
      weight: '2,100 KG',
    },
  },
  {
    id: 'shadowmane',
    productId: 2,
    name: 'Ascendant Shadowmane',
    tagline: 'จ้าวแห่งเงาพราย. ความเร็วและความแม่นยำระดับอัลกอริทึม.',
    priceIC: 3400,
    priceTHB: 1190,
    image: '/images/products/shadowmane_duo.jpg',
    badge: 'STEALTH VELOCITY',
    summary: 'นักล่าชีวจักรกลใต้น้ำและบนบก ผสานเทคโนโลยีพรางตัว Cloak ระดับควอนตัม พร้อมท่าช็อตไฟฟ้าทะลวงเกราะกลุ่มเป้าหมาย',
    finishes: [
      { id: 'aurora', name: 'Royal Amethyst', colorHex: '#a855f7', accentGlow: 'rgba(168, 85, 247, 0.25)', trait: 'ปล่อยคลื่นกระแสไฟฟ้าทะลุเกราะ 100%' },
      { id: 'glacial', name: 'Cryo Azure', colorHex: '#06b6d4', accentGlow: 'rgba(6, 182, 212, 0.25)', trait: 'ความเร็วเคลื่อนที่ในน้ำ +50%' },
      { id: 'obsidian', name: 'Space Black', colorHex: '#18181b', accentGlow: 'rgba(255, 255, 255, 0.1)', trait: 'ระยะเวลาล่องหน Stealth เพิ่ม 2 เท่า' },
      { id: 'amber', name: 'Plasma Rose', colorHex: '#fb7185', accentGlow: 'rgba(251, 113, 133, 0.25)', trait: 'คอมโบคูลดาวน์ Teleport Dash -35%' },
    ],
    specs: [
      { label: 'ความเร็วสูงสุด', value: '3.8x', subtext: 'Sub-Light Sprint & Leap' },
      { label: 'ระบบล่องหน', value: 'True Stealth', subtext: 'Turret Radar Invisibility' },
      { label: 'ความบริสุทธิ์สายเลือด', value: '100%', subtext: 'Flawless Bred Lineage' },
      { label: 'ระบบส่งมอบ', value: 'Instant', subtext: 'Direct to Player Inventory' },
    ],
    attributes: {
      health: '98,000 HP',
      stamina: '4,500 STAM',
      melee: '1,980% DMG',
      weight: '1,450 KG',
    },
  },
];

interface AppleDuoHeroProps {
  onOpenSpecs?: (model: DuoModel) => void;
}

export function AppleDuoHero({ onOpenSpecs }: AppleDuoHeroProps) {
  const [selectedModelIndex, setSelectedModelIndex] = React.useState(0);
  const [selectedFinishIndex, setSelectedFinishIndex] = React.useState(0);
  const [justAdded, setJustAdded] = React.useState(false);

  const activeModel = DUO_MODELS[selectedModelIndex];
  const activeFinish = activeModel.finishes[selectedFinishIndex] || activeModel.finishes[0];

  const { addItem } = useCartStore();

  const handleSelectModel = (index: number) => {
    setSelectedModelIndex(index);
    setSelectedFinishIndex(0);
  };

  const handleAddToCart = () => {
    addItem(activeModel.productId, 1, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2200);
  };

  return (
    <section className="relative overflow-hidden rounded-[2.5rem] bg-[#000000] border border-white/[0.08] shadow-2xl p-6 sm:p-10 lg:p-14 mb-16">
      {/* Subtle Ambient Radial Lighting */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-30 transition-colors duration-700"
        style={{ backgroundColor: activeFinish.colorHex }}
      />
      
      {/* Top Header & Model Switcher */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-white/70" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-white/80">
            ARK IRIS FLAGSHIP DUO
          </span>
        </div>

        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-white leading-tight">
          {activeModel.name}
        </h2>

        <p className="text-base sm:text-xl font-normal text-[#86868b] max-w-2xl">
          {activeModel.tagline}
        </p>

        {/* Apple-Style Model Segmented Switcher */}
        <div className="pt-2 flex items-center p-1 rounded-full bg-[#161617] border border-white/[0.08]">
          {DUO_MODELS.map((model, idx) => {
            const isSelected = selectedModelIndex === idx;
            return (
              <button
                key={model.id}
                onClick={() => handleSelectModel(idx)}
                className={`relative px-5 sm:px-7 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                  isSelected
                    ? 'text-white'
                    : 'text-[#86868b] hover:text-white/90'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="duo-pill-selector"
                    className="absolute inset-0 rounded-full bg-white/[0.12] border border-white/[0.15] shadow-inner"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">{model.name.split(' ')[1] || model.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hero Showcase Image Stage */}
      <div className="relative z-10 my-8 sm:my-12 flex flex-col items-center">
        <div className="relative w-full max-w-4xl aspect-[16/9] overflow-hidden rounded-3xl group">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeModel.id}-${activeFinish.id}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="relative w-full h-full"
            >
              <Image
                src={activeModel.image}
                alt={activeModel.name}
                fill
                priority
                className="object-cover object-center transition-transform duration-1000 group-hover:scale-105"
                sizes="(max-width: 1200px) 100vw, 1200px"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
            </motion.div>
          </AnimatePresence>

          {/* Floating Spec Pill */}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 px-4 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-xl text-xs font-semibold tracking-wider text-white uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeFinish.colorHex }} />
            {activeModel.badge}
          </div>

          {/* Finish Trait Callout */}
          <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto max-w-md p-4 rounded-2xl bg-black/70 border border-white/10 backdrop-blur-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
              ฟินิช: {activeFinish.name}
            </p>
            <p className="text-xs sm:text-sm font-medium text-white/95 mt-0.5">
              {activeFinish.trait}
            </p>
          </div>
        </div>

        {/* Color Finish Dots Selector */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 p-2 rounded-full bg-[#161617]/80 border border-white/[0.08] backdrop-blur-md">
            {activeModel.finishes.map((finish, idx) => {
              const isSelected = selectedFinishIndex === idx;
              return (
                <button
                  key={finish.id}
                  onClick={() => setSelectedFinishIndex(idx)}
                  className={`group relative w-7 h-7 rounded-full transition-transform duration-200 flex items-center justify-center ${
                    isSelected ? 'scale-110' : 'hover:scale-105'
                  }`}
                  aria-label={`เลือกสี ${finish.name}`}
                >
                  <span
                    className="w-5 h-5 rounded-full shadow-inner border border-white/20 transition-all"
                    style={{ backgroundColor: finish.colorHex }}
                  />
                  {isSelected && (
                    <motion.span
                      layoutId="finish-ring"
                      className="absolute inset-0 rounded-full border-2 border-white"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <span className="text-[12px] font-medium text-[#86868b]">
            {activeFinish.name}
          </span>
        </div>
      </div>

      {/* Apple-Style Key Highlights (Big Typography Specs) */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-5xl mx-auto py-6 sm:py-8 border-t border-white/[0.08]">
        {activeModel.specs.map((spec, i) => (
          <div key={i} className="flex flex-col items-center text-center space-y-1">
            <span className="text-2xl sm:text-4xl font-semibold tracking-tight text-white font-mono">
              {spec.value}
            </span>
            <span className="text-xs sm:text-sm font-medium text-white/90">
              {spec.label}
            </span>
            <span className="text-[11px] text-[#86868b]">
              {spec.subtext}
            </span>
          </div>
        ))}
      </div>

      {/* Action Bar & Pricing (Apple Pill CTAs) */}
      <div className="relative z-10 mt-6 sm:mt-10 flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto pt-6 border-t border-white/[0.08]">
        <div className="flex flex-col items-center sm:items-start">
          <span className="text-xs uppercase tracking-wider text-[#86868b] font-medium">
            ราคาเปิดตัวแบบคอมพลีท
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-white font-mono">
              {activeModel.priceIC.toLocaleString()} IC
            </span>
            <span className="text-sm text-[#86868b]">
              (฿{activeModel.priceTHB.toLocaleString()})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Learn More / Full Specs */}
          {onOpenSpecs && (
            <button
              onClick={() => onOpenSpecs(activeModel)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-full text-xs sm:text-sm font-medium text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition-colors"
            >
              <span>ดูสเปกเต็ม</span>
              <ChevronRight className="w-4 h-4 text-white/70" />
            </button>
          )}

          {/* Buy Now / Add to Cart */}
          <button
            onClick={handleAddToCart}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-xs sm:text-sm font-semibold tracking-wide transition-all duration-300 ${
              justAdded
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-105'
                : 'bg-white text-black hover:bg-[#e8e8ed] shadow-lg shadow-white/10'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-4 h-4" />
                <span>เพิ่มลงตะกร้าแล้ว</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                <span>สั่งซื้อทันที</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
