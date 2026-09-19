'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Clock,
  PawPrint,
  Crown,
  Medal,
  Sparkles,
  Search,
  Server,
  Gift,
  Info,
  CheckCircle,
  X,
} from 'lucide-react';
import { serverApi } from '@/lib/contracts/client';
import { useAuthStore } from '@/lib/store';

type RankingCategory = 'playtime' | 'dinos' | 'contributors';

interface SurvivorRankItem {
  rank: number;
  id: string;
  name: string;
  guild?: string;
  avatarUrl?: string;
  level: number;
  serverName: string;
  score: string;
  scoreNumber: number;
  scoreLabel: string;
  badge: string;
  badgeColor: string;
  isOnline: boolean;
  title: string;
}

const CATEGORY_TABS: { id: RankingCategory; label: string; icon: React.ElementType; sub: string }[] = [
  {
    id: 'playtime',
    label: 'ชั่วโมงสำรวจแดนหิมะ',
    icon: Clock,
    sub: 'Expedition Playtime & Milestones',
  },
  {
    id: 'dinos',
    label: 'ผู้พิชิตไดโนเสาร์ขั้วโลก',
    icon: PawPrint,
    sub: 'Apex Taming & Monster Kills',
  },
  {
    id: 'contributors',
    label: 'ผู้สนับสนุนระดับสูง',
    icon: Crown,
    sub: 'Patrons & Community Pillars',
  },
];

