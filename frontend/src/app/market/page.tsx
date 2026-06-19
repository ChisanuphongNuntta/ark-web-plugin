'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { dinoMarketApi } from '@/lib/api';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
import {
  Loader2,
  Search,
  Filter,
  Store,
  ArrowUpDown,
  Heart,
  Zap,
  Shield,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

// Gender icons
const GenderIcon = ({ gender }: { gender: string }) => {
  if (gender === 'Male') {
    return <span className="text-blue-400 font-extrabold text-sm drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]">♂ MALE</span>;
  }
  return <span className="text-pink-400 font-extrabold text-sm drop-shadow-[0_0_5px_rgba(244,114,182,0.5)]">♀ FEMALE</span>;
};

// Dino Card Component
function DinoCard({ listing }: { listing: any }) {
  const totalMutations = listing.maternalMutations + listing.paternalMutations;

  return (
    <Link href={`/market/${listing.id}`}>
      <LaserCard glowOnHover variant={listing.gender === 'Male' ? 'cyan' : 'gold'} className="h-full">
        <div className="p-5 space-y-4 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 relative overflow-hidden">
          
          {/* Subtle background watermarked text of species */}
          <div className="absolute right-[-10px] top-[-10px] text-5xl font-black text-white/2 select-none uppercase tracking-tighter italic">{listing.species.slice(0, 5)}</div>

          {/* Header */}
          <div className="flex items-start justify-between z-10 relative">
            <div>
              <h3 className="font-extrabold text-base text-white truncate max-w-[140px] uppercase tracking-wide">
                {listing.dinoName || listing.species}
              </h3>
              <p className="text-xs text-ark-primary font-bold tracking-wider uppercase">{listing.species}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="px-2 py-0.5 bg-ark-primary/10 border border-ark-primary/30 rounded-lg text-[10px] font-black text-ark-primary">
                LV.{listing.level}
              </span>
              <GenderIcon gender={listing.gender} />
            </div>
          </div>

          {/* Stats terminal preview */}
          <div className="grid grid-cols-2 gap-2 text-xs z-10 relative">
            
            {/* HP */}
            <div className="p-2 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold">
                <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-400" /> HP</span>
                <span className="text-white font-extrabold">{listing.baseHealth}</span>
              </div>
              <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full bg-red-400" style={{ width: `${Math.min(100, (listing.baseHealth / 100) * 100)}%` }}></div>
              </div>
            </div>

            {/* Stamina */}
            <div className="p-2 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold">
                <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-yellow-400" /> STAM</span>
                <span className="text-white font-extrabold">{listing.baseStamina}</span>
              </div>
              <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, (listing.baseStamina / 100) * 100)}%` }}></div>
              </div>
            </div>

            {/* Melee Damage */}
            <div className="p-2 bg-black/40 rounded-xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold">
                <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-ark-primary" /> DMG</span>
                <span className="text-white font-extrabold">{listing.baseDamage}</span>
              </div>
              <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full bg-ark-primary" style={{ width: `${Math.min(100, (listing.baseDamage / 100) * 100)}%` }}></div>
              </div>
            </div>

            {/* Mutations */}
            <div className="p-2 bg-black/40 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center">
              <span className="text-[9px] text-gray-500 font-black uppercase">MUTATIONS</span>
              <span className="text-xs font-black text-ark-accent">{totalMutations}</span>
            </div>

          </div>

          {/* Imprint status */}
          {listing.imprintQuality > 0 && (
            <div className="space-y-1 z-10 relative">
              <div className="flex items-center justify-between text-[9px] font-black text-gray-500 tracking-wider">
                <span>NEURAL SYNC:</span>
                <span className="text-ark-primary">{Math.round(listing.imprintQuality * 100)}% IMPRINT</span>
              </div>
              <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-ark-primary to-ark-accent"
                  style={{ width: `${listing.imprintQuality * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Seller HUD & points */}
          <div className="flex items-center justify-between pt-3 border-t border-white/5 z-10 relative">
            <div className="flex items-center gap-2">
              {listing.seller?.discordAvatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${listing.seller.id}/${listing.seller.discordAvatar}.png`}
                  alt=""
                  className="w-5.5 h-5.5 rounded-full border border-white/10"
                />
              ) : (
                <div className="w-5.5 h-5.5 rounded-full bg-white/5 border border-white/10" />
              )}
              <span className="text-xs text-gray-400 font-semibold max-w-[80px] truncate uppercase">
                {listing.seller?.discordUsername || 'UNKNOWN'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-gradient-primary">
                {listing.price.toLocaleString()}
              </span>
              <span className="text-[9px] text-gray-500 ml-1 font-black uppercase">IC</span>
            </div>
          </div>

        </div>
      </LaserCard>
    </Link>
  );
}

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [gender, setGender] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: listingsData, isLoading } = useQuery({
    queryKey: ['dinoListings', search, selectedSpecies, gender, sortBy, sortOrder, page],
    queryFn: () =>
      dinoMarketApi.getListings({
        search: search || undefined,
        species: selectedSpecies || undefined,
        gender: gender || undefined,
        sortBy,
        sortOrder,
        page,
        limit: 12,
      }).then((res) => res.data),
  });

  const { data: speciesData } = useQuery({
    queryKey: ['dinoSpecies'],
    queryFn: () => dinoMarketApi.getSpeciesList().then((res) => res.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['marketStats'],
    queryFn: () => dinoMarketApi.getStats().then((res) => res.data),
  });

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-8 py-6">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-ark-primary/10 rounded-2xl blur-2xl"></div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-ark-primary via-ark-accent to-ark-primary bg-clip-text text-transparent relative flex items-center gap-3 tracking-widest uppercase">
            <div className="relative">
              <div className="absolute inset-0 bg-ark-primary/25 rounded-full blur-md animate-pulse"></div>
              <Store className="h-8 w-8 text-ark-primary relative" />
            </div>
            DINO MARKETPLACE
          </h1>
        </div>

        {/* Quick Stats Grid */}
        <div className="flex gap-4">
          <div className="px-4.5 py-2 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider">ACTIVE TRADES</span>
            <p className="text-lg font-black text-ark-primary">
              {statsData?.stats?.activeListings || 0}
            </p>
          </div>
          <div className="px-4.5 py-2 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider">SECURED SALES</span>
            <p className="text-lg font-black text-ark-accent">
              {statsData?.stats?.totalSold || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <LaserCard className="border-white/5">
        <div className="p-4 bg-gradient-to-r from-ark-panel/60 to-ark-dark/40 flex flex-col md:flex-row items-center gap-4">
          
          {/* Search bar */}
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ark-primary" />
            <input
              type="text"
              placeholder="ค้นหาไดโน เช่น Rex, Giga, Spino..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full animate-pulse-glow"
            />
          </div>

          {/* Species Picker */}
          <div className="w-full md:w-44 flex items-center gap-2">
            <Filter className="h-4 w-4 text-ark-accent flex-shrink-0" />
            <select
              value={selectedSpecies}
              onChange={(e) => setSelectedSpecies(e.target.value)}
              className="input text-xs font-bold uppercase tracking-wider"
            >
              <option value="">ทุกสายพันธุ์</option>
              {speciesData?.species?.map((s: any) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* Gender Picker */}
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="input w-full md:w-32 text-xs font-bold uppercase tracking-wider"
          >
            <option value="">ทุกเพศ</option>
            <option value="Male">♂ MALE</option>
            <option value="Female">♀ FEMALE</option>
          </select>

          {/* Sort Toggles */}
          <div className="flex gap-2 w-full md:w-auto flex-shrink-0">
            {[
              { id: 'createdAt', label: 'ล่าสุด' },
              { id: 'price', label: 'ราคา' },
              { id: 'level', label: 'LEVEL' },
            ].map((sort) => (
              <button
                key={sort.id}
                onClick={() => toggleSort(sort.id)}
                className={`px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all flex items-center gap-1 w-full justify-center ${
                  sortBy === sort.id
                    ? 'border-ark-primary bg-ark-primary/10 text-ark-primary'
                    : 'border-white/5 text-gray-400 hover:border-white/20'
                }`}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>{sort.label}</span>
              </button>
            ))}
          </div>

        </div>
      </LaserCard>

      {/* Listings Grid */}
      {isLoading ? (
        <div className="flex justify-center py-32 bg-ark-panel/20 rounded-3xl border border-white/5">
          <div className="relative">
            <div className="absolute inset-0 bg-ark-primary/10 rounded-full blur-xl"></div>
            <Loader2 className="h-10 w-10 animate-spin text-ark-primary relative" />
          </div>
        </div>
      ) : !listingsData?.listings || listingsData.listings.length === 0 ? (
        <LaserCard>
          <div className="text-center py-24 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40">
            <Store className="h-16 w-16 text-gray-500/30 mx-auto mb-4" />
            <p className="text-gray-400 font-extrabold text-base uppercase tracking-wider">ไม่พบไดโนเสาร์ในรายการค้นหา</p>
            <p className="text-xs text-gray-500 mt-2">โปรดปรับสายพันธุ์ ตัวกรอง หรือพิมพ์เพื่อค้นหาใหม่อีกครั้ง</p>
          </div>
        </LaserCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {listingsData.listings.map((listing: any) => (
            <DinoCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination control */}
      {listingsData?.pagination && listingsData.pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4.5 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-3 rounded-xl border border-white/5 text-ark-primary disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>

          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            PAGE {listingsData.pagination.page} / {listingsData.pagination.totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(listingsData.pagination.totalPages, p + 1))}
            disabled={page === listingsData.pagination.totalPages}
            className="p-3 rounded-xl border border-white/5 text-ark-primary disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
          >
            <ChevronRight className="h-4.5 w-4.5" />
          </button>
        </div>
      )}

      {/* Navigation action links */}
      <div className="flex justify-center gap-4 pt-4">
        <Link href="/market/my-listings">
          <LaserButton variant="secondary" icon={<TrendingUp className="h-4.5 w-4.5" />}>
            รายการขายของฉัน
          </LaserButton>
        </Link>
        <Link href="/market/my-purchases">
          <LaserButton variant="secondary" icon={<Store className="h-4.5 w-4.5 text-ark-accent" />}>
            ไดโนที่ฉันซื้อ
          </LaserButton>
        </Link>
      </div>

    </div>
  );
}
