'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Trophy,
  Clock,
  PawPrint,
  Crown,
  Medal,
  Sparkles,
  Search,
  Server,
  Shield,
  Award,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { useVipBadges } from '@/hooks/useVipBadges';
import type { VipBadge } from '@/lib/vip';

type RankingCategory = 'playtime' | 'dinos' | 'contributors' | 'tribes';

interface SurvivorRankItem {
  rank: number;
  id: string;
  name: string;
  guild?: string;
  avatarUrl?: string;
  userId?: string;
  vip?: VipBadge | null;
  level: number;
  serverName: string;
  score: string;
  scoreNumber: number;
  scoreLabel: string;
  badge: string;
  isOnline: boolean;
  title: string;
}

const CATEGORY_TABS: { id: RankingCategory; labelTh: string; labelEn: string; icon: React.ElementType }[] = [
  {
    id: 'playtime',
    labelTh: 'ชั่วโมงสำรวจ',
    labelEn: 'Expedition Playtime',
    icon: Clock,
  },
  {
    id: 'dinos',
    labelTh: 'การครอบครองไดโน',
    labelEn: 'Apex Dinos & Tames',
    icon: PawPrint,
  },
  {
    id: 'contributors',
    labelTh: 'ผู้สนับสนุนระดับสูง',
    labelEn: 'Top Supporters',
    icon: Crown,
  },
  {
    id: 'tribes',
    labelTh: 'อันดับเผ่าชั้นนำ',
    labelEn: 'Tribe Dominance',
    icon: Shield,
  },
];

