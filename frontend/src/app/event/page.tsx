'use client';

import { Calendar, Clock, Gift, Trophy, Users, Sparkles, Star } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
import { useState, useEffect } from 'react';

// Mock events - fully visually styled
const events = [
  {
    id: 1,
    title: 'Boss Hunt Weekend',
    description: 'ล่าบอสร่วมกัน! ร่วมกำจัดบอสใหญ่ของเซิร์ฟเวอร์ครบ 10 ตัว เพื่อรับพิมพ์เขียวระดับ Mastercraft และ Ascendant',
    imageUrl: null,
    icon: '🦖',
    startDate: '2026-05-25',
    endDate: '2026-05-28',
    status: 'active',
    rewards: ['Ascendant Giga Saddle x1', 'Iris Coin x500', 'Exclusive Champion Tag'],
    gradient: 'from-red-600 via-orange-600 to-red-500',
    participants: 128,
  },
  {
    id: 2,
    title: 'Summer Survival Celebration',
    description: 'กิจกรรมรับหน้าร้อนสุดเดือด! เพียงเข้าล็อกอินบนเว็บไซต์ติดต่อกันทุกวันเพื่อรับสุ่มไข่ไดโนเสาร์อักขระพิเศษฟรี',
    imageUrl: null,
    icon: '🎆',
    startDate: '2026-05-20',
    endDate: '2026-06-05',
    status: 'active',
    rewards: ['Daily Summer Dropbox', 'Summer Special Skin', 'Firework Emote (Permanent)'],
    gradient: 'from-emerald-600 via-ark-primary to-ark-accent',
    participants: 456,
  },
  {
    id: 3,
    title: 'PvP Tournament Season 5',
    description: 'แข่งขันประกาศความแข็งแกร่งศึก PVP ทัวร์นาเมนต์ระดับภูมิภาค ชิงเงินรางวัลรวมกว่า 10,000 Iris Coins!',
    imageUrl: null,
    icon: '⚔️',
    startDate: '2026-06-10',
    endDate: '2026-06-17',
    status: 'upcoming',
    rewards: ['1st: 5,000 IC + Trophy', '2nd: 3,000 IC', '3rd: 2,000 IC'],
    gradient: 'from-ark-gold via-yellow-500 to-amber-300',
    participants: 64,
  },
  {
    id: 4,
    title: 'Christmas Giveaway',
    description: 'กิจกรรมแจกของรางวัลส่งท้ายปีเก่าต้อนรับปีใหม่ ย้อนหลังความสำเร็จปีที่ผ่านมา สุ่มผู้โชคดีแจกหินสเตท',
    imageUrl: null,
    icon: '🎄',
    startDate: '2025-12-20',
    endDate: '2025-12-31',
    status: 'ended',
    rewards: ['Random Legendary Item', 'Christmas Skin Pack'],
    gradient: 'from-green-600 via-emerald-600 to-green-500',
    participants: 892,
  },
];

const statusConfig = {
  active: {
    label: 'กำลังดำเนินการ',
    color: 'text-ark-primary bg-ark-primary/10 border-ark-primary/30',
    glow: 'bg-ark-primary/30',
  },
  upcoming: {
    label: 'เร็วๆ นี้',
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    glow: 'bg-yellow-500/30',
  },
  ended: {
    label: 'สิ้นสุดแล้ว',
    color: 'text-gray-500 bg-white/2 border-white/5',
    glow: 'bg-white/5',
  },
};

