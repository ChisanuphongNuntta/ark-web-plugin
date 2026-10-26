'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Gift,
  CheckCircle2,
  Calendar,
  Sparkles,
  
  Shield,
  Zap,
  Clock,
  Award,
  ChevronRight,
  Flame,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface DailyReward {
  day: number;
  rewardTh: string;
  rewardEn: string;
  type: 'coins' | 'ammo' | 'potion' | 'material' | 'gear' | 'crate';
  amount: string;
  isMilestone?: boolean;
}

const SEVEN_DAY_REWARDS: DailyReward[] = [
  { day: 1, rewardTh: '50 Iris Coins', rewardEn: '50 IC', type: 'coins', amount: '50 IC' },
  { day: 2, rewardTh: '100 Iris Coins', rewardEn: '100 IC', type: 'coins', amount: '100 IC' },
  { day: 3, rewardTh: 'Medical Brew (50x)', rewardEn: 'Medical Brew (50x)', type: 'potion', amount: '50x' },
  { day: 4, rewardTh: '150 Iris Coins', rewardEn: '150 IC', type: 'coins', amount: '150 IC' },
  { day: 5, rewardTh: 'Hard Polymer (100x)', rewardEn: 'Polymer (100x)', type: 'material', amount: '100x' },
  { day: 6, rewardTh: 'Advanced Rifle Bullet (500x)', rewardEn: 'Ammo (500x)', type: 'ammo', amount: '500x' },
  { day: 7, rewardTh: '350 IC + Ascendant Loot Voucher', rewardEn: '350 IC + Ascendant Box', type: 'crate', amount: '350 IC + Crate', isMilestone: true },
];

