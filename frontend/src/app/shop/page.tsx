'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { productApi } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import {
  SlidersHorizontal,
  Search,
  Grid,
  ShoppingBag,
  Coins,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const categoryId = searchParams.get('category');
  const searchParam = searchParams.get('search');

  // Input states
  const [search, setSearch] = React.useState(searchParam || '');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(categoryId);
  const [minPrice, setMinPrice] = React.useState('');
  const [maxPrice, setMaxPrice] = React.useState('');
  const [selectedQuality, setSelectedQuality] = React.useState<string>('all');

  // Sync route params to state
  React.useEffect(() => {
    setSelectedCategory(categoryId);
  }, [categoryId]);

  React.useEffect(() => {
    setSearch(searchParam || '');
  }, [searchParam]);

  // Queries
  const {
    data: productsData,
    isLoading: loadingProducts,
    isError: isProductsError,
    refetch: refetchProducts
  } = useQuery({
    queryKey: ['products', selectedCategory, search, minPrice, maxPrice],
    queryFn: () =>
      productApi.getAll({
        categoryId: selectedCategory || undefined,
        search: search || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
      }).then(res => res.data),
  });

  const {
    data: categoriesData,
    isLoading: loadingCategories,
    isError: isCategoriesError,
    refetch: refetchCategories
  } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productApi.getCategories().then(res => res.data),
  });

  const handleSelectCategory = (catId: string | null) => {
    setSelectedCategory(catId);
    if (catId) {
      router.push(`/shop?category=${catId}`);
    } else {
      router.push('/shop');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory(null);
    setMinPrice('');
    setMaxPrice('');
    setSelectedQuality('all');
    router.push('/shop');
  };

  // Rarity filtering on client side (since DB quality has numerical ratings)
  const filteredProducts = React.useMemo(() => {
    const products = productsData?.products || [];
    if (selectedQuality === 'all') return products;
    
    const qualityMap: Record<string, number> = {
      primitive: 0,
      ramshackle: 1,
      apprentice: 2,
      journeyman: 3,
      mastercraft: 4,
      ascendant: 5,
    };
    
    const targetQual = qualityMap[selectedQuality];
    return products.filter((prod: any) => prod.quality === targetQual);
  }, [productsData, selectedQuality]);

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      
      {/* 1. Header Title */}
      <div className="flex flex-col gap-2 border-b border-white/5 pb-6">
        <span className="eyebrow text-iris-cyan">IRIS Catalog</span>
        <h1 className="font-display text-4xl font-extrabold text-iris-pearl uppercase tracking-tight flex items-center gap-3">
          <ShoppingBag className="h-8 w-8 text-iris-cyan" />
          <span>Official Store Database</span>
        </h1>
      </div>

      {/* 2. Main Store Catalog Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar Filters */}
        <aside className="space-y-6 lg:col-span-1" aria-label="แถบตัวกรองสินค้า">
          
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-iris-muted" />
              <h3 className="text-xs font-bold text-iris-muted uppercase tracking-wider">แผงควบคุมตัวกรอง</h3>
            </div>
            <button
              onClick={resetFilters}
              className="text-[10px] font-bold text-iris-cyan hover:underline flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              ล้างตัวกรอง
            </button>
          </div>

          {/* Categories card */}
          <GlassCard className="p-4" variant="default">
            <h4 className="text-xs font-bold text-iris-pearl uppercase tracking-wider mb-4 border-b border-white/5 pb-2">หมวดหมู่สินค้า</h4>
            
            {loadingCategories ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-xl" />
                ))}
              </div>
            ) : isCategoriesError ? (
              <Button size="sm" variant="secondary" onClick={() => refetchCategories()} className="w-full">
                โหลดหมวดหมู่ใหม่
              </Button>
            ) : (
              <div className="space-y-1.5 flex flex-col">
                <button
                  onClick={() => handleSelectCategory(null)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    selectedCategory === null
                      ? 'text-iris-cyan bg-iris-cyan/10 border border-iris-cyan/20'
                      : 'text-iris-muted hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2">📦 สินค้าทั้งหมด</span>
                  {selectedCategory === null && <span className="h-1.5 w-1.5 rounded-full bg-iris-cyan" />}
                </button>

                {categoriesData?.categories?.map((cat: any) => {
                  const isSelected = selectedCategory === String(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(String(cat.id))}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        isSelected
                          ? 'text-iris-cyan bg-iris-cyan/10 border border-iris-cyan/20'
                          : 'text-iris-muted hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{cat.icon || '🏷️'}</span>
                        <span>{cat.name}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-iris-muted bg-white/2 px-1.5 py-0.5 rounded border border-white/5">
                          {cat._count?.products || 0}
                        </span>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-iris-cyan" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Rarity & Price range cards */}
          <GlassCard className="p-4 space-y-5" variant="default">
            {/* Price Filter */}
            <div>
              <h4 className="text-xs font-bold text-iris-pearl uppercase tracking-wider mb-3.5 border-b border-white/5 pb-2">ช่วงราคา (IRIS Coins)</h4>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  type="number"
                  className="py-2 px-3 text-xs"
                />
                <Input
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  type="number"
                  className="py-2 px-3 text-xs"
                />
              </div>
            </div>

            {/* Quality/Rarity select */}
            <div>
              <h4 className="text-xs font-bold text-iris-pearl uppercase tracking-wider mb-3 border-b border-white/5 pb-2">คุณภาพอุปกรณ์ (Quality Rarity)</h4>
              <Select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="py-2.5 px-3 text-xs"
              >
                <option value="all">ทั้งหมด (All Qualities)</option>
                <option value="primitive">Primitive (เริ่มต้น)</option>
                <option value="ramshackle">Ramshackle (ดีขึ้น)</option>
                <option value="apprentice">Apprentice (ปานกลาง)</option>
                <option value="journeyman">Journeyman (มือโปร)</option>
                <option value="mastercraft">Mastercraft (ช่างศิลป์)</option>
                <option value="ascendant">Ascendant (สุดยอดกังวาล)</option>
              </Select>
            </div>
          </GlassCard>
        </aside>

        {/* Right Catalog Feed */}
        <main className="lg:col-span-3 space-y-6" id="catalog-main" aria-label="รายการสินค้าแนะนำ">
          {/* Top Search & Layout Control */}
          <GlassCard className="p-4" variant="default">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <Input
                  placeholder="ค้นหาชื่อสินค้า หรือ รายละเอียดอาวุธ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="h-4 w-4 text-iris-cyan" />}
                />
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-iris-cyan shrink-0 px-2 uppercase tracking-wide">
                <Grid className="w-4 h-4 text-iris-cyan" />
                <span>GRID VIEW</span>
              </div>
            </div>
          </GlassCard>

          {/* Main Grid Content */}
          {loadingProducts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <GlassCard key={i} className="p-6">
                  <Skeleton variant="card" className="h-44 mb-4" />
                  <Skeleton className="w-2/3 h-5 mb-2" />
                  <Skeleton className="w-full h-3" />
                </GlassCard>
              ))}
            </div>
          ) : isProductsError ? (
            <ErrorMessage
              title="ไม่สามารถโหลดข้อมูลรายการสินค้าได้"
              message="ไม่สามารถเชื่อมต่อไปยังแคตตาล็อกฐานข้อมูลสินค้า IRIS Store ได้ในขณะนี้ กรุณาลองตรวจสอบความถูกต้องอินเทอร์เน็ต"
              onRetry={refetchProducts}
            />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="ไม่พบสินค้าตรงเงื่อนไขการค้นหา"
              description="ไม่มีรายการอุปกรณ์หรือไดโนเสาร์ที่ตรงกับประเภทตัวกรองที่คุณกําหนดไว้ข้างต้น โปรดลองเปลี่ยนคำสำคัญใหม่"
              actionText="ล้างข้อมูลการค้นหาทั้งหมด"
              onAction={resetFilters}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {productsData?.pagination && productsData.pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-8 border-t border-white/5">
              <Button
                variant="secondary"
                size="sm"
                disabled={productsData.pagination.page <= 1}
                onClick={() => {
                  const prevPage = productsData.pagination.page - 1;
                  router.push(`/shop?page=${prevPage}${selectedCategory ? `&category=${selectedCategory}` : ''}`);
                }}
              >
                ก่อนหน้า
              </Button>
              <span className="font-mono text-xs font-bold text-iris-muted">
                หน้า {productsData.pagination.page} จาก {productsData.pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={productsData.pagination.page >= productsData.pagination.totalPages}
                onClick={() => {
                  const nextPage = productsData.pagination.page + 1;
                  router.push(`/shop?page=${nextPage}${selectedCategory ? `&category=${selectedCategory}` : ''}`);
                }}
              >
                ถัดไป
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-iris-cyan" />
        </div>
      }
    >
      <ShopContent />
    </React.Suspense>
  );
}
