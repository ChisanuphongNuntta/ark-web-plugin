'use client';

import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import { Loader2, Percent, Clock, Sparkles, Tag } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import Link from 'next/link';

// Mock promotion banners - in production, these would come from an API
const promotionBanners = [
  {
    id: 1,
    title: 'Grand Opening Sale!',
    subtitle: 'ลดสูงสุด 50% ทุกไอเทม',
    gradient: 'from-emerald-600 via-cyan-600 to-emerald-600',
    endDate: '2025-01-31',
  },
  {
    id: 2,
    title: 'Dino Pack Special',
    subtitle: 'ซื้อ 2 แถม 1 ทุกไดโนเสาร์',
    gradient: 'from-cyan-600 via-blue-600 to-cyan-600',
    endDate: '2025-01-15',
  },
];

export default function PromotionPage() {
  // Fetch products that are on sale (products with discountPrice set)
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['promotion-products'],
    queryFn: () => productApi.getAll({ onSale: true }).then(res => res.data),
  });

  // Calculate time remaining for promotion
  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'หมดเวลา';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `เหลือ ${days} วัน ${hours} ชม.`;
    return `เหลือ ${hours} ชม.`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-2xl"></div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-lg animate-pulse"></div>
            <Percent className="h-10 w-10 text-cyan-400 relative" />
          </div>
          โปรโมชั่น
        </h1>
      </div>

      {/* Promotion Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {promotionBanners.map((banner) => (
          <LaserCard key={banner.id} withBeam glowOnHover>
            <div className="relative p-8 overflow-hidden">
              {/* Background gradient */}
              <div className={`absolute inset-0 bg-gradient-to-r ${banner.gradient} opacity-20`}></div>

              {/* Decorative sparkles */}
              <div className="absolute top-4 right-4">
                <Sparkles className="h-8 w-8 text-yellow-400/50 animate-pulse" />
              </div>
              <div className="absolute bottom-4 left-4">
                <Tag className="h-6 w-6 text-cyan-400/50" />
              </div>

              {/* Content */}
              <div className="relative">
                <h2 className={`text-3xl font-bold bg-gradient-to-r ${banner.gradient} bg-clip-text text-transparent mb-2`}>
                  {banner.title}
                </h2>
                <p className="text-xl text-gray-300 mb-4">{banner.subtitle}</p>

                {/* Timer */}
                <div className="flex items-center gap-2 text-sm">
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500/30 rounded-full blur-md"></div>
                    <Clock className="h-4 w-4 text-orange-400 relative" />
                  </div>
                  <span className="text-orange-400 font-medium">
                    {getTimeRemaining(banner.endDate)}
                  </span>
                </div>
              </div>
            </div>
          </LaserCard>
        ))}
      </div>

      {/* Discounted Products Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-lg animate-pulse"></div>
            <Tag className="h-8 w-8 text-cyan-400 relative" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            สินค้าลดราคา
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-xl animate-pulse"></div>
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400 relative" />
            </div>
          </div>
        ) : productsData?.products?.length === 0 ? (
          <LaserCard>
            <div className="p-12 text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-2xl"></div>
                <Percent className="h-16 w-16 text-cyan-400/50 relative mx-auto" />
              </div>
              <p className="text-gray-400 text-lg mb-4">ยังไม่มีสินค้าลดราคาในขณะนี้</p>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-xl font-medium text-white hover:opacity-90 transition-opacity"
              >
                ดูสินค้าทั้งหมด
              </Link>
            </div>
          </LaserCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {productsData?.products?.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Promotion Rules */}
      <LaserCard>
        <div className="p-6">
          <h3 className="text-xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            เงื่อนไขโปรโมชั่น
          </h3>
          <ul className="space-y-2 text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400">•</span>
              <span>โปรโมชั่นมีระยะเวลาจำกัด ตรวจสอบวันหมดอายุก่อนสั่งซื้อ</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400">•</span>
              <span>ไม่สามารถใช้ร่วมกับโปรโมชั่นอื่นได้</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400">•</span>
              <span>สินค้าลดราคาไม่สามารถคืนเงินได้</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400">•</span>
              <span>ขอสงวนสิทธิ์ในการเปลี่ยนแปลงเงื่อนไขโดยไม่ต้องแจ้งให้ทราบล่วงหน้า</span>
            </li>
          </ul>
        </div>
      </LaserCard>
    </div>
  );
}
