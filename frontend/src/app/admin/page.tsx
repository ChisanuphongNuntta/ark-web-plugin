'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi } from '@/lib/api';
import { adminContractApi } from '@/lib/contracts/client';
import type { SlipTopupSubmission } from '@/lib/contracts/types';
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
  CreditCard,
  Receipt,
  FileCheck,
  Eye,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

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

  // Slip Inspection Lightbox
  const [selectedSlip, setSelectedSlip] = useState<SlipTopupSubmission | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingSlip, setRejectingSlip] = useState<SlipTopupSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ title: string; desc: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((res) => res.data),
    enabled: canAccessAdmin,
  });

  // Query pending bank transfer slip approvals
  const { data: pendingTopupsData, isLoading: pendingTopupsLoading } = useQuery({
    queryKey: ['admin-pending-topups'],
    queryFn: () => adminContractApi.getPendingTopups(),
    enabled: canAccessAdmin,
  });

  const [localPendingTopups, setLocalPendingTopups] = useState<SlipTopupSubmission[] | null>(null);
  const pendingTopups = localPendingTopups ?? pendingTopupsData?.topups ?? [];

  const handleApproveSlip = async (topup: SlipTopupSubmission) => {
    try {
      await adminContractApi.approveTopup(topup.id, 'Approved by Admin');
      setLocalPendingTopups((prev) => (prev ?? pendingTopups).filter((item) => item.id !== topup.id));
      queryClient.invalidateQueries({ queryKey: ['admin-pending-topups'] });
      setSelectedSlip(null);
      setFeedbackMessage({
        title: 'อนุมัติยอดโอนเงินสำเร็จ',
        desc: `ระบบได้เติมเงิน ${topup.pointsToCredit.toLocaleString()} IC ให้กับ ${topup.userName} เรียบร้อยแล้ว`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        title: 'เกิดข้อผิดพลาด',
        desc: err?.message || 'ไม่สามารถอนุมัติรายการได้',
        type: 'error',
      });
    }
  };

  const handleRejectSlip = async () => {
    if (!rejectingSlip) return;
    try {
      await adminContractApi.rejectTopup(rejectingSlip.id, rejectReason || 'สลิปไม่ถูกต้องหรือไม่พบยอดเงิน');
      setLocalPendingTopups((prev) => (prev ?? pendingTopups).filter((item) => item.id !== rejectingSlip.id));
      queryClient.invalidateQueries({ queryKey: ['admin-pending-topups'] });
      setRejectModalOpen(false);
      setRejectingSlip(null);
      setSelectedSlip(null);
      setRejectReason('');
      setFeedbackMessage({
        title: 'ปฏิเสธรายการเรียบร้อย',
        desc: `รายการ ${rejectingSlip.id} ถูกปฏิเสธพร้อมบันทึกเหตุผลเรียบร้อยแล้ว`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        title: 'เกิดข้อผิดพลาด',
        desc: err?.message || 'ไม่สามารถปฏิเสธรายการได้',
        type: 'error',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-iris-cyan">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm font-bold tracking-wider uppercase">Authenticating Access...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <GlassCard className="p-12 text-center">
        <p className="text-iris-muted">กรุณาเข้าสู่ระบบเพื่อเข้าใช้งานแผงควบคุม</p>
      </GlassCard>
    );
  }

  if (!canAccessAdmin) {
    return (
      <GlassCard variant="danger" className="p-12 text-center">
        <XCircle className="mx-auto h-12 w-12 text-rose-400 mb-3" />
        <p className="text-lg font-bold text-rose-400">คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-iris-cyan animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-iris-cyan">
              OPERATIONS COMMAND CENTER
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-black text-iris-pearl">
            Admin Dashboard
          </h1>
        </div>

        {/* Role Badge */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-black/40">
          <Shield className="h-4 w-4 text-iris-cyan" />
          <span className="text-xs text-iris-muted">Role:</span>
          <span className="text-xs font-bold uppercase text-iris-gold">
            {role === 'server_admin' ? 'Server Admin' : role}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <GlassCard hoverEffect="lift" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iris-muted">ผู้ใช้ทั้งหมด</p>
                  <p className="text-2xl font-black text-iris-pearl mt-1">
                    {data?.stats?.totalUsers || 0}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iris-muted">คำสั่งซื้อ</p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {data?.stats?.totalOrders || 0}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iris-muted">รายได้รวม</p>
                  <p className="text-2xl font-black text-iris-gold mt-1">
                    {(data?.stats?.totalRevenue || 0).toLocaleString()} <span className="text-xs">IC</span>
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris-gold/10 border border-iris-gold/30 text-iris-gold">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iris-muted">รออนุมัติโอน</p>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    {pendingTopups.length}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Receipt className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iris-muted">เซิร์ฟเวอร์</p>
                  <p className="text-2xl font-black text-iris-orchid mt-1">
                    {data?.stats?.activeServers || 0}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris-orchid/10 border border-iris-orchid/30 text-iris-orchid">
                  <Server className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* SECTION: PENDING SLIP APPROVALS (ระบบแจ้งเตือนแอดมิน Approve ยอดโอนเงิน) */}
          <GlassCard variant="default" className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-iris-pearl flex items-center gap-2">
                    รายการสลิปโอนเงินรอการอนุมัติ (Pending Top-up Approvals)
                    {pendingTopups.length > 0 && (
                      <Badge variant="hot">{pendingTopups.length} รายการรอตรวจ</Badge>
                    )}
                  </h2>
                  <p className="text-xs text-iris-muted">
                    ตรวจสอบความถูกต้องของสลิปโอนเงิน และกดยืนยันเพื่อเติมเหรียญ Iris Coin เข้ากระเป๋าผู้ใช้
                  </p>
                </div>
              </div>
            </div>

            {pendingTopupsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" />
              </div>
            ) : pendingTopups.length === 0 ? (
              <div className="py-8 text-center text-xs text-iris-muted">
                <CheckCircle className="mx-auto h-8 w-8 text-emerald-400/60 mb-2" />
                ไม่มีรายการสลิปค้างรออนุมัติในขณะนี้ ทุกรายการได้รับการตรวจสอบครบถ้วนแล้ว
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {pendingTopups.map((item) => (
                  <GlassCard
                    key={item.id}
                    variant="default"
                    className="p-4 border border-amber-500/20 bg-amber-500/[0.02] flex flex-col justify-between gap-4"
                  >
                    <div className="flex gap-4">
                      {/* Slip Thumbnail Click to View */}
                      <div
                        className="relative h-28 w-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/60 group"
                        onClick={() => setSelectedSlip(item)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.slipImageUrl} alt="Slip" className="h-full w-full object-cover transition duration-300 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <Eye className="h-5 w-5 text-white" />
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-iris-pearl">{item.userName}</span>
                          <Badge variant="cyan">{item.transferBank}</Badge>
                        </div>
                        <p className="text-iris-muted text-[11px]">
                          แพ็คเกจ: <span className="text-iris-pearl font-bold">{item.packageName}</span>
                        </p>
                        <p className="text-iris-muted text-[11px]">
                          ยอดเงินโอน: <span className="text-iris-cyan font-bold">฿{item.amountThb.toLocaleString()} THB</span>
                        </p>
                        <p className="text-iris-muted text-[11px]">
                          เหรียญที่จะได้รับ: <span className="text-iris-gold font-bold">+{item.pointsToCredit.toLocaleString()} IC</span>
                        </p>
                        <p className="text-iris-muted text-[10px] font-mono">
                          Ref: {item.transferRef || 'N/A'} • {new Date(item.createdAt).toLocaleTimeString('th-TH')}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSlip(item)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        ดูสลิป
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setRejectingSlip(item);
                          setRejectModalOpen(true);
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        ปฏิเสธ
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApproveSlip(item)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        อนุมัติยอด (Approve)
                      </Button>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Quick Nav Links */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {canManageProducts && (
              <Link href="/admin/products" className="block">
                <GlassCard hoverEffect="lift" className="p-5">
                  <Package className="h-6 w-6 text-iris-cyan mb-2" />
                  <h3 className="font-bold text-iris-pearl">จัดการสินค้า (Products)</h3>
                  <p className="text-xs text-iris-muted mt-1">เพิ่ม แก้ไข ลบสินค้าและกำหนดราคา</p>
                </GlassCard>
              </Link>
            )}

            {canManageProducts && (
              <Link href="/admin/categories" className="block">
                <GlassCard hoverEffect="lift" className="p-5">
                  <FolderOpen className="h-6 w-6 text-iris-gold mb-2" />
                  <h3 className="font-bold text-iris-pearl">หมวดหมู่สินค้า (Categories)</h3>
                  <p className="text-xs text-iris-muted mt-1">จัดการโครงสร้างหมวดหมู่</p>
                </GlassCard>
              </Link>
            )}

            {canManageServerUsers && (
              <Link href="/admin/users" className="block">
                <GlassCard hoverEffect="lift" className="p-5">
                  <Users className="h-6 w-6 text-iris-orchid mb-2" />
                  <h3 className="font-bold text-iris-pearl">จัดการผู้ใช้ (Users)</h3>
                  <p className="text-xs text-iris-muted mt-1">ดูข้อมูล แบน ให้สิทธิ์ Admin</p>
                </GlassCard>
              </Link>
            )}

            {canManageServers && (
              <Link href="/admin/servers" className="block">
                <GlassCard hoverEffect="lift" className="p-5">
                  <Server className="h-6 w-6 text-emerald-400 mb-2" />
                  <h3 className="font-bold text-iris-pearl">เซิร์ฟเวอร์ (ARK Clusters)</h3>
                  <p className="text-xs text-iris-muted mt-1">มอนิเตอร์สถานะ Heartbeat</p>
                </GlassCard>
              </Link>
            )}
          </div>
        </>
      )}

      {/* Slip Inspection Lightbox Modal */}
      <Dialog open={Boolean(selectedSlip)} onOpenChange={(open) => !open && setSelectedSlip(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>ตรวจสอบหลักฐานการโอนเงิน (Slip Verification)</DialogTitle>
            <DialogDescription>
              ตรวจสอบความถูกต้องของยอดเงินและเวลาในสลิปก่อนดำเนินการอนุมัติ
            </DialogDescription>
          </DialogHeader>

          {selectedSlip && (
            <div className="space-y-4 pt-2">
              {/* Slip Image Full */}
              <div className="relative aspect-[3/4] max-h-96 w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedSlip.slipImageUrl} alt="Full Slip" className="h-full w-full object-contain" />
              </div>

              {/* Info summary */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-black/40 border border-white/5 p-4 text-xs">
                <div>
                  <span className="text-iris-muted">ผู้โอน:</span>
                  <p className="font-bold text-iris-pearl">{selectedSlip.userName}</p>
                </div>
                <div>
                  <span className="text-iris-muted">ธนาคาร:</span>
                  <p className="font-bold text-iris-cyan">{selectedSlip.transferBank}</p>
                </div>
                <div>
                  <span className="text-iris-muted">ยอดเงิน:</span>
                  <p className="font-bold text-emerald-400">฿{selectedSlip.amountThb.toLocaleString()} THB</p>
                </div>
                <div>
                  <span className="text-iris-muted">เหรียญที่จะเติม:</span>
                  <p className="font-bold text-iris-gold">+{selectedSlip.pointsToCredit.toLocaleString()} IC</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    setRejectingSlip(selectedSlip);
                    setRejectModalOpen(true);
                  }}
                >
                  ปฏิเสธรายการ (Reject)
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleApproveSlip(selectedSlip)}
                >
                  ยืนยันอนุมัติและเติมเหรียญ (Approve & Credit)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ระบุเหตุผลการปฏิเสธสลิป</DialogTitle>
            <DialogDescription>
              ข้อความนี้จะถูกบันทึกในระบบและแจ้งเตือนไปยังผู้ใช้งาน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="เช่น ยอดเงินไม่ตรงกับแพ็คเกจ, ไม่พบรายการโอนในบัญชีธนาคาร..."
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-sm text-iris-pearl focus:border-rose-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={handleRejectSlip}>
                ยืนยันการปฏิเสธ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Feedback Dialog */}
      <Dialog open={Boolean(feedbackMessage)} onOpenChange={(open) => !open && setFeedbackMessage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{feedbackMessage?.title}</DialogTitle>
            <DialogDescription>{feedbackMessage?.desc}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button variant="primary" onClick={() => setFeedbackMessage(null)}>
              รับทราบ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
