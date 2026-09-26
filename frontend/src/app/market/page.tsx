'use client';

import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { dinoMarketApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  Loader2,
  Search,
  Filter,
  Store,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

import { getProductImageUrl } from '@/lib/productVisuals';

// Gender icons
const GenderIcon = ({ gender }: { gender: string }) => {
  if (gender === 'Male') {
    return <span className="text-sky-400 font-extrabold text-[11px] tracking-wider bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-lg">♂ MALE</span>;
  }
  return <span className="text-pink-400 font-extrabold text-[11px] tracking-wider bg-pink-500/10 border border-pink-500/30 px-2 py-0.5 rounded-lg">♀ FEMALE</span>;
};

// Dino Card Component
function DinoCard({ listing }: { listing: any }) {
  const imageUrl = getProductImageUrl({ name: listing.species || listing.dinoName || 'Dinosaur', imageUrl: listing.imageUrl });

  return (
    <Link href={`/market/${listing.id}`}>
      <div
        className="h-full rounded-2xl border border-slate-700/40 bg-[#102637] transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] flex flex-col justify-between overflow-hidden group"
      >
        <div className="p-4 space-y-3 relative">
          {/* 3D Creature Image Frame */}
          <div className="relative h-40 w-full overflow-hidden rounded-xl bg-[#081826] border border-slate-700/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={listing.species}
              className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06111d]/90 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-cyan-950/70 border border-cyan-400/40 rounded-md text-[10px] font-bold text-cyan-200 backdrop-blur-md">
                LV.{listing.level}
              </span>
            </div>
            <div className="absolute top-2 right-2">
              <GenderIcon gender={listing.gender} />
            </div>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between z-10 relative">
            <div>
              <h3 className="font-bold text-base text-iris-pearl truncate max-w-[170px] uppercase tracking-wide group-hover:text-iris-cyan transition">
                {listing.dinoName || listing.species}
              </h3>
              <p className="text-xs text-iris-cyan font-bold tracking-wider uppercase">{listing.species}</p>
            </div>
          </div>

          {/* Stats Preview */}
          <div className="grid grid-cols-2 gap-2 text-xs z-10 relative bg-black/20 p-2.5 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] text-iris-muted uppercase block">Health</span>
              <span className="font-mono font-bold text-iris-pearl tabular-nums">{listing.health ? listing.health.toLocaleString() : 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] text-iris-muted uppercase block">Melee</span>
              <span className="font-mono font-bold text-iris-pearl tabular-nums">{listing.melee ? `${listing.melee}%` : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/30 flex items-center justify-between bg-black/15">
          <span className="text-xs text-iris-muted font-medium truncate max-w-[110px]">
            {listing.seller?.discordUsername || 'UNKNOWN'}
          </span>
          <div className="text-right flex items-center gap-1">
            <span className="text-base font-bold text-iris-gold font-mono tabular-nums">
              {listing.price.toLocaleString()}
            </span>
            <span className="text-[10px] text-iris-gold/80 font-bold">IC</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MarketplaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const searchParam = searchParams.get('search') ?? '';
  const speciesParam = searchParams.get('species') ?? '';
  const genderParam = searchParams.get('gender') ?? '';
  const sortByParam = searchParams.get('sortBy') ?? 'createdAt';
  const sortOrderParam = (searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const pageParam = Math.max(1, Number(searchParams.get('page')) || 1);

  const [search, setSearch] = useState(searchParam);
  const [selectedSpecies, setSelectedSpecies] = useState(speciesParam);
  const [gender, setGender] = useState(genderParam);
  const [sortBy, setSortBy] = useState(sortByParam);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(sortOrderParam);
  const [page, setPage] = useState(pageParam);

  useEffect(() => {
    setSearch(searchParam);
    setSelectedSpecies(speciesParam);
    setGender(genderParam);
    setSortBy(sortByParam);
    setSortOrder(sortOrderParam);
    setPage(pageParam);
  }, [searchParam, speciesParam, genderParam, sortByParam, sortOrderParam, pageParam]);

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      const query = next.toString();
      router.push(query ? `/market?${query}` : '/market');
    },
    [router, searchParams]
  );

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
    const nextOrder = sortBy === field && sortOrder === 'desc' ? 'asc' : 'desc';
    setSortBy(field);
    setSortOrder(nextOrder);
    updateUrl({ sortBy: field, sortOrder: nextOrder, page: null });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    updateUrl({ search: value || null, page: null });
  };

  const handleSpeciesChange = (value: string) => {
    setSelectedSpecies(value);
    updateUrl({ species: value || null, page: null });
  };

  const handleGenderChange = (value: string) => {
    setGender(value);
    updateUrl({ gender: value || null, page: null });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: String(newPage) });
  };

  return (
    <div className="page-shell py-8 sm:py-10 space-y-8 animate-slide-up">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-700/30 pb-6">
        <div className="space-y-1">
          <span className="eyebrow text-cyan-300">IRIS Player Market</span>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl tracking-tight flex items-center gap-3">
            <Store className="h-7 w-7 text-iris-cyan" />
            <span>ตลาดไดโนเสาร์</span>
          </h1>
          <p className="text-xs text-iris-muted">พบไดโนเสาร์คู่ใจจากผู้เล่นในชุมชน ตรวจสอบรายละเอียดและเงื่อนไขก่อนซื้อ</p>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-[#102637] rounded-2xl border border-slate-700/40 text-center">
            <span className="text-[10px] text-iris-muted font-semibold uppercase block">รายการทั้งหมด</span>
            <span className="text-sm font-bold text-iris-pearl font-mono tabular-nums">
              {statsData?.stats?.totalListings || 0}
            </span>
          </div>
          <div className="px-4 py-2 bg-[#102637] rounded-2xl border border-slate-700/40 text-center">
            <span className="text-[10px] text-iris-muted font-semibold uppercase block">ยอดเทรดสะสม</span>
            <span className="text-sm font-bold text-iris-gold font-mono tabular-nums">
              {(statsData?.stats?.totalVolume || 0).toLocaleString()} IC
            </span>
          </div>
        </div>
      </div>

      {/* Advanced Filters Card */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Search bar */}
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-iris-cyan" />
            <input
              type="text"
              aria-label="ค้นหาไดโนเสาร์"
              placeholder="ค้นหาไดโน เช่น Rex, Giga, Spino..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-black/40 border border-white/10 rounded-2xl text-xs text-iris-pearl placeholder:text-iris-muted/60 focus:border-iris-cyan focus:outline-none focus:ring-1 focus:ring-iris-cyan/30 transition-all"
            />
          </div>

          {/* Species Picker */}
          <div className="w-full md:w-48 flex items-center gap-2">
            <Filter className="h-4 w-4 text-iris-gold shrink-0" />
            <select
              value={selectedSpecies}
              onChange={(e) => handleSpeciesChange(e.target.value)}
              aria-label="เลือกสายพันธุ์ไดโนเสาร์"
              className="w-full h-11 px-3 bg-black/40 border border-white/10 rounded-2xl text-xs font-bold text-iris-pearl uppercase focus:border-iris-cyan focus:outline-none transition-all"
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
            onChange={(e) => handleGenderChange(e.target.value)}
            aria-label="เลือกเพศไดโนเสาร์"
            className="w-full md:w-36 h-11 px-3 bg-black/40 border border-white/10 rounded-2xl text-xs font-bold text-iris-pearl uppercase focus:border-iris-cyan focus:outline-none transition-all"
          >
            <option value="">ทุกเพศ</option>
            <option value="Male">♂ MALE</option>
            <option value="Female">♀ FEMALE</option>
          </select>

          {/* Sort Toggles */}
          <div className="flex gap-2 w-full md:w-auto shrink-0">
            {[
              { id: 'createdAt', label: 'ล่าสุด' },
              { id: 'price', label: 'ราคา' },
              { id: 'level', label: 'LEVEL' },
            ].map((sort) => (
              <button
                key={sort.id}
                type="button"
                onClick={() => toggleSort(sort.id)}
                className={`px-3.5 h-11 text-xs font-extrabold uppercase tracking-wider rounded-2xl border transition-all flex items-center gap-1.5 justify-center ${
                  sortBy === sort.id
                    ? 'border-iris-cyan bg-iris-cyan/15 text-iris-cyan'
                    : 'border-white/10 text-iris-muted hover:border-white/20 hover:text-iris-pearl'
                }`}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>{sort.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Breeder Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-iris-muted mr-1">แท็กแนะนำ:</span>
          {[
            { label: '🌟 ทั้งหมด', value: '' },
            { label: '🦖 Apex Rex', value: 'Rex' },
            { label: '⚡ Shadowmane', value: 'Shadowmane' },
            { label: '🦅 Wyvern', value: 'Wyvern' },
            { label: '🛡️ Golem / Stego', value: 'Golem' },
            { label: '🦤 Gigantoraptor', value: 'Giganto' },
          ].map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => handleSearchChange(tag.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                search === tag.value
                  ? 'bg-iris-cyan/20 text-iris-cyan border border-iris-cyan/40'
                  : 'bg-white/5 text-iris-muted hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Listings Grid */}
      {isLoading ? (
        <div className="flex justify-center py-32 bg-iris-slate/30 rounded-3xl border border-white/5">
          <Loader2 className="h-10 w-10 animate-spin text-iris-cyan" />
        </div>
      ) : !listingsData?.listings || listingsData.listings.length === 0 ? (
        <GlassCard className="text-center py-24">
          <Store className="h-16 w-16 text-iris-muted/30 mx-auto mb-4" />
          <p className="text-iris-pearl font-extrabold text-base uppercase tracking-wider">ไม่พบไดโนเสาร์ในรายการค้นหา</p>
          <p className="text-xs text-iris-muted mt-2">โปรดปรับสายพันธุ์ ตัวกรอง หรือพิมพ์เพื่อค้นหาใหม่อีกครั้ง</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {listingsData.listings.map((listing: any) => (
            <DinoCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination Control */}
      {listingsData?.pagination && listingsData.pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-4">
          <button
            type="button"
            onClick={() => handlePageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="หน้าก่อนหน้า"
            className="p-3 rounded-2xl border border-white/10 text-iris-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-xs font-extrabold text-iris-muted uppercase tracking-widest">
            PAGE {listingsData.pagination.page} / {listingsData.pagination.totalPages}
          </span>

          <button
            type="button"
            onClick={() => handlePageChange(Math.min(listingsData.pagination.totalPages, page + 1))}
            disabled={page === listingsData.pagination.totalPages}
            aria-label="หน้าถัดไป"
            className="p-3 rounded-2xl border border-white/10 text-iris-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Action links */}
      <div className="flex justify-center gap-4 pt-4">
        <Link href="/market/my-listings">
          <Button variant="secondary" className="gap-2 text-xs uppercase font-extrabold">
            <TrendingUp className="h-4 w-4 text-iris-cyan" />
            รายการขายของฉัน
          </Button>
        </Link>
        <Link href="/market/my-purchases">
          <Button variant="secondary" className="gap-2 text-xs uppercase font-extrabold">
            <Store className="h-4 w-4 text-iris-gold" />
            ไดโนที่ฉันซื้อ
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-iris-cyan" />
        </div>
      }
    >
      <MarketplaceContent />
    </Suspense>
  );
}
