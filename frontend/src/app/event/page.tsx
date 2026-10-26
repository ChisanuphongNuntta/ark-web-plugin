'use client';

import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  MapPin,
  Gift,
  Swords,
  Zap,
  Flame,
  Award,
  Globe,
  Bell,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';

interface CalendarEvent {
  id: string;
  titleTh: string;
  titleEn: string;
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  time: string;
  type: 'raid' | 'boost' | 'tournament' | 'festival';
  tag: string;
  server: string;
  rewardTh: string;
  rewardEn: string;
  descriptionTh: string;
  descriptionEn: string;
}

const SAMPLE_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-1',
    titleTh: 'ศึกปราบบอสโลก: มังกรโบราณเหมันต์',
    titleEn: 'World Boss Raid: Ancient Frost Wyvern',
    dateStr: '2026-10-25',
    dayNumber: 25,
    time: '20:00 - 22:00 น.',
    type: 'raid',
    tag: 'WORLD BOSS',
    server: 'Server 1 (The Island) & Server 2 (Fjordur)',
    rewardTh: '500 IC + กล่องสุ่ม Ascendant Gear',
    rewardEn: '500 IC + Ascendant Gear Box',
    descriptionTh: 'รวมพลผู้รอดชีวิตทั่วทั้งเซิร์ฟเวอร์ร่วมโค่นจอมราชันย์มังกรหิมะ รับรางวัลไอเทมและเหรียญ IC เข้ากระเป๋าทันที',
    descriptionEn: 'Gather survivors to slay the Frost Wyvern. Earn IC coins and Ascendant loot delivered directly to your Iris Wallet.',
  },
  {
    id: 'evt-2',
    titleTh: 'เทศกาลคูณสอง: ค่าประสบการณ์ & การเก็บเกี่ยว',
    titleEn: 'Double Boost Weekend: EXP & Harvest Frenzy',
    dateStr: '2026-10-27',
    dayNumber: 27,
    time: 'ตลอดทั้งวัน (All Day)',
    type: 'boost',
    tag: 'BOOST RATE',
    server: 'ทุกเซิร์ฟเวอร์ในเครือข่าย (All Cluster)',
    rewardTh: 'EXP x2, Harvest x3, Taming x2',
    rewardEn: 'EXP x2, Harvest x3, Taming x2',
    descriptionTh: 'เพิ่มอัตราการเก็บเกี่ยวและค่าประสบการณ์คูณพิเศษ เพื่อให้ผู้รอดชีวิตพัฒนาฐานทัพและไดโนเสาร์ได้อย่างรวดเร็ว',
    descriptionEn: 'Special server multiplier active across all cluster maps to accelerate character growth and base development.',
  },
  {
    id: 'evt-3',
    titleTh: 'สัปดาห์การเพาะพันธุ์ & ฟักไข่ระดับตำนาน',
    titleEn: 'Breeding & Mutation Evolution Gala',
    dateStr: '2026-10-31',
    dayNumber: 31,
    time: '18:00 น. เป็นต้นไป',
    type: 'festival',
    tag: 'BREEDING',
    server: 'ทุกเซิร์ฟเวอร์ PvE (PvE Cluster)',
    rewardTh: 'Hatch Speed x5, Maturation x4',
    rewardEn: 'Hatch Speed x5, Maturation x4',
    descriptionTh: 'เปิดโอกาสให้นักเพาะพันธุ์ผสมสัตว์และลุ้นรับสีพิเศษ Mutation ประจำฤดูกาลฮาโลวีนเหมันต์',
    descriptionEn: 'Accelerated hatching and maturation rates with boosted chances for Halloween mutation color regions.',
  },
  {
    id: 'evt-4',
    titleTh: 'ศึกประลองชิงปราสาทอาร์กติก',
    titleEn: 'Arctic Citadel Siege Tournament',
    dateStr: '2026-11-06',
    dayNumber: 6,
    time: '21:00 - 23:30 น.',
    type: 'tournament',
    tag: 'TOURNAMENT',
    server: 'PvP Event Arena Server',
    rewardTh: 'กองกลาง 10,000 IC + ฉายา VIP พิเศษ',
    rewardEn: '10,000 IC Prize Pool + Exclusive VIP Title',
    descriptionTh: 'การแข่งขัน PvP ระหว่างเผ่าเพื่อยึดครองธงปราสาทน้ำแข็ง ถ่ายทอดสดและแจกรางวัลแก่สมาชิกในเผ่าทุกคน',
    descriptionEn: 'Inter-tribe PvP competition to conquer the ice fortress. Livestreamed with massive IC rewards.',
  },
  {
    id: 'evt-5',
    titleTh: 'มหกรรมการล่าสัตว์หายากใต้สมุทรลึก',
    titleEn: 'Abyssal Deep-Sea Expedition',
    dateStr: '2026-11-12',
    dayNumber: 12,
    time: '19:00 - 22:00 น.',
    type: 'festival',
    tag: 'EXPEDITION',
    server: 'The Abyss & Aquatic Zones',
    rewardTh: 'Chibi พิเศษ + สกินอุปกรณ์ดำน้ำ',
    rewardEn: 'Exclusive Chibi + Deep Diver Skin',
    descriptionTh: 'ดำดิ่งสู่ร่องลึกใต้สมุทรเพื่อค้นหาสิ่งมีชีวิตโบราณและอาร์ติแฟกต์ที่สูญหาย',
    descriptionEn: 'Dive into the ocean depths to uncover ancient aquatic species and lost artifacts.',
  },
];

