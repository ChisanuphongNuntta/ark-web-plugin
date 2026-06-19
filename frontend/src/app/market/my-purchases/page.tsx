'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dinoMarketApi } from '@/lib/api';
import LaserCard from '@/components/LaserCard';
import {
  Loader2,
  ArrowLeft,
  ShoppingBag,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
} from 'lucide-react';

// Delivery status badge
function DeliveryBadge({ status }: { status: string | null }) {
  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    pending: { color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30', icon: Clock, label: 'รอรับของ' },
    delivered: { color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: CheckCircle, label: 'รับแล้ว' },
    failed: { color: 'text-red-400 bg-red-500/20 border-red-500/30', icon: AlertCircle, label: 'ล้มเหลว' },
  };

  const config = statusConfig[status || 'pending'] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-1 ${config.color}`}>
      <Icon className="h-4 w-4" />
      {config.label}
    </span>
  );
}

export default function MyPurchasesPage() {
  const { data: purchasesData, isLoading } = useQuery({
    queryKey: ['myDinoPurchases'],
    queryFn: () => dinoMarketApi.getMyPurchases().then((res) => res.data),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/market"
          className="p-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-2xl"></div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent relative flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-cyan-400 relative" />
            ไดโนที่ฉันซื้อ
          </h1>
        </div>
      </div>

      {/* Purchases */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : purchasesData?.purchases?.length === 0 ? (
        <LaserCard>
          <div className="text-center py-16">
            <Package className="h-16 w-16 text-emerald-400/50 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">คุณยังไม่มีการซื้อ</p>
            <Link
              href="/market"
              className="mt-4 inline-block px-6 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-300 hover:bg-emerald-600/30 transition-all"
            >
              ไปดูตลาด
            </Link>
          </div>
        </LaserCard>
      ) : (
        <div className="space-y-4">
          {purchasesData?.purchases?.map((purchase: any) => (
            <LaserCard key={purchase.id} glowOnHover>
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                {/* Dino Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/market/${purchase.id}`}
                      className="font-bold text-lg text-white hover:text-emerald-300 transition-colors"
                    >
                      {purchase.dinoName || purchase.species}
                    </Link>
                    <DeliveryBadge status={purchase.deliveryStatus} />
                  </div>
                  <p className="text-sm text-emerald-300">
                    {purchase.species} • Lv.{purchase.level} •{' '}
                    {purchase.gender === 'Male' ? '♂' : '♀'}
                  </p>
                </div>

                {/* Stats Summary */}
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-gray-400">HP</p>
                    <p className="font-medium text-red-400">{purchase.baseHealth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">DMG</p>
                    <p className="font-medium text-emerald-400">{purchase.baseDamage}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Mutations</p>
                    <p className="font-medium text-cyan-400">
                      {purchase.maternalMutations + purchase.paternalMutations}
                    </p>
                  </div>
                </div>

                {/* Price Paid */}
                <div className="text-right">
                  <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                    {purchase.price.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-400">Points</p>
                </div>

                {/* Seller Info */}
                <div className="flex items-center gap-2">
                  {purchase.seller?.discordAvatar ? (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${purchase.seller.id}/${purchase.seller.discordAvatar}.png`}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-600/30" />
                  )}
                  <div>
                    <p className="text-xs text-gray-400">ซื้อจาก</p>
                    <p className="text-sm text-white">
                      {purchase.seller?.discordUsername || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Purchase Date */}
                <div className="text-center">
                  <p className="text-xs text-gray-400">ซื้อเมื่อ</p>
                  <p className="text-sm text-emerald-300">
                    {new Date(purchase.soldAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
              </div>

              {/* Delivery Info */}
              {purchase.deliveryStatus === 'pending' && (
                <div className="px-4 pb-4">
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <p className="text-sm text-yellow-400">
                      รอรับไดโน - เข้าเกมและรอสักครู่ ระบบจะส่งให้อัตโนมัติ
                    </p>
                  </div>
                </div>
              )}

              {purchase.deliveryStatus === 'delivered' && purchase.deliveredAt && (
                <div className="px-4 pb-4">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <p className="text-sm text-green-400">
                      รับไดโนแล้วเมื่อ {new Date(purchase.deliveredAt).toLocaleString('th-TH')}
                    </p>
                  </div>
                </div>
              )}
            </LaserCard>
          ))}
        </div>
      )}

      {/* Pagination */}
      {purchasesData?.pagination && purchasesData.pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <p className="text-gray-400">
            แสดง {purchasesData.purchases.length} จาก {purchasesData.pagination.total} รายการ
          </p>
        </div>
      )}
    </div>
  );
}
