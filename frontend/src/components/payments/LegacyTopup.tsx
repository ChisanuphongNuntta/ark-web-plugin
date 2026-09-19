'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '@/lib/contracts/client';
import {
  Coins,
  ShieldCheck,
  Clock,
  CheckCircle,
  Zap,
  Building2,
  QrCode,
  Upload,
  FileCheck,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  Trash2,
  CreditCard,
  Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import Link from 'next/link';

// Fallback packages if network is offline
const fallbackCoinPackages = [
  { id: 'pkg-1', coins: 100, price: 35, bonus: 0, tier: 'basic', popular: false },
  { id: 'pkg-2', coins: 300, price: 99, bonus: 10, tier: 'basic', popular: false },
  { id: 'pkg-3', coins: 500, price: 159, bonus: 25, tier: 'standard', popular: false },
  { id: 'pkg-4', coins: 1000, price: 299, bonus: 100, tier: 'standard', popular: true },
  { id: 'pkg-5', coins: 2500, price: 699, bonus: 350, tier: 'premium', popular: false },
  { id: 'pkg-6', coins: 5000, price: 1299, bonus: 1000, tier: 'premium', popular: false },
  { id: 'pkg-7', coins: 10000, price: 2499, bonus: 2500, tier: 'legendary', popular: false },
];

interface TierProfile {
  name: string;
  tagline: string;
  badge?: string;
  accentColor: string;
  borderActive: string;
  borderInactive: string;
  bgActive: string;
  iconBg: string;
  bonusTag?: string;
  bgImage: string;
}

const TIER_PROFILES: Record<string, TierProfile> = {
  'pkg-1': {
    name: 'STARTER',
    tagline: 'ชุดเริ่มต้นผู้รอดชีวิต',
    accentColor: 'text-sky-300',
    borderActive: 'border-sky-400 ring-2 ring-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-sky-400/40',
    bgActive: '',
    iconBg: 'bg-sky-500/20 border-sky-400/40 text-sky-300 backdrop-blur-sm',
    bgImage: '/images/packages/pkg-starter.jpg',
  },
  'pkg-2': {
    name: 'SURVIVOR',
    tagline: 'ชุดสำรวจทุ่งหิมะ',
    accentColor: 'text-slate-200',
    borderActive: 'border-cyan-300 ring-2 ring-cyan-300/50 shadow-[0_0_20px_rgba(103,232,249,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-cyan-300/40',
    bgActive: '',
    iconBg: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300 backdrop-blur-sm',
    bonusTag: '+10 IC โบนัส',
    bgImage: '/images/packages/pkg-survivor.jpg',
  },
  'pkg-3': {
    name: 'EXPLORER',
    tagline: 'ชุดนักสำรวจถ้ำคริสตัล',
    accentColor: 'text-emerald-300',
    borderActive: 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-emerald-400/40',
    bgActive: '',
    iconBg: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 backdrop-blur-sm',
    bonusTag: '+25 IC โบนัส',
    bgImage: '/images/packages/pkg-explorer.jpg',
  },
  'pkg-4': {
    name: 'TRIBESMAN',
    tagline: 'ชุดหัวหน้าเผ่า (ยอดนิยม)',
    badge: 'POPULAR',
    accentColor: 'text-cyan-300',
    borderActive: 'border-cyan-300 ring-2 ring-cyan-400/50 shadow-[0_0_20px_rgba(75,228,255,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-cyan-400/40',
    bgActive: '',
    iconBg: 'bg-cyan-950/70 border-cyan-400/40 text-cyan-300 backdrop-blur-sm',
    bonusTag: '+100 IC โบนัส',
    bgImage: '/images/packages/pkg-tribesman.png',
  },
  'pkg-5': {
    name: 'ALPHA',
    tagline: 'ชุดจ่าฝูงอัลฟ่า',
    badge: 'VALUE PACK',
    accentColor: 'text-sky-300',
    borderActive: 'border-sky-400 ring-2 ring-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-sky-400/40',
    bgActive: '',
    iconBg: 'bg-sky-950/70 border-sky-400/40 text-sky-300 backdrop-blur-sm',
    bonusTag: '+350 IC โบนัส',
    bgImage: '/images/packages/pkg-alpha.png',
  },
  'pkg-6': {
    name: 'MASTER',
    tagline: 'ชุดปรมาจารย์แห่งอาร์ค',
    badge: 'PRO CHOICE',
    accentColor: 'text-amber-300',
    borderActive: 'border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.35)]',
    borderInactive: 'border-slate-700/40 hover:border-amber-400/40',
    bgActive: '',
    iconBg: 'bg-amber-950/70 border-amber-400/40 text-amber-300 backdrop-blur-sm',
    bonusTag: '+1,000 IC โบนัส',
    bgImage: '/images/packages/pkg-master.png',
  },
  'pkg-7': {
    name: 'ASCENDANT',
    tagline: 'ชุดจักรพรรดิน้ำแข็ง (คุ้มค่าสูงสุด)',
    badge: 'BEST VALUE +25%',
    accentColor: 'text-cyan-200',
    borderActive: 'border-cyan-300 ring-2 ring-cyan-300 shadow-[0_0_25px_rgba(75,228,255,0.4)]',
    borderInactive: 'border-slate-700/40 hover:border-cyan-400/50',
    bgActive: '',
    iconBg: 'bg-cyan-950/70 border-cyan-300/50 text-cyan-200 backdrop-blur-sm',
    bonusTag: '+2,500 IC โบนัสพิเศษ (+25% ฟรี)',
    bgImage: '/images/packages/pkg-ascendant.jpg',
  },
};

export function LegacyTopupPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedPackageId, setSelectedPackageId] = useState<string>('pkg-4');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_slip' | 'sandbox'>('bank_slip');
  const [isCreatingStripe, setIsCreatingStripe] = useState(false);

  // Bank Transfer & Slip states
  const [selectedBank, setSelectedBank] = useState<string>('KBANK');
  const [transferRef, setTransferRef] = useState<string>('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [isSubmittingSlip, setIsSubmittingSlip] = useState(false);
  const [copiedBank, setCopiedBank] = useState<string | null>(null);

  // Modal State
  const [dialogConfig, setDialogConfig] = useState<{
    open: boolean;
    title: string;
    description?: string;
    content?: React.ReactNode;
    type?: 'success' | 'warning' | 'error' | 'info';
  }>({
    open: false,
    title: '',
  });

  const { data: fetchedPackages } = useQuery({
    queryKey: ['payment-packages'],
    queryFn: async () => {
      const res = await paymentApi.getPackages();
      return res.packages || (res as any).data?.packages || [];
    },
  });

  const packages = (fetchedPackages && fetchedPackages.length > 0)
    ? fetchedPackages.map((pkg) => ({
        id: pkg.id,
        coins: Number(pkg.points),
        price: Number(pkg.priceThb),
        bonus: Number(pkg.bonusPoints),
        tier: pkg.tier || 'basic',
        popular: Boolean(pkg.isPopular),
      }))
    : fallbackCoinPackages;

  const currentPkg = packages.find((p) => String(p.id) === String(selectedPackageId)) || packages[0];
  const totalCoinsToReceive = currentPkg.coins + currentPkg.bonus;
  const currentTierMeta = TIER_PROFILES[String(currentPkg.id)] || TIER_PROFILES['pkg-1'];

  const handleCopyAccount = (bankId: string, accountNumber: string) => {
    navigator.clipboard.writeText(accountNumber);
    setCopiedBank(bankId);
    setTimeout(() => setCopiedBank(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSlipFile(file);
      setSlipPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleBankTransferSubmit = async () => {
    if (!user) {
      setDialogConfig({
        open: true,
        title: 'กรุณาเข้าสู่ระบบก่อนทำรายการ',
        description: 'ท่านต้องเข้าสู่ระบบบัญชีสมาชิกเพื่อดำเนินการเติมเงินและรับ Iris Coin',
        type: 'warning',
      });
      return;
    }

    if (!slipFile && !slipPreviewUrl) {
      setDialogConfig({
        open: true,
        title: 'กรุณาแนบภาพสลิปการโอนเงิน',
        description: 'โปรดอัปโหลดภาพหลักฐานการโอนเงิน (สลิปธนาคาร) ก่อนส่งให้เจ้าหน้าที่ตรวจสอบ',
        type: 'warning',
      });
      return;
    }

    setIsSubmittingSlip(true);
    try {
      const res = await paymentApi.submitSlip({
        packageId: String(currentPkg.id),
        packageName: `Pack ${currentPkg.coins.toLocaleString()} IC`,
        amountThb: currentPkg.price,
        pointsToCredit: totalCoinsToReceive,
        transferBank: selectedBank,
        transferRef: transferRef || `TRX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        slipImageUrl: slipPreviewUrl || '/images/mock/slips/sample-slip-01.svg',
      });

      queryClient.invalidateQueries({ queryKey: ['wallet'] });

      setDialogConfig({
        open: true,
        title: 'ส่งหลักฐานการโอนเงินสำเร็จ',
        type: 'success',
        content: (
          <div className="space-y-4 pt-2 text-sm text-iris-muted">
            <div className="rounded-2xl border border-iris-cyan/30 bg-iris-cyan/10 p-5 text-center shadow-lg">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-iris-cyan/20 text-iris-cyan">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="font-bold text-iris-pearl text-base">ระบบได้ส่งข้อมูลให้ Admin ตรวจสอบเรียบร้อยแล้ว</p>
              <p className="mt-1 text-xs text-iris-muted">
                รหัสรายการ: <span className="font-mono font-bold text-iris-gold">{res.submission.id}</span>
              </p>
            </div>
            <div className="space-y-2 rounded-xl border border-white/5 bg-black/40 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-iris-muted">แพ็คเกจเหรียญ:</span>
                <span className="font-bold text-iris-pearl">{totalCoinsToReceive.toLocaleString()} IC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-iris-muted">ยอดเงินที่โอน:</span>
                <span className="font-bold text-iris-cyan">฿{currentPkg.price.toLocaleString()} THB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-iris-muted">สถานะการตรวจสอบ:</span>
                <span className="font-bold text-amber-400">⏳ รอแอดมินอนุมัติ (Pending Approval)</span>
              </div>
            </div>
            <p className="text-xs text-center text-iris-muted/80 leading-relaxed">
              เมื่อแอดมินตรวจสอบความถูกต้องแล้ว ยอดเหรียญจะถูกเติมเข้าสู่กระเป๋าของท่านทันที (เฉลี่ย 1 - 5 นาที)
            </p>
          </div>
        ),
      });

      // Clear slip after success
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setTransferRef('');
    } catch (err: any) {
      setDialogConfig({
        open: true,
        title: 'ไม่สามารถส่งข้อมูลได้',
        description: err?.message || 'เกิดข้อผิดพลาดในการส่งหลักฐานการโอนเงิน กรุณาลองใหม่อีกครั้ง',
        type: 'error',
      });
    } finally {
      setIsSubmittingSlip(false);
    }
  };

  const handleStripePurchase = async () => {
    if (!user) {
      setDialogConfig({
        open: true,
        title: 'กรุณาเข้าสู่ระบบ',
        description: 'ท่านต้องเข้าสู่ระบบสมาชิกก่อนทำรายการชำระเงินผ่านบัตร',
        type: 'warning',
      });
      return;
    }

    setIsCreatingStripe(true);
    try {
      const res = await paymentApi.createIntent({
        packageId: String(currentPkg.id),
        provider: 'stripe',
      });

      const intent = (res as any)?.intent || (res as any)?.data?.intent;
      if (intent?.paymentUrl) {
        window.location.assign(intent.paymentUrl);
      } else {
        throw new Error('ไม่พบ URL สำหรับชำระเงินของ Stripe');
      }
    } catch (err: any) {
      setDialogConfig({
        open: true,
        title: 'ไม่สามารถเปิดหน้าชำระเงินได้',
        description: err?.response?.data?.message || err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Stripe Gateway กรุณาลองใหม่อีกครั้ง',
        type: 'error',
      });
    } finally {
      setIsCreatingStripe(false);
    }
  };

  const handleSandboxPurchase = async () => {
    if (!user) {
      setDialogConfig({
        open: true,
        title: 'กรุณาเข้าสู่ระบบ',
        description: 'ท่านต้องเข้าสู่ระบบสมาชิกก่อนทำรายการ',
        type: 'warning',
      });
      return;
    }

    try {
      const res = await paymentApi.createIntent({
        packageId: String(currentPkg.id),
        provider: 'sandbox',
      });

      queryClient.invalidateQueries({ queryKey: ['wallet'] });

      setDialogConfig({
        open: true,
        title: 'SANDBOX PAYMENT COMPLETED',
        type: 'success',
        content: (
          <div className="space-y-4 pt-2 text-sm text-iris-muted">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
              <CheckCircle className="mx-auto mb-2 h-10 w-10 text-emerald-400" />
              <p className="font-bold text-iris-pearl text-base">จำลองการชำระเงินสำเร็จ (Developer Mode)</p>
              <p className="mt-1 text-xs text-iris-muted">
                Reference: <span className="font-mono font-bold text-iris-gold">{(res as any)?.intent?.reference || (res as any)?.data?.intent?.reference || 'IRIS-SANDBOX-SUCCESS'}</span>
              </p>
              <p className="mt-2 text-xs text-emerald-300">
                เพิ่ม {totalCoinsToReceive.toLocaleString()} IC เข้ากระเป๋าเรียบร้อยแล้ว
              </p>
            </div>
          </div>
        ),
      });
    } catch (err: any) {
      setDialogConfig({
        open: true,
        title: 'ชำระเงินไม่สำเร็จ',
        description: err?.message || 'เกิดข้อผิดพลาด',
        type: 'error',
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-3 sm:px-5 lg:px-6 py-2 sm:py-3 space-y-3 animate-slide-up">
      {/* Sleek Compact Header & User HUD Bar */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-[#102637]/90 px-4 py-3 sm:px-6 sm:py-3.5 shadow-lg">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-iris-pearl flex items-center gap-2">
              เติมเหรียญ <span className="text-cyan-300">IRIS COIN</span>
            </h1>
            <div className="hidden md:flex items-center gap-2.5 text-[11px] text-slate-400 border-l border-white/10 pl-3">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> 256-bit SSL
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-cyan-400 font-medium">
                <Zap className="h-3.5 w-3.5" /> เข้ากระเป๋าเร็ว 1-5 นาที
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <Sparkles className="h-3.5 w-3.5" /> โบนัสสูงสุด +25%
              </span>
            </div>
          </div>

          {/* User Wallet HUD Pill */}
          {user ? (
            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-black/50 px-3.5 py-1.5 shadow-inner">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">ยอดคงเหลือ</p>
                <p className="text-base font-black text-amber-300 leading-tight">
                  {user.pointsBalance?.toLocaleString() || 0}{' '}
                  <span className="text-[10px] font-bold text-amber-400/80">IC</span>
                </p>
              </div>
              <Link href="/orders" className="ml-1">
                <Button variant="secondary" size="sm" className="h-7 text-xs border-white/10 hover:border-white/25 px-2.5">
                  <Clock className="h-3 w-3 mr-1" />
                  ประวัติ
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/login" className="shrink-0">
              <Button variant="secondary" size="sm" className="h-8 text-xs border-cyan-400/30 text-cyan-300">
                เข้าสู่ระบบเพื่อเติมเหรียญ
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Main Single-Screen Cockpit: 2-Column Split */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 items-stretch">
        
        {/* LEFT COLUMN: Step 1 - Select Coin Package (7 Packages in balanced high-density grid) */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-2.5">
          <div>
            {/* Step Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-black">
                  1
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white">เลือกจำนวนเหรียญ</h2>
              </div>
              <span className="text-[11px] text-cyan-300 flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3" />
                คลิกเลือกแพ็คเกจ
              </span>
            </div>

            {/* Packages Grid: 6 standard cards (2 cols x 3 rows) + 1 Ascendant Full-Width Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {packages.map((pkg, idx) => {
                const isSelected = selectedPackageId === String(pkg.id);
                const totalCoins = pkg.coins + pkg.bonus;
                const meta = TIER_PROFILES[String(pkg.id)] || TIER_PROFILES['pkg-1'];
                const isAscendant = pkg.id === 'pkg-7' || idx === 6;

                // Ascendant Double-Wide Card
                if (isAscendant) {
                  return (
                    <div
                      key={pkg.id}
                      role="button"
                      tabIndex={0}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl border p-2.5 transition-all duration-200 sm:col-span-2 ${
                        isSelected
                          ? 'border-cyan-300 ring-2 ring-cyan-300/60 shadow-[0_0_20px_rgba(75,228,255,0.35)]'
                          : 'border-slate-700/50 hover:border-cyan-400/40'
                      }`}
                      onClick={() => setSelectedPackageId(String(pkg.id))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedPackageId(String(pkg.id)); }}
                    >
                      {/* Background Artwork Layer */}
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
                        style={{ backgroundImage: `url(${meta.bgImage})` }}
                      />
                      {/* Contrast Dark Gradient Overlay */}
                      <div
                        className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#031322]/85 via-[#0d2235]/75 to-[#1c1404]/75'
                            : 'bg-gradient-to-r from-[#031322]/90 via-[#0a1c2b]/85 to-[#140e03]/85 group-hover:via-[#0a1c2b]/75'
                        }`}
                      />

                      <div className="relative z-10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/40 backdrop-blur-sm">
                            <Crown className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-black uppercase text-amber-300 tracking-wide truncate">
                                {meta.name}
                              </span>
                              <span className="rounded-full border border-amber-400/40 bg-amber-400/20 px-2 py-0.2 text-[9px] font-black text-amber-200 backdrop-blur-sm">
                                BEST VALUE +25%
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-base sm:text-lg font-black text-white">
                                {totalCoins.toLocaleString()}{' '}
                                <span className="text-xs font-bold text-amber-300">IC</span>
                              </span>
                              <span className="text-[11px] font-semibold text-emerald-400 truncate">
                                +{pkg.bonus.toLocaleString()} IC โบนัสพิเศษ (+25% ฟรี)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right flex items-center gap-2">
                          <div className="rounded-lg border border-amber-400/40 bg-black/70 px-3 py-1 text-sm sm:text-base font-black text-amber-300 backdrop-blur-sm shadow-md">
                            ฿{pkg.price.toLocaleString()}
                          </div>
                          {isSelected && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-black shadow-md">
                              <Check className="h-3 w-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Standard Tier Cards (High-Density, Symmetrical)
                return (
                  <div
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl border p-2 sm:p-2.5 transition-all duration-200 flex items-center justify-between gap-2.5 ${
                      isSelected ? meta.borderActive : meta.borderInactive
                    }`}
                    onClick={() => setSelectedPackageId(String(pkg.id))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedPackageId(String(pkg.id)); }}
                  >
                    {/* Background Artwork Layer */}
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
                      style={{ backgroundImage: `url(${meta.bgImage})` }}
                    />
                    {/* Contrast Dark Gradient Overlay */}
                    <div
                      className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#051624]/85 via-[#0a1c2b]/80 to-black/75'
                          : 'bg-gradient-to-r from-[#051624]/90 via-[#081827]/85 to-black/80 group-hover:via-[#081827]/75'
                      }`}
                    />

                    <div className="relative z-10 flex items-center gap-2 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.iconBg}`}>
                        <Coins className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${meta.accentColor} truncate`}>
                            {meta.name}
                          </span>
                          {pkg.popular && (
                            <Badge variant="hot" className="text-[9px] px-1.5 py-0 font-bold leading-tight shadow-sm">
                              POPULAR
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-sm sm:text-base font-black text-white leading-none">
                            {totalCoins.toLocaleString()}{' '}
                            <span className="text-[10px] font-bold text-amber-300">IC</span>
                          </span>
                          {pkg.bonus > 0 ? (
                            <span className="text-[10px] font-semibold text-emerald-400 truncate">
                              +{pkg.bonus.toLocaleString()} IC โบนัส
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 truncate">แพ็คเกจเริ่มต้น</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 shrink-0 flex items-center gap-1.5">
                      <span className="rounded-lg border border-white/10 bg-black/70 px-2 py-0.5 text-xs sm:text-sm font-black text-white backdrop-blur-sm shadow-md">
                        ฿{pkg.price.toLocaleString()}
                      </span>
                      {isSelected && (
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-black shadow-md">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Left Bottom Trust Footer */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 px-3.5 py-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>ความปลอดภัยสูงสุด ผ่านการตรวจสอบสลิปและระบบอัตโนมัติ</span>
            </span>
            <Link href="/support" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
              ศูนย์ช่วยเหลือ
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN: Step 2 & Step 3 - Payment Hub & Instant Confirmation */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-2.5">
          
          {/* STEP 2: Select Payment Method Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-black">
                  2
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white">เลือกช่องทางชำระเงิน</h2>
              </div>
              <span className="text-[11px] text-slate-400">3 ช่องทางพร้อมใช้งาน</span>
            </div>

            {/* Payment Method Switcher Pills */}
            <div className="grid grid-cols-3 gap-2">
              {/* Option 1: Bank Transfer / Slip */}
              <button
                type="button"
                className={`rounded-xl border p-2 text-left transition-all duration-200 relative ${
                  paymentMethod === 'bank_slip'
                    ? 'border-iris-cyan bg-iris-cyan/15 ring-2 ring-iris-cyan/50 shadow-[0_0_15px_rgba(55,229,210,0.3)]'
                    : 'border-white/10 bg-[#102637]/70 hover:border-white/20 hover:bg-[#153147]'
                }`}
                onClick={() => setPaymentMethod('bank_slip')}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    paymentMethod === 'bank_slip' ? 'border-iris-cyan bg-iris-cyan/20 text-iris-cyan' : 'border-white/10 bg-white/5 text-slate-400'
                  }`}>
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate leading-tight">โอนเงินธนาคาร / QR</p>
                    <span className="text-[9px] font-bold text-cyan-300 block truncate">ADMIN APPROVAL</span>
                  </div>
                </div>
              </button>

              {/* Option 2: Stripe */}
              <button
                type="button"
                className={`rounded-xl border p-2 text-left transition-all duration-200 relative ${
                  paymentMethod === 'stripe'
                    ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/50 shadow-[0_0_15px_rgba(75,228,255,0.3)]'
                    : 'border-white/10 bg-[#102637]/70 hover:border-white/20 hover:bg-[#153147]'
                }`}
                onClick={() => setPaymentMethod('stripe')}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    paymentMethod === 'stripe' ? 'border-cyan-400 bg-cyan-400/20 text-cyan-300' : 'border-white/10 bg-white/5 text-slate-400'
                  }`}>
                    <CreditCard className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate leading-tight">บัตรเครดิต/เดบิต</p>
                    <span className="text-[9px] font-bold text-cyan-300 block truncate">Stripe Checkout</span>
                  </div>
                </div>
              </button>

              {/* Option 3: Sandbox */}
              <button
                type="button"
                className={`rounded-xl border p-2 text-left transition-all duration-200 relative ${
                  paymentMethod === 'sandbox'
                    ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'border-white/10 bg-[#102637]/70 hover:border-white/20 hover:bg-[#153147]'
                }`}
                onClick={() => setPaymentMethod('sandbox')}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    paymentMethod === 'sandbox' ? 'border-amber-400 bg-amber-400/20 text-amber-300' : 'border-white/10 bg-white/5 text-slate-400'
                  }`}>
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate leading-tight">Sandbox Developer Gateway</p>
                    <span className="text-[9px] font-bold text-amber-300 block truncate">TESTING MODE</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* DYNAMIC PAYMENT METHOD PANEL */}
          <div className="rounded-2xl border border-slate-700/40 bg-[#102637]/90 p-3 sm:p-3.5 flex-1 flex flex-col justify-center">
            {/* SUBPANEL A: Bank Transfer & Slip */}
            {paymentMethod === 'bank_slip' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  
                  {/* Bank Accounts & PromptPay Column (7 cols) */}
                  <div className="sm:col-span-7 space-y-2">
                    {/* Bank Selection Cards - Stacked Full-Width with Clean Single Lines */}
                    <div className="space-y-1.5">
                      {/* KBANK */}
                      <div
                        role="button"
                        tabIndex={0}
                        className={`rounded-xl border px-3 py-1.5 cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                          selectedBank === 'KBANK'
                            ? 'border-emerald-500 bg-emerald-500/15 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : 'border-white/10 bg-black/40 hover:border-white/20'
                        }`}
                        onClick={() => setSelectedBank('KBANK')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedBank('KBANK'); }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="text-xs font-bold text-emerald-400 whitespace-nowrap">
                              ธนาคารกสิกรไทย (KBANK)
                            </span>
                          </div>
                          {selectedBank === 'KBANK' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                        </div>

                        <div className="flex items-center justify-between bg-black/60 rounded-lg px-2.5 py-1 border border-white/5">
                          <span className="text-xs font-mono font-bold text-white tracking-wide whitespace-nowrap">
                            095-2-88219-4
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyAccount('KBANK', '095-2-88219-4');
                            }}
                            className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 whitespace-nowrap shrink-0 transition flex items-center gap-1"
                          >
                            {copiedBank === 'KBANK' ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>คัดลอกแล้ว</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>คัดลอก</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* SCB */}
                      <div
                        role="button"
                        tabIndex={0}
                        className={`rounded-xl border px-3 py-1.5 cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                          selectedBank === 'SCB'
                            ? 'border-sky-500 bg-sky-500/15 shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                            : 'border-white/10 bg-black/40 hover:border-white/20'
                        }`}
                        onClick={() => setSelectedBank('SCB')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedBank('SCB'); }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" />
                            <span className="text-xs font-bold text-sky-400 whitespace-nowrap">
                              ธนาคารไทยพาณิชย์ (SCB)
                            </span>
                          </div>
                          {selectedBank === 'SCB' && <CheckCircle className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
                        </div>

                        <div className="flex items-center justify-between bg-black/60 rounded-lg px-2.5 py-1 border border-white/5">
                          <span className="text-xs font-mono font-bold text-white tracking-wide whitespace-nowrap">
                            408-1-55410-9
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyAccount('SCB', '408-1-55410-9');
                            }}
                            className="text-[11px] font-bold text-sky-400 hover:text-sky-300 px-2 py-0.5 rounded bg-sky-500/20 whitespace-nowrap shrink-0 transition flex items-center gap-1"
                          >
                            {copiedBank === 'SCB' ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>คัดลอกแล้ว</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>คัดลอก</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* PromptPay QR Preview Strip */}
                    <div className="rounded-xl border border-iris-cyan/30 bg-black/60 p-2 flex items-center gap-3">
                      <div className="shrink-0 bg-white p-1 rounded-lg border border-iris-cyan/50 text-center">
                        <div className="bg-[#113566] text-white text-[8px] font-black uppercase px-1 rounded flex items-center justify-center gap-0.5">
                          <QrCode className="h-2.5 w-2.5" />
                          <span>PROMPTPAY</span>
                        </div>
                        <div className="h-12 w-12 bg-white grid place-items-center">
                          <div className="grid grid-cols-4 gap-0.5 p-0.5">
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-transparent" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-transparent" />
                            <div className="h-2.5 w-2.5 bg-iris-cyan rounded-xs animate-pulse" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-transparent" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-transparent" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                            <div className="h-2.5 w-2.5 bg-[#113566] rounded-xs" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-0.5 text-left">
                        <span className="text-[9px] font-black uppercase tracking-wider text-iris-cyan">
                          สแกน QR พร้อมเพย์
                        </span>
                        <p className="text-xs font-bold text-white">
                          ยอดโอน: <span className="text-cyan-300 font-mono">฿{currentPkg.price.toLocaleString()}.00 THB</span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          ชื่อบัญชี: บจก. ไอริส เอ็กซ์พีดิชั่น (IRIS EXPEDITION)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Slip Upload Column (5 cols) */}
                  <div className="sm:col-span-5 space-y-2">
                    <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-black/40 p-2.5 text-center hover:border-iris-cyan/60 transition min-h-[92px]">
                      {slipPreviewUrl ? (
                        <div className="w-full flex items-center justify-between gap-2 p-1">
                          <div className="flex items-center gap-2 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={slipPreviewUrl}
                              alt="Slip preview"
                              className="h-10 w-10 rounded object-cover border border-iris-cyan/30 shrink-0"
                            />
                            <div className="text-left truncate">
                              <p className="text-[11px] font-bold text-white truncate max-w-[100px]">
                                {slipFile ? slipFile.name : 'สลิปโอนเงิน'}
                              </p>
                              <p className="text-[9px] text-emerald-400 flex items-center gap-1">
                                <CheckCircle className="h-2.5 w-2.5" />
                                พร้อมส่ง
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              setSlipFile(null);
                              setSlipPreviewUrl(null);
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            ลบรูป
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-iris-cyan/15 text-iris-cyan mb-1">
                            <Upload className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-xs font-bold text-white">แนบรูปภาพสลิปการโอนเงิน</p>
                          <p className="text-[9px] text-slate-400">JPG, PNG, WEBP (สูงสุด 10MB)</p>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={transferRef}
                        onChange={(e) => setTransferRef(e.target.value)}
                        placeholder="เลขอ้างอิงสลิป / บันทึกช่วยจำ (เว้นว่างได้)"
                        className="w-full rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-iris-cyan focus:outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBPANEL B: Stripe Checkout */}
            {paymentMethod === 'stripe' && (
              <div className="space-y-3 text-center py-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(75,228,255,0.3)]">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                    ชำระผ่านบัตรเครดิต/เดบิต (Stripe Checkout)
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                    รองรับ Visa, Mastercard, JCB ทุกธนาคาร ชำระเงินผ่านระบบรักษาความปลอดภัยระดับสากล และได้รับเหรียญเข้ากระเป๋าทันที
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 text-[11px] text-cyan-200">
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> PCI-DSS Compliant</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-cyan-400" /> อนุมัติทันที (Instant Credit)</span>
                </div>
              </div>
            )}

            {/* SUBPANEL C: Sandbox Developer Mode */}
            {paymentMethod === 'sandbox' && (
              <div className="space-y-3 text-center py-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    โหมดจำลองการเติมเงิน (Developer Sandbox)
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                    ใช้สำหรับทดสอบระบบเติมเงินและอัปเดตยอดคงเหลือในกระเป๋าเหรียญทันทีโดยไม่ต้องโอนเงินจริง
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-black/40 px-3 py-1 text-xs">
                  <span className="text-slate-400">โหมดทดสอบ:</span>
                  <span className="font-mono font-bold text-amber-300">IRIS-SANDBOX-TEST</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: Order Summary & Primary Action CTA Button */}
          <div className="rounded-2xl border border-cyan-500/25 bg-black/60 p-3 sm:p-3.5 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  แพ็คเกจที่เลือก: <span className="text-white">{currentTierMeta.name} PACK</span>
                </p>
                <p className="text-xs font-black text-amber-300">
                  {totalCoinsToReceive.toLocaleString()} IC{' '}
                  <span className="text-[10px] font-medium text-emerald-400">
                    ({currentPkg.coins.toLocaleString()} + {currentPkg.bonus.toLocaleString()} โบนัส)
                  </span>
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">ยอดชำระสุทธิ</p>
                <div className="flex items-baseline gap-1 justify-end">
                  <span className="text-xl sm:text-2xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(55,229,210,0.3)]">
                    ฿{currentPkg.price.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-slate-400">THB</span>
                </div>
              </div>
            </div>

            {/* Action CTA Button */}
            {paymentMethod === 'stripe' ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full font-bold h-11 text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_20px_rgba(75,228,255,0.35)] rounded-xl"
                onClick={handleStripePurchase}
                isLoading={isCreatingStripe}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                ชำระผ่าน Stripe (฿{currentPkg.price.toLocaleString()} THB)
              </Button>
            ) : paymentMethod === 'bank_slip' ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full font-bold h-11 text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-[0_0_20px_rgba(55,229,210,0.35)] rounded-xl"
                onClick={handleBankTransferSubmit}
                isLoading={isSubmittingSlip}
              >
                <FileCheck className="h-4 w-4 mr-2" />
                ส่งสลิปเพื่อขออนุมัติ (Submit for Approval)
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full font-bold h-11 text-sm bg-amber-400 text-black hover:bg-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.35)] rounded-xl"
                onClick={handleSandboxPurchase}
              >
                <Zap className="h-4 w-4 mr-2" />
                ยืนยันการเติมเงินจำลอง (Confirm Sandbox Topup)
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Global Feedback Dialog */}
      <Dialog open={dialogConfig.open} onOpenChange={(open) => setDialogConfig((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogConfig.title}</DialogTitle>
            {dialogConfig.description && (
              <DialogDescription>{dialogConfig.description}</DialogDescription>
            )}
          </DialogHeader>
          {dialogConfig.content}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={() => setDialogConfig((prev) => ({ ...prev, open: false }))}>
              รับทราบ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