const LEADERBOARD_DATA: Record<RankingCategory, SurvivorRankItem[]> = {
  playtime: [
    {
      rank: 1,
      id: 'p1',
      name: 'Vanguard_Iris',
      guild: 'ALPHA EXPEDITION',
      level: 105,
      serverName: 'Server 1 · The Island',
      score: '1,420 ชม.',
      scoreNumber: 1420,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'GRAND EXPLORER',
      isOnline: true,
      title: 'Grand Expedition Pioneer',
    },
    {
      rank: 2,
      id: 'p2',
      name: 'GlacierKing',
      guild: 'FROSTBITE',
      level: 102,
      serverName: 'Server 2 · Fjordur',
      score: '1,280 ชม.',
      scoreNumber: 1280,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'ARCTIC MASTER',
      isOnline: true,
      title: 'Lord of the Glaciers',
    },
    {
      rank: 3,
      id: 'p3',
      name: 'AuroraHunter',
      guild: 'NORTH STAR',
      level: 98,
      serverName: 'Server 1 · The Island',
      score: '1,150 ชม.',
      scoreNumber: 1150,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'VETERAN',
      isOnline: false,
      title: 'Aurora Night Walker',
    },
    {
      rank: 4,
      id: 'p4',
      name: 'StormBreaker_99',
      guild: 'VALHALLA',
      level: 94,
      serverName: 'Server 3 · Aberration',
      score: '990 ชม.',
      scoreNumber: 990,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'SURVIVOR',
      isOnline: true,
      title: 'Storm Conqueror',
    },
    {
      rank: 5,
      id: 'p5',
      name: 'AbyssDiver',
      guild: 'DEEP SEA',
      level: 91,
      serverName: 'Server 1 · The Island',
      score: '920 ชม.',
      scoreNumber: 920,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'SURVIVOR',
      isOnline: false,
      title: 'Trench Explorer',
    },
    {
      rank: 6,
      id: 'p6',
      name: 'ShadowFang',
      guild: 'NIGHTHAWK',
      level: 87,
      serverName: 'Server 2 · Fjordur',
      score: '840 ชม.',
      scoreNumber: 840,
      scoreLabel: 'เวลาสำรวจ',
      badge: 'SURVIVOR',
      isOnline: true,
      title: 'Shadow Vanguard',
    },
  ],
  dinos: [
    {
      rank: 1,
      id: 'd1',
      name: 'Tamer_Xeno',
      guild: 'BEAST MASTERS',
      level: 99,
      serverName: 'Server 1 · The Island',
      score: '482 ตัว',
      scoreNumber: 482,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'APEX TAMER',
      isOnline: true,
      title: 'Lord of Apex Beasts',
    },
    {
      rank: 2,
      id: 'd2',
      name: 'RexWhisperer',
      guild: 'FROSTBITE',
      level: 95,
      serverName: 'Server 2 · Fjordur',
      score: '415 ตัว',
      scoreNumber: 415,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'ALPHA HUNTER',
      isOnline: true,
      title: 'Wyvern Warden',
    },
    {
      rank: 3,
      id: 'd3',
      name: 'GigaHunter_PRO',
      guild: 'TITAN SLAYERS',
      level: 92,
      serverName: 'Server 1 · The Island',
      score: '378 ตัว',
      scoreNumber: 378,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'SLAYER',
      isOnline: false,
      title: 'Giga Executioner',
    },
    {
      rank: 4,
      id: 'd4',
      name: 'SkyBreaker',
      guild: 'ARCTIC WINGS',
      level: 88,
      serverName: 'Server 3 · Aberration',
      score: '320 ตัว',
      scoreNumber: 320,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'TAMER',
      isOnline: true,
      title: 'Storm Griffin Rider',
    },
    {
      rank: 5,
      id: 'd5',
      name: 'AbyssCrawler',
      guild: 'NIGHTFALL',
      level: 86,
      serverName: 'Server 1 · The Island',
      score: '295 ตัว',
      scoreNumber: 295,
      scoreLabel: 'ไดโนเสาร์พิชิต',
      badge: 'TAMER',
      isOnline: false,
      title: 'Deep Trench Tamer',
    },
  ],
  contributors: [
    {
      rank: 1,
      id: 'c1',
      name: 'Lord_Aethelgard',
      guild: 'ROYAL PATRONS',
      level: 100,
      serverName: 'Server 1 · The Island',
      score: '125,000 IC',
      scoreNumber: 125000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'EMPEROR PATRON',
      isOnline: true,
      title: 'Imperial Benefactor',
    },
    {
      rank: 2,
      id: 'c2',
      name: 'CyberVanguard',
      guild: 'CYBER TITANS',
      level: 96,
      serverName: 'Server 2 · Fjordur',
      score: '84,500 IC',
      scoreNumber: 84500,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'MYTHIC PATRON',
      isOnline: true,
      title: 'Tek Titan Supporter',
    },
    {
      rank: 3,
      id: 'c3',
      name: 'Lady_Seraphina',
      guild: 'FROST GUARDIANS',
      level: 93,
      serverName: 'Server 1 · The Island',
      score: '62,000 IC',
      scoreNumber: 62000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'NOBLE PATRON',
      isOnline: false,
      title: 'Crystalline Benefactor',
    },
    {
      rank: 4,
      id: 'c4',
      name: 'DragonSlayer_XX',
      guild: 'TITAN LEGION',
      level: 89,
      serverName: 'Server 3 · Aberration',
      score: '45,000 IC',
      scoreNumber: 45000,
      scoreLabel: 'สนับสนุนสะสม',
      badge: 'DIAMOND',
      isOnline: true,
      title: 'Diamond Crusader',
    },
  ],
  tribes: [
    {
      rank: 1,
      id: 't1',
      name: 'FROSTBITE SYNDICATE',
      guild: 'ALPHA TRIBE',
      level: 105,
      serverName: 'Server 1 · The Island',
      score: '185,400 PTS',
      scoreNumber: 185400,
      scoreLabel: 'คะแนนอำนาจเผ่า',
      badge: 'SUPREME ALPHA',
      isOnline: true,
      title: 'Overlords of IRIS Cluster',
    },
    {
      rank: 2,
      id: 't2',
      name: 'VALHALLA LEGION',
      guild: 'DOMINANT CLAN',
      level: 102,
      serverName: 'Server 1 · The Island',
      score: '162,900 PTS',
      scoreNumber: 162900,
      scoreLabel: 'คะแนนอำนาจเผ่า',
      badge: 'WAR CLAN',
      isOnline: true,
      title: 'Defenders of Glacial Ridge',
    },
    {
      rank: 3,
      id: 't3',
      name: 'NORTHERN ALLIANCE',
      guild: 'ALLIANCE',
      level: 97,
      serverName: 'Server 2 · Fjordur',
      score: '138,500 PTS',
      scoreNumber: 138500,
      scoreLabel: 'คะแนนอำนาจเผ่า',
      badge: 'VANGUARD',
      isOnline: false,
      title: 'Guardians of the North',
    },
    {
      rank: 4,
      id: 't4',
      name: 'TITAN REIGN',
      guild: 'ELITE CORPS',
      level: 93,
      serverName: 'Server 3 · Aberration',
      score: '115,000 PTS',
      scoreNumber: 115000,
      scoreLabel: 'คะแนนอำนาจเผ่า',
      badge: 'COUNCIL',
      isOnline: true,
      title: 'Abyssal War Machine',
    },
  ],
};

