'use client';

import { useAuthStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { orderApi } from '@/lib/api';
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Coins,
} from 'lucide-react';
import LaserCard from '@/components/LaserCard';

const statusConfig: Record<
  string,
  { label: string; color: string; glow: string; border: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'รอรับของ',
    color: 'text-yellow-400 bg-yellow-400/20',
    glow: 'bg-yellow-500/30',
    border: 'border-yellow-500/30',
    icon: <Clock className="h-4 w-4" />,
  },
  queued: {
    label: 'อยู่ในคิว',
    color: 'text-blue-400 bg-blue-400/20',
    glow: 'bg-blue-500/30',
    border: 'border-blue-500/30',
    icon: <RefreshCw className="h-4 w-4" />,
  },
  delivered: {
    label: 'ส่งแล้ว',
    color: 'text-green-400 bg-green-400/20',
    glow: 'bg-green-500/30',
    border: 'border-green-500/30',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  failed: {
    label: 'ล้มเหลว',
    color: 'text-red-400 bg-red-400/20',
    glow: 'bg-red-500/30',
    border: 'border-red-500/30',
    icon: <XCircle className="h-4 w-4" />,
  },
  refunded: {
    label: 'คืนเงิน',
    color: 'text-gray-400 bg-gray-400/20',
    glow: 'bg-gray-500/30',
    border: 'border-gray-500/30',
    icon: <RefreshCw className="h-4 w-4" />,
  },
};

export default function OrdersPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => orderApi.getAll().then(res => res.data),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-2xl"></div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-lg animate-pulse"></div>
            <Package className="h-10 w-10 text-emerald-400 relative" />
          </div>
          คำสั่งซื้อของฉัน
        </h1>
      </div>

      {/* Pending orders info */}
      {data?.orders?.some((o: any) => o.status === 'pending') && (
        <LaserCard className="border-yellow-500/30 shadow-yellow-500/20">
          <div className="p-4 bg-yellow-500/10 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-lg animate-pulse"></div>
                <Clock className="h-6 w-6 text-yellow-400 relative" />
              </div>
              <p className="text-yellow-400">
                คุณมีคำสั่งซื้อที่รอรับ - พิมพ์ <code className="bg-black/40 px-2 py-1 rounded border border-yellow-500/30">/claim</code> ในเกมเพื่อรับไอเทม
              </p>
            </div>
          </div>
        </LaserCard>
      )}

      {/* Orders list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data?.orders?.length === 0 ? (
          <LaserCard className="lg:col-span-2">
            <div className="p-12 text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl"></div>
                <Package className="h-16 w-16 text-emerald-400/50 relative mx-auto" />
              </div>
              <p className="text-gray-400 text-lg">ยังไม่มีคำสั่งซื้อ</p>
            </div>
          </LaserCard>
        ) : (
          data?.orders?.map((order: any) => {
            const status = statusConfig[order.status] || statusConfig.pending;

            return (
              <LaserCard key={order.id} glowOnHover className={status.border}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      {/* Product image placeholder */}
                      <div className="relative w-16 h-16 bg-black/60 rounded-xl flex items-center justify-center text-2xl border border-emerald-500/20 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10"></div>
                        <span className="relative">{order.product?.category?.icon || '📦'}</span>
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                          {order.product?.name}
                        </h3>
                        <div className="text-sm text-gray-400 space-y-1 mt-1">
                          <p>
                            <span className="text-emerald-400">เซิร์ฟเวอร์:</span> {order.server?.name} ({order.server?.map})
                          </p>
                          <p>
                            <span className="text-emerald-400">จำนวน:</span> x{order.quantity}
                          </p>
                          <p className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(order.createdAt).toLocaleString('th-TH')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="relative inline-block">
                        <div className={`absolute inset-0 ${status.glow} rounded-full blur-md`}></div>
                        <div
                          className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border backdrop-blur-sm ${status.color} ${status.border}`}
                        >
                          {status.icon}
                          <span className="font-medium">{status.label}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 justify-end mt-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-md"></div>
                          <Coins className="h-4 w-4 text-yellow-500 relative" />
                        </div>
                        <span className="font-bold bg-gradient-to-r from-yellow-500 to-amber-500 bg-clip-text text-transparent">
                          {order.totalPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {order.status === 'failed' && order.lastError && (
                    <div className="mt-3 p-3 bg-red-500/10 rounded-xl text-sm text-red-400 border border-red-500/30 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        <span className="font-medium">Error:</span> {order.lastError}
                      </div>
                    </div>
                  )}
                </div>
              </LaserCard>
            );
          })
        )}
      </div>
    </div>
  );
}
