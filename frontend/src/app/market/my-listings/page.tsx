'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { dinoMarketApi } from '@/lib/api';
import LaserCard from '@/components/LaserCard';
import LaserModal from '@/components/LaserModal';
import {
  Loader2,
  ArrowLeft,
  Store,
  Tag,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
} from 'lucide-react';

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    listed: { color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: Tag, label: 'กำลังขาย' },
    sold: { color: 'text-blue-400 bg-blue-500/20 border-blue-500/30', icon: CheckCircle, label: 'ขายแล้ว' },
    cancelled: { color: 'text-gray-400 bg-gray-500/20 border-gray-500/30', icon: XCircle, label: 'ยกเลิก' },
    expired: { color: 'text-orange-400 bg-orange-500/20 border-orange-500/30', icon: Clock, label: 'หมดอายุ' },
  };

  const config = statusConfig[status] || statusConfig.listed;
  const Icon = config.icon;

  return (
    <span className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-1 ${config.color}`}>
      <Icon className="h-4 w-4" />
      {config.label}
    </span>
  );
}

export default function MyListingsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    onConfirm?: () => void;
    singleButton?: boolean;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const showModal = ({
    title,
    content,
    onConfirm,
    variant = 'default',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    singleButton = false,
  }: {
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    confirmText?: string;
    cancelText?: string;
    singleButton?: boolean;
  }) => {
    setModalConfig({
      isOpen: true,
      title,
      content,
      onConfirm: onConfirm
        ? () => {
          onConfirm();
          closeModal();
        }
        : singleButton ? closeModal : undefined,
      variant,
      confirmText,
      cancelText,
      singleButton,
    });
  };

  const { data: listingsData, isLoading } = useQuery({
    queryKey: ['myDinoListings', statusFilter],
    queryFn: () =>
      dinoMarketApi.getMyListings({
        status: statusFilter || undefined,
      }).then((res) => res.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => dinoMarketApi.cancelListing(id),
    onSuccess: (res) => {
      showModal({
        title: 'สำเร็จ',
        content: <p>{res.data.message}</p>,
        variant: 'success',
        singleButton: true,
        confirmText: 'ตกลง',
      });
      queryClient.invalidateQueries({ queryKey: ['myDinoListings'] });
    },
    onError: (error: any) => {
      showModal({
        title: 'ผิดพลาด',
        content: <p>{error.response?.data?.error || 'Failed to cancel listing'}</p>,
        variant: 'danger',
        singleButton: true,
        confirmText: 'ตกลง',
      });
    },
  });

  const handleCancel = (id: string, species: string) => {
    showModal({
      title: `ยกเลิกการขาย ${species}?`,
      content: <p>ไดโนจะถูกส่งคืนเมื่อคุณเข้าเกม</p>,
      variant: 'warning',
      confirmText: 'ยืนยัน',
      onConfirm: () => cancelMutation.mutate(id),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/market"
            className="p-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-2xl"></div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent relative flex items-center gap-3">
              <Store className="h-8 w-8 text-emerald-400 relative" />
              รายการขายของฉัน
            </h1>
          </div>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-40"
        >
          <option value="">ทั้งหมด</option>
          <option value="listed">กำลังขาย</option>
          <option value="sold">ขายแล้ว</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : listingsData?.listings?.length === 0 ? (
        <LaserCard>
          <div className="text-center py-16">
            <Store className="h-16 w-16 text-emerald-400/50 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">คุณยังไม่มีรายการขาย</p>
            <p className="text-gray-500 text-sm mt-2">
              ใช้คำสั่ง /sell ในเกมเพื่อขายไดโน
            </p>
          </div>
        </LaserCard>
      ) : (
        <div className="space-y-4">
          {listingsData?.listings?.map((listing: any) => (
            <LaserCard key={listing.id} glowOnHover>
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                {/* Dino Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/market/${listing.id}`}
                      className="font-bold text-lg text-white hover:text-emerald-300 transition-colors"
                    >
                      {listing.dinoName || listing.species}
                    </Link>
                    <StatusBadge status={listing.status} />
                  </div>
                  <p className="text-sm text-emerald-300">
                    {listing.species} • Lv.{listing.level} •{' '}
                    {listing.gender === 'Male' ? '♂' : '♀'}
                  </p>
                </div>

                {/* Stats Summary */}
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-gray-400">HP</p>
                    <p className="font-medium text-red-400">{listing.baseHealth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">DMG</p>
                    <p className="font-medium text-emerald-400">{listing.baseDamage}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Imprint</p>
                    <p className="font-medium text-green-400">
                      {Math.round(listing.imprintQuality * 100)}%
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right">
                  <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                    {listing.price.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-400">Points</p>
                </div>

                {/* Actions */}
                {listing.status === 'listed' && (
                  <button
                    onClick={() => handleCancel(listing.id, listing.species)}
                    disabled={cancelMutation.isPending}
                    className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                    title="ยกเลิกการขาย"
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                  </button>
                )}

                {listing.status === 'sold' && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400">ขายเมื่อ</p>
                    <p className="text-sm text-blue-400">
                      {new Date(listing.soldAt).toLocaleDateString('th-TH')}
                    </p>
                  </div>
                )}
              </div>
            </LaserCard>
          ))}
        </div>
      )}

      {/* Pagination */}
      {listingsData?.pagination && listingsData.pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <p className="text-gray-400">
            แสดง {listingsData.listings.length} จาก {listingsData.pagination.total} รายการ
          </p>
        </div>
      )}
      {/* Laser Modal */}
      <LaserModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        singleButton={modalConfig.singleButton}
      >
        {modalConfig.content}
      </LaserModal>
    </div>
  );
}
