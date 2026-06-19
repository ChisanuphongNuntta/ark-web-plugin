'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi } from '@/lib/api';
import {
  Loader2,
  Users,
  ShoppingCart,
  Package,
  Server,
  TrendingUp,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  FolderOpen,
  LayoutGrid,
  Key,
  Crown,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const {
    role,
    canAccessAdmin,
    canManageProducts,
    canManageContent,
    canManageOrders,
    canManageServerUsers,
    canManageApiKeys,
    canManageServers,
    canManageChatRanks,
    isRoot,
  } = usePermissions();
  const queryClient = useQueryClient();


  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((res) => res.data),
    enabled: canAccessAdmin,
  });



  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LaserCard>
        <div className="text-center py-12">
          <p className="text-gray-400">กรุณาเข้าสู่ระบบ</p>
        </div>
      </LaserCard>
    );
  }

  if (!canAccessAdmin) {
    return (
      <LaserCard className="border-red-500/30">
        <div className="text-center py-12">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl"></div>
            <XCircle className="h-16 w-16 text-red-400 relative mx-auto" />
          </div>
          <p className="text-red-400 text-lg">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </div>
      </LaserCard>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-2xl"></div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent relative flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-lg animate-pulse"></div>
              <Settings className="h-10 w-10 text-emerald-400 relative" />
            </div>
            Admin Dashboard
          </h1>
        </div>
        {/* Role Badge */}
        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 rounded-xl border border-emerald-500/20">
          <Shield className="h-5 w-5 text-emerald-400" />
          <span className="text-sm text-gray-400">Role:</span>
          <span className={`font-medium capitalize ${role === 'root' ? 'text-red-400' :
            role === 'server_admin' ? 'text-orange-400' :
              role === 'admin' ? 'text-emerald-400' : 'text-gray-400'
            }`}>
            {role === 'server_admin' ? 'Server Admin' : role}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
          </div>
        </div>
      ) : (
        <>
          {/* Plugin Compile Section - Root Only */}


          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <LaserCard glowOnHover>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">ผู้ใช้ทั้งหมด</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {data?.stats?.totalUsers || 0}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-xl blur-lg"></div>
                    <Users className="h-10 w-10 text-blue-400 relative" />
                  </div>
                </div>
              </div>
            </LaserCard>

            <LaserCard glowOnHover>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">คำสั่งซื้อทั้งหมด</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                      {data?.stats?.totalOrders || 0}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-500/20 rounded-xl blur-lg"></div>
                    <ShoppingCart className="h-10 w-10 text-green-400 relative" />
                  </div>
                </div>
              </div>
            </LaserCard>

            <LaserCard glowOnHover>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">รายได้รวม</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
                      {(data?.stats?.totalRevenue || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-yellow-500/20 rounded-xl blur-lg"></div>
                    <TrendingUp className="h-10 w-10 text-yellow-400 relative" />
                  </div>
                </div>
              </div>
            </LaserCard>

            <LaserCard glowOnHover>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">รอดำเนินการ</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                      {data?.stats?.pendingOrders || 0}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500/20 rounded-xl blur-lg"></div>
                    <Package className="h-10 w-10 text-orange-400 relative" />
                  </div>
                </div>
              </div>
            </LaserCard>

            <LaserCard glowOnHover>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">เซิร์ฟเวอร์</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                      {data?.stats?.activeServers || 0}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-xl blur-lg"></div>
                    <Server className="h-10 w-10 text-emerald-400 relative" />
                  </div>
                </div>
              </div>
            </LaserCard>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {canManageContent && (
              <Link href="/admin/content" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600 via-rose-600 to-cyan-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-cyan-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-cyan-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <LayoutGrid className="h-8 w-8 text-cyan-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-rose-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        Content Builder
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">สร้างหน้า Dynamic</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageProducts && (
              <Link href="/admin/products" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-emerald-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-emerald-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Package className="h-8 w-8 text-emerald-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-emerald-400 group-hover:to-cyan-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        จัดการสินค้า
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">เพิ่ม แก้ไข ลบสินค้า</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageProducts && (
              <Link href="/admin/categories" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-cyan-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-cyan-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <FolderOpen className="h-8 w-8 text-cyan-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-teal-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        หมวดหมู่
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">จัดการหมวดหมู่สินค้า</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageServerUsers && (
              <Link href="/admin/users" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-blue-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-blue-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Users className="h-8 w-8 text-blue-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-cyan-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        จัดการผู้ใช้
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">ดูข้อมูล แบน ให้สิทธิ์</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageOrders && (
              <Link href="/admin/orders" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-green-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-green-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <ShoppingCart className="h-8 w-8 text-green-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-green-400 group-hover:to-emerald-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        คำสั่งซื้อ
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">ดูคำสั่งซื้อ คืนเงิน</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageServers && (
              <Link href="/admin/servers" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-orange-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-orange-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Server className="h-8 w-8 text-orange-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-orange-400 group-hover:to-amber-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        เซิร์ฟเวอร์
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">จัดการเซิร์ฟเวอร์ ARK</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageApiKeys && (
              <Link href="/admin/api-keys" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-emerald-600 to-violet-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-violet-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-violet-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Users className="h-8 w-8 text-violet-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-violet-400 group-hover:to-emerald-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        Users API Keys
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">ตรวจสอบ Keys ผู้ใช้</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {isRoot && (
              <Link href="/admin/system/api-key" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-red-600 via-orange-600 to-red-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-red-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-red-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Key className="h-8 w-8 text-red-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-red-400 group-hover:to-orange-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        System API Key
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">สร้าง Key สำหรับเซิร์ฟเวอร์</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}

            {canManageChatRanks && (
              <Link href="/admin/chat-ranks" className="block group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-30 transition-opacity"></div>
                  <LaserCard className="group-hover:border-amber-500/40 transition-all">
                    <div className="p-6">
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-amber-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Crown className="h-8 w-8 text-amber-400 relative" />
                      </div>
                      <h3 className="font-semibold group-hover:bg-gradient-to-r group-hover:from-amber-400 group-hover:to-yellow-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                        Chat Ranks
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">จัดการยศในแชท</p>
                    </div>
                  </LaserCard>
                </div>
              </Link>
            )}
          </div>

          {/* Recent Orders - Website Admin only */}
          {canManageOrders && (
            <LaserCard glowOnHover>
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
                  <ShoppingCart className="h-6 w-6 text-emerald-400" />
                  คำสั่งซื้อล่าสุด
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-b border-emerald-500/20">
                        <th className="pb-3 text-emerald-300 font-medium">ผู้ใช้</th>
                        <th className="pb-3 text-emerald-300 font-medium">สินค้า</th>
                        <th className="pb-3 text-emerald-300 font-medium">ราคา</th>
                        <th className="pb-3 text-emerald-300 font-medium">สถานะ</th>
                        <th className="pb-3 text-emerald-300 font-medium">เวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentOrders?.map((order: any) => (
                        <tr key={order.id} className="border-b border-emerald-500/10 hover:bg-emerald-500/5 transition-colors">
                          <td className="py-3 text-gray-200">{order.user?.discordUsername || 'Unknown'}</td>
                          <td className="py-3 text-gray-200">{order.product?.name || 'Unknown'}</td>
                          <td className="py-3">
                            <span className="bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent font-bold">
                              {order.totalPrice.toLocaleString()} IC
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="relative inline-block">
                              <div
                                className={`absolute inset-0 rounded-lg blur-md ${order.status === 'delivered'
                                  ? 'bg-green-500/20'
                                  : order.status === 'pending'
                                    ? 'bg-yellow-500/20'
                                    : order.status === 'refunded'
                                      ? 'bg-red-500/20'
                                      : 'bg-gray-500/20'
                                  }`}
                              ></div>
                              <span
                                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-sm ${order.status === 'delivered'
                                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                  : order.status === 'pending'
                                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                    : order.status === 'refunded'
                                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                      : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                  }`}
                              >
                                {order.status}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-gray-400 text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(order.createdAt).toLocaleString('th-TH')}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!data?.recentOrders || data.recentOrders.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-400">
                            ยังไม่มีคำสั่งซื้อ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </LaserCard>
          )}
        </>
      )}
    </div>
  );
}
