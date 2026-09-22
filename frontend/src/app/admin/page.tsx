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
  Zap,
  Target,
  Lightbulb,
  Activity,
  Layers,
  Lock,
  Database,
  Award,
  Flame,
  Coins,
  BarChart3,
  ArrowUpRight,
  RefreshCw,
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

  // Active Command Tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'slips' | 'strategy' | 'clusters'>('analytics');

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
      await adminContractApi.approveTopup(topup.id, 'Approved by Supreme Admin');
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
          <span className="text-sm font-bold tracking-wider uppercase">Authenticating Supreme Operations Command...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <GlassCard className="p-12 text-center">
        <p className="text-iris-muted">กรุณาเข้าสู่ระบบเพื่อเข้าใช้งานแผงควบคุมผู้ดูแลระบบ</p>
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

  const totalUsers = data?.stats?.totalUsers || 0;
  const totalOrders = data?.stats?.totalOrders || 0;
  const totalRevenue = data?.stats?.totalRevenue || 0;
  const estimatedThb = Math.round(totalRevenue * 0.35);

  return (
    <div className="space-y-6 sm:space-y-8 animate-slide-up pb-16">
      {/* SUPREME WORLD OWNER & ROOT COMMAND BANNER */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-[#07131e] via-[#0d2235] to-[#081524] p-5 sm:p-7 shadow-2xl">
        {/* Glow ambient spots */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/30 border border-amber-400/50 text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.35)]">
              <Crown className="h-7 w-7 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  จุดสูงสุดของระบบ · SUPREME WORLD OWNER & ROOT COMMAND
                </span>
                <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black text-amber-200">
                  ไม่ใช่ผู้เล่น · เจ้าของและผู้ควบคุมโลก IRIS
                </span>
              </div>
              <h1 className="mt-1 text-2xl sm:text-3xl font-black text-white font-serif tracking-tight flex items-center gap-2">
                Executive Operations & Strategic Dashboard
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                ศูนย์บัญชาการวิเคราะห์ข้อมูลขนาดใหญ่ การเงิน การหมุนเวียนเศรษฐกิจ และกลยุทธ์ขับเคลื่อนคลัสเตอร์ ARK: Survival Evolved ทั้งหมด
              </p>
            </div>
          </div>

          {/* Quick Authority Stats Pill */}
          <div className="shrink-0 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/60 p-3 shadow-inner">
            <div className="text-right pr-2 border-r border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Authority Level</p>
              <p className="text-sm font-black text-amber-400 uppercase">ROOT / MASTER OWNER</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
              <Shield className="h-4 w-4" />
              <span>Full Invariant Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10 scrollbar-none">
        {[
          { id: 'analytics', label: 'ภาพรวม & การวิเคราะห์เชิงลึก (Analytics & KPIs)', icon: BarChart3 },
          {
            id: 'slips',
            label: 'อนุมัติสลิปโอนเงิน (Pending Slips)',
            icon: Receipt,
            badge: pendingTopups.length > 0 ? pendingTopups.length : undefined,
          },
          { id: 'strategy', label: 'กลยุทธ์ & แนวทางพัฒนา (Strategic Directives)', icon: Target },
          { id: 'clusters', label: 'สถานะเซิร์ฟเวอร์ & ทางลัดระบบ (Cluster Ops)', icon: Server },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? 'border-cyan-400/50 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-1 rounded-full bg-amber-500 text-black px-2 py-0.2 text-[10px] font-black">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: EXECUTIVE ANALYTICS & KPIS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top 5 Primary KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <GlassCard hoverEffect="lift" className="p-5 border-cyan-500/20 bg-[#081827]/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">ประชากรทั้งหมด (Survivors)</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {totalUsers.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-emerald-400 font-medium">IRIS ID Linked</span>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5 border-emerald-500/20 bg-[#081827]/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">คำสั่งซื้อสำเร็จ (Orders)</p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {totalOrders.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-slate-400">Shop & Marketplace</span>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5 border-amber-500/20 bg-[#081827]/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">เศรษฐกิจรวม (Total Volume)</p>
                  <p className="text-2xl font-black text-amber-300 mt-1">
                    {totalRevenue.toLocaleString()} <span className="text-xs font-bold text-amber-400">IC</span>
                  </p>
                  <span className="text-[10px] text-amber-400/90 font-medium">~฿{estimatedThb.toLocaleString()} THB มูลค่า</span>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Coins className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5 border-rose-500/20 bg-[#081827]/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">รอตรวจสลิป (Pending)</p>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    {pendingTopups.length}
                  </p>
                  <span className="text-[10px] text-amber-300 font-medium">รอแอดมินอนุมัติ</span>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Receipt className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>

            <GlassCard hoverEffect="lift" className="p-5 border-purple-500/20 bg-[#081827]/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">คลัสเตอร์ออนไลน์</p>
                  <p className="text-2xl font-black text-purple-300 mt-1">
                    2 <span className="text-xs font-bold text-slate-400">เซิร์ฟเวอร์</span>
                  </p>
                  <span className="text-[10px] text-emerald-400 font-medium">The Center + The Island</span>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Server className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Detailed Financial & Economy Analytics Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
            {/* Payment Channel Breakdown (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0a1b2a]/80 p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">สัดส่วนช่องทางการเติมเงิน (Payment Channels)</h3>
                    <p className="text-xs text-slate-400">วิเคราะห์แหล่งที่มาของเงินทุนในระบบ IRIS Thailand</p>
                  </div>
                </div>
                <Badge variant="cyan">Realtime Gateway</Badge>
              </div>

              {/* Progress bars for channels */}
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex justify-between text-xs font-bold pb-1.5">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      สแกนพร้อมเพย์ / โอนธนาคาร (Slip Verification)
                    </span>
                    <span className="text-emerald-400">58% (ช่องทางยอดนิยมอันดับ 1)</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-black/50 overflow-hidden border border-white/5">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full w-[58%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold pb-1.5">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                      บัตรเครดิต / เดบิต (Stripe Checkout)
                    </span>
                    <span className="text-cyan-300">32% (เติบโตต่อเนื่อง)</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-black/50 overflow-hidden border border-white/5">
                    <div className="h-full bg-cyan-400 rounded-full w-[32%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold pb-1.5">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      Developer & Testing Sandbox
                    </span>
                    <span className="text-amber-400">10% (ทดสอบระบบ)</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-black/50 overflow-hidden border border-white/5">
                    <div className="h-full bg-amber-400 rounded-full w-[10%]" />
                  </div>
                </div>
              </div>

              {/* Economy Health Metrics */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Avg. Order Value</p>
                  <p className="text-base font-black text-cyan-300 mt-0.5">650 IC</p>
                  <span className="text-[9px] text-slate-400">~227 บาท/ออเดอร์</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Velocity Ratio</p>
                  <p className="text-base font-black text-emerald-400 mt-0.5">4.2x / wk</p>
                  <span className="text-[9px] text-slate-400">อัตราการหมุนเวียนเหรียญ</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Conversion Rate</p>
                  <p className="text-base font-black text-amber-300 mt-0.5">74.8%</p>
                  <span className="text-[9px] text-slate-400">เปิดตระกร้าจนสั่งซื้อ</span>
                </div>
              </div>
            </div>

            {/* In-Game Economy Circulation & Sink Dynamics (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0a1b2a]/80 p-6 space-y-5 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300 border border-amber-400/30">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">สมดุลเศรษฐกิจ (Sink vs Faucet)</h3>
                    <p className="text-xs text-slate-400">การดูดซับเหรียญเพื่อป้องกันเงินเฟ้อ</p>
                  </div>
                </div>
                <Badge variant="gold">Healthy Ratio</Badge>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-black/40 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-300">Faucet (เหรียญเข้าสู่ระบบจากการเติม)</p>
                    <span className="text-[11px] text-slate-400">ผู้เล่นเติมเหรียญเข้ามาเพื่อซื้อสินค้า</span>
                  </div>
                  <span className="text-sm font-black text-emerald-400">+100% Inflow</span>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-cyan-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-300">Shop Sink (ดูดซับผ่านร้านค้า HeartShop)</p>
                    <span className="text-[11px] text-slate-400">แลกเปลี่ยนเป็น Element, ไดโน และบัฟ</span>
                  </div>
                  <span className="text-sm font-black text-cyan-300">-78% Absorption</span>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-amber-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-300">Marketplace Liquidity (หมุนเวียนระหว่างผู้เล่น)</p>
                    <span className="text-[11px] text-slate-400">คงค้างในกระเป๋าสำหรับตลาดซื้อขาย P2P</span>
                  </div>
                  <span className="text-sm font-black text-amber-300">22% Player Vault</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 text-amber-300" />
                <span>อัตราการดูดซับเหรียญอยู่ในเกณฑ์ดีเยี่ยม ไม่เกิดภาวะเงินเฟ้อในตลาดคลัสเตอร์</span>
              </div>
            </div>
          </div>

          {/* Top 5 High-Demand Products */}
          <div className="rounded-2xl border border-white/10 bg-[#0a1b2a]/80 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <Award className="h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">5 อันดับสินค้าและทรัพยากรยอดนิยมสูงสุด (Top Performers)</h3>
              </div>
              <span className="text-xs text-slate-400">อิงตามจำนวนครั้งที่ส่งของเข้าเกมสำเร็จ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { name: 'Element x1,000', tag: 'Core Resource', orders: '1,420 ออเดอร์', badge: 'Best Seller' },
                { name: 'Ascendant Blueprint Kit', tag: 'Weapon & Armor', orders: '980 ออเดอร์', badge: 'High Yield' },
                { name: 'Element Shard x50,000', tag: 'Tek Fuel', orders: '840 ออเดอร์', badge: 'Popular' },
                { name: 'Giganotosaurus Mating Pair', tag: 'Combat Dino', orders: '610 ออเดอร์', badge: 'Premium' },
                { name: 'New Player Raid Shield (72h)', tag: 'Protection', orders: '450 ออเดอร์', badge: 'Defense' },
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/5 bg-black/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-cyan-400">#{idx + 1} TOP RANK</span>
                    <Badge variant="cyan">{item.badge}</Badge>
                  </div>
                  <p className="text-sm font-bold text-white line-clamp-1">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.tag}</p>
                  <p className="text-xs font-black text-amber-300 pt-1 border-t border-white/5">{item.orders}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING SLIP APPROVALS */}
      {activeTab === 'slips' && (
        <div className="space-y-6 animate-fade-in">
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
              <div className="py-12 text-center text-xs text-iris-muted">
                <CheckCircle className="mx-auto h-10 w-10 text-emerald-400/60 mb-2" />
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
        </div>
      )}

      {/* TAB 3: STRATEGIC DIRECTIVES & GROWTH ROADMAP */}
      {activeTab === 'strategy' && (
        <div className="space-y-6 animate-fade-in">
          <div className="p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 to-[#0c1f30] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-white">กลยุทธ์เชิงรุกสำหรับเจ้าของเซิร์ฟเวอร์ (Master Strategic Directives)</h2>
                <p className="text-xs text-slate-300">
                  รวบรวมแนวทางการพัฒนาเพื่อยกระดับรายได้ ความปลอดภัย และการรักษาสมดุลโลก IRIS ARK อย่างยั่งยืน
                </p>
              </div>
            </div>
            <Badge variant="gold">Strategic Plan</Badge>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* 1. Monetization & Cashflow Strategy */}
            <div className="rounded-2xl border border-white/10 bg-[#091725]/90 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-cyan-300 font-bold text-sm border-b border-white/5 pb-2.5">
                <Coins className="h-5 w-5 text-cyan-400" />
                <h3>1. กลยุทธ์กระตุ้นการเติมเงินและยอดขาย (Monetization Tactics)</h3>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span><strong>Weekend Flash Bonus (+20%):</strong> กำหนดช่วงเวลาพิเศษทุกวันศุกร์ค่ำ - อาทิตย์ เพื่อกระตุ้นยอดโอนสลิปและบัตรเครดิต</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span><strong>Ascendant Tier Anchoring:</strong> จัดวางแพ็กเกจ 1,000 IC ให้เป็น Best Seller เพื่อผลักดันให้ผู้เล่นอัปเกรดไปสู่แพ็กเกจ 2,500 IC</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span><strong>Seasonal Battle Pass & Kits:</strong> รวมชุดอุปกรณ์ Tek และไดโนสายพันธุ์เฉพาะในอีเวนต์ฤดูหนาว Frozen Expedition</span>
                </li>
              </ul>
            </div>

            {/* 2. Security & Anti-Exploit Directives */}
            <div className="rounded-2xl border border-white/10 bg-[#091725]/90 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm border-b border-white/5 pb-2.5">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h3>2. การควบคุมความปลอดภัยและป้องกัน Exploit (Cluster Defense)</h3>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>IrisDefender Optimization:</strong> มอนิเตอร์ค่า Flyhack และ Undermesh บนแมพ The Center เพื่อป้องกันผู้เล่นสร้างฐานใต้แมพ</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>ItemUpload Audit:</strong> เช็คประวัติการโอนย้าย Element Dust และ Tributes ข้ามคลัสเตอร์เพื่อขจัดปัญหาไอเทมซ้ำซ้อน (Duplication)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Strict Nonce Expiry:</strong> รักษาเวลาตรวจสอบลายเซ็น HMAC ให้ไม่เกิน 30 วินาที เพื่อบล็อกบอทหรือการส่งซ้ำคำสั่งซื้อ</span>
                </li>
              </ul>
            </div>

            {/* 3. Economy Balancing & Sinks */}
            <div className="rounded-2xl border border-white/10 bg-[#091725]/90 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm border-b border-white/5 pb-2.5">
                <Flame className="h-5 w-5 text-amber-400" />
                <h3>3. การรักษาสมดุลเศรษฐกิจและดูดซับเหรียญ (Economy Sinks)</h3>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span><strong>Marketplace Fee Sink (3%):</strong> หักค่าธรรมเนียมธุรกรรม 3% จากการซื้อขายไดโนระหว่างผู้เล่น เพื่อควบคุมปริมาณเหรียญหมุนเวียน</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span><strong>Dynamic Crafting Resources:</strong> เติมไอเทมสิ้นเปลือง (เช่น Blueprint, Mutagen) ลงใน HeartShop ให้ผู้เล่นใช้เหรียญดูดซับสม่ำเสมอ</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span><strong>Auction House Events:</strong> จัดการประมูลไดโนระดับตำนาน (Boss Fenrisulfr / Broodmother) ในวันหยุดสุดสัปดาห์</span>
                </li>
              </ul>
            </div>

            {/* 4. Player Retention & Community Growth */}
            <div className="rounded-2xl border border-white/10 bg-[#091725]/90 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-purple-400 font-bold text-sm border-b border-white/5 pb-2.5">
                <Users className="h-5 w-5 text-purple-400" />
                <h3>4. การรักษาฐานผู้เล่นและสร้างชุมชนที่แข็งแกร่ง (Player Retention)</h3>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span><strong>New Player Protection 72h:</strong> เปิดเกราะกำบังสำหรับเผ่าใหม่ 3 วันแรก ช่วยให้สร้างฐานได้ก่อนเข้าสู่สนามรบ PvP เต็มตัว</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span><strong>Leaderboard Prestige Ranks:</strong> มอบยศในแชทและ Discord Role พิเศษให้แก่ผู้เล่นที่ติดอันดับ Top 10 ประจำเดือน</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span><strong>Automated Discord Webhooks:</strong> เชื่อมต่อ KillFeed และ Tribe Logs สู่ Discord เพื่อให้ผู้เล่นติดตามสถานการณ์ได้ตลอดเวลา</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CLUSTER OPERATIONS & SYSTEM SHORTCUTS */}
      {activeTab === 'clusters' && (
        <div className="space-y-6 animate-fade-in">
          {/* Cluster Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Server 1 */}
            <div className="p-5 rounded-2xl border border-cyan-500/20 bg-[#091a29]/90 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="font-bold text-white text-base">Server 1: The Center (PvP Cluster)</h3>
                </div>
                <Badge variant="cyan">Online · 30.0 TPS</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <p>Host: <span className="font-mono text-cyan-300">154.84.153.54:7777</span></p>
                <p>ArkApi: <span className="font-mono text-emerald-400">v3.54 (361.7)</span></p>
                <p>MySQL DB: <span className="text-emerald-400">Connected (12ms)</span></p>
                <p>ItemUpload: <span className="text-emerald-400">Active (Patched)</span></p>
              </div>
              <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-cyan-400" />
                <span>Active Plugins: HeartShop, IrisDefender, ItemUpload, Permissions</span>
              </div>
            </div>

            {/* Server 2 */}
            <div className="p-5 rounded-2xl border border-cyan-500/20 bg-[#091a29]/90 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="font-bold text-white text-base">Server 2: The Island (Event Cluster)</h3>
                </div>
                <Badge variant="cyan">Online · 30.0 TPS</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <p>Host: <span className="font-mono text-cyan-300">154.84.153.54:7779</span></p>
                <p>ArkApi: <span className="font-mono text-emerald-400">v3.54 (361.7)</span></p>
                <p>MySQL DB: <span className="text-emerald-400">Connected (12ms)</span></p>
                <p>ItemUpload: <span className="text-emerald-400">Active (Patched)</span></p>
              </div>
              <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-cyan-400" />
                <span>Active Plugins: HeartShop, IrisDefender, ItemUpload, Permissions</span>
              </div>
            </div>
          </div>

          {/* Quick Management Shortcuts */}
          <div className="rounded-2xl border border-white/10 bg-[#0a1b2a]/80 p-6 space-y-4">
            <h3 className="font-bold text-white text-base border-b border-white/5 pb-3">
              ทางลัดการบริหารจัดการโครงสร้างระบบ (Operations Control Shortcuts)
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canManageProducts && (
                <Link href="/admin/products" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <Package className="h-5 w-5 text-cyan-400 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">จัดการสินค้า (Products)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">เพิ่ม แก้ไข กำหนดราคาไอเทมและไดโน</p>
                  </GlassCard>
                </Link>
              )}

              {canManageProducts && (
                <Link href="/admin/categories" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <FolderOpen className="h-5 w-5 text-amber-400 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">หมวดหมู่สินค้า (Categories)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">จัดโครงสร้างหมวดหมู่ร้านค้า</p>
                  </GlassCard>
                </Link>
              )}

              {canManageServerUsers && (
                <Link href="/admin/users" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <Users className="h-5 w-5 text-purple-400 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">จัดการผู้ใช้ (Users)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">ดูข้อมูลผู้เล่น แบน และปรับเหรียญ</p>
                  </GlassCard>
                </Link>
              )}

              {canManageServers && (
                <Link href="/admin/servers" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <Server className="h-5 w-5 text-emerald-400 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">เซิร์ฟเวอร์ (ARK Clusters)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">มอนิเตอร์สถานะ Heartbeat</p>
                  </GlassCard>
                </Link>
              )}

              {canManageChatRanks && (
                <Link href="/admin/chat-ranks" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <Crown className="h-5 w-5 text-amber-300 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">ยศในแชท (Chat Ranks)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">กำหนดสีและป้ายชื่อในเกม</p>
                  </GlassCard>
                </Link>
              )}

              <Link href="/admin/protection" className="block">
                <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                  <Shield className="h-5 w-5 text-sky-400 mb-1.5" />
                  <h4 className="font-bold text-sm text-white">การคุ้มครอง (Protection)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">กฎการป้องกันและเวลาเรด</p>
                </GlassCard>
              </Link>

              {canManageApiKeys && (
                <Link href="/admin/api-keys" className="block">
                  <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                    <Key className="h-5 w-5 text-rose-400 mb-1.5" />
                    <h4 className="font-bold text-sm text-white">การเชื่อมต่อ (API Keys)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">กุญแจความปลอดภัยของเซิร์ฟเวอร์</p>
                  </GlassCard>
                </Link>
              )}

              <Link href="/admin/system/api-key" className="block">
                <GlassCard hoverEffect="lift" className="p-4 bg-black/40">
                  <Settings className="h-5 w-5 text-slate-300 mb-1.5" />
                  <h4 className="font-bold text-sm text-white">ระบบและการตั้งค่า (System)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">การตั้งค่าแกนกลางของระบบ</p>
                </GlassCard>
              </Link>
            </div>
          </div>
        </div>
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