const MONTH_NAMES = [
  { th: 'มกราคม', en: 'January' },
  { th: 'กุมภาพันธ์', en: 'February' },
  { th: 'มีนาคม', en: 'March' },
  { th: 'เมษายน', en: 'April' },
  { th: 'พฤษภาคม', en: 'May' },
  { th: 'มิถุนายน', en: 'June' },
  { th: 'กรกฎาคม', en: 'July' },
  { th: 'สิงหาคม', en: 'August' },
  { th: 'กันยายน', en: 'September' },
  { th: 'ตุลาคม', en: 'October' },
  { th: 'พฤศจิกายน', en: 'November' },
  { th: 'ธันวาคม', en: 'December' },
];

const WEEKDAYS = [
  { th: 'อา.', en: 'Sun' },
  { th: 'จ.', en: 'Mon' },
  { th: 'อ.', en: 'Tue' },
  { th: 'พ.', en: 'Wed' },
  { th: 'พฤ.', en: 'Thu' },
  { th: 'ศ.', en: 'Fri' },
  { th: 'ส.', en: 'Sat' },
];

export default function EventPage() {
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(9); // 0-indexed, 9 = October
  const [selectedDay, setSelectedDay] = useState<number | null>(25);

  const prevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonthIndex((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonthIndex((m) => m + 1);
    }
    setSelectedDay(null);
  };

  // Calendar math
  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonthIndex, 1).getDay();

  // Filter events matching selected day or all upcoming
  const eventsForSelectedDay = selectedDay
    ? SAMPLE_EVENTS.filter((e) => e.dayNumber === selectedDay)
    : SAMPLE_EVENTS;

  return (
    <div className="page-shell max-w-7xl mx-auto py-8 sm:py-12 space-y-10 animate-slide-up">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-700/40 pb-6">
        <div>
          <span className="eyebrow text-iris-cyan flex items-center gap-1.5 font-bold tracking-widest text-xs uppercase">
            <CalendarIcon className="h-4 w-4" /> SERVER CALENDAR & MILESTONES · ตารางกิจกรรม
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl mt-2">
            ปฏิทินกิจกรรมเซิร์ฟเวอร์
          </h1>
          <p className="text-xs text-iris-muted mt-1 max-w-xl">
            ติดตามตารางศึกบอสโลก อีเวนต์คูณเรต การประลอง และภารกิจสำรวจประจำฤดูกาล เตรียมความพร้อมทีมของคุณ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-slate-700/60 bg-surface-2 px-4 py-2 text-center shadow-lg">
            <span className="block text-[10px] text-iris-muted font-bold uppercase">กิจกรรมเดือนนี้</span>
            <span className="font-mono text-base font-bold text-iris-pearl">{SAMPLE_EVENTS.length} อีเวนต์</span>
          </div>
          <div className="rounded-2xl border border-iris-cyan/40 bg-iris-cyan/10 px-4 py-2 text-center shadow-lg">
            <span className="block text-[10px] text-iris-cyan font-bold uppercase">สถานะ</span>
            <span className="font-mono text-base font-bold text-emerald-400">Online Active</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: Interactive Monthly Calendar Grid */}
      <div className="p-2 sm:p-6 rounded-3xl border border-slate-700/80 bg-surface-1 shadow-2xl">
        {/* Month Navigation */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl font-bold text-iris-pearl">
              {MONTH_NAMES[currentMonthIndex].th} {currentYear}
            </h2>
            <span className="text-xs text-iris-muted font-mono uppercase tracking-wider">
              ({MONTH_NAMES[currentMonthIndex].en})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="เดือนก่อนหน้า"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700/60 bg-surface-3 text-slate-300 hover:border-iris-cyan hover:text-white transition"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentYear(2026);
                setCurrentMonthIndex(9);
                setSelectedDay(25);
              }}
              className="rounded-xl border border-slate-700/60 bg-surface-3 px-3 min-h-11 text-xs font-semibold text-slate-300 hover:border-iris-cyan hover:text-white transition"
            >
              วันนี้ · Today
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="เดือนถัดไป"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700/60 bg-surface-3 text-slate-300 hover:border-iris-cyan hover:text-white transition"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-4 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w.en} className="py-2 text-xs font-bold uppercase tracking-wider text-iris-muted">
              <span>{w.th}</span> <span className="text-[10px] text-slate-500 font-mono">({w.en})</span>
            </div>
          ))}
        </div>

        {/* Calendar Day Tiles */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-2 pt-2">
          {/* Empty cells before 1st of month */}
          {Array.from({ length: firstDayOfWeek }, (_, i) => (
            <div key={`empty-${i}`} className="min-h-[85px] rounded-xl bg-black/10 border border-transparent" />
          ))}

          {/* Days of current month */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1;
            const hasEvent = SAMPLE_EVENTS.some((e) => e.dayNumber === dayNum);
            const isToday = dayNum === 25 && currentMonthIndex === 9 && currentYear === 2026;
            const isSelected = selectedDay === dayNum;

            return (
              <button
                key={`day-${dayNum}`}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                className={`relative flex min-h-[85px] flex-col justify-between rounded-xl border p-2 text-left transition-all ${
                  isSelected
                    ? 'border-iris-cyan bg-iris-cyan/15 ring-2 ring-iris-cyan shadow-[0_0_20px_rgba(160,224,244,0.25)]'
                    : isToday
                    ? 'border-iris-gold/80 bg-iris-gold/10'
                    : hasEvent
                    ? 'border-slate-700/80 bg-surface-3 hover:border-slate-500'
                    : 'border-slate-800 bg-surface-1 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-xs font-bold ${
                      isSelected ? 'text-white' : isToday ? 'text-iris-gold font-black' : 'text-slate-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {isToday && (
                    <span className="rounded bg-iris-gold/20 px-1 py-0.2 text-[9px] font-bold text-iris-gold">
                      วันนี้
                    </span>
                  )}
                </div>

                {/* Event Indicator Pills */}
                {hasEvent && (
                  <div className="mt-1 space-y-1">
                    {SAMPLE_EVENTS.filter((e) => e.dayNumber === dayNum).map((evt) => (
                      <div
                        key={evt.id}
                        className="truncate rounded bg-cyan-950/80 border border-cyan-500/40 px-1 py-0.5 text-[9px] font-semibold text-cyan-200"
                        title={evt.titleTh}
                      >
                        {evt.tag}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Upcoming Events List as Milestones / Bullet Dots */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-iris-cyan shadow-[0_0_10px_#a0e0f4]" />
            <h2 className="font-serif text-2xl font-normal text-iris-pearl">
              {selectedDay ? `รายการกิจกรรมวันที่ ${selectedDay} ตุลาคม` : 'รายการกิจกรรมที่จะเกิดขึ้นทั้งหมด · Upcoming Events'}
            </h2>
          </div>
          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-iris-cyan hover:underline"
            >
              ดูทั้งหมด ({SAMPLE_EVENTS.length}) · Show All
            </button>
          )}
        </div>

        {eventsForSelectedDay.length === 0 ? (
          <GlassCard className="p-8 text-center text-iris-muted">
            <p className="text-sm">ไม่มีกิจกรรมที่กำหนดไว้สำหรับวันที่เลือก</p>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="mt-3 text-xs text-iris-cyan hover:underline"
            >
              แสดงกิจกรรมทั้งหมดของเซิร์ฟเวอร์
            </button>
          </GlassCard>
        ) : (
          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-gradient-to-b before:from-iris-cyan before:via-iris-gold before:to-transparent">
            {eventsForSelectedDay.map((evt, idx) => {
              const iconMap = {
                raid: Swords,
                boost: Zap,
                tournament: Award,
                festival: Sparkles,
              };
              const IconComponent = iconMap[evt.type] || Sparkles;

              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline Bullet Dot */}
                  <div className="absolute -left-[30px] sm:-left-[34px] top-4 flex h-6 w-6 items-center justify-center rounded-full border border-iris-cyan bg-surface-1 text-iris-cyan shadow-[0_0_12px_rgba(160,224,244,0.4)]">
                    <IconComponent size={12} />
                  </div>

                  {/* Event Card */}
                  <div className="rounded-2xl border border-slate-700/80 bg-surface-1 p-5 shadow-xl transition hover:border-iris-cyan/50 hover:shadow-[0_0_25px_rgba(160,224,244,0.1)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                            {evt.tag}
                          </span>
                          <span className="text-xs text-iris-muted font-mono">{evt.dateStr}</span>
                        </div>
                        <h3 className="mt-1 font-bold text-lg text-iris-pearl group-hover:text-iris-cyan transition">
                          {evt.titleTh}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">{evt.titleEn}</p>
                      </div>

                      <div className="text-right">
                        <div className="inline-flex items-center gap-1.5 text-xs text-iris-gold font-mono font-semibold">
                          <Clock size={14} />
                          <span>{evt.time}</span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-slate-300">{evt.descriptionTh}</p>
                    <p className="mt-1 text-[11px] text-iris-muted italic">{evt.descriptionEn}</p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <MapPin size={14} className="text-iris-cyan shrink-0" />
                        <span>{evt.server}</span>
                      </div>

                      <div className="flex items-center gap-1.5 rounded-lg bg-iris-gold/10 border border-iris-gold/25 px-2.5 py-1 text-iris-gold font-semibold">
                        <Gift size={14} className="shrink-0" />
                        <span>ของรางวัล: {evt.rewardTh}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