export default function DailyRewardsPage() {
  const [currentStreak, setCurrentStreak] = useState(3);
  const [hasClaimedToday, setHasClaimedToday] = useState(false);
  const [claimedDays, setClaimedDays] = useState<number[]>([1, 2]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Load persistence
  useEffect(() => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastClaimed = localStorage.getItem('iris_daily_claimed_date');
      if (lastClaimed === todayStr) {
        setHasClaimedToday(true);
      }
      const savedStreak = localStorage.getItem('iris_daily_streak');
      if (savedStreak) setCurrentStreak(Number(savedStreak));
      const savedClaimedDays = localStorage.getItem('iris_daily_claimed_days');
      if (savedClaimedDays) setClaimedDays(JSON.parse(savedClaimedDays));
    } catch {}
  }, []);

  const handleClaimToday = () => {
    if (hasClaimedToday) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const newStreak = currentStreak + 1;
    const nextClaimedDays = [...claimedDays, currentStreak];

    setHasClaimedToday(true);
    setCurrentStreak(newStreak);
    setClaimedDays(nextClaimedDays);

    try {
      localStorage.setItem('iris_daily_claimed_date', todayStr);
      localStorage.setItem('iris_daily_streak', String(newStreak));
      localStorage.setItem('iris_daily_claimed_days', JSON.stringify(nextClaimedDays));
    } catch {}

    setFeedback('ยินดีด้วย! คุณได้รับรางวัลประจำวันนี้เรียบร้อยแล้ว · Daily Reward Claimed Successfully!');
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="page-shell max-w-6xl mx-auto py-8 sm:py-12 space-y-10 animate-slide-up">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 px-5 py-3.5 text-xs font-bold text-emerald-300 shadow-2xl backdrop-blur-xl animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-700/40 pb-6">
        <div>
          <span className="eyebrow text-iris-cyan flex items-center gap-1.5 font-bold tracking-widest text-xs uppercase">
            <Gift className="h-4 w-4" /> DAILY EXPEDITION REWARDS · กิจกรรมรับของรายวัน
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl mt-2">
            ของขวัญล็อกอินรายวัน
          </h1>
          <p className="text-xs text-iris-muted mt-1 max-w-xl">
            เช็กอินต่อเนื่องทุกวันเพื่อรับ Iris Coins, กระสุน, ยา และกล่องสุ่มไอเทม Ascendant เข้าสู่กระเป๋าของคุณทันที
          </p>
        </div>

        {/* Streak Counter Card */}
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-3 shadow-xl text-center">
            <span className="block text-[10px] text-amber-300 font-bold uppercase">เช็กอินต่อเนื่อง</span>
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-mono text-2xl font-black text-amber-300">{currentStreak}</span>
              <span className="text-xs font-bold text-amber-400">วัน (Days)</span>
            </div>
          </div>

          <Button
            size="lg"
            disabled={hasClaimedToday}
            onClick={handleClaimToday}
            className={`gap-2 font-bold shadow-xl ${
              hasClaimedToday
                ? 'bg-slate-800 text-slate-500 border border-slate-700'
                : 'bg-gradient-to-r from-iris-cyan via-blue-500 to-indigo-600 text-slate-950 shadow-[0_0_25px_rgba(160,224,244,0.3)]'
            }`}
          >
            {hasClaimedToday ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                รับแล้ววันนี้ · Claimed
              </>
            ) : (
              <>
                <Gift className="h-5 w-5" />
                กดรับรางวัลวันนี้ · Claim Today
              </>
            )}
          </Button>
        </div>
      </div>

      {/* SECTION 1: 7-Day Login Streak Showcase */}
      <div className="p-6 rounded-3xl border border-slate-700/80 bg-surface-1 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-iris-cyan" />
            <h2 className="font-serif text-2xl font-normal text-iris-pearl">
              เส้นทางของขวัญ 7 วัน · 7-Day Streak Track
            </h2>
          </div>
          <span className="text-xs text-iris-gold font-mono font-semibold">
            รีเซ็ตทุกสัปดาห์ (Weekly Cycle)
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {SEVEN_DAY_REWARDS.map((item) => {
            const isClaimed = claimedDays.includes(item.day);
            const isToday = item.day === currentStreak && !hasClaimedToday;
            const isFuture = item.day > currentStreak;

            return (
              <div
                key={item.day}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 text-center transition-all ${
                  item.isMilestone
                    ? 'border-amber-400/60 bg-gradient-to-b from-surface-3 to-surface-2 ring-1 ring-amber-400/40'
                    : isToday
                    ? 'border-iris-cyan bg-iris-cyan/15 ring-2 ring-iris-cyan shadow-[0_0_20px_rgba(160,224,244,0.2)]'
                    : isClaimed
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-700 bg-surface-1'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-400">
                    <span>DAY {item.day}</span>
                    {isClaimed && <CheckCircle2 size={13} className="text-emerald-400" />}
                  </div>

                  <div className="my-3 mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-black/40 border border-slate-700/50">
                    {item.isMilestone ? (
                      <Sparkles className="h-6 w-6 text-amber-300" />
                    ) : item.type === 'coins' ? (
                      <IrisCoin className="h-6 w-6 text-iris-gold" />
                    ) : item.type === 'ammo' ? (
                      <Zap className="h-6 w-6 text-iris-cyan" />
                    ) : (
                      <Shield className="h-6 w-6 text-purple-300" />
                    )}
                  </div>

                  <p className="font-bold text-xs text-iris-pearl truncate" title={item.rewardTh}>
                    {item.rewardTh}
                  </p>
                  <p className="text-[10px] text-slate-400 italic mt-0.5">{item.rewardEn}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <span
                    className={`block text-[10px] font-bold uppercase tracking-wider ${
                      isClaimed
                        ? 'text-emerald-400'
                        : isToday
                        ? 'text-iris-cyan animate-pulse'
                        : 'text-slate-100'
                    }`}
                  >
                    {isClaimed ? 'รับแล้ว · Claimed' : isToday ? 'พร้อมรับวันนี้' : 'รอปลดล็อก'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Rules & Delivery Info Box */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/80 bg-surface-1 p-5 space-y-2 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-iris-cyan">
            <Clock className="h-4 w-4" /> เวลาตัดรอบประจำวัน
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            ระบบจะรีเซ็ตสิทธิ์รับของรางวัลเวลา 00:00 น. ของทุกวัน (ตามเวลาประเทศไทย UTC+7) หากไม่เข้ามารับในวันนั้นๆ สตรีคจะไม่สูญหายแต่รางวัลจะขยับไปวันถัดไป
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-surface-2/80 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-iris-gold">
            <Award className="h-4 w-4" /> การส่งมอบเข้าสู่ตัวละคร
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            เหรียญ Iris Coins จะถูกบันทึกลงใน IRIS Wallet ทันที ส่วนไอเทมในเกมจะถูกจัดส่งไปยังเซิร์ฟเวอร์ที่คุณกำลังออนไลน์ หรือสามารถเคลมผ่านคำสั่ง <code className="text-iris-cyan">/claim</code> ในเกม
          </p>
        </div>
      </div>
    </div>
  );
}
