'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { dinoMarketApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  Loader2,
  ArrowLeft,
  Store,
  Tag,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Heart,
  Zap,
} from 'lucide-react';

export default function MyListingsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const [dialogConfig, setDialogConfig] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: 'primary' | 'danger';
    onConfirm?: () => void;
  }>({
    open: false,
    title: '',
  });

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
      setDialogConfig({
        open: true,
        title: 'สำเร็จ',
        description: res.data?.message || 'ยกเลิกการวางจำหน่ายเรียบร้อยแล้ว',
      });
      queryClient.invalidateQueries({ queryKey: ['myDinoListings'] });
    },
    onError: (error: any) => {
      setDialogConfig({
        open: true,
        title: 'ผิดพลาด',
        description: error.response?.data?.error || 'ไม่สามารถยกเลิกการวางจำหน่ายได้',
      });
    },
  });

  const handleCancel = (id: string, species: string) => {
    setDialogConfig({
      open: true,
      title: `ยกเลิกการขาย ${species}?`,
      description: 'สัตว์จะถูกปลดจากการวางขายและส่งคืนให้คุณเมื่อเข้าสู่เซิร์ฟเวอร์เกม',
      variant: 'danger',
      onConfirm: () => cancelMutation.mutate(id),
    });
  };

  return (
    <div className="page-shell max-w-7xl mx-auto py-8 sm:py-10 space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                MY EXPEDITION LISTINGS
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black text-iris-pearl">
              รายการขายของฉัน
            </h1>
          </div>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-xs font-bold text-iris-pearl focus:border-iris-cyan focus:outline-none"
        >
          <option value="">ทั้งหมด (All Status)</option>
          <option value="listed">กำลังขาย (Listed)</option>
          <option value="sold">ขายแล้ว (Sold)</option>
          <option value="cancelled">ยกเลิกแล้ว (Cancelled)</option>
        </select>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : listingsData?.listings?.length === 0 ? (
        <GlassCard className="p-16 text-center">
          <Store className="mx-auto h-12 w-12 text-iris-muted/40 mb-3" />
          <p className="text-lg font-bold text-iris-pearl">คุณยังไม่มีรายการขาย</p>
          <p className="text-xs text-iris-muted mt-1">
            ใช้คำสั่ง <code className="text-iris-cyan font-mono">/sell</code> ในเกมเพื่อนำไดโนเสาร์มาวางขายในตลาดผู้เล่น
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {listingsData?.listings?.map((listing: any) => (
            <GlassCard key={listing.id} hoverEffect="lift" className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Dino Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/market/${listing.id}`}
                    className="font-bold text-base text-iris-pearl hover:text-iris-cyan transition"
                  >
                    {listing.dinoName || listing.species}
                  </Link>
                  <Badge variant={listing.status === 'listed' ? 'cyan' : listing.status === 'sold' ? 'gold' : 'default'}>
                    {listing.status === 'listed' ? 'กำลังขาย' : listing.status === 'sold' ? 'ขายแล้ว' : listing.status}
                  </Badge>
                </div>
                <p className="text-xs text-iris-muted mt-1">
                  {listing.species} • Lv.{listing.level} • {listing.gender === 'Male' ? '♂ ผู้' : '♀ เมีย'}
                </p>
              </div>

              {/* Stats Summary */}
              <div className="flex gap-6 text-xs border-y md:border-y-0 md:border-x border-white/5 py-2 md:py-0 md:px-6">
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Health</p>
                  <p className="font-bold text-rose-400">{listing.baseHealth}</p>
                </div>
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Damage</p>
                  <p className="font-bold text-emerald-400">{listing.baseDamage}</p>
                </div>
                <div>
                  <p className="text-[10px] text-iris-muted uppercase">Imprint</p>
                  <p className="font-bold text-iris-cyan">
                    {Math.round(listing.imprintQuality * 100)}%
                  </p>
                </div>
              </div>

              {/* Price & Actions */}
              <div className="flex items-center justify-between md:justify-end gap-6">
                <div className="text-right">
                  <p className="text-xl font-black text-iris-gold">
                    {listing.price.toLocaleString()}{' '}
                    <span className="text-xs font-bold text-iris-gold/70">IC</span>
                  </p>
                </div>

                {listing.status === 'listed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                    onClick={() => handleCancel(listing.id, listing.species)}
                    disabled={cancelMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    ยกเลิกขาย
                  </Button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Confirmation / Info Dialog */}
      <Dialog open={dialogConfig.open} onOpenChange={(open) => setDialogConfig((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogConfig.title}</DialogTitle>
            {dialogConfig.description && (
              <DialogDescription>{dialogConfig.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            {dialogConfig.onConfirm ? (
              <>
                <Button variant="secondary" onClick={() => setDialogConfig((prev) => ({ ...prev, open: false }))}>
                  ปิด
                </Button>
                <Button
                  variant={dialogConfig.variant === 'danger' ? 'secondary' : 'primary'}
                  className={dialogConfig.variant === 'danger' ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/20' : undefined}
                  onClick={() => {
                    dialogConfig.onConfirm?.();
                    setDialogConfig((prev) => ({ ...prev, open: false }));
                  }}
                >
                  ยืนยัน
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setDialogConfig((prev) => ({ ...prev, open: false }))}>
                รับทราบ
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
