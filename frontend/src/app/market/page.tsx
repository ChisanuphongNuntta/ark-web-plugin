'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';


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
  ShieldCheck,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

import { marketArtwork } from '@/lib/marketArtwork';
import { VipBadgePill } from '@/components/vip/VipAvatar';
import { useVipBadges } from '@/hooks/useVipBadges';
import { toVipBadge, type VipBadge } from '@/lib/vip';
import { IrisCoin } from '@/components/ui/IrisCoin';

// Sleek SVG gender glyphs (no emojis)
const MaleGlyph = ({ className = 'h-3 w-3' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="10" cy="14" r="5" />
    <path d="M19 5l-5.4 5.4" />
    <path d="M19 5h-5" />
    <path d="M19 5v5" />
  </svg>
);

const FemaleGlyph = ({ className = 'h-3 w-3' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="9" r="5" />
    <path d="M12 14v7" />
    <path d="M9 18h6" />
  </svg>
);

// Gender Badge Component
const GenderBadge = ({ gender }: { gender: string }) => {
  if (gender === 'Male') {
    return (
      <span className="inline-flex items-center gap-1 text-sky-300 font-bold text-[10px] tracking-wider bg-sky-950/80 border border-sky-400/40 px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-md">
        <MaleGlyph className="h-3 w-3 text-sky-400" /> MALE
      </span>
    );
  }
  if (gender === 'Female') {
    return (
      <span className="inline-flex items-center gap-1 text-pink-300 font-bold text-[10px] tracking-wider bg-pink-950/80 border border-pink-400/40 px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-md">
        <FemaleGlyph className="h-3 w-3 text-pink-400" /> FEMALE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-700/60 bg-black/40 px-2 py-0.5 text-[10px] text-iris-muted">
      UNKNOWN
    </span>
  );
};

// Dino Card Component
function DinoCard({ listing, sellerVip }: { listing: any; sellerVip?: VipBadge | null }) {
  const artwork = marketArtwork(listing);
  const imageUrl = artwork.imageUrl;

  return (
    <Link href={`/market/${listing.id}`} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan focus-visible:ring-offset-4 focus-visible:ring-offset-iris-ink">
      <div className="h-full rounded-2xl border border-slate-700/40 bg-surface-3 transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] flex flex-col justify-between overflow-hidden group">
        <div className="p-4 space-y-3 relative">
          {/* 3D Creature Image Frame */}
          <div className="relative h-40 w-full overflow-hidden rounded-xl bg-surface-1 border border-slate-700/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`ภาพอ้างอิง ${artwork.name}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain object-center p-3 transition duration-300 group-hover:scale-105 opacity-90 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-1/90 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-cyan-950/70 border border-cyan-400/40 rounded-md text-[10px] font-bold text-cyan-200 backdrop-blur-md">
                LV.{listing.level}
              </span>
            </div>
            <div className="absolute top-2 right-2">
              <GenderBadge gender={listing.gender} />
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
              <span className="text-[10px] text-iris-muted uppercase block"><T text={"Health (แต้ม)"} /></span>
              <span className="font-mono font-bold text-iris-pearl tabular-nums">
                {listing.baseHealth ?? '—'} + {listing.addedHealth ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-iris-muted uppercase block"><T text={"Melee (แต้ม)"} /></span>
              <span className="font-mono font-bold text-iris-pearl tabular-nums">
                {listing.baseDamage ?? '—'} + {listing.addedDamage ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/30 flex items-center justify-between bg-black/15">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs text-iris-muted font-medium truncate max-w-[110px]">
              {listing.seller?.discordUsername || 'UNKNOWN'}
            </span>
            <VipBadgePill vip={sellerVip} />
          </span>
          <div className="text-right flex items-center gap-1">
            <span className="text-base font-bold text-iris-gold font-mono tabular-nums">
              {listing.price.toLocaleString()}
            </span>
            <span className="tk-sr">IC</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MarketplaceContent() {
  const { t } = useLanguage();
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
      dinoMarketApi
        .getListings({
          search: search || undefined,
          species: selectedSpecies || undefined,
          gender: gender || undefined,
          sortBy,
          sortOrder,
          page,
          limit: 12,
        })
        .then((res) => res.data),
  });

  const sellerBadges = useVipBadges(
    ((listingsData?.listings ?? []) as Array<{ seller?: { id?: string; vip?: unknown } }>)
      .filter((l) => l.seller?.vip === undefined)
      .map((l) => l.seller?.id)
  );

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
      {/* SECTION 1: Header & Marketplace Statistics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-700/30 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-cyan-300"><T text={"IRIS PLAYER MARKET · ตลาดซื้อขายระหว่างผู้เล่น"} /></span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <ShieldCheck className="h-3 w-3" /> Escrow Protected
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl tracking-tight flex items-center gap-3">
            <Store className="h-7 w-7 text-iris-cyan" />
            <span><T text={"ตลาดแลกเปลี่ยนไดโนเสาร์"} /></span>
          </h1>
          <p className="text-xs text-iris-muted"><T text={"คัดเลือกไดโนเสาร์คุณภาพจากผู้เล่นในเครือข่าย ตรวจสอบสเตตัส รหัสสี และสายเลือดอย่างแม่นยำ"} /></p>
        </div>

        {/* Market Stats Counters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2.5 bg-surface-2 rounded-2xl border border-slate-700/60 shadow-lg text-center">
            <span className="text-[10px] text-iris-muted font-semibold uppercase block"><T text={"รายการกำลังวางขาย · Active"} /></span>
            <span className="text-base font-bold text-iris-pearl font-mono tabular-nums">
              {statsData?.stats?.totalListings || 0}
            </span>
          </div>
          <div className="px-4 py-2.5 bg-surface-2 rounded-2xl border border-slate-700/60 shadow-lg text-center">
            <span className="text-[10px] text-iris-muted font-semibold uppercase block"><T text={"มูลค่าการเทรดสะสม · Volume"} /></span>
            <span className="text-base font-bold text-iris-gold font-mono tabular-nums">
              {(statsData?.stats?.totalVolume || 0).toLocaleString()}<IrisCoin size={16} className="ml-1 inline-block align-text-bottom" /><span className="tk-sr">IC</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/market/my-listings">
              <Button variant="secondary" className="gap-2 text-xs uppercase font-extrabold">
                <TrendingUp className="h-4 w-4 text-iris-cyan" /><T text={"รายการขายของฉัน"} /></Button>
            </Link>
            <Link href="/market/my-purchases">
              <Button variant="secondary" className="gap-2 text-xs uppercase font-extrabold">
                <ShoppingBag className="h-4 w-4 text-iris-gold" /><T text={"ประวัติการซื้อ"} /></Button>
            </Link>
          </div>
        </div>
      </div>

      {/* SECTION 2: Advanced Filters & Search Bar (Unified Dark Glass Theme) */}
      <div className="p-5 space-y-4 rounded-2xl border border-slate-700/80 bg-surface-1 shadow-2xl">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Live Search Input */}
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-iris-cyan" />
            <input
              type="text"
              aria-label="ค้นหาไดโนเสาร์"
              placeholder={t('ค้นหาไดโนเสาร์ เช่น Rex, Giga, Spino, Shadowmane...', 'Search Rex, Giga, Spino, Shadowmane...')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-surface-1 border border-slate-700/60 rounded-xl text-xs text-iris-pearl placeholder:text-slate-500 focus:border-iris-cyan focus:outline-none focus:ring-1 focus:ring-iris-cyan/30 transition-all"
            />
          </div>

          {/* Species Picker (Custom Styled Select) */}
          <div className="w-full md:w-52 relative">
            <select
              value={selectedSpecies}
              onChange={(e) => handleSpeciesChange(e.target.value)}
              aria-label="เลือกสายพันธุ์ไดโนเสาร์"
              className="w-full h-11 px-3 bg-surface-1 border border-slate-700/60 rounded-xl text-xs font-semibold text-iris-pearl focus:border-iris-cyan focus:outline-none transition-all"
            >
              <option value=""><T text={"ทุกสายพันธุ์ · All Species"} /></option>
              {speciesData?.species?.map((s: any) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* Gender Picker (Custom Styled Select) */}
          <div className="w-full md:w-44 relative">
            <select
              value={gender}
              onChange={(e) => handleGenderChange(e.target.value)}
              aria-label="เลือกเพศไดโนเสาร์"
              className="w-full h-11 px-3 bg-surface-1 border border-slate-700/60 rounded-xl text-xs font-semibold text-iris-pearl focus:border-iris-cyan focus:outline-none transition-all"
            >
              <option value=""><T text={"ทุกเพศ · All Genders"} /></option>
              <option value="Male"><T text={"เพศผู้ · Male"} /></option>
              <option value="Female"><T text={"เพศเมีย · Female"} /></option>
            </select>
          </div>

          {/* Sort Toggles */}
          <div className="flex gap-1.5 w-full md:w-auto shrink-0">
            {[
              { id: 'createdAt', labelTh: 'ล่าสุด', labelEn: 'Recent' },
              { id: 'price', labelTh: 'ราคา', labelEn: 'Price' },
              { id: 'level', labelTh: 'เลเวล', labelEn: 'Level' },
            ].map((sort) => (
              <button
                key={sort.id}
                type="button"
                onClick={() => toggleSort(sort.id)}
                className={`px-3.5 h-11 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 justify-center ${
                  sortBy === sort.id
                    ? 'border-iris-cyan bg-iris-cyan/20 text-iris-cyan shadow-[0_0_12px_rgba(160,224,244,0.15)]'
                    : 'border-slate-700/50 bg-surface-1 text-slate-400 hover:border-slate-600 hover:text-white'
                }`}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>{sort.labelTh}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Breeder Search Tags (No Emojis) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-800/80">
          <span className="text-[11px] font-bold uppercase tracking-wider text-iris-muted mr-1"><T text={"สายพันธุ์ยอดนิยม · Popular:"} /></span>
          {[
            { label: 'ทั้งหมด · All', value: '' },
            { label: 'Apex Rex', value: 'Rex' },
            { label: 'Shadowmane', value: 'Shadowmane' },
            { label: 'Wyvern', value: 'Wyvern' },
            { label: 'Golem & Stego', value: 'Golem' },
            { label: 'Gigantoraptor', value: 'Giganto' },
            { label: 'Carcharodontosaurus', value: 'Carcharo' },
          ].map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => handleSearchChange(tag.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                search === tag.value
                  ? 'bg-iris-cyan/20 text-iris-cyan border border-iris-cyan/40 font-bold'
                  : 'bg-surface-1 text-slate-400 hover:text-white hover:border-slate-700 border border-slate-800'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 3: Listings Grid */}
      {isLoading ? (
        <div className="flex justify-center py-32 bg-surface-2/40 rounded-3xl border border-slate-800">
          <Loader2 className="h-10 w-10 animate-spin text-iris-cyan" />
        </div>
      ) : !listingsData?.listings || listingsData.listings.length === 0 ? (
        <div className="text-center py-24 rounded-2xl border border-slate-700/80 bg-surface-1 shadow-2xl">
          <Store className="h-14 w-14 text-slate-600 mx-auto mb-4" />
          <p className="text-iris-pearl font-bold text-base uppercase tracking-wider"><T text={"ไม่พบไดโนเสาร์ตรงตามเงื่อนไขการค้นหา"} /></p>
          <p className="text-xs text-iris-muted mt-2"><T text={"โปรดปรับสายพันธุ์ ตัวกรองเพศ หรือคลิกแท็กด้านบนเพื่อค้นหาใหม่อีกครั้ง"} /></p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectedSpecies('');
              setGender('');
              router.push('/market');
            }}
            className="mt-4 rounded-xl border border-iris-cyan/40 bg-iris-cyan/15 px-4 py-2 text-xs font-semibold text-iris-cyan hover:bg-iris-cyan/25 transition"
          ><T text={"ล้างตัวกรองทั้งหมด · Reset Filters"} /></button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {listingsData.listings.map((listing: any) => (
            <DinoCard
              key={listing.id}
              listing={listing}
              sellerVip={toVipBadge(listing.seller?.vip) ?? sellerBadges.get(listing.seller?.id) ?? null}
            />
          ))}
        </div>
      )}

      {/* SECTION 4: Pagination Controls (Numbered Page Buttons) */}
      {listingsData?.pagination && listingsData.pagination.totalPages > 1 && (
        <nav aria-label="หน้ารายการตลาด" className="flex justify-center items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => handlePageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="หน้าก่อนหน้า"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-700/60 bg-surface-3 text-xs font-semibold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:border-slate-600 hover:text-white transition-all"
          >
            <ChevronLeft className="h-4 w-4" /><T text={"ก่อนหน้า · Prev"} /></button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, listingsData.pagination.totalPages) }, (_, i) => {
              const pNum = i + 1;
              const isActive = pNum === page;
              return (
                <button
                  key={pNum}
                  onClick={() => handlePageChange(pNum)}
                  className={`h-8 w-8 rounded-lg font-mono text-xs font-medium transition ${
                    isActive
                      ? 'border border-iris-cyan bg-iris-cyan/20 text-white font-bold'
                      : 'border border-slate-800 bg-surface-1 text-slate-400 hover:text-white'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}
            {listingsData.pagination.totalPages > 5 && (
              <span className="px-1 text-slate-500 text-xs">... {listingsData.pagination.totalPages}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handlePageChange(Math.min(listingsData.pagination.totalPages, page + 1))}
            disabled={page === listingsData.pagination.totalPages}
            aria-label="หน้าถัดไป"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-700/60 bg-surface-3 text-xs font-semibold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:border-slate-600 hover:text-white transition-all"
          ><T text={"ถัดไป · Next"} /><ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
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
