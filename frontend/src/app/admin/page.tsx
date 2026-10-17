'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  CheckCircle,
  Coins,
  CreditCard,
  Crown,
  Download,
  Eye,
  Flame,
  FolderOpen,
  Key,
  Lightbulb,
  Loader2,
  Package,
  Receipt,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Target,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi } from '@/lib/api';
import { adminContractApi } from '@/lib/contracts/client';
import type { SlipTopupSubmission } from '@/lib/contracts/types';
import {
  AdminButton,
  AdminDialog,
  AdminField,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';

type DashboardTab = 'analytics' | 'slips' | 'strategy' | 'clusters';
type Feedback = { title: string; desc: string; type: 'success' | 'error' };

const ROLE_LABEL: Record<string, string> = {
  root: 'ผู้ดูแลสูงสุด (Root)',
  admin: 'ผู้ดูแลระบบ',
  server_admin: 'ผู้ดูแลเซิร์ฟเวอร์',
  user: 'ผู้ใช้',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown };
    const fromApi = e.response?.data?.error ?? e.response?.data?.message;
    if (typeof fromApi === 'string' && fromApi) return fromApi;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return fallback;
}

/* ---------- small presentational pieces (page-local, built on the kit look) ---------- */

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass-card p-5">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-iris-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-iris-pearl">{value}</p>
          <p className="mt-0.5 text-xs text-iris-muted">{hint}</p>
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-iris-cyan [&>svg]:h-5 [&>svg]:w-5"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function ShareBar({ label, note, percent }: { label: string; note: string; percent: number }) {
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-x-3 pb-1.5 text-xs">
        <span className="text-iris-pearl">{label}</span>
        <span className="text-iris-muted">
          <span className="font-semibold tabular-nums text-iris-pearl">{percent}%</span> · {note}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-iris-cyan/70" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-xs text-iris-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-iris-pearl">{value}</p>
      <p className="text-[11px] text-iris-muted">{hint}</p>
    </div>
  );
}

function SampleDataNote() {
  return <p className="text-[11px] text-iris-muted">ตัวเลขในส่วนนี้เป็นค่าตั้งต้น ยังไม่ได้ดึงจากระบบจริง</p>;
}

function DirectiveCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { term: string; text: string }[];
}) {
  return (
    <AdminPanel
      title={
        <span className="flex items-center gap-2">
          <span className="text-iris-cyan [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
      }
    >
      <ul className="space-y-2.5 text-sm text-iris-muted">
        {items.map((item) => (
          <li key={item.term} className="flex items-start gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-iris-cyan/70" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-iris-pearl">{item.term}:</strong> {item.text}
            </span>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

function ShortcutCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-iris-cyan/30 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40"
    >
      <span className="text-iris-cyan [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
        {icon}
      </span>
      <h4 className="mt-2 text-sm font-semibold text-iris-pearl">{title}</h4>
      <p className="mt-0.5 text-xs text-iris-muted">{desc}</p>
    </Link>
  );
}

/* ---------- static content (unchanged from the previous dashboard) ---------- */

const TOP_PRODUCTS = [
  { name: 'Element x1,000', tag: 'Core Resource', orders: '1,420 ออเดอร์', badge: 'Best Seller' },
  { name: 'Ascendant Blueprint Kit', tag: 'Weapon & Armor', orders: '980 ออเดอร์', badge: 'High Yield' },
  { name: 'Element Shard x50,000', tag: 'Tek Fuel', orders: '840 ออเดอร์', badge: 'Popular' },
  { name: 'Giganotosaurus Mating Pair', tag: 'Combat Dino', orders: '610 ออเดอร์', badge: 'Premium' },
  { name: 'New Player Raid Shield (72h)', tag: 'Protection', orders: '450 ออเดอร์', badge: 'Defense' },
];

const DIRECTIVES: { title: string; icon: React.ReactNode; items: { term: string; text: string }[] }[] = [
  {
    title: '1. กระตุ้นการเติมเงินและยอดขาย',
    icon: <Coins />,
    items: [
      { term: 'Weekend Flash Bonus (+20%)', text: 'กำหนดช่วงเวลาพิเศษทุกวันศุกร์ค่ำ - อาทิตย์ เพื่อกระตุ้นยอดโอนสลิปและบัตรเครดิต' },
      { term: 'Ascendant Tier Anchoring', text: 'จัดวางแพ็กเกจ 1,000 IC ให้เป็น Best Seller เพื่อผลักดันให้ผู้เล่นอัปเกรดไปสู่แพ็กเกจ 2,500 IC' },
      { term: 'Seasonal Battle Pass & Kits', text: 'รวมชุดอุปกรณ์ Tek และไดโนสายพันธุ์เฉพาะในอีเวนต์ฤดูหนาว Frozen Expedition' },
    ],
  },
  {
    title: '2. ความปลอดภัยและการป้องกัน Exploit',
    icon: <Shield />,
    items: [
      { term: 'IrisDefender Optimization', text: 'มอนิเตอร์ค่า Flyhack และ Undermesh บนแมพ The Center เพื่อป้องกันผู้เล่นสร้างฐานใต้แมพ' },
      { term: 'ItemUpload Audit', text: 'เช็คประวัติการโอนย้าย Element Dust และ Tributes ข้ามคลัสเตอร์เพื่อขจัดปัญหาไอเทมซ้ำซ้อน (Duplication)' },
      { term: 'Strict Nonce Expiry', text: 'รักษาเวลาตรวจสอบลายเซ็น HMAC ให้ไม่เกิน 30 วินาที เพื่อบล็อกบอทหรือการส่งซ้ำคำสั่งซื้อ' },
    ],
  },
  {
    title: '3. สมดุลเศรษฐกิจและการดูดซับเหรียญ',
    icon: <Flame />,
    items: [
      { term: 'Marketplace Fee Sink (3%)', text: 'หักค่าธรรมเนียมธุรกรรม 3% จากการซื้อขายไดโนระหว่างผู้เล่น เพื่อควบคุมปริมาณเหรียญหมุนเวียน' },
      { term: 'Dynamic Crafting Resources', text: 'เติมไอเทมสิ้นเปลือง (เช่น Blueprint, Mutagen) ลงใน HeartShop ให้ผู้เล่นใช้เหรียญดูดซับสม่ำเสมอ' },
      { term: 'Auction House Events', text: 'จัดการประมูลไดโนระดับตำนาน (Boss Fenrisulfr / Broodmother) ในวันหยุดสุดสัปดาห์' },
    ],
  },
  {
    title: '4. รักษาฐานผู้เล่นและสร้างชุมชน',
    icon: <Users />,
    items: [
      { term: 'New Player Protection 72h', text: 'เปิดเกราะกำบังสำหรับเผ่าใหม่ 3 วันแรก ช่วยให้สร้างฐานได้ก่อนเข้าสู่สนามรบ PvP เต็มตัว' },
      { term: 'Leaderboard Prestige Ranks', text: 'มอบยศในแชทและ Discord Role พิเศษให้แก่ผู้เล่นที่ติดอันดับ Top 10 ประจำเดือน' },
      { term: 'Automated Discord Webhooks', text: 'เชื่อมต่อ KillFeed และ Tribe Logs สู่ Discord เพื่อให้ผู้เล่นติดตามสถานการณ์ได้ตลอดเวลา' },
    ],
  },
];

const SERVER_PREVIEW_SIZE = 10;

/**
 * Live server summary for the dashboard (root only: GET /admin/servers is
 * root-gated). Reads the paginated list: first page for the rows, and the
 * status=online total for the online count. No hosts/IPs are shown here.
 */
function ServerStatusPanel() {
  const allQuery = useQuery({
    queryKey: ['admin-dashboard-servers', 'all'],
    queryFn: ({ signal }) => adminApi.getServersPage({ page: 1, pageSize: SERVER_PREVIEW_SIZE }, signal),
    staleTime: 30_000,
  });
  const onlineQuery = useQuery({
    queryKey: ['admin-dashboard-servers', 'online'],
    queryFn: ({ signal }) =>
      adminApi.getServersPage({ page: 1, pageSize: SERVER_PREVIEW_SIZE, filters: { status: 'online' } }, signal),
    staleTime: 30_000,
  });

  const total = allQuery.data?.pagination.total;
  const online = onlineQuery.data?.pagination.total;
  const rows = allQuery.data?.items ?? [];

  return (
    <AdminPanel
      title="สถานะเซิร์ฟเวอร์"
      description={
        total === undefined
          ? 'กำลังโหลดข้อมูลจากระบบ…'
          : `ออนไลน์ ${online ?? '—'} จาก ${total} เซิร์ฟเวอร์ (ตาม Heartbeat ล่าสุด)`
      }
      actions={
        <Link href="/admin/servers" className="text-xs font-medium text-iris-cyan hover:underline">
          ดูทั้งหมด
        </Link>
      }
    >
      {allQuery.isError ? (
        <p className="text-sm text-iris-muted">โหลดสถานะเซิร์ฟเวอร์ไม่สำเร็จ ลองเปิดหน้าจัดการเซิร์ฟเวอร์อีกครั้ง</p>
      ) : allQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-iris-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          กำลังโหลด…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-iris-muted">ยังไม่มีเซิร์ฟเวอร์ในระบบ</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-iris-pearl">{s.displayName || s.name}</span>
                <span className="block truncate text-xs text-iris-muted">
                  {[s.cluster?.name, s.map].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {s.online && <span className="text-xs tabular-nums text-iris-muted">{s.playerCount} คน</span>}
                <StatusBadge tone={s.online ? 'success' : s.isActive ? 'neutral' : 'warning'} dot>
                  {s.online ? 'ออนไลน์' : s.isActive ? 'ออฟไลน์' : 'ปิดใช้งาน'}
                </StatusBadge>
              </span>
            </li>
          ))}
        </ul>
      )}
      {total !== undefined && total > rows.length && (
        <p className="mt-2 text-[11px] text-iris-muted">
          แสดง {rows.length} จาก {total} เซิร์ฟเวอร์ ดูทั้งหมดได้ที่หน้าจัดการเซิร์ฟเวอร์
        </p>
      )}
    </AdminPanel>
  );
}

