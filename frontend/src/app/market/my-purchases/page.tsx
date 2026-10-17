'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dinoMarketApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Loader2,
  ArrowLeft,
  ShoppingBag,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
} from 'lucide-react';

export default function MyPurchasesPage() {
  const { data: purchasesData, isLoading } = useQuery({
    queryKey: ['myDinoPurchases'],
    queryFn: () => dinoMarketApi.getMyPurchases().then((res) => res.data),
  });

  return (
    <div className="page-shell max-w-7xl mx-auto py-8 sm:py-10 space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/market">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            กลับตลาด
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-iris-cyan animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-iris-cyan">
              MY EXPEDITION PURCHASES
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-iris-pearl">
            สัตว์ที่ฉันสั่งซื้อ
          </h1>
        </div>
      </div>

      {/* Purchases */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : purchasesData?.purchases?.length === 0 ? (
        <GlassCard className="p-16 text-center">
          <Package className="mx-auto h-12 w-12 text-iris-muted/40 mb-3" />
          <p className="text-lg font-bold text-iris-pearl">คุณยังไม่มีประวัติการซื้อสัตว์</p>
          <div className="mt-4">
            <Link href="/market">
              <Button variant="primary">สำรวจตลาดสัตว์เลี้ยง</Button>
            </Link>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {purchasesData?.purchases?.map((purchase: any) => (
            <GlassCard key={purchase.id} hoverEffect="lift" className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Dino Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/market/${purchase.id}`}
                    className="font-bold text-base text-iris-pearl hover:text-iris-cyan transition"
                  >
                    {purchase.dinoName || purchase.species}
                  </Link>
                  <Badge variant={purchase.deliveryStatus === 'delivered' ? 'cyan' : 'gold'}>
                    {purchase.deliveryStatus === 'delivered' ? 'ส่งมอบแล้ว' : 'รอรับของในเกม'}
                  </Badge>
                </div>
                <p className="text-xs text-iris-muted mt-1">
                  {purchase.species} • Lv.{purchase.level} • {purchase.gender === 'Male' ? '♂ ผู้' : '♀ เมีย'}
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-6 text-xs border-y md:border-y-0 md:border-x border-white/5 py-2 md:py-0 md:px-6">
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Health</p>
                  <p className="font-bold text-rose-400">{purchase.baseHealth}</p>
                </div>
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Damage</p>
                  <p className="font-bold text-emerald-400">{purchase.baseDamage}</p>
                </div>
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Imprint</p>
                  <p className="font-bold text-iris-cyan">
                    {Math.round(purchase.imprintQuality * 100)}%
                  </p>
                </div>
              </div>

              {/* Price & Delivery Details */}
              <div className="text-right">
                <p className="text-xl font-black text-iris-gold">
                  {purchase.price.toLocaleString()}{' '}
                  <span className="text-xs font-bold text-iris-gold/70">IC</span>
                </p>
                <p className="text-[11px] text-iris-muted mt-0.5">
                  ซื้อเมื่อ {new Date(purchase.soldAt || purchase.createdAt).toLocaleDateString('th-TH')}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
