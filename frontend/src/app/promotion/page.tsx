'use client';

import Link from 'next/link';
import { Tag, Sparkles, Clock, ShoppingBag, ShieldCheck, Gift } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function PromotionPage() {
  return (
    <div className="page-shell max-w-5xl mx-auto py-10 sm:py-16 space-y-10 animate-slide-up">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="eyebrow text-iris-cyan flex items-center justify-center gap-1.5 font-bold tracking-widest text-xs uppercase">
          <Tag className="h-4 w-4" /> SPECIAL OFFERS & DISCOUNTS · แคมเปญโปรโมชั่น
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl">
          โปรโมชั่นและข้อเสนอพิเศษ
        </h1>
        <p className="text-xs text-iris-muted max-w-md mx-auto">
          ติดตามแคมเปญลดราคา แพ็กเกจสุดคุ้ม และสิทธิพิเศษสำหรับผู้รอดชีวิตแห่ง Iris
        </p>
      </div>

      {/* Main Empty / Teaser State Card */}
      <div className="p-8 sm:p-12 text-center rounded-3xl border border-slate-700/80 bg-surface-1 shadow-2xl space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-iris-cyan/30 bg-iris-cyan/10 text-iris-cyan shadow-[0_0_25px_rgba(160,224,244,0.15)]">
          <Clock className="h-8 w-8" />
        </div>

        <div className="space-y-2 max-w-lg mx-auto">
          <h2 className="font-serif text-2xl font-bold text-iris-pearl">
            ขณะนี้ยังไม่มีโปรโมชั่นเปิดใช้งาน
          </h2>
          <p className="text-xs font-mono text-iris-cyan uppercase tracking-wider">
            No Active Promotions Right Now
          </p>
          <p className="text-xs text-slate-400 leading-relaxed pt-2">
            ทีมงานกำลังจัดเตรียมแคมเปญพิเศษประจำฤดูกาลถัดไป คุณสามารถตรวจสอบสินค้ามาตรฐานในร้านค้า หรือรับเหรียญฟรีจากกิจกรรมรับของรายวันได้ทันที
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/shop">
            <Button className="gap-2 bg-gradient-to-r from-iris-cyan to-blue-500 text-slate-950 font-bold">
              <ShoppingBag className="h-4 w-4" />
              ไปยังร้านค้า · Explore Shop
            </Button>
          </Link>
          <Link href="/rewards">
            <Button variant="secondary" className="gap-2">
              <Gift className="h-4 w-4 text-iris-gold" />
              รับของรายวัน · Daily Claim
            </Button>
          </Link>
        </div>
      </div>

      {/* Upcoming Promotions Preview Teasers */}
      <div className="space-y-4">
        <h3 className="font-serif text-xl font-normal text-iris-pearl flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-iris-gold" />
          <span>แคมเปญที่เตรียมเปิดตัวเร็วๆ นี้ · Upcoming Campaigns</span>
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-700/50 bg-surface-3/80 p-5 space-y-2">
            <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300 uppercase">
              COMING SOON
            </span>
            <h4 className="font-bold text-sm text-iris-pearl">มหกรรมลดราคาเหมันต์</h4>
            <p className="text-[11px] text-iris-muted">
              Winter Expedition Sale: ลดราคาอานและชุดพิมพ์เขียวระดับสูง สูงสุดถึง 30%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-surface-3/80 p-5 space-y-2">
            <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
              VIP SPECIAL
            </span>
            <h4 className="font-bold text-sm text-iris-pearl">โบนัสเติมเงิน X2</h4>
            <p className="text-[11px] text-iris-muted">
              VIP Top-up Multiplier: รับโบนัสแต้มสะสมและ Iris Coin เพิ่มเป็นสองเท่า
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-surface-3/80 p-5 space-y-2">
            <span className="rounded bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 uppercase">
              PASS BOOST
            </span>
            <h4 className="font-bold text-sm text-iris-pearl">เร่งระดับไอริสพาส</h4>
            <p className="text-[11px] text-iris-muted">
              Iris Pass Expedition Rush: ปลดล็อกระดับพาสเร็วขึ้นสองเท่าตลอดสุดสัปดาห์
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