/* ---------- page ---------- */

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const {
    role,
    canAccessAdmin,
    canManageProducts,
    canManageServerUsers,
    canManageApiKeys,
    canManageServers,
    canManageChatRanks,
    isRoot,
  } = usePermissions();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DashboardTab>('analytics');

  // Slip review state
  const [selectedSlip, setSelectedSlip] = useState<SlipTopupSubmission | null>(null);
  const [rejectingSlip, setRejectingSlip] = useState<SlipTopupSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectPending, setRejectPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((res) => res.data),
    enabled: canAccessAdmin,
  });

  const { data: pendingTopupsData, isLoading: pendingTopupsLoading } = useQuery({
    queryKey: ['admin-pending-topups'],
    queryFn: () => adminContractApi.getPendingTopups(),
    enabled: canAccessAdmin,
  });

  const [localPendingTopups, setLocalPendingTopups] = useState<SlipTopupSubmission[] | null>(null);
  const pendingTopups = localPendingTopups ?? pendingTopupsData?.topups ?? [];

  const handleApproveSlip = async (topup: SlipTopupSubmission) => {
    if (approvingId) return; // one approval at a time — avoids double-crediting on double click
    setApprovingId(topup.id);
    setFeedback(null);
    try {
      await adminContractApi.approveTopup(topup.id, 'Approved by Supreme Admin');
      setLocalPendingTopups((prev) => (prev ?? pendingTopups).filter((item) => item.id !== topup.id));
      queryClient.invalidateQueries({ queryKey: ['admin-pending-topups'] });
      setSelectedSlip(null);
      setFeedback({
        title: 'อนุมัติยอดโอนเงินสำเร็จ',
        desc: `ระบบได้เติมเงิน ${topup.pointsToCredit.toLocaleString()} IC ให้กับ ${topup.userName} เรียบร้อยแล้ว`,
        type: 'success',
      });
    } catch (err: unknown) {
      setFeedback({
        title: 'เกิดข้อผิดพลาด',
        desc: errorMessage(err, 'ไม่สามารถอนุมัติรายการได้'),
        type: 'error',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const openReject = (slip: SlipTopupSubmission) => {
    setFeedback(null);
    setSelectedSlip(null);
    setRejectingSlip(slip);
  };

  const closeReject = () => {
    if (rejectPending) return;
    setRejectingSlip(null);
    if (feedback?.type === 'error') setFeedback(null);
  };

  const handleRejectSlip = async () => {
    if (!rejectingSlip || rejectPending) return;
    const slip = rejectingSlip;
    setRejectPending(true);
    setFeedback(null);
    try {
      await adminContractApi.rejectTopup(slip.id, rejectReason || 'สลิปไม่ถูกต้องหรือไม่พบยอดเงิน');
      setLocalPendingTopups((prev) => (prev ?? pendingTopups).filter((item) => item.id !== slip.id));
      queryClient.invalidateQueries({ queryKey: ['admin-pending-topups'] });
      setRejectingSlip(null);
      setSelectedSlip(null);
      setRejectReason('');
      setFeedback({
        title: 'ปฏิเสธรายการเรียบร้อย',
        desc: `รายการ ${slip.id} ถูกปฏิเสธพร้อมบันทึกเหตุผลเรียบร้อยแล้ว`,
        type: 'success',
      });
    } catch (err: unknown) {
      setFeedback({
        title: 'เกิดข้อผิดพลาด',
        desc: errorMessage(err, 'ไม่สามารถปฏิเสธรายการได้'),
        type: 'error',
      });
    } finally {
      setRejectPending(false);
    }
  };

  const roleLabel = ROLE_LABEL[role] ?? role;

  const handleExportReport = () => {
    const today = new Date().toISOString().split('T')[0];
    const totalUsers = data?.stats?.totalUsers || 0;
    const totalOrders = data?.stats?.totalOrders || 0;
    const totalRevenue = data?.stats?.totalRevenue || 0;
    const estimatedThb = Math.round(totalRevenue * 0.35);

    const csvContent =
      '﻿' +
      'รายงานสรุปสถานะการเงินและปฏิบัติการ IRIS Cluster (Executive Financial Report)\n' +
      `วันที่ส่งออก,${today}\n` +
      `ผู้ส่งออก,${user?.discordUsername || user?.steamId || '-'}\n` +
      `ระดับสิทธิ์,${roleLabel}\n\n` +
      'ตัวชี้วัด (Metrics),ค่าตัวเลข (Value),หน่วย (Unit)\n' +
      `ผู้เล่นที่ลงทะเบียนทั้งหมด,${totalUsers},บัญชี\n` +
      `คำสั่งซื้อที่สำเร็จแล้ว,${totalOrders},รายการ\n` +
      `ปริมาณเหรียญหมุนเวียน (Gross Volume),${totalRevenue},Iris Coin\n` +
      `รายรับสุทธิโดยประมาณ (THB),${estimatedThb},บาท (THB)\n` +
      `สลิปโอนเงินที่รอดำเนินการ,${pendingTopups.length},รายการ\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `iris-financial-report-${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-iris-muted">
        <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" aria-hidden="true" />
        <span className="text-sm">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AdminPanel className="text-center">
        <p className="py-8 text-sm text-iris-muted">กรุณาเข้าสู่ระบบเพื่อเข้าใช้งานแผงควบคุมผู้ดูแลระบบ</p>
      </AdminPanel>
    );
  }

  if (!canAccessAdmin) {
    return (
      <AdminPanel className="text-center">
        <div className="py-8">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-200" aria-hidden="true" />
          <p className="text-base font-semibold text-iris-pearl">คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ</p>
        </div>
      </AdminPanel>
    );
  }

  const totalUsers = data?.stats?.totalUsers || 0;
  const totalOrders = data?.stats?.totalOrders || 0;
  const totalRevenue = data?.stats?.totalRevenue || 0;
  const estimatedThb = Math.round(totalRevenue * 0.35);

  const dialogError = feedback?.type === 'error' ? feedback : null;

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="DASHBOARD"
        title="ภาพรวมผู้ดูแลระบบ"
        description="สรุปผู้เล่น คำสั่งซื้อ การเงิน และสลิปที่รออนุมัติของคลัสเตอร์ IRIS"
        actions={
          <>
            <StatusBadge tone="info">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
              {roleLabel}
            </StatusBadge>
            <AdminButton variant="secondary" icon={<Download />} onClick={handleExportReport}>
              ส่งออกรายงาน (CSV)
            </AdminButton>
          </>
        }
      />

      {feedback && !selectedSlip && !rejectingSlip && (
        <AdminNotice
          tone={feedback.type === 'success' ? 'success' : 'danger'}
          title={feedback.title}
          onDismiss={() => setFeedback(null)}
        >
          {feedback.desc}
        </AdminNotice>
      )}

      <SegmentedTabs<DashboardTab>
        aria-label="ส่วนของแดชบอร์ด"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'analytics', label: 'ภาพรวม' },
          { value: 'slips', label: 'สลิปรออนุมัติ', count: pendingTopups.length },
          { value: 'strategy', label: 'กลยุทธ์' },
          { value: 'clusters', label: 'เซิร์ฟเวอร์และทางลัด' },
        ]}
      />

      {/* TAB 1: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="ผู้เล่นทั้งหมด" value={totalUsers.toLocaleString()} hint="บัญชีที่ลงทะเบียน" icon={<Users />} />
            <KpiCard label="คำสั่งซื้อสำเร็จ" value={totalOrders.toLocaleString()} hint="ร้านค้าและตลาด" icon={<ShoppingCart />} />
            <KpiCard
              label="เหรียญหมุนเวียนรวม"
              value={
                <>
                  {totalRevenue.toLocaleString()} <span className="text-sm text-iris-gold">IC</span>
                </>
              }
              hint={`≈ ฿${estimatedThb.toLocaleString()}`}
              icon={<Coins />}
            />
            <KpiCard label="สลิปรอตรวจ" value={pendingTopups.length.toLocaleString()} hint="รอแอดมินอนุมัติ" icon={<Receipt />} />
            <KpiCard
              label="คลัสเตอร์"
              value={
                <>
                  2 <span className="text-sm text-iris-muted">เซิร์ฟเวอร์</span>
                </>
              }
              hint="The Center + The Island"
              icon={<Server />}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            <AdminPanel
              className="lg:col-span-7"
              title={
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                  สัดส่วนช่องทางการเติมเงิน
                </span>
              }
              description="แหล่งที่มาของเงินในระบบ IRIS Thailand"
            >
              <div className="space-y-4">
                <ShareBar label="พร้อมเพย์ / โอนธนาคาร (ตรวจสลิป)" note="ยอดนิยมอันดับ 1" percent={58} />
                <ShareBar label="บัตรเครดิต / เดบิต (Stripe)" note="เติบโตต่อเนื่อง" percent={32} />
                <ShareBar label="Sandbox ทดสอบระบบ" note="ทดสอบระบบ" percent={10} />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
                <StatTile label="มูลค่าเฉลี่ยต่อออเดอร์" value="650 IC" hint="~227 บาท/ออเดอร์" />
                <StatTile label="อัตราหมุนเวียนเหรียญ" value="4.2x / สัปดาห์" hint="Velocity ratio" />
                <StatTile label="อัตราการสั่งซื้อ" value="74.8%" hint="เปิดตะกร้าจนสั่งซื้อ" />
              </div>
              <div className="mt-3">
                <SampleDataNote />
              </div>
            </AdminPanel>

            <AdminPanel
              className="lg:col-span-5"
              title={
                <span className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                  สมดุลเศรษฐกิจ
                </span>
              }
              description="เหรียญเข้า (faucet) เทียบกับเหรียญที่ถูกดูดซับ (sink)"
              actions={<StatusBadge tone="success">สมดุลดี</StatusBadge>}
            >
              <ul className="space-y-3">
                {[
                  { title: 'เหรียญเข้าระบบจากการเติม', desc: 'ผู้เล่นเติมเหรียญเข้ามาเพื่อซื้อสินค้า', value: '+100%' },
                  { title: 'ดูดซับผ่านร้านค้า HeartShop', desc: 'แลกเป็น Element ไดโน และบัฟ', value: '-78%' },
                  { title: 'หมุนเวียนระหว่างผู้เล่น', desc: 'คงค้างในกระเป๋าสำหรับตลาด P2P', value: '22%' },
                ].map((row) => (
                  <li
                    key={row.title}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-iris-pearl">{row.title}</p>
                      <p className="text-xs text-iris-muted">{row.desc}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-iris-pearl">{row.value}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-iris-gold/20 bg-iris-gold/[0.05] p-3 text-xs text-iris-pearl">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-iris-gold" aria-hidden="true" />
                <span>อัตราการดูดซับเหรียญอยู่ในเกณฑ์ดี ไม่เกิดภาวะเงินเฟ้อในตลาดคลัสเตอร์</span>
              </div>
              <div className="mt-3">
                <SampleDataNote />
              </div>
            </AdminPanel>
          </div>

          <AdminPanel
            title={
              <span className="flex items-center gap-2">
                <Award className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                สินค้ายอดนิยม 5 อันดับ
              </span>
            }
            description="อิงตามจำนวนครั้งที่ส่งของเข้าเกมสำเร็จ"
          >
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TOP_PRODUCTS.map((item, idx) => (
                <li key={item.name} className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-iris-muted">อันดับ {idx + 1}</span>
                    <StatusBadge tone="info">{item.badge}</StatusBadge>
                  </div>
                  <p className="line-clamp-1 text-sm font-semibold text-iris-pearl">{item.name}</p>
                  <p className="text-xs text-iris-muted">{item.tag}</p>
                  <p className="border-t border-white/[0.06] pt-1.5 text-xs font-semibold text-iris-gold">{item.orders}</p>
                </li>
              ))}
            </ol>
            <div className="mt-3">
              <SampleDataNote />
            </div>
          </AdminPanel>
        </div>
      )}

      {/* TAB 2: PENDING SLIPS */}
      {activeTab === 'slips' && (
        <AdminPanel
          title={
            <span className="flex flex-wrap items-center gap-2">
              สลิปโอนเงินรออนุมัติ
              {pendingTopups.length > 0 && <StatusBadge tone="warning">{pendingTopups.length} รายการ</StatusBadge>}
            </span>
          }
          description="ตรวจยอดเงินและเวลาในสลิป แล้วกดอนุมัติเพื่อเติม Iris Coin เข้ากระเป๋าผู้ใช้"
        >
          {pendingTopupsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" aria-label="กำลังโหลด" />
            </div>
          ) : pendingTopups.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle className="mx-auto mb-2 h-9 w-9 text-iris-muted" aria-hidden="true" />
              <p className="text-sm text-iris-muted">ไม่มีสลิปค้างรออนุมัติ</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {pendingTopups.map((item) => {
                const isApproving = approvingId === item.id;
                return (
                  <li
                    key={item.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
                  >
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setSelectedSlip(item)}
                        aria-label={`ดูสลิปของ ${item.userName}`}
                        className="group relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-iris-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.slipImageUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-iris-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <Eye className="h-5 w-5 text-iris-pearl" aria-hidden="true" />
                        </span>
                      </button>

                      <dl className="min-w-0 flex-1 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="sr-only">ผู้โอน</dt>
                          <dd className="truncate text-sm font-semibold text-iris-pearl">{item.userName}</dd>
                          <StatusBadge tone="neutral">{item.transferBank}</StatusBadge>
                        </div>
                        <div className="flex gap-1">
                          <dt className="text-iris-muted">แพ็กเกจ:</dt>
                          <dd className="font-semibold text-iris-pearl">{item.packageName}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="text-iris-muted">ยอดโอน:</dt>
                          <dd className="font-semibold tabular-nums text-iris-pearl">฿{item.amountThb.toLocaleString()}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="text-iris-muted">เหรียญที่จะได้รับ:</dt>
                          <dd className="font-semibold tabular-nums text-iris-gold">+{item.pointsToCredit.toLocaleString()} IC</dd>
                        </div>
                        <div className="flex gap-1 font-mono text-[11px] text-iris-muted">
                          <dt>Ref:</dt>
                          <dd>
                            {item.transferRef || '—'} · {new Date(item.createdAt).toLocaleTimeString('th-TH')}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
                      <AdminButton size="sm" variant="ghost" icon={<Eye />} onClick={() => setSelectedSlip(item)}>
                        ดูสลิป
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        icon={<XCircle />}
                        disabled={approvingId !== null}
                        onClick={() => openReject(item)}
                      >
                        ปฏิเสธ
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="primary"
                        icon={<CheckCircle />}
                        loading={isApproving}
                        disabled={approvingId !== null && !isApproving}
                        onClick={() => handleApproveSlip(item)}
                      >
                        อนุมัติ
                      </AdminButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminPanel>
      )}

      {/* TAB 3: STRATEGY */}
      {activeTab === 'strategy' && (
        <div className="space-y-6">
          <AdminPanel
            title={
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                แนวทางพัฒนาสำหรับเจ้าของเซิร์ฟเวอร์
              </span>
            }
          >
            <p className="text-sm text-iris-muted">แนวทางยกระดับรายได้ ความปลอดภัย และสมดุลของโลก IRIS ARK</p>
          </AdminPanel>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {DIRECTIVES.map((d) => (
              <DirectiveCard key={d.title} title={d.title} icon={d.icon} items={d.items} />
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CLUSTERS & SHORTCUTS */}
      {activeTab === 'clusters' && (
        <div className="space-y-6">
          {canManageServers && <ServerStatusPanel />}

          <AdminPanel title="ทางลัดการจัดการ" description="ไปยังหน้าจัดการที่ใช้บ่อย">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canManageProducts && (
                <ShortcutCard href="/admin/products" icon={<Package />} title="จัดการสินค้า" desc="เพิ่ม แก้ไข กำหนดราคาไอเทมและไดโน" />
              )}
              {canManageProducts && (
                <ShortcutCard href="/admin/categories" icon={<FolderOpen />} title="จัดการหมวดหมู่สินค้า" desc="จัดโครงสร้างหมวดหมู่ร้านค้า" />
              )}
              {canManageServerUsers && (
                <ShortcutCard href="/admin/users" icon={<Users />} title="จัดการผู้ใช้" desc="ดูข้อมูลผู้เล่น แบน และปรับเหรียญ" />
              )}
              {canManageServers && (
                <ShortcutCard href="/admin/servers" icon={<Server />} title="จัดการเซิร์ฟเวอร์" desc="มอนิเตอร์สถานะ Heartbeat" />
              )}
              {canManageChatRanks && (
                <ShortcutCard href="/admin/chat-ranks" icon={<Crown />} title="แรงก์ในแชท" desc="กำหนดสีและป้ายชื่อในเกม" />
              )}
              <ShortcutCard href="/admin/protection" icon={<Shield />} title="ระบบคุ้มครองผู้เล่น" desc="กฎการป้องกันและเวลาเรด" />
              {canManageApiKeys && (
                <ShortcutCard href="/admin/api-keys" icon={<Key />} title="จัดการ API key" desc="กุญแจเชื่อมต่อของเซิร์ฟเวอร์" />
              )}
              {isRoot && (
                <ShortcutCard href="/admin/system/api-key" icon={<Settings />} title="API key ของระบบ" desc="กุญแจหลักของระบบ (เฉพาะผู้ดูแลสูงสุด)" />
              )}
            </div>
          </AdminPanel>
        </div>
      )}

      {/* Slip inspection */}
      <AdminDialog
        open={selectedSlip !== null}
        onClose={() => {
          setSelectedSlip(null);
          if (feedback?.type === 'error') setFeedback(null);
        }}
        busy={selectedSlip !== null && approvingId === selectedSlip.id}
        title="ตรวจสอบสลิปโอนเงิน"
        description="ตรวจยอดเงินและเวลาในสลิปก่อนอนุมัติ"
        size="lg"
        footer={
          selectedSlip && (
            <>
              <AdminButton
                variant="danger"
                icon={<XCircle />}
                disabled={approvingId !== null}
                onClick={() => openReject(selectedSlip)}
              >
                ปฏิเสธ
              </AdminButton>
              <AdminButton
                variant="primary"
                icon={<CheckCircle />}
                loading={approvingId === selectedSlip.id}
                disabled={approvingId !== null && approvingId !== selectedSlip.id}
                onClick={() => handleApproveSlip(selectedSlip)}
              >
                อนุมัติและเติมเหรียญ
              </AdminButton>
            </>
          )
        }
      >
        {selectedSlip && (
          <div className="space-y-4">
            <div className="relative aspect-[3/4] max-h-96 w-full overflow-hidden rounded-2xl border border-white/10 bg-iris-midnight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedSlip.slipImageUrl} alt={`สลิปโอนเงินของ ${selectedSlip.userName}`} className="h-full w-full object-contain" />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs">
              <div>
                <dt className="text-iris-muted">ผู้โอน</dt>
                <dd className="font-semibold text-iris-pearl">{selectedSlip.userName}</dd>
              </div>
              <div>
                <dt className="text-iris-muted">ธนาคาร</dt>
                <dd className="font-semibold text-iris-pearl">{selectedSlip.transferBank}</dd>
              </div>
              <div>
                <dt className="text-iris-muted">ยอดเงิน</dt>
                <dd className="font-semibold tabular-nums text-iris-pearl">฿{selectedSlip.amountThb.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-iris-muted">เหรียญที่จะเติม</dt>
                <dd className="font-semibold tabular-nums text-iris-gold">+{selectedSlip.pointsToCredit.toLocaleString()} IC</dd>
              </div>
            </dl>
            {dialogError && (
              <AdminNotice tone="danger" title={dialogError.title}>
                {dialogError.desc}
              </AdminNotice>
            )}
          </div>
        )}
      </AdminDialog>

      {/* Reject reason */}
      <AdminDialog
        open={rejectingSlip !== null}
        onClose={closeReject}
        busy={rejectPending}
        size="sm"
        title="ปฏิเสธสลิปนี้?"
        description="เหตุผลจะถูกบันทึกในระบบและแจ้งไปยังผู้ใช้"
        footer={
          <>
            <AdminButton variant="ghost" onClick={closeReject} disabled={rejectPending}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="danger" icon={<XCircle />} loading={rejectPending} onClick={handleRejectSlip}>
              ยืนยันการปฏิเสธ
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4">
          {rejectingSlip && (
            <p className="text-sm text-iris-muted">
              {rejectingSlip.userName} · ฿{rejectingSlip.amountThb.toLocaleString()} · {rejectingSlip.packageName}
            </p>
          )}
          <AdminField label="เหตุผล" hint="เว้นว่างได้ ระบบจะใช้ “สลิปไม่ถูกต้องหรือไม่พบยอดเงิน”">
            {(field) => (
              <textarea
                {...field}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เช่น ยอดเงินไม่ตรงกับแพ็กเกจ, ไม่พบรายการโอนในบัญชี"
                rows={3}
                maxLength={500}
                className={adminInputClass}
              />
            )}
          </AdminField>
          {dialogError && (
            <AdminNotice tone="danger" title={dialogError.title}>
              {dialogError.desc}
            </AdminNotice>
          )}
        </div>
      </AdminDialog>
    </AdminPage>
  );
}

