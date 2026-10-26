'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';
import { Suspense, useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  PawPrint,
  Package,
  X,
  Sparkles,
  MapPin,
  Compass,
  Footprints,
  Shield,
  Layers,
  Filter,
  Gift,
} from 'lucide-react';
import { shopApi } from '@/lib/contracts/client';
import { categoryLabel } from '@/lib/catalogLabels';
import './tek-shop.css';
import './christmas-shop.css';
import { TekShopHero } from '@/components/tek/TekShopHero';
import { PalworldProductCard } from '@/components/shop/PalworldProductCard';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import type { Product } from '@/lib/contracts/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DINO_MAP_OPTIONS,
  DINO_ROLE_OPTIONS,
  DINO_STANCE_OPTIONS,
  ITEM_CLASS_OPTIONS,
  POPULAR_SEARCH_SUGGESTIONS,
} from '@/lib/taxonomy';

function Catalog() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const category = params.get('category');
  const type = params.get('type');
  const mapFilter = params.get('map') || 'all';
  const roleFilter = params.get('role') || 'all';
  const stanceFilter = params.get('stance') || 'all';
  const itemClassFilter = params.get('itemClass') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const searchParam = params.get('search') || '';

  // Local state for search input & autocomplete
  const [searchInput, setSearchInput] = useState(searchParam);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    // Commit an unfinished typed search with filters, and cancel its older navigation.
    if (searchDebounceRef.current !== null) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
      if (!Object.hasOwn(values, 'search')) {
        if (searchInput.trim()) next.set('search', searchInput.trim());
        else next.delete('search');
      }
    }
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => {
      router.push('/shop' + (next.size ? '?' + next : ''), { scroll: false });
    });
  };

  // Only actual typing starts a debounce. URL sync and preset selection must not
  // schedule a stale search that could overwrite a newer category/price filter.
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current !== null) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = null;
    if (value.trim() !== searchParam) {
      searchDebounceRef.current = setTimeout(() => update({ search: value.trim() || null, page: null }), 280);
    }
  };
  useEffect(() => () => {
    if (searchDebounceRef.current !== null) clearTimeout(searchDebounceRef.current);
  }, []);

  // Click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsAutocompleteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: categoryData } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: shopApi.listCategories,
    staleTime: 60000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contract', 'products', params.toString()],
    queryFn: () =>
      shopApi.listProducts({
        categoryId: category ? Number(category) : undefined,
        type: type === 'dino' || type === 'item' ? type : undefined,
        search: searchParam || undefined,
        minPrice: params.has('minPrice') ? Number(params.get('minPrice')) : undefined,
        maxPrice: params.has('maxPrice') ? Number(params.get('maxPrice')) : undefined,
        page,
        limit: 24,
      }),
  });

  const categories = (categoryData?.categories || [])
    .filter((c) => (c._count?.products ?? 0) > 0)
    .filter((c) => !type || (type === 'dino' ? /Dinos|Creatures/i.test(c.name) : !/Dinos|Creatures/i.test(c.name)));

  const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');

  const buyParam = params.get('buy');
  useEffect(() => {
    if (buyParam) {
      const id = Number(buyParam);
      if (Number.isInteger(id) && id > 0) {
        const found = data?.products?.find((p) => p.id === id);
        if (found) {
          setBuyingProduct(found);
        } else {
          shopApi
            .getProduct(id)
            .then((res) => {
              if (res?.product) setBuyingProduct(res.product);
            })
            .catch(() => {});
        }
      }
    }
  }, [buyParam, data?.products]);

  const handleCloseModal = () => {
    setBuyingProduct(null);
    if (params.get('buy')) {
      const next = new URLSearchParams(params.toString());
      next.delete('buy');
      router.replace('/shop' + (next.size ? '?' + next : ''), { scroll: false });
    }
  };

  const handlePriceSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const min = String(form.get('min') || '');
    const max = String(form.get('max') || '');
    if (min && max && Number(min) > Number(max)) {
      setFormError('ราคาต่ำสุดต้องไม่เกินราคาสูงสุด');
      return;
    }
    setFormError('');
    update({ minPrice: min || null, maxPrice: max || null, page: null });
  };

  // Filter products by active taxonomy tags (Map, Role, Stance, ItemClass)
  const filteredProducts = (data?.products || []).filter((prod) => {
    const textToMatch = `${prod.name} ${prod.description || ''} ${prod.category?.name || ''}`.toLowerCase();

    // Dino Map filter
    if (type === 'dino' && mapFilter !== 'all') {
      const opt = DINO_MAP_OPTIONS.find((m) => m.id === mapFilter);
      if (opt?.keywords && !opt.keywords.some((k) => textToMatch.includes(k.toLowerCase()))) {
        return false;
      }
    }

    // Dino Role filter
    if (type === 'dino' && roleFilter !== 'all') {
      const opt = DINO_ROLE_OPTIONS.find((r) => r.id === roleFilter);
      if (opt?.keywords && !opt.keywords.some((k) => textToMatch.includes(k.toLowerCase()))) {
        return false;
      }
    }

    // Dino Stance filter
    if (type === 'dino' && stanceFilter !== 'all') {
      const opt = DINO_STANCE_OPTIONS.find((s) => s.id === stanceFilter);
      if (opt?.keywords && !opt.keywords.some((k) => textToMatch.includes(k.toLowerCase()))) {
        return false;
      }
    }

    // Item Class filter
    if (type === 'item' && itemClassFilter !== 'all') {
      const opt = ITEM_CLASS_OPTIONS.find((c) => c.id === itemClassFilter);
      if (opt?.keywords && !opt.keywords.some((k) => textToMatch.includes(k.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });

  // Autocomplete matching items
  const autocompleteMatches = POPULAR_SEARCH_SUGGESTIONS.filter((s) =>
    searchInput.trim() ? s.label.toLowerCase().includes(searchInput.toLowerCase()) || s.query.toLowerCase().includes(searchInput.toLowerCase()) : true
  ).slice(0, 6);

  const hasActiveFilters =
    Boolean(category) ||
    Boolean(type) ||
    Boolean(searchParam) ||
    Boolean(params.get('minPrice')) ||
    Boolean(params.get('maxPrice')) ||
    mapFilter !== 'all' ||
    roleFilter !== 'all' ||
    stanceFilter !== 'all' ||
    itemClassFilter !== 'all';

  return (
    <div className="tk-christmas-shop">
      <TekShopHero />
      <div className="page-shell shop-catalog-shell tk-shop pb-16 space-y-7">

        <section id="catalog" className="scroll-mt-32 tk-depot-catalog">
          {/* Header */}
          <div className="tk-depot-heading flex flex-wrap items-end justify-between gap-4 mb-6">
            <div className="tk-depot-title">
              <Gift className="tk-depot-gift" size={58} aria-hidden="true" />
              <div><p className="eyebrow flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] text-iris-cyan">
                <Compass className="h-3.5 w-3.5" />THE EXPEDITION COLLECTION</p>
              <h2 className="font-display text-2xl sm:text-3xl mt-2 text-iris-pearl font-normal"><T text="เลือกดูไอเทม เตรียมพร้อมออกเดินทาง" en="Choose your gear. Begin your expedition." /><span className="sr-only">Official Store Database</span>
              </h2></div>
            </div>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-iris-cyan hover:text-white transition"
            ><T text={"ติดตามคำสั่งซื้อ · Order History"} /></Link>
          </div>

          {/* Primary Type Switcher */}
          <div className="tk-depot-tabs flex flex-wrap gap-2 mb-6" aria-label="ประเภทสินค้า">
            {[
              { id: null, labelTh: 'ทั้งหมด', labelEn: 'All Items', icon: Package },
              { id: 'dino', labelTh: 'สัตว์ ARK', labelEn: 'ARK Creatures', icon: PawPrint },
              { id: 'item', labelTh: 'ไอเทม & อุปกรณ์', labelEn: 'Gear & Resources', icon: Layers },
            ].map((tab) => {
              const isActive = type === tab.id && !searchParam;
              const IconComponent = tab.icon;
              return (
                <button
                  key={t(tab.labelTh, tab.labelEn)}
                  onClick={() => {
                    setSearchInput('');
                    update({
                      type: tab.id,
                      category: null,
                      map: null,
                      role: null,
                      stance: null,
                      itemClass: null,
                      search: null,
                      page: null,
                    });
                  }}
                  aria-pressed={isActive}
                  className={`tk-chip${isActive ? ' on' : ''}`}
                >
                  <IconComponent size={16} aria-hidden="true" />
                  <span>{t(tab.labelTh, tab.labelEn)}</span>
                </button>
              );
            })}
            {[
              { query: 'Rex', th: 'Rex', en: 'Rex', Icon: PawPrint },
              { query: 'Skin', th: 'สกิน & ตกแต่ง', en: 'Skins & cosmetics', Icon: Sparkles },
              { query: 'Tek', th: 'อุปกรณ์ TEK', en: 'TEK equipment', Icon: Shield },
            ].map(({ query, th, en, Icon }) => (
              <button key={query} type="button" className={`tk-chip${searchParam === query ? ' on' : ''}`} aria-pressed={searchParam === query} onClick={() => { setSearchInput(query); update({ type: null, category: null, search: query, page: null }); }}>
                <Icon size={16} aria-hidden="true" />{t(th, en)}
              </button>
            ))}
          </div>

          {/* DINO TAXONOMY FILTER BAR */}
          {type === 'dino' && (
            <div className="mb-6 space-y-3 tk-panel p-4 sm:p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-iris-cyan">
                <Filter className="h-3.5 w-3.5" /><T text={"จัดกลุ่มสิ่งมีชีวิต · Dino Taxonomy"} /></div>

              {/* By Map */}
              <div className="space-y-1.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <MapPin className="h-3 w-3 text-iris-cyan" /><T text={"ตามแมพกำเนิด · By Map:"} /></span>
                <div className="flex flex-wrap gap-1.5">
                  {DINO_MAP_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update({ map: opt.id === 'all' ? null : opt.id, page: null })}
                      className={`tk-chip sm${mapFilter === opt.id ? ' on' : ''}`}
                    >
                      {t(opt.labelTh, opt.labelEn)}
                    </button>
                  ))}
                </div>
              </div>

              {/* By Ecological Role / Diet */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <Compass className="h-3 w-3 text-iris-cyan" /><T text={"บทบาท & อาหาร · By Role / Diet:"} /></span>
                <div className="flex flex-wrap gap-1.5">
                  {DINO_ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update({ role: opt.id === 'all' ? null : opt.id, page: null })}
                      className={`tk-chip sm${roleFilter === opt.id ? ' on' : ''}`}
                    >
                      {t(opt.labelTh, opt.labelEn)}
                    </button>
                  ))}
                </div>
              </div>

              {/* By Stance / Legs */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <Footprints className="h-3 w-3 text-iris-cyan" /><T text={"ลักษณะทางกายภาพ & ขา · By Stance:"} /></span>
                <div className="flex flex-wrap gap-1.5">
                  {DINO_STANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => update({ stance: opt.id === 'all' ? null : opt.id, page: null })}
                      className={`tk-chip sm${stanceFilter === opt.id ? ' on' : ''}`}
                    >
                      {t(opt.labelTh, opt.labelEn)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ITEM TAXONOMY FILTER BAR */}
          {type === 'item' && (
            <div className="mb-6 space-y-3 tk-panel p-4 sm:p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-iris-cyan">
                <Filter className="h-3.5 w-3.5" /><T text={"จำแนกหมวดหมู่ไอเทม · Item Classification"} /></div>
              <div className="flex flex-wrap gap-1.5">
                {ITEM_CLASS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => update({ itemClass: opt.id === 'all' ? null : opt.id, page: null })}
                    className={`tk-chip sm${itemClassFilter === opt.id ? ' on' : ''}`}
                  >
                    {t(opt.labelTh, opt.labelEn)} <span className="text-[10px] text-iris-muted">({opt.labelEn})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SEARCH & PRICE TOOLBAR */}
          <div className="relative z-30 mb-6 tk-panel tk-depot-search p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              {/* Live Search Input with Autocomplete */}
              <div ref={searchContainerRef} className="relative">
                <label htmlFor="shop-search-input" className="block text-xs font-semibold text-iris-pearl mb-1.5"><T text={"ค้นหาสินค้าทันที · Instant Search & Autocomplete"} /></label>
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 h-4 w-4 text-iris-cyan pointer-events-none" />
                  <input
                    id="shop-search-input"
                    type="text"
                    value={searchInput}
                    onFocus={() => setIsAutocompleteOpen(true)}
                    onChange={(e) => {
                      handleSearchInput(e.target.value);
                      setIsAutocompleteOpen(true);
                    }}
                    placeholder={t('พิมพ์เพื่อค้นหาและกรองทันที เช่น Rex, Wyvern, Tek, Saddle, Flak, Kibble...', 'Search Rex, Wyvern, Tek, Saddle, Flak, Kibble...')}
                    className="tk-input"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        update({ search: null, page: null });
                      }}
                      className="absolute right-3 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition"
                      aria-label="ล้างคำค้นหา"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown - 100% Solid Opaque Background, High Z-Index, Deep Elevation */}
                {isAutocompleteOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-cyan-500/50 bg-surface-1 p-2.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] animate-in fade-in">
                    <div className="flex items-center justify-between px-2.5 py-1.5 mb-1.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-iris-cyan">
                      <span><T text={"คำค้นหายอดนิยม & แนะนำ · Suggestions"} /></span>
                      <span className="text-slate-400 font-normal"><T text={"กดเพื่อเลือก"} /></span>
                    </div>
                    <div className="space-y-1">
                      {autocompleteMatches.map((item) => (
                        <button
                          key={item.query}
                          type="button"
                          onClick={() => {
                            setSearchInput(item.query);
                            setIsAutocompleteOpen(false);
                            update({ search: item.query, page: null });
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition bg-surface-2 hover:bg-iris-cyan/25 hover:text-white text-slate-200 border border-slate-700/60 hover:border-iris-cyan/60"
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="font-medium">{item.label}</span>
                          </div>
                          <span className="rounded bg-surface-1 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-300 font-mono font-semibold">
                            {item.tag}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Price Range Filter Form */}
              <form onSubmit={handlePriceSubmit} className="flex flex-wrap items-end gap-2">
                <div>
                  <span className="block text-xs font-semibold text-iris-pearl mb-1.5"><T text={"ช่วงราคา (IC)"} /></span>
                  <div className="flex items-center gap-1.5">
                    <input
                      name="min"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder={t('ต่ำสุด', 'Min')}
                      defaultValue={params.get('minPrice') || ''}
                      className="tk-input plain"
                    />
                    <span className="text-slate-500">–</span>
                    <input
                      name="max"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder={t('สูงสุด', 'Max')}
                      defaultValue={params.get('maxPrice') || ''}
                      className="tk-input plain"
                    />
                    <button
                      type="submit"
                      className="tk-chip on"
                    ><T text={"กรองราคา"} /></button>
                  </div>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      router.push('/shop');
                    }}
                    className="tk-chip"
                  ><T text={"ล้างตัวกรองทั้งหมด"} /></button>
                )}
              </form>
            </div>

            {/* Quick Search Chips */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-800/60 text-xs">
              <span className="text-[11px] text-iris-muted"><T text={"ค้นหาด่วน:"} /></span>
              {['Rex', 'Wyvern', 'Tek', 'Saddle', 'Flak', 'Polymer', 'Kibble', 'Element'].map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => {
                    setSearchInput(keyword);
                    update({ search: keyword, page: null });
                  }}
                  className="tk-chip sm"
                >
                  {keyword}
                </button>
              ))}
            </div>

            {formError && <p role="alert" className="mt-2 text-rose-300 text-xs">{formError}</p>}
          </div>

          {/* Main Layout: Categories Sidebar + Products Grid */}
          <div className="frozen-catalog-layout">
            <aside className="frozen-category-list" aria-label="หมวดหมู่สินค้า">
              <button aria-pressed={!category} onClick={() => update({ category: null, page: null })}><T text={"ทุกหมวดหมู่ · All Categories"} /></button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={category === String(c.id)}
                  onClick={() => update({ category: String(c.id), page: null })}
                >
                  <span>{t(categoryLabel(c.name), c.name)}</span>
                  <span className="tabular-nums text-xs font-mono">{c._count?.products}</span>
                </button>
              ))}
            </aside>

            <div className="min-w-0">
              {/* Product Counter & Status */}
              <div className="flex items-center justify-between text-xs text-iris-muted mb-4" aria-live="polite">
                <span>
                  {isLoading
                    ? 'กำลังค้นหาสินค้า…'
                    : isError
                    ? 'ยังโหลดรายการไม่ได้'
                    : `พบ ${filteredProducts.length.toLocaleString()} รายการ (จากทั้งหมด ${data?.pagination.total.toLocaleString() ?? 0})`}
                </span>
                {searchParam && (
                  <span className="text-iris-cyan"><T text={"คำค้นหา: &ldquo;"} />{searchParam}&rdquo;
                  </span>
                )}
              </div>

              {/* Product Grid / States */}
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} className="h-64 rounded-2xl" />
                  ))}
                </div>
              ) : isError ? (
                <ErrorMessage title="โหลดสินค้าไม่สำเร็จ" message="กรุณาลองอีกครั้ง" onRetry={refetch} />
              ) : !filteredProducts.length ? (
                <EmptyState
                  title="ไม่พบสินค้าตรงเงื่อนไขการค้นหา"
                  description="ลองเปลี่ยนชื่อหรือล้างตัวกรองหมวดหมู่"
                  actionText="ล้างข้อมูลการค้นหาทั้งหมด"
                  onAction={() => {
                    setSearchInput('');
                    router.push('/shop');
                  }}
                />
              ) : (
                <div className="tk-grid">
                  {filteredProducts.map((p) => (
                    <PalworldProductCard key={p.id} product={p} onQuickBuy={setBuyingProduct} />
                  ))}
                </div>
              )}

              {/* Modern Pagination Controls (No AI arrows) */}
              {(data?.pagination.totalPages ?? 0) > 1 && (
                <nav aria-label="หน้ารายการสินค้า" className="tk-pager">
                  <button disabled={page <= 1} className="tk-chip sm" onClick={() => update({ page: String(page - 1) })}>
                    <T text={"หน้าก่อนหน้า"} />
                  </button>
                  <div className="nums">
                    {Array.from({ length: Math.min(5, data?.pagination.totalPages ?? 1) }, (_, i) => {
                      const pNum = i + 1;
                      return (
                        <button key={pNum} className={`num${pNum === page ? ' on' : ''}`} aria-current={pNum === page ? 'page' : undefined} onClick={() => update({ page: String(pNum) })}>
                          {pNum}
                        </button>
                      );
                    })}
                    {(data?.pagination.totalPages ?? 0) > 5 && (
                      <span className="px-1 text-slate-500 self-center">... {data?.pagination.totalPages}</span>
                    )}
                  </div>
                  <button disabled={page >= (data?.pagination.totalPages ?? 1)} className="tk-chip sm" onClick={() => update({ page: String(page + 1) })}>
                    <T text={"หน้าถัดไป"} />
                  </button>
                </nav>
              )}
            </div>
          </div>
        </section>
      </div>

      <ProductBuyModal product={buyingProduct} isOpen={!!buyingProduct} onClose={handleCloseModal} />
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="page-shell py-16 text-center text-slate-400"><T text={"กำลังเปิดร้านค้า…"} /></div>}>
      <Catalog />
    </Suspense>
  );
}