export default function EventPage() {
  const [countdown, setCountdown] = useState({ hours: 14, mins: 32, secs: 15 });

  // Clock ticking
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.secs > 0) return { ...prev, secs: prev.secs - 1 };
        if (prev.mins > 0) return { ...prev, mins: prev.mins - 1, secs: 59 };
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, mins: 59, secs: 59 };
        return { hours: 23, mins: 59, secs: 59 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const activeEvents = events.filter(e => e.status === 'active');
  const upcomingEvents = events.filter(e => e.status === 'upcoming');
  const endedEvents = events.filter(e => e.status === 'ended');

  return (
    <div className="space-y-8 py-6 relative">
      
      {/* Page Title */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-ark-primary/10 rounded-2xl blur-2xl"></div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-ark-primary via-ark-accent to-ark-primary bg-clip-text text-transparent relative flex items-center gap-3 tracking-widest uppercase">
          <div className="relative">
            <div className="absolute inset-0 bg-ark-primary/25 rounded-full blur-md animate-pulse"></div>
            <Calendar className="h-8 w-8 text-ark-primary relative" />
          </div>
          SEASON CHRONICLE
        </h1>
      </div>

      {/* Active Events */}
      {activeEvents.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <Sparkles className="h-5 w-5 text-ark-primary animate-pulse" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">กำลังดำเนินการ</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeEvents.map((event) => (
              <EventCard key={event.id} event={event} countdown={countdown} formatDate={formatDate} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <Clock className="h-5 w-5 text-ark-gold" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">กิจกรรมเร็วๆ นี้</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} countdown={null} formatDate={formatDate} />
            ))}
          </div>
        </section>
      )}

      {/* Ended Events */}
      {endedEvents.length > 0 && (
        <section className="space-y-6 opacity-60">
          <div className="flex items-center gap-3 px-1">
            <Trophy className="h-5 w-5 text-gray-500" />
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">กิจกรรมที่สิ้นสุดแล้ว</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {endedEvents.map((event) => (
              <EventCard key={event.id} event={event} countdown={null} formatDate={formatDate} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function EventCard({ event, countdown, formatDate }: { event: typeof events[0], countdown: { hours: number, mins: number, secs: number } | null, formatDate: any }) {
  const status = statusConfig[event.status as keyof typeof statusConfig];

  return (
    <LaserCard withBeam={event.status === 'active'} variant={event.status === 'active' ? 'primary' : event.status === 'upcoming' ? 'gold' : 'default'} glowOnHover>
      <div className="relative overflow-hidden bg-gradient-to-b from-ark-panel/60 to-ark-dark/40">
        
        {/* Background visual overlay */}
        <div className={`absolute inset-0 bg-gradient-to-br ${event.gradient} opacity-5`}></div>

        <div className="relative p-6 space-y-4">
          
          {/* Header info */}
          <div className="flex items-start justify-between gap-4 z-10 relative">
            <div className="flex items-center gap-3.5">
              <div className="relative flex-shrink-0">
                <div className={`absolute inset-0 ${status.glow} rounded-xl blur-lg`}></div>
                <div className="relative w-14 h-14 bg-black/45 rounded-xl border border-white/5 flex items-center justify-center text-3xl">
                  {event.icon}
                </div>
              </div>
              <div>
                <h3 className={`font-black text-base uppercase tracking-wide bg-gradient-to-r ${event.gradient} bg-clip-text text-transparent`}>
                  {event.title}
                </h3>
                
                {/* Status indicator */}
                <div className="relative inline-block mt-1">
                  <span className={`relative inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Description text */}
          <p className="text-xs text-gray-400 leading-relaxed z-10 relative">{event.description}</p>

          {/* Meta metrics */}
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-gray-500 font-bold uppercase tracking-wider z-10 relative">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-ark-primary" />
              <span>{formatDate(event.startDate)} - {formatDate(event.endDate)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-ark-accent" />
              <span>{event.participants.toLocaleString()} PARTICIPANTS</span>
            </div>
          </div>

          {/* Rewards Grid */}
          <div className="space-y-2 z-10 relative">
            <div className="flex items-center gap-1.5 text-xs text-ark-gold font-black uppercase tracking-wider">
              <Gift className="h-4 w-4 text-ark-gold" />
              <span>REWARDS EXPONENT</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {event.rewards.map((reward, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/45 rounded-lg text-[10px] font-bold text-gray-300 border border-white/5 hover:border-ark-gold/30 transition-all uppercase"
                >
                  <Star className="h-3 w-3 text-ark-gold animate-spin-slow" />
                  {reward}
                </span>
              ))}
            </div>
          </div>

          {/* Active countdown or status hooks */}
          {event.status === 'active' && (
            <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 z-10 relative">
              {countdown ? (
                <div className="flex items-center gap-1.5 text-xs font-black text-ark-primary uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-ark-primary animate-pulse" />
                  <span>RESET IN: {String(countdown.hours).padStart(2, '0')}:{String(countdown.mins).padStart(2, '0')}:{String(countdown.secs).padStart(2, '0')}</span>
                </div>
              ) : (
                <div className="h-4"></div>
              )}
              <LaserButton variant="primary" size="sm">
                JOIN MISSION
              </LaserButton>
            </div>
          )}

          {event.status === 'upcoming' && (
            <div className="pt-4 border-t border-white/5 flex items-center justify-end z-10 relative">
              <LaserButton variant="gold" size="sm">
                INSPECT MISSION
              </LaserButton>
            </div>
          )}

        </div>
      </div>
    </LaserCard>
  );
}
