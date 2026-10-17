'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Zap, Award, CheckCircle2, ShoppingCart } from 'lucide-react';
import type { DuoModel } from './AppleDuoHero';
import { useCartStore } from '@/lib/store';

interface AppleSpecDrawerProps {
  model: DuoModel | null;
  onClose: () => void;
}

export function AppleSpecDrawer({ model, onClose }: AppleSpecDrawerProps) {
  const { addItem } = useCartStore();
  const [added, setAdded] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (model) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [model]);

  if (!mounted || !model) return null;

  const handleAddToCart = () => {
    addItem(model.productId, 1, 1);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1500);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/85 backdrop-blur-2xl transition-opacity animate-fade-in"
      />

      {/* Modal Window */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] bg-[#161617] border border-white/[0.12] shadow-2xl p-6 sm:p-10 z-10 text-white my-auto animate-scale-in">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="sticky top-0 float-right grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[#86868b] hover:text-white transition-colors z-20"
          aria-label="ปิดหน้าต่างสเปก"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/[0.08] text-white/90">
            {model.badge}
          </span>
          <span className="text-xs text-[#86868b]">สเปกทางเทคนิคอย่างเป็นทางการ</span>
        </div>

        <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">
          {model.name}
        </h3>

        <p className="text-sm text-[#86868b] mt-1.5 leading-relaxed">
          {model.summary}
        </p>

        {/* Model Image Preview */}
        <div className="relative w-full aspect-[16/9] my-6 rounded-2xl overflow-hidden border border-white/[0.08] bg-black">
          <Image
            src={model.image}
            alt={model.name}
            fill
            className="object-cover object-center"
          />
        </div>

        {/* Stat Bars (Apple Spec Sheet Style) */}
        <div className="space-y-4 my-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#86868b]">
            ค่าสเตตัสทางพันธุกรรม (Genetic Invariants)
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
              <span className="text-[11px] text-[#86868b] uppercase tracking-wider">Health</span>
              <p className="text-xl font-semibold font-mono text-white mt-0.5">{model.attributes.health}</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-emerald-400 h-full rounded-full w-[95%]" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
              <span className="text-[11px] text-[#86868b] uppercase tracking-wider">Melee Damage</span>
              <p className="text-xl font-semibold font-mono text-white mt-0.5">{model.attributes.melee}</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-rose-400 h-full rounded-full w-[98%]" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
              <span className="text-[11px] text-[#86868b] uppercase tracking-wider">Stamina</span>
              <p className="text-xl font-semibold font-mono text-white mt-0.5">{model.attributes.stamina}</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-sky-400 h-full rounded-full w-[85%]" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
              <span className="text-[11px] text-[#86868b] uppercase tracking-wider">Weight Capacity</span>
              <p className="text-xl font-semibold font-mono text-white mt-0.5">{model.attributes.weight}</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full w-[90%]" />
              </div>
            </div>
          </div>
        </div>

        {/* Guarantees */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-xs text-[#86868b]">
          <div className="flex items-center gap-2 text-white/90 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>การันตีการส่งมอบแบบ Zero-Loss Auto Ledger Guard</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            ไอเทมทุกชิ้นจะถูกออกใบรับรองสิทธิ์และส่งมอบเข้าช่องเก็บของตัวละครทันทีที่ระบบชำระเงินยืนยันความถูกต้อง ไม่สูญหายแม้เซิร์ฟเวอร์เกิด Rollback
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/[0.08]">
          <div>
            <span className="text-[11px] text-[#86868b] uppercase tracking-wider">ราคาเหรียญ</span>
            <p className="text-2xl font-semibold font-mono text-white">{model.priceIC.toLocaleString()} IC</p>
          </div>

          <button
            onClick={handleAddToCart}
            className={`inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold tracking-wide transition-all ${
              added
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-black hover:bg-[#e8e8ed]'
            }`}
          >
            {added ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>เพิ่มเรียบร้อย</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                <span>สั่งซื้อรุ่นนี้</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