const LEADERBOARD_DATA: Record<RankingCategory, SurvivorRankItem[]> = {
  playtime: [
    {
      rank: 1,
      id: 'p1',
      name: 'Valkyrie_Ice',
      guild: 'FROST',
      level: 98,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '1,420 ชม.',
      scoreNumber: 1420,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'GRAND MASTER',
      badgeColor: 'border-amber-400/60 bg-amber-400/15 text-amber-300',
      isOnline: true,
      title: '👑 Sovereign of the Frost',
    },
    {
      rank: 2,
      id: 'p2',
      name: 'Kratos_Glacier',
      guild: 'TITAN',
      level: 94,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '1,285 ชม.',
      scoreNumber: 1285,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'WARLORD',
      badgeColor: 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200',
      isOnline: true,
      title: '❄️ Blizzard Warlord',
    },
    {
      rank: 3,
      id: 'p3',
      name: 'WinterFox_99',
      guild: 'ARCTIC',
      level: 91,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '1,150 ชม.',
      scoreNumber: 1150,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'VANGUARD',
      badgeColor: 'border-amber-600/60 bg-amber-600/15 text-amber-200',
      isOnline: false,
      title: '⚔️ Glacial Vanguard',
    },
    {
      rank: 4,
      id: 'p4',
      name: 'ShadowRanger',
      guild: 'NIGHT',
      level: 87,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '980 ชม.',
      scoreNumber: 980,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'VETERAN',
      badgeColor: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
      isOnline: true,
      title: '🏹 Aurora Scout',
    },
    {
      rank: 5,
      id: 'p5',
      name: 'GlacierQueen',
      guild: 'FROST',
      level: 85,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '920 ชม.',
      scoreNumber: 920,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'VETERAN',
      badgeColor: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
      isOnline: false,
      title: '💎 Crystal Sage',
    },
    {
      rank: 6,
      id: 'p6',
      name: 'ArkArchitect',
      guild: 'BUILD',
      level: 82,
      serverName: '[TH] IRIS Glacier Abyss #3',
      score: '875 ชม.',
      scoreNumber: 875,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'EXPLORER',
      badgeColor: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
      isOnline: true,
      title: '🏰 Citadel Mason',
    },
    {
      rank: 7,
      id: 'p7',
      name: 'IronWolf_TH',
      guild: 'WOLF',
      level: 80,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '810 ชม.',
      scoreNumber: 810,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'EXPLORER',
      badgeColor: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
      isOnline: true,
      title: '🐺 Pack Alpha',
    },
    {
      rank: 8,
      id: 'p8',
      name: 'Phoenix_Snow',
      guild: 'REBIRTH',
      level: 79,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '780 ชม.',
      scoreNumber: 780,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'SURVIVOR',
      badgeColor: 'border-white/20 bg-white/5 text-slate-300',
      isOnline: false,
      title: '🔥 Iceflame Phoenix',
    },
  ],
  dinos: [
    {
      rank: 1,
      id: 'd1',
      name: 'Tamer_Xeno',
      guild: 'BEAST',
      level: 99,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '482 ตัว',
      scoreNumber: 482,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'APEX TAMER',
      badgeColor: 'border-amber-400/60 bg-amber-400/15 text-amber-300',
      isOnline: true,
      title: '🦖 Lord of Beasts',
    },
    {
      rank: 2,
      id: 'd2',
      name: 'RexWhisperer',
      guild: 'FROST',
      level: 95,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '415 ตัว',
      scoreNumber: 415,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'ALPHA HUNTER',
      badgeColor: 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200',
      isOnline: true,
      title: '🐲 Wyvern Warden',
    },
    {
      rank: 3,
      id: 'd3',
      name: 'GigaHunter_PRO',
      guild: 'TITAN',
      level: 92,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '378 ตัว',
      scoreNumber: 378,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'SLAYER',
      badgeColor: 'border-amber-600/60 bg-amber-600/15 text-amber-200',
      isOnline: false,
      title: '⚔️ Giga Executioner',
    },
    {
      rank: 4,
      id: 'd4',
      name: 'SkyBreaker',
      guild: 'ARCTIC',
      level: 88,
      serverName: '[TH] IRIS Glacier Abyss #3',
      score: '320 ตัว',
      scoreNumber: 320,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'TAMER',
      badgeColor: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
      isOnline: true,
      title: '🦅 Storm Griffin Rider',
    },
    {
      rank: 5,
      id: 'd5',
      name: 'AbyssCrawler',
      guild: 'NIGHT',
      level: 86,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '295 ตัว',
      scoreNumber: 295,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'TAMER',
      badgeColor: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
      isOnline: false,
      title: '🐙 Deep Trench Tamer',
    },
    {
      rank: 6,
      id: 'd6',
      name: 'SnowSabertooth',
      guild: 'WOLF',
      level: 83,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '264 ตัว',
      scoreNumber: 264,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'HUNTER',
      badgeColor: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
      isOnline: true,
      title: '🐾 Frost Stalker',
    },
    {
      rank: 7,
      id: 'd7',
      name: 'TitanBuster',
      guild: 'TITAN',
      level: 81,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '240 ตัว',
      scoreNumber: 240,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'HUNTER',
      badgeColor: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
      isOnline: false,
      title: '💥 Colossus Breaker',
    },
  ],
  contributors: [
    {
      rank: 1,
      id: 'c1',
      name: 'Lord_Aethelgard',
      guild: 'ROYAL',
      level: 100,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '125,000 IC',
      scoreNumber: 125000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'EMPEROR PATRON',
      badgeColor: 'border-amber-400/70 bg-amber-400/20 text-amber-300',
      isOnline: true,
      title: '👑 Imperial Benefactor',
    },
    {
      rank: 2,
      id: 'c2',
      name: 'CyberVanguard',
      guild: 'CYBER',
      level: 96,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '84,500 IC',
      scoreNumber: 84500,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'MYTHIC PATRON',
      badgeColor: 'border-cyan-300/70 bg-cyan-400/20 text-cyan-200',
      isOnline: true,
      title: '⚡ Tek Titan Supporter',
    },
    {
      rank: 3,
      id: 'c3',
      name: 'Lady_Seraphina',
      guild: 'FROST',
      level: 93,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '62,000 IC',
      scoreNumber: 62000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'NOBLE PATRON',
      badgeColor: 'border-amber-600/70 bg-amber-600/20 text-amber-200',
      isOnline: false,
      title: '✨ Crystalline Angel',
    },
    {
      rank: 4,
      id: 'c4',
      name: 'DragonSlayer_XX',
      guild: 'TITAN',
      level: 89,
      serverName: '[TH] IRIS Glacier Abyss #3',
      score: '45,000 IC',
      scoreNumber: 45000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'DIAMOND',
      badgeColor: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
      isOnline: true,
      title: '💎 Diamond Crusader',
    },
    {
      rank: 5,
      id: 'c5',
      name: 'Frostbite_Lord',
      guild: 'ARCTIC',
      level: 85,
      serverName: '[TH] IRIS Blizzard Valley #2',
      score: '32,500 IC',
      scoreNumber: 32500,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'PLATINUM',
      badgeColor: 'border-teal-400/40 bg-teal-500/15 text-teal-200',
      isOnline: false,
      title: '🛡️ Glacier Aegis',
    },
    {
      rank: 6,
      id: 'c6',
      name: 'AuroraKnight',
      guild: 'NIGHT',
      level: 82,
      serverName: '[TH] IRIS Frost Peak #1',
      score: '24,000 IC',
      scoreNumber: 24000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'GOLD',
      badgeColor: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-200',
      isOnline: true,
      title: '⭐ Polar Star Knight',
    },
  ],
};