export default function RankingPage() {
  const [activeTab, setActiveTab] = React.useState<RankingCategory>('playtime');
  const [searchQuery, setSearchQuery] = React.useState('');

  const currentList = LEADERBOARD_DATA[activeTab] || [];
  const filteredList = currentList.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.guild && item.guild.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const top1 = currentList.find((i) => i.rank === 1);
  const top2 = currentList.find((i) => i.rank === 2);
  const top3 = currentList.find((i) => i.rank === 3);
  const restOfList = filteredList.filter((i) => i.rank > 3);

  return (
    <div className="page-shell max-w-7xl mx-auto py-8 sm:py-12 space-y-10 animate-slide-up">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-700/40 pb-6">
        <div>
          <span className="eyebrow text-iris-cyan flex items-center gap-1.5 font-bold tracking-widest text-xs uppercase">
            <Trophy className="h-4 w-4 text-iris-gold" /> IRIS HALL OF FAME · หอเกียรติยศนักสำรวจ
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl mt-2">
            อันดับผู้เล่นและชนเผ่าทรงคุณค่า
          </h1>
          <p className="text-xs text-iris-muted mt-1 max-w-xl">
            บันทึกสถิติความสำเร็จสูงสุดของผู้รอดชีวิตในเครือข่าย IRIS อัปเดตแบบเรียลไทม์จากระบบเซิร์ฟเวอร์
          </p>
        </div>

        {/* Global Stats Counter */}
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-slate-700/60 bg-surface-2 px-4 py-2.5 text-center shadow-lg">
            <span className="block text-[10px] text-iris-muted font-bold uppercase">ผู้เล่นที่บันทึก</span>
            <span className="font-mono text-base font-bold text-iris-pearl">1,480+ Survivors</span>
          </div>
          <div className="rounded-2xl border border-iris-cyan/40 bg-iris-cyan/10 px-4 py-2.5 text-center shadow-lg">
            <span className="block text-[10px] text-iris-cyan font-bold uppercase">ซีซัน</span>
            <span className="font-mono text-base font-bold text-cyan-300">Season 1 Active</span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2.5" role="tablist" aria-label="หมวดหมู่อันดับ">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchQuery('');
              }}
              className={`inline-flex items-center gap-2.5 rounded-2xl px-5 py-3 text-xs font-bold tracking-wide transition-all ${
                isActive
                  ? 'border border-iris-cyan bg-iris-cyan/20 text-white shadow-[0_0_20px_rgba(160,224,244,0.2)] ring-1 ring-iris-cyan/40'
                  : 'border border-slate-700/60 bg-surface-2/80 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}
            >
              <IconComponent size={16} className={isActive ? 'text-iris-cyan' : 'text-slate-500'} />
              <span>{tab.labelTh}</span>
              <span className="text-[10px] text-iris-muted uppercase">({tab.labelEn})</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: Top 3 Podium (แท่นเกียรติยศ 3 อันดับแรก) */}
      {!searchQuery && (
        <div className="grid gap-6 md:grid-cols-3 items-end pt-6">
          {/* 2nd Place (Silver - Left) */}
          {top2 && (
            <div className="relative order-2 md:order-1 rounded-3xl border border-slate-600/60 bg-surface-2/95 p-6 shadow-xl text-center space-y-4">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-300/15 border border-slate-300/40 text-slate-200 font-bold font-mono text-sm">
                #2
              </div>
              <div className="space-y-1">
                <span className="rounded bg-slate-400/15 border border-slate-400/30 px-2 py-0.5 text-[9px] font-bold text-slate-300 uppercase">
                  {top2.badge}
                </span>
                <h3 className="font-bold text-lg text-iris-pearl truncate mt-1">{top2.name}</h3>
                <p className="text-[11px] text-iris-cyan font-mono">{top2.guild || top2.title}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-surface-1 p-3">
                <span className="block text-[10px] text-iris-muted uppercase">{top2.scoreLabel}</span>
                <span className="font-mono text-xl font-bold text-slate-200 tabular-nums">{top2.score}</span>
              </div>
              <p className="text-[10px] text-slate-500">{top2.serverName}</p>
            </div>
          )}

          {/* 1st Place (Gold Center - Elevated) */}
          {top1 && (
            <div className="relative order-1 md:order-2 rounded-3xl border border-amber-400/70 bg-gradient-to-b from-surface-3 to-surface-2 p-8 shadow-[0_0_35px_rgba(251,191,36,0.15)] text-center space-y-4 md:-translate-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-300 font-extrabold font-mono text-lg shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                #1
              </div>
              <div className="space-y-1">
                <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-3 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  {top1.badge}
                </span>
                <h3 className="font-bold text-xl text-iris-pearl truncate mt-1">{top1.name}</h3>
                <p className="text-xs text-iris-gold font-semibold">{top1.guild || top1.title}</p>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-surface-1 p-3.5 shadow-inner">
                <span className="block text-[10px] text-amber-400/80 uppercase font-bold">{top1.scoreLabel}</span>
                <span className="font-mono text-2xl font-black text-amber-300 tabular-nums">{top1.score}</span>
              </div>
              <p className="text-xs text-slate-400">{top1.serverName}</p>
            </div>
          )}

          {/* 3rd Place (Bronze - Right) */}
          {top3 && (
            <div className="relative order-3 md:order-3 rounded-3xl border border-amber-700/60 bg-surface-2/95 p-6 shadow-xl text-center space-y-4">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-700/20 border border-amber-600/40 text-amber-400 font-bold font-mono text-sm">
                #3
              </div>
              <div className="space-y-1">
                <span className="rounded bg-amber-700/20 border border-amber-600/30 px-2 py-0.5 text-[9px] font-bold text-amber-400 uppercase">
                  {top3.badge}
                </span>
                <h3 className="font-bold text-lg text-iris-pearl truncate mt-1">{top3.name}</h3>
                <p className="text-[11px] text-iris-cyan font-mono">{top3.guild || top3.title}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-surface-1 p-3">
                <span className="block text-[10px] text-iris-muted uppercase">{top3.scoreLabel}</span>
                <span className="font-mono text-xl font-bold text-amber-400 tabular-nums">{top3.score}</span>
              </div>
              <p className="text-[10px] text-slate-500">{top3.serverName}</p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Leaderboard Table (Search & Rows) */}
      <div className="p-6 rounded-3xl border border-slate-700/80 bg-surface-1 shadow-2xl space-y-5">
        {/* Table Search Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-iris-cyan" />
            <input
              type="text"
              placeholder="ค้นหาชื่อผู้เล่น เผ่า หรือฉายา... (Search Rank)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 bg-surface-1 border border-slate-700/60 rounded-xl text-xs text-iris-pearl placeholder:text-slate-500 focus:border-iris-cyan focus:outline-none"
            />
          </div>
          <span className="text-xs text-iris-muted">
            แสดง {filteredList.length} รายการ · Ranking Board
          </span>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-iris-muted">
                <th className="py-3 px-3 w-16">อันดับ</th>
                <th className="py-3 px-3">ผู้รอดชีวิต / เผ่า · Survivor</th>
                <th className="py-3 px-3">เซิร์ฟเวอร์ · Server</th>
                <th className="py-3 px-3 text-right">คะแนน / สถิติ · Score</th>
                <th className="py-3 px-3 text-center w-24">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredList.map((item) => (
                <tr key={item.id} className="hover:bg-surface-2 transition">
                  {/* Rank Column */}
                  <td className="py-3 px-3 font-mono font-bold">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs ${
                        item.rank === 1
                          ? 'bg-amber-400/20 text-amber-300 font-black'
                          : item.rank === 2
                          ? 'bg-slate-300/20 text-slate-200 font-bold'
                          : item.rank === 3
                          ? 'bg-amber-700/20 text-amber-400 font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      #{item.rank}
                    </span>
                  </td>

                  {/* Name & Guild Column */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div>
                        <p className="font-bold text-iris-pearl">{item.name}</p>
                        <p className="text-[10px] text-iris-muted">{item.title}</p>
                      </div>
                      {item.guild && (
                        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold text-iris-cyan">
                          {item.guild}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Server Column */}
                  <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                    {item.serverName}
                  </td>

                  {/* Score Column */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-iris-gold text-sm tabular-nums">
                    {item.score}
                  </td>

                  {/* Online Status Column */}
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                        item.isOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {item.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
