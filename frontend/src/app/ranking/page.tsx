'use client';

import { useState } from 'react';
import { Trophy, Coins, Clock, Shield, Award, Sparkles, User, HelpCircle } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';

// Mock leaderboards data for high-fidelity gaming visuals
const leaderboards = {
  spenders: [
    { name: 'PlayerOne', spend: 245000, level: 88, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', rank: 1, title: 'ASCENDANT GOLD' },
    { name: 'BobLee', spend: 128500, level: 75, avatar: null, rank: 2, title: 'MASTERCRAFT' },
    { name: 'AnimeLove', spend: 98750, level: 64, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', rank: 3, title: 'JOURNEYMAN' },
    { name: 'MightyX', spend: 75300, level: 52, avatar: null, rank: 4, title: 'APPRENTICE' },
    { name: 'CrystalX', spend: 64200, level: 48, avatar: null, rank: 5, title: 'APPRENTICE' },
    { name: 'GigaChad', spend: 58900, level: 45, avatar: null, rank: 6, title: 'RAMSHACKLE' },
    { name: 'DinoLover', spend: 41200, level: 32, avatar: null, rank: 7, title: 'RAMSHACKLE' },
  ],
  playtime: [
    { name: 'GigaChad', spend: 12450, level: 95, avatar: null, rank: 1, title: 'ARK DICTATOR' },
    { name: 'DinoLover', spend: 9850, level: 82, avatar: null, rank: 2, title: 'JUNGLE MASTER' },
    { name: 'PlayerOne', spend: 8740, level: 88, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', rank: 3, title: 'ELITE VETERAN' },
    { name: 'MightyX', spend: 7120, level: 52, avatar: null, rank: 4, title: 'SURVIVOR' },
    { name: 'BobLee', spend: 6400, level: 75, avatar: null, rank: 5, title: 'SURVIVOR' },
    { name: 'AnimeLove', spend: 4320, level: 64, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', rank: 6, title: 'WANDERER' },
    { name: 'CrystalX', spend: 2890, level: 48, avatar: null, rank: 7, title: 'BEACH BOB' },
  ],
  dinos: [
    { name: 'MightyX', spend: 890, level: 52, avatar: null, rank: 1, title: 'APEX HUNTER' },
    { name: 'GigaChad', spend: 754, level: 95, avatar: null, rank: 2, title: 'REX SLAYER' },
    { name: 'BobLee', spend: 610, level: 75, avatar: null, rank: 3, title: 'HUNTER' },
    { name: 'PlayerOne', spend: 420, level: 88, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', rank: 4, title: 'TRACKER' },
    { name: 'DinoLover', spend: 320, level: 82, avatar: null, rank: 5, title: 'TRACKER' },
    { name: 'AnimeLove', spend: 180, level: 64, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', rank: 6, title: 'BOB' },
    { name: 'CrystalX', spend: 95, level: 48, avatar: null, rank: 7, title: 'BOB' },
  ],
  harvesters: [
    { name: 'DinoLover', spend: 985400, level: 82, avatar: null, rank: 1, title: 'METAL DICTATOR' },
    { name: 'PlayerOne', spend: 645000, level: 88, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60', rank: 2, title: 'INDUSTRIALIST' },
    { name: 'GigaChad', spend: 520000, level: 95, avatar: null, rank: 3, title: 'MINER' },
    { name: 'MightyX', spend: 412000, level: 52, avatar: null, rank: 4, title: 'FARMER' },
    { name: 'BobLee', spend: 345000, level: 75, avatar: null, rank: 5, title: 'FARMER' },
    { name: 'AnimeLove', spend: 120000, level: 64, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60', rank: 6, title: 'COLLECTOR' },
    { name: 'CrystalX', spend: 45000, level: 48, avatar: null, rank: 7, title: 'COLLECTOR' },
  ],
};

export default function RankingPage() {
  const [activeTab, setActiveTab] = useState<'spenders' | 'playtime' | 'dinos' | 'harvesters'>('spenders');
  const currentList = leaderboards[activeTab];

  // Podium Positions mapping
  const podium = [
    currentList.find((p) => p.rank === 2), // 2nd Silver left
    currentList.find((p) => p.rank === 1), // 1st Gold center
    currentList.find((p) => p.rank === 3), // 3rd Bronze right
  ].filter(Boolean);

  const getMetricString = (val: number) => {
    if (activeTab === 'spenders') return `${val.toLocaleString()} IC`;
    if (activeTab === 'playtime') return `${Math.floor(val / 60)} ชม.`;
    if (activeTab === 'dinos') return `${val.toLocaleString()} KILLS`;
    return `${val.toLocaleString()} UNITS`;
  };

  const getMetricIcon = () => {
    if (activeTab === 'spenders') return <Coins className="w-4 h-4 text-ark-gold" />;
    if (activeTab === 'playtime') return <Clock className="w-4 h-4 text-ark-primary" />;
    if (activeTab === 'dinos') return <Shield className="w-4 h-4 text-red-400" />;
    return <Award className="w-4 h-4 text-ark-accent" />;
  };

  return (
    <div className="space-y-8 py-6 relative">
      
      {/* Title */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-ark-primary/10 rounded-2xl blur-2xl"></div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-ark-primary via-ark-accent to-ark-primary bg-clip-text text-transparent relative flex items-center gap-3 tracking-widest uppercase">
          <div className="relative">
            <div className="absolute inset-0 bg-ark-primary/25 rounded-full blur-md animate-pulse"></div>
            <Trophy className="h-8 w-8 text-ark-primary relative" />
          </div>
          LEADERBOARDS
        </h1>
      </div>

      {/* Selector Tabs bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { id: 'spenders', label: 'TOP SPENDERS', desc: 'ยอดการสนับสนุนสะสม', icon: Coins, color: 'hover:border-ark-gold/40 text-ark-gold' },
          { id: 'playtime', label: 'PLAYTIME SPAN', desc: 'ชั่วโมงผู้รอดชีวิตสูงสุด', icon: Clock, color: 'hover:border-ark-primary/40 text-ark-primary' },
          { id: 'dinos', label: 'DINO SLAYERS', desc: 'สถิติการกำจัดไดโนเสาร์', icon: Shield, color: 'hover:border-red-500/40 text-red-400' },
          { id: 'harvesters', label: 'HARVEST INDEX', desc: 'เก็บเกี่ยวทรัพยากรรวม', icon: Award, color: 'hover:border-ark-accent/40 text-ark-accent' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`p-4 rounded-2xl border text-left bg-ark-panel/60 backdrop-blur-md transition-all duration-300 flex items-center gap-3 group hover:scale-[1.01] ${
                isActive
                  ? 'border-ark-primary bg-ark-primary/10'
                  : 'border-white/5 text-gray-400'
              }`}
            >
              <div className={`p-3 rounded-xl bg-black/40 border border-white/5 group-hover:scale-115 transition-transform duration-300 ${isActive ? 'text-ark-primary' : 'text-gray-500'}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">{tab.label}</h4>
                <p className="text-[9px] text-gray-500 font-bold mt-0.5 tracking-tighter uppercase">{tab.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 3D Esports Podium */}
      <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-ark-panel to-[#02040b] shadow-2xl py-12 px-6 flex flex-col items-center">
        
        {/* Background neon aura */}
        <div className="absolute w-[300px] h-[300px] bg-ark-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>

        <div className="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-12 w-full max-w-3xl pt-10 relative z-10">
          {podium.map((player: any) => {
            const is1st = player.rank === 1;
            const is2nd = player.rank === 2;
            const is3rd = player.rank === 3;

            const podiumConfig = is1st
              ? { height: 'h-40 md:h-48', color: 'from-ark-gold/25 via-ark-gold/10 to-transparent border-ark-gold/45', label: '1ST PLACE', shadow: 'shadow-[0_0_30px_rgba(246,196,83,0.3)]', badge: '🥇' }
              : is2nd
              ? { height: 'h-32 md:h-36', color: 'from-gray-500/20 via-gray-500/5 to-transparent border-gray-500/30', label: '2ND PLACE', shadow: 'shadow-[0_0_20px_rgba(156,163,175,0.15)]', badge: '🥈' }
              : { height: 'h-24 md:h-28', color: 'from-amber-700/20 via-amber-700/5 to-transparent border-amber-700/30', label: '3RD PLACE', shadow: 'shadow-[0_0_20px_rgba(180,83,9,0.15)]', badge: '🥉' };

            return (
              <div key={player.name} className="flex flex-col items-center w-full md:w-48 text-center">
                
                {/* Avatar block */}
                <div className="relative mb-4">
                  {/* Glowing circles */}
                  {is1st && <div className="absolute -inset-1 bg-gradient-to-r from-ark-gold to-yellow-400 rounded-full blur-md opacity-50 animate-pulse z-0"></div>}
                  
                  {player.avatar ? (
                    <img
                      src={player.avatar}
                      alt=""
                      className={`relative z-10 w-16 h-16 rounded-full object-cover border-2 ${
                        is1st ? 'border-ark-gold w-20 h-20' : is2nd ? 'border-gray-400' : 'border-amber-600'
                      }`}
                    />
                  ) : (
                    <div className={`relative z-10 rounded-full bg-black/60 border-2 flex items-center justify-center ${
                      is1st ? 'border-ark-gold w-20 h-20 text-ark-gold text-2xl' : is2nd ? 'border-gray-400 w-16 h-16 text-gray-300 text-xl' : 'border-amber-600 w-16 h-16 text-amber-500 text-xl'
                    }`}>
                      <User />
                    </div>
                  )}
                  
                  {/* Placement crown */}
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xl z-20">{podiumConfig.badge}</span>
                </div>

                {/* Account details */}
                <div className="space-y-1 relative z-10 mb-4">
                  <h4 className="font-extrabold text-sm text-white uppercase tracking-wide">{player.name}</h4>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{player.title}</p>
                </div>

                {/* 3D Platform Column */}
                <div className={`w-full ${podiumConfig.height} rounded-t-3xl border-t border-x ${podiumConfig.color} ${podiumConfig.shadow} bg-gradient-to-b flex flex-col justify-end p-4 z-10 relative`}>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{podiumConfig.label}</span>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-black text-white uppercase">
                      {getMetricIcon()}
                      <span>{getMetricString(player.spend)}</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </section>

      {/* Leaderboard Table List */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Award className="h-4.5 w-4.5 text-ark-primary" />
          <h3 className="text-sm font-black text-white uppercase tracking-widest">LEADERBOARD INDEX</h3>
        </div>

        <LaserCard>
          <div className="p-4 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 space-y-2.5">
            
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-6 gap-4 px-4 py-2 text-[10px] font-black text-gray-500 tracking-widest uppercase border-b border-white/5">
              <span>RANK</span>
              <span className="col-span-2">SURVIVOR BATTLE TAG</span>
              <span>LEVEL RATING</span>
              <span>GUILD TITLE</span>
              <span className="text-right">SCORE RECORD</span>
            </div>

            {/* Survivor Rows */}
            {currentList.map((player) => (
              <div
                key={player.name}
                className="grid grid-cols-3 sm:grid-cols-6 gap-4 items-center p-3.5 rounded-xl bg-black/45 border border-white/5 hover:border-ark-primary/30 transition-all duration-300"
              >
                {/* Placement */}
                <div className="flex items-center gap-2 font-black text-xs text-white">
                  <span className="text-gray-500 w-5">#{player.rank}</span>
                  {player.rank === 1 && <span className="text-xs">🥇</span>}
                  {player.rank === 2 && <span className="text-xs">🥈</span>}
                  {player.rank === 3 && <span className="text-xs">🥉</span>}
                </div>

                {/* Tag */}
                <div className="col-span-1 sm:col-span-2 flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-black text-gray-400">
                    {player.name.charAt(0)}
                  </div>
                  <span className="font-extrabold text-xs text-white uppercase tracking-wide">{player.name}</span>
                </div>

                {/* Level */}
                <span className="hidden sm:block text-xs font-bold text-gray-400">LV.{player.level}</span>

                {/* Guild title */}
                <span className="hidden sm:block text-[9px] text-gray-500 font-black tracking-widest uppercase">{player.title}</span>

                {/* Score */}
                <div className="text-right flex items-center justify-end gap-1.5 text-xs font-black text-white col-span-1 sm:col-span-1">
                  {getMetricIcon()}
                  <span>{getMetricString(player.spend)}</span>
                </div>
              </div>
            ))}

          </div>
        </LaserCard>
      </section>

    </div>
  );
}