const SEASON_REWARDS = [
  {
    tier: '🏆 อันดับ 1 (แชมเปี้ยนแห่งฤดูกาล)',
    rewards: [
      'ฉายาสีทองพิเศษถาวร: 👑 Sovereign of the Frost',
      'สัตว์ขี่ระดับ Ascendant ลิมิเต็ด: Frostwyrm Monarch (Max Stats)',
      '15,000 Iris Coins เข้ากระเป๋าโดยตรง',
      'สิทธิ์ Discord VIP + ช่องแชทส่วนตัว Hall of Champions',
    ],
    border: 'border-amber-400/60 bg-gradient-to-r from-amber-500/15 to-transparent',
    badge: 'CHAMPION',
  },
  {
    tier: '🥈 อันดับ 2 - 3 (ยอดขุนพลแดนหิมะ)',
    rewards: [
      'ฉายาสีเงินพิเศษถาวร: ❄️ Blizzard Warlord / ⚔️ Glacial Vanguard',
      'สกินเกราะระดับ Master: Cryo-Tek Knight Armor Set',
      '8,000 Iris Coins',
      'สิทธิ์ Discord Champion Role',
    ],
    border: 'border-cyan-400/50 bg-gradient-to-r from-cyan-500/15 to-transparent',
    badge: 'TOP 3',
  },
  {
    tier: '🥉 อันดับ 4 - 10 (ผู้รอดชีวิตชั้นนำ)',
    rewards: [
      'ฉายาพิเศษ: 🏹 Aurora Vanguard',
      'กล่องสุ่มไข่ไดโนเสาร์ระดับ Alpha x 3 ฟอง',
      '3,000 Iris Coins',
      'สิทธิ์ Discord Season 1 Elite',
    ],
    border: 'border-sky-400/40 bg-gradient-to-r from-sky-500/10 to-transparent',
    badge: 'TOP 10',
  },
  {
    tier: '🎖️ อันดับ 11 - 50 (นักผจญภัยยอดฝีมือ)',
    rewards: [
      'เหรียญตราเกียรติยศโปรไฟล์ Season 1 Explorer',
      'กล่องคริสตัลอาร์ค 1,000 Iris Coins',
      'สกินปืน Longneck Rifle ลายเกล็ดน้ำแข็ง',
    ],
    border: 'border-slate-700 bg-white/5',
    badge: 'TOP 50',
  },
];

export default function RankingPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = React.useState<RankingCategory>('playtime');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedServer, setSelectedServer] = React.useState<string>('all');
  const [showRewardsModal, setShowRewardsModal] = React.useState(false);

  const rawList = LEADERBOARD_DATA[activeTab];

  // Filtered leaderboard
  const filteredList = React.useMemo(() => {
    return rawList.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.guild && item.guild.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchServer =
        selectedServer === 'all' || item.serverName.includes(selectedServer);
      return matchSearch && matchServer;
    });
  }, [rawList, searchQuery, selectedServer]);

  const top1 = rawList[0];
  const top2 = rawList[1];
  const top3 = rawList[2];
  const remainingList = filteredList.filter((item) => item.rank > 3);

  return (
    <div className="min-h-screen bg-[#061019] text-white">
      {/* BACKGROUND ATMOSPHERE */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_40%,rgba(6,182,212,0.1),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#061019]/80 to-[#061019]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* HERO INTRO BANNER */}
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-[#07192b]/95 via-[#0b253d]/90 to-[#0d1624]/95 p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
          {/* Subtle Background Glow Artwork */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none mix-blend-luminosity"
            style={{ backgroundImage: 'url(/images/backgrounds/winter_hero_frozen.jpg)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07192b] via-[#07192b]/80 to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300 shadow-sm backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
                <span>SEASON 1: FROZEN EXPEDITION CHRONICLES</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                ทำเนียบเกียรติยศ <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-200">นักสำรวจแดนหิมะ</span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                บันทึกประวัติศาสตร์แห่งความกล้าหาญ การพิชิตสัตว์ขั้วโลก และเกียรติยศของผู้รอดชีวิตในชุมชน IRIS Thailand
              </p>
            </div>

            {/* Quick Season Actions & Prize Pool */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowRewardsModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-amber-600/20 px-4 py-3 text-sm font-bold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:border-amber-300 hover:bg-amber-500/30 transition-all duration-200 backdrop-blur-md cursor-pointer"
              >
                <Gift className="h-4 w-4" />
                <span>ดูของรางวัลประจำฤดูกาล (Rewards)</span>
              </button>

              <Link
                href="/event"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 hover:bg-cyan-500/10 transition-all duration-200 backdrop-blur-md"
              >
                <Info className="h-4 w-4" />
                <span>กติกาและกิจกรรมฤดูกาล</span>
              </Link>
            </div>
          </div>

          {/* SEASON OVERVIEW STATS CHIPS */}
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 font-semibold block">ผู้เล่นที่จัดอันดับ</span>
              <span className="text-lg sm:text-xl font-black text-cyan-300 font-mono">1,248 คน</span>
            </div>
            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 font-semibold block">สิ้นสุดฤดูกาลใน</span>
              <span className="text-lg sm:text-xl font-black text-white font-mono">42 วัน 14 ชม.</span>
            </div>
            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 font-semibold block">ยอดรางวัลสะสม</span>
              <span className="text-lg sm:text-xl font-black text-amber-300 font-mono">50,000 IC</span>
            </div>
            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 font-semibold block">เซิร์ฟเวอร์เข้าร่วม</span>
              <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">4 คลัสเตอร์</span>
            </div>
          </div>
        </div>

        {/* CATEGORY SELECTOR TABS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative rounded-2xl border p-4 text-left transition-all duration-200 overflow-hidden cursor-pointer ${
                  isActive
                    ? 'border-cyan-400 bg-gradient-to-b from-cyan-950/70 via-[#0a2033] to-[#071524] shadow-[0_0_25px_rgba(6,182,212,0.25)] ring-2 ring-cyan-400/40'
                    : 'border-slate-800 bg-[#0a1827]/70 hover:border-slate-700 hover:bg-[#0d2033]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                      isActive
                        ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-300 shadow-md'
                        : 'border-white/10 bg-white/5 text-slate-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${isActive ? 'text-cyan-200' : 'text-white'}`}>
                      {tab.label}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{tab.sub}</p>
                  </div>
                </div>

                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* TOP 3 PODIUM DISPLAY */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">ยอดขุนพล 3 อันดับแรก (Top 3 Champions)</h2>
            </div>
            <span className="text-xs text-slate-400">อัปเดตเรียลไทม์ทุก 15 นาที</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 items-end">
            
            {/* RANK 2 (Silver - Left) */}
            {top2 && (
              <div className="relative rounded-2xl border border-cyan-400/40 bg-gradient-to-b from-[#091f33]/90 via-[#061524]/90 to-[#040d17]/90 p-5 flex flex-col items-center text-center shadow-[0_0_25px_rgba(56,189,248,0.15)] md:order-1 order-2">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-300/60 bg-slate-300 text-black px-3 py-0.5 text-xs font-black shadow-md flex items-center gap-1">
                  <Medal className="h-3.5 w-3.5" />
                  <span>อันดับ 2 SILVER</span>
                </div>

                {/* Avatar Frame */}
                <div className="relative mt-3 h-20 w-20 rounded-2xl border-2 border-slate-300/50 bg-[#0b243b] flex items-center justify-center shadow-lg overflow-hidden">
                  <span className="text-2xl font-black text-slate-200 font-mono">
                    {top2.name.substring(0, 2).toUpperCase()}
                  </span>
                  {top2.isOnline && (
                    <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#091f33]" title="Online" />
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    {top2.guild && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                        [{top2.guild}]
                      </span>
                    )}
                    <h3 className="text-base font-black text-white">{top2.name}</h3>
                  </div>
                  <p className="text-xs font-semibold text-cyan-300">{top2.title}</p>
                  <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                    <Server className="h-3 w-3" />
                    <span>{top2.serverName}</span>
                  </p>
                </div>

                <div className="mt-4 w-full rounded-xl bg-black/50 border border-white/5 p-2.5">
                  <span className="text-[10px] text-slate-400 font-semibold block">{top2.scoreLabel}</span>
                  <span className="text-xl font-black text-cyan-200 font-mono">{top2.score}</span>
                </div>
              </div>
            )}

            {/* RANK 1 (Gold / Champion - Center, Elevated) */}
            {top1 && (
              <div className="relative rounded-3xl border-2 border-amber-400/80 bg-gradient-to-b from-[#1b1c11]/95 via-[#0e1d2c]/95 to-[#061019]/95 p-6 flex flex-col items-center text-center shadow-[0_0_40px_rgba(251,191,36,0.3)] ring-2 ring-amber-400/30 md:order-2 order-1 md:-translate-y-2">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-300 bg-gradient-to-r from-amber-400 to-amber-500 text-black px-4 py-1 text-xs font-black shadow-lg flex items-center gap-1.5">
                  <Crown className="h-4 w-4 fill-black" />
                  <span>CHAMPION อันดับ 1</span>
                </div>

                {/* Avatar Frame with Crown Glow */}
                <div className="relative mt-4 h-24 w-24 rounded-3xl border-3 border-amber-400 bg-gradient-to-br from-[#24210d] to-[#0d2235] flex items-center justify-center shadow-[0_0_30px_rgba(251,191,36,0.4)] overflow-hidden">
                  <span className="text-3xl font-black text-amber-300 font-mono">
                    {top1.name.substring(0, 2).toUpperCase()}
                  </span>
                  {top1.isOnline && (
                    <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full bg-emerald-400 border-2 border-[#1b1c11]" title="Online" />
                  )}
                </div>

                <div className="mt-3.5 space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    {top1.guild && (
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                        [{top1.guild}]
                      </span>
                    )}
                    <h3 className="text-lg font-black text-white">{top1.name}</h3>
                  </div>
                  <p className="text-xs font-bold text-amber-300">{top1.title}</p>
                  <p className="text-xs text-slate-300 flex items-center justify-center gap-1">
                    <Server className="h-3 w-3 text-cyan-400" />
                    <span>{top1.serverName}</span>
                  </p>
                </div>

                <div className="mt-4 w-full rounded-2xl bg-amber-500/10 border border-amber-400/30 p-3">
                  <span className="text-xs text-amber-200/80 font-bold block">{top1.scoreLabel}</span>
                  <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono tracking-wide">
                    {top1.score}
                  </span>
                </div>
              </div>
            )}

            {/* RANK 3 (Bronze - Right) */}
            {top3 && (
              <div className="relative rounded-2xl border border-amber-700/40 bg-gradient-to-b from-[#1c130b]/90 via-[#0a1520]/90 to-[#040d17]/90 p-5 flex flex-col items-center text-center shadow-[0_0_25px_rgba(217,119,6,0.15)] md:order-3 order-3">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-600/60 bg-amber-600 text-white px-3 py-0.5 text-xs font-black shadow-md flex items-center gap-1">
                  <Medal className="h-3.5 w-3.5" />
                  <span>อันดับ 3 BRONZE</span>
                </div>

                {/* Avatar Frame */}
                <div className="relative mt-3 h-20 w-20 rounded-2xl border-2 border-amber-600/50 bg-[#1f170c] flex items-center justify-center shadow-lg overflow-hidden">
                  <span className="text-2xl font-black text-amber-200 font-mono">
                    {top3.name.substring(0, 2).toUpperCase()}
                  </span>
                  {top3.isOnline && (
                    <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#1c130b]" title="Online" />
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    {top3.guild && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-amber-200">
                        [{top3.guild}]
                      </span>
                    )}
                    <h3 className="text-base font-black text-white">{top3.name}</h3>
                  </div>
                  <p className="text-xs font-semibold text-amber-200">{top3.title}</p>
                  <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                    <Server className="h-3 w-3" />
                    <span>{top3.serverName}</span>
                  </p>
                </div>

                <div className="mt-4 w-full rounded-xl bg-black/50 border border-white/5 p-2.5">
                  <span className="text-[10px] text-slate-400 font-semibold block">{top3.scoreLabel}</span>
                  <span className="text-xl font-black text-amber-200 font-mono">{top3.score}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CONTROLS & TABLE SECTION (Ranks 4+) */}
        <div className="rounded-3xl border border-slate-800 bg-[#091a2a]/80 p-5 sm:p-6 space-y-5 backdrop-blur-xl shadow-xl">
          
          {/* TOOLBAR: Search & Server Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อผู้รอดชีวิต หรือชื่อกิลด์..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-black/40 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium shrink-0 flex items-center gap-1">
                <Server className="h-3.5 w-3.5 text-cyan-400" />
                เซิร์ฟเวอร์:
              </span>
              <select
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
                className="rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-hidden"
              >
                <option value="all">ทุกเซิร์ฟเวอร์ (All Clusters)</option>
                <option value="Frost Peak">[TH] IRIS Frost Peak #1</option>
                <option value="Blizzard Valley">[TH] IRIS Blizzard Valley #2</option>
                <option value="Glacier Abyss">[TH] IRIS Glacier Abyss #3</option>
              </select>
            </div>
          </div>

          {/* LEADERBOARD TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="pb-3 pl-3 w-16">อันดับ</th>
                  <th className="pb-3">ผู้รอดชีวิต (Survivor)</th>
                  <th className="pb-3 hidden sm:table-cell">คลัสเตอร์เซิร์ฟเวอร์</th>
                  <th className="pb-3 hidden md:table-cell">เกียรติยศ / ฉายา</th>
                  <th className="pb-3 text-right pr-3">{rawList[0]?.scoreLabel || 'คะแนน'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {remainingList.length > 0 ? (
                  remainingList.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-white/5 transition-colors duration-150 group"
                    >
                      {/* Rank Number */}
                      <td className="py-3.5 pl-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 border border-white/10 font-mono font-bold text-xs text-slate-300">
                          #{item.rank}
                        </span>
                      </td>

                      {/* Survivor Identity */}
                      <td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative h-9 w-9 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold text-cyan-200">
                            {item.name.substring(0, 2).toUpperCase()}
                            {item.isOnline && (
                              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-black" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              {item.guild && (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-400/30">
                                  [{item.guild}]
                                </span>
                              )}
                              <span className="font-bold text-white group-hover:text-cyan-300 transition">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 block sm:hidden">
                              {item.serverName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Server Name */}
                      <td className="py-3.5 hidden sm:table-cell text-xs text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Server className="h-3 w-3 text-slate-400" />
                          {item.serverName}
                        </span>
                      </td>

                      {/* Title & Badge */}
                      <td className="py-3.5 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300">{item.title}</span>
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                      </td>

                      {/* Score */}
                      <td className="py-3.5 text-right pr-3">
                        <span className="font-mono font-black text-sm text-cyan-300">
                          {item.score}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                      ไม่พบข้อมูลผู้รอดชีวิตที่ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MY RANK STICKY BANNER */}
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/80 via-[#0a253a] to-[#091a2a] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold font-mono">
                {user ? '#42' : '—'}
              </div>
              <div>
                <p className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  อันดับของคุณในฤดูกาลนี้ (My Season Rank)
                </p>
                <p className="text-sm font-bold text-white">
                  {user ? user.discordUsername : 'เข้าสู่ระบบเพื่อตรวจอันดับและรับรางวัล'}
                </p>
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-semibold">คะแนนสะสมของคุณ</span>
                  <span className="text-sm font-black text-amber-300 font-mono">
                    {user.pointsBalance.toLocaleString()} IC
                  </span>
                </div>
                <Link
                  href="/profile"
                  className="rounded-xl border border-cyan-400 bg-cyan-400/15 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-400/25 transition"
                >
                  ดูโปรไฟล์ของฉัน
                </Link>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-cyan-400 bg-cyan-400 px-4 py-2 text-xs font-black text-black hover:bg-cyan-300 transition"
              >
                เข้าสู่ระบบทันที
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* SEASON REWARDS MODAL */}
      {showRewardsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl rounded-3xl border border-cyan-500/40 bg-[#081726] p-6 space-y-5 shadow-[0_0_50px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">ของรางวัลประจำฤดูกาล (Season 1 Rewards)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRewardsModal(false)}
                className="p-1.5 rounded-lg border border-white/10 hover:border-white/30 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {SEASON_REWARDS.map((rew, idx) => (
                <div key={idx} className={`rounded-2xl border p-4 space-y-2 ${rew.border}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-white">{rew.tier}</h4>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/20 text-amber-300">
                      {rew.badge}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {rew.rewards.map((r, rIdx) => (
                      <li key={rIdx} className="flex items-start gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowRewardsModal(false)}
                className="w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-black hover:bg-cyan-300 transition cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
