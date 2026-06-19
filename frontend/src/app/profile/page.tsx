'use client';

import * as React from 'react';
import { useAuthStore } from '@/lib/store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, walletApi } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  User,
  Coins,
  Link2,
  Clock,
  Award,
  Shield,
  Flame,
  ChevronDown,
  ChevronUp,
  UserCheck,
  CheckCircle,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import ProtectionStatus from '@/components/ProtectionStatus';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const showLinkSteam = searchParams.get('linkSteam') === 'true';
  const steamError = searchParams.get('error');
  const queryClient = useQueryClient();

  // Active Tab: console, wallet, identity
  const [activeTab, setActiveTab] = React.useState<'console' | 'wallet' | 'identity'>('console');
  
  // Expanded transaction IDs for double-entry details
  const [expandedTxIds, setExpandedTxIds] = React.useState<Record<string, boolean>>({});
  
  // Epic linking mock states
  const [epicUsername, setEpicUsername] = React.useState('');
  const [isEpicLinking, setIsEpicLinking] = React.useState(false);
  const [epicConnectedUser, setEpicConnectedUser] = React.useState<string | null>(null);

  // Claim points states
  const [claimMessage, setClaimMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Pagination for wallet history
  const [currentPage, setCurrentPage] = React.useState(1);

  // Queries
  const { data: profileData, isLoading: isProfileLoading, isError: isProfileError, refetch: refetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => userApi.getProfile().then(res => res.data),
    enabled: !!user,
  });

  const { data: walletBalance, isLoading: isWalletLoading, isError: isWalletError, refetch: refetchWallet } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance().then(res => res.data),
    enabled: !!user,
  });

  const { data: walletHistory, isLoading: isHistoryLoading, isError: isHistoryError, refetch: refetchHistory } = useQuery({
    queryKey: ['wallet-history', currentPage],
    queryFn: () => walletApi.getTransactions(currentPage, 10).then(res => res.data),
    enabled: !!user,
  });

  // Points claim mutation
  const claimMutation = useMutation({
    mutationFn: () => userApi.claimPoints(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-history'] });
      
      if (data.data.success) {
        setClaimMessage({
          type: 'success',
          text: `ทำรายการเคลมเวลาสำเร็จ! ได้รับ ${data.data.pointsEarned} IC เข้ากระเป๋าของคุณ`,
        });
      } else {
        setClaimMessage({
          type: 'error',
          text: data.data.message || 'ไม่พบเวลาเล่นสะสมที่ยังไม่ได้เคลมบนเซิร์ฟเวอร์',
        });
      }
    },
    onError: () => {
      setClaimMessage({
        type: 'error',
        text: 'เกิดข้อขัดข้องในการเชื่อมต่อระบบตรวจสอบเวลาเล่นเกม',
      });
    },
  });

  const toggleExpandTx = (txId: string) => {
    setExpandedTxIds(prev => ({
      ...prev,
      [txId]: !prev[txId]
    }));
  };

  const handleEpicLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicUsername.trim()) return;
    
    setIsEpicLinking(true);
    // Simulate API link delay
    setTimeout(() => {
      setIsEpicLinking(false);
      setEpicConnectedUser(epicUsername);
      setEpicUsername('');
    }, 1500);
  };

  const handleEpicUnlink = () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะยกเลิกการเชื่อมโยงบัญชี Epic Games?')) {
      setEpicConnectedUser(null);
    }
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4">
        <EmptyState
          title="กรุณาเข้าสู่ระบบก่อนทำรายการ"
          description="คุณจำเป็นต้องเชื่อมต่อบัญชีเข้าสู่ระบบเพื่อใช้งาน Survivor Console และกระเป๋าเงินดิจิทัล"
          actionText="เข้าสู่ระบบทันที"
          onAction={() => {
            window.location.href = `${apiUrl}/auth/discord`;
          }}
        />
      </div>
    );
  }

  // MMORPG Level progression calculation
  const userSpent = Number(profileData?.user?.totalSpent || 0);
  const userLevel = Math.max(1, Math.min(100, Math.floor(userSpent / 1000) + 1));
  const nextLevelSpent = userLevel * 1000;
  const currentLevelProgress = ((userSpent % 1000) / 1000) * 100;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* 1. Header & Character identity summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/5">
        <div>
          <span className="eyebrow">User Dashboard</span>
          <h1 className="font-display text-3xl font-extrabold text-iris-pearl uppercase tracking-tight flex items-center gap-2.5">
            <User className="h-8 w-8 text-iris-cyan" />
            <span>Survivor Console</span>
          </h1>
        </div>

        {/* Short Balance HUD widget */}
        {walletBalance && (
          <GlassCard variant="gold" className="px-5 py-3 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-iris-gold/10 border border-iris-gold/25 flex items-center justify-center">
              <Coins className="h-5 w-5 text-iris-gold animate-spin-slow" />
            </div>
            <div>
              <p className="text-[10px] text-iris-muted uppercase font-bold tracking-wider">Available Balance</p>
              <p className="font-mono font-bold text-lg text-gradient-gold">
                {Number(walletBalance.accounts?.available || 0).toLocaleString()} <span className="text-xs text-iris-gold">IC</span>
              </p>
            </div>
          </GlassCard>
        )}
      </div>

      {/* Steam Link Alerts */}
      {steamError && (
        <ErrorMessage
          title="เกิดข้อผิดพลาดในการเชื่อมโยง Steam"
          message={
            steamError === 'steam_cancelled'
              ? 'ผู้ใช้งานยกเลิกคำขอเชื่อมโยงโปรไฟล์ Steam'
              : 'การตรวจสอบสิทธิ์ล้มเหลวหรือ Steam ID นี้ถูกผูกกับ survivor คนอื่นแล้ว'
          }
          errorCode={steamError.toUpperCase()}
        />
      )}

      {/* Navigation tabs */}
      <div className="flex border-b border-white/5 gap-1.5" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'console'}
          onClick={() => setActiveTab('console')}
          className={`px-5 py-3 font-bold text-xs uppercase tracking-wider rounded-t-2xl transition-all ${
            activeTab === 'console'
              ? 'bg-white/[0.04] border-t-2 border-iris-cyan text-iris-cyan'
              : 'text-iris-muted hover:text-iris-pearl hover:bg-white/[0.015]'
          }`}
        >
          คอนโซลผู้เล่น (Console)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'wallet'}
          onClick={() => setActiveTab('wallet')}
          className={`px-5 py-3 font-bold text-xs uppercase tracking-wider rounded-t-2xl transition-all ${
            activeTab === 'wallet'
              ? 'bg-white/[0.04] border-t-2 border-iris-gold text-iris-gold'
              : 'text-iris-muted hover:text-iris-pearl hover:bg-white/[0.015]'
          }`}
        >
          กระเป๋าเงินและบัญชีแยกประเภท (Wallet & Ledger)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'identity'}
          onClick={() => setActiveTab('identity')}
          className={`px-5 py-3 font-bold text-xs uppercase tracking-wider rounded-t-2xl transition-all ${
            activeTab === 'identity'
              ? 'bg-white/[0.04] border-t-2 border-iris-orchid text-iris-orchid'
              : 'text-iris-muted hover:text-iris-pearl hover:bg-white/[0.015]'
          }`}
        >
          บัญชีเชื่อมต่อ (Identities)
        </button>
      </div>

      {/* TAB CONTENT: CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-8 animate-slide-up">
          {/* Main User Card */}
          <GlassCard variant="prism" hasLattice className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {user.discordAvatar ? (
                  <div className="relative h-20 w-20 rounded-full border-2 border-iris-cyan/30 overflow-hidden shadow-lg">
                    <Image
                      src={user.discordAvatar}
                      alt={user.discordUsername || 'User Avatar'}
                      width={80}
                      height={80}
                    />
                    <div className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-iris-cyan text-iris-ink font-mono font-black text-[10px] flex items-center justify-center border border-iris-ink">
                      {userLevel}
                    </div>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-full bg-black/40 border-2 border-iris-cyan/30 flex items-center justify-center text-iris-cyan font-bold text-xl">
                    {userLevel}
                  </div>
                )}

                <div className="space-y-1 text-left">
                  <h2 className="text-xl font-extrabold text-iris-pearl flex items-center gap-2">
                    {user.discordUsername}
                    <Badge variant="cyan">Survivor</Badge>
                  </h2>
                  <p className="font-mono text-xs text-iris-muted">
                    Discord ID: <span className="text-iris-pearl/80">{user.discordId}</span>
                  </p>
                  {user.steamId && (
                    <p className="font-mono text-xs text-iris-muted">
                      Steam ID: <span className="text-iris-pearl/80">{user.steamId}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Account Spent status */}
              <div className="text-center md:text-right">
                <p className="text-[10px] text-iris-muted uppercase font-bold tracking-widest">ยอดใช้จ่ายสะสม</p>
                <p className="font-mono font-bold text-2xl text-gradient-primary">
                  ฿{userSpent.toLocaleString()}
                </p>
                <p className="text-[9px] text-iris-muted mt-1 uppercase">สะสม XP จากการซื้อสินค้าทางการ</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-6 pt-6 border-t border-white/5 space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-iris-muted uppercase tracking-wider">
                <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-iris-gold" /> Level {userLevel} Survivor</span>
                <span>{userSpent % 1000} / 1000 SPENT to Level {userLevel + 1}</span>
              </div>
              <div className="h-2 w-full bg-black/40 rounded-full p-[1px] border border-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-iris-cyan to-iris-orchid rounded-full transition-all duration-500"
                  style={{ width: `${currentLevelProgress}%` }}
                />
              </div>
            </div>
          </GlassCard>

          {/* Protection Status widget (Only if Steam Id linked) */}
          {user.steamId ? (
            <ProtectionStatus />
          ) : (
            <GlassCard variant="gold" className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-iris-gold/10 border border-iris-gold/30 flex items-center justify-center text-iris-gold shrink-0">
                    <Shield className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-iris-gold text-sm tracking-wider uppercase">กรุณาเชื่อมโยง Steam Account</h3>
                    <p className="text-xs text-iris-muted mt-1 leading-relaxed max-w-lg">
                      เพื่อเปิดการสแกนสถานะสิ่งปลูกสร้าง การป้องกันการโจมตี (Tribe Protection Status) และอนุญาตการดึงข้อมูลตัวละครในเซิร์ฟเวอร์
                    </p>
                  </div>
                </div>
                <Button variant="gold" size="sm" onClick={() => setActiveTab('identity')}>
                  ไปที่หน้าเชื่อมต่อไอดี
                </Button>
              </div>
            </GlassCard>
          )}

          {/* Claims Play Points Terminal */}
          <GlassCard variant="default" className="p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="font-display text-sm font-bold text-iris-pearl uppercase tracking-wider flex items-center gap-2">
                  <Award className="h-5 w-5 text-iris-cyan" />
                  <span>ระบบเคลมเหรียญเวลาเล่น (Survival Time Claim Vault)</span>
                </h3>
                <p className="text-xs text-iris-muted max-w-xl leading-relaxed">
                  สแกนชั่วโมงออนไลน์สะสมขณะเอาชีวิตรอดบนเซิร์ฟเวอร์พันธมิตรของ IRIS Thailand เพื่อแปลงเวลาเล่นเกมเป็นแต้มพิเศษเข้ากระเป๋าเงินคุณโดยอัตโนมัติ
                </p>
              </div>
              <Button
                variant="cyan"
                onClick={() => claimMutation.mutate()}
                isLoading={claimMutation.isPending}
                leftIcon={<Award className="h-4 w-4" />}
              >
                เคลมแต้มเวลาสะสม
              </Button>
            </div>

            {claimMessage && (
              <div className="mt-4">
                {claimMessage.type === 'success' ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-2xl flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold">{claimMessage.text}</p>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold">{claimMessage.text}</p>
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* TAB CONTENT: WALLET & DOUBLE-ENTRY LEDGER */}
      {activeTab === 'wallet' && (
        <div className="space-y-8 animate-slide-up">
          {/* Skeleton Loaders */}
          {isWalletLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <GlassCard key={i} className="p-5">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-6 w-24" />
                </GlassCard>
              ))}
            </div>
          )}

          {isWalletError && (
            <ErrorMessage
              title="ไม่สามารถดาวน์โหลดข้อมูลกระเป๋าเงินได้"
              message="การสืบค้นสถานะ Ledger ผิดพลาด หรือสิทธิ์เซสชันของท่านหมดอายุ กรุณาโหลดหน้าจอใหม่อีกครั้ง"
              onRetry={refetchWallet}
            />
          )}

          {/* Wallet sub-ledger accounts view */}
          {walletBalance && !isWalletLoading && (
            <div className="space-y-6">
              <div>
                <span className="eyebrow">IRIS Multi-Account Ledger</span>
                <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">ยอดบัญชีแยกประเภท</h3>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Available Account */}
                <GlassCard className="p-5 border-l-2 border-l-iris-cyan">
                  <p className="text-[10px] text-iris-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                    Available Balance
                    <span className="cursor-help" title="เหรียญที่พร้อมใช้ซื้อของได้ทันที">
                      <HelpCircle className="h-3 w-3 text-iris-muted hover:text-white" />
                    </span>
                  </p>
                  <p className="font-mono font-bold text-2xl text-iris-cyan mt-1.5">
                    {Number(walletBalance.accounts?.available || 0).toLocaleString()}
                    <span className="text-xs ml-1 text-iris-muted">IC</span>
                  </p>
                  <p className="text-[9px] text-iris-muted mt-2">กระเป๋าหลักพร้อมทำรายการ</p>
                </GlassCard>

                {/* Held Account (P2P listing lock) */}
                <GlassCard className="p-5 border-l-2 border-l-amber-400">
                  <p className="text-[10px] text-iris-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                    Escrow Held Funds
                    <span className="cursor-help" title="เงินค้ำประกันที่ค้างในระบบระหว่างการซื้อขายแบบ P2P หรือรอรับสินค้า">
                      <HelpCircle className="h-3 w-3 text-iris-muted hover:text-white" />
                    </span>
                  </p>
                  <p className="font-mono font-bold text-2xl text-amber-400 mt-1.5">
                    {Number(walletBalance.accounts?.held || 0).toLocaleString()}
                    <span className="text-xs ml-1 text-iris-muted">IC</span>
                  </p>
                  <p className="text-[9px] text-iris-muted mt-2">เงินค้ำประกันตลาดซื้อขาย</p>
                </GlassCard>

                {/* Promotional Account */}
                <GlassCard className="p-5 border-l-2 border-l-iris-orchid">
                  <p className="text-[10px] text-iris-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                    Promotional Bonus
                    <span className="cursor-help" title="โบนัสเครดิตพ้อยต์พิเศษที่ได้รับจากกิจกรรม ไม่สามารถถอนออกเป็นเงินสดได้">
                      <HelpCircle className="h-3 w-3 text-iris-muted hover:text-white" />
                    </span>
                  </p>
                  <p className="font-mono font-bold text-2xl text-iris-orchid mt-1.5">
                    {Number(walletBalance.accounts?.promotional || 0).toLocaleString()}
                    <span className="text-xs ml-1 text-iris-muted">IC</span>
                  </p>
                  <p className="text-[9px] text-iris-muted mt-2">เหรียญของขวัญโปรโมชั่น</p>
                </GlassCard>

                {/* Refundable Account */}
                <GlassCard className="p-5 border-l-2 border-l-rose-400">
                  <p className="text-[10px] text-iris-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                    Refundable Cash
                    <span className="cursor-help" title="เครดิตเงินเติมที่ขอรับเงินคืนกลับเป็นเงินบาทไทยได้หากซื้อผิดพลาดและอยู่ตามเงื่อนไข">
                      <HelpCircle className="h-3 w-3 text-iris-muted hover:text-white" />
                    </span>
                  </p>
                  <p className="font-mono font-bold text-2xl text-rose-400 mt-1.5">
                    {Number(walletBalance.accounts?.refundable || 0).toLocaleString()}
                    <span className="text-xs ml-1 text-iris-muted">IC</span>
                  </p>
                  <p className="text-[9px] text-iris-muted mt-2">ส่วนแบ่งเงินคืนเข้าบัญชีหลัก</p>
                </GlassCard>
              </div>

              {/* Total Balance Summary Panel */}
              <GlassCard variant="gold" className="p-5 flex justify-between items-center bg-gradient-to-r from-iris-gold/5 to-transparent">
                <div>
                  <h4 className="text-xs font-bold text-iris-gold uppercase tracking-wider">มูลค่าพอร์ตทรัพย์สินรวม (Grand Total Portfolio)</h4>
                  <p className="text-xs text-iris-muted mt-0.5">ผลบวกของยอดทรัพย์สินสะสมทุกกระเป๋าดิจิทัล</p>
                </div>
                <p className="font-mono font-black text-2xl text-gradient-gold">
                  {Number(walletBalance.total).toLocaleString()} <span className="text-xs text-iris-gold">IRIS COINS</span>
                </p>
              </GlassCard>
            </div>
          )}

          {/* DOUBLE-ENTRY TRANSACTION TIMELINE */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="eyebrow">Immutable Ledger Log</span>
                <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">ไทม์ไลน์สมุดรายวันธุรกรรมดิจิทัล</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchHistory()} leftIcon={<Clock className="h-3.5 w-3.5" />}>
                อัปเดตข้อมูลสด
              </Button>
            </div>

            {isHistoryLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <GlassCard key={i} className="p-6">
                    <div className="flex justify-between items-center mb-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-2/3" />
                  </GlassCard>
                ))}
              </div>
            )}

            {isHistoryError && (
              <ErrorMessage
                title="เกิดปัญหาในการดึงประวัติสมุดบัญชี"
                message="ไม่สามารถเชื่อมต่อไปยังฐานข้อมูล Ledger บัญชีแยกประเภทได้ในเวลานี้"
                onRetry={refetchHistory}
              />
            )}

            {walletHistory && !isHistoryLoading && (
              <div className="space-y-4">
                {walletHistory.transactions?.length === 0 ? (
                  <EmptyState
                    title="ไม่มีรายการประวัติ Ledger"
                    description="บัญชีแยกประเภทนี้ยังไม่มีรายการตรวจสอบเงินเข้าหรือออกประวัติใดๆ ในระบบฐานข้อมูล"
                  />
                ) : (
                  <div className="space-y-3">
                    {walletHistory.transactions.map((tx: any) => {
                      const isExpanded = !!expandedTxIds[tx.id];
                      
                      // Calculate the net change for this user's available balance in the transaction
                      const userEntries = tx.entries?.filter((entry: any) => entry.account?.key?.includes(user.id)) || [];
                      const availableEntry = userEntries.find((entry: any) => entry.account?.type === 'available');
                      const amountVal = availableEntry ? Number(availableEntry.amount) : 0;
                      
                      return (
                        <GlassCard
                          key={tx.id}
                          className={`border transition-all ${
                            isExpanded ? 'border-iris-cyan/30' : 'border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    tx.type?.includes('recharge') || tx.type?.includes('credit')
                                      ? 'success'
                                      : tx.type?.includes('hold')
                                      ? 'warning'
                                      : 'default'
                                  }
                                >
                                  {tx.type}
                                </Badge>
                                <span className="font-mono text-[10px] text-iris-muted bg-black/40 px-2 py-0.5 rounded">
                                  ID: {tx.id.substring(0, 8)}...
                                </span>
                              </div>
                              <p className="text-sm font-bold text-iris-pearl mt-1">
                                {tx.description || 'Ledger Entry Update'}
                              </p>
                              <p className="text-[10px] text-iris-muted flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(tx.createdAt).toLocaleString('th-TH')}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 self-end md:self-center">
                              <div className="text-right">
                                <span
                                  className={`font-mono font-bold text-base ${
                                    amountVal >= 0 ? 'text-iris-cyan' : 'text-rose-400'
                                  }`}
                                >
                                  {amountVal >= 0 ? '+' : ''}
                                  {amountVal.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-iris-muted ml-1">IC</span>
                              </div>

                              <button
                                onClick={() => toggleExpandTx(tx.id)}
                                className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition"
                                aria-label="แสดงบัญชีแยกประเภทร่วม"
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Ledger Double-Entry representation */}
                          {isExpanded && (
                            <div className="bg-black/50 border-t border-white/5 px-5 py-4 space-y-3 animate-slide-up">
                              <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-bold text-iris-cyan uppercase tracking-wider">ตรวจสอบโครงสร้างบัญชีสองด้าน (Ledger Entries)</h4>
                                <span className="font-mono text-[9px] text-iris-muted">Idempotency: {tx.idempotencyKey}</span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left font-mono text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-white/10 text-iris-muted text-[10px]">
                                      <th className="pb-2">Account Key / Type</th>
                                      <th className="pb-2 text-right">Debit/Credit</th>
                                      <th className="pb-2 text-right">Balance After</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tx.entries?.map((entry: any) => {
                                      const entryAmount = Number(entry.amount);
                                      return (
                                        <tr key={entry.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                          <td className="py-2.5">
                                            <p className="text-iris-pearl font-medium text-[11px] truncate max-w-xs md:max-w-md" title={entry.account?.key}>
                                              {entry.account?.key || 'System account'}
                                            </p>
                                            <span className="text-[9px] bg-white/5 text-iris-muted px-1.5 py-0.2 rounded uppercase">
                                              {entry.account?.type || 'External'}
                                            </span>
                                          </td>
                                          <td className={`py-2.5 text-right font-bold ${entryAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {entryAmount >= 0 ? '+' : ''}
                                            {entryAmount.toLocaleString()} IC
                                          </td>
                                          <td className="py-2.5 text-right text-iris-muted">
                                            {Number(entry.balanceAfter).toLocaleString()} IC
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </GlassCard>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {walletHistory.pagination && walletHistory.pagination.totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 pt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    >
                      ก่อนหน้า
                    </Button>
                    <span className="text-xs text-iris-muted font-bold font-mono">
                      หน้า {currentPage} จาก {walletHistory.pagination.totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage >= walletHistory.pagination.totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, walletHistory.pagination.totalPages))}
                    >
                      ถัดไป
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: IDENTITIES LINKING */}
      {activeTab === 'identity' && (
        <div className="space-y-6 animate-slide-up">
          <div>
            <span className="eyebrow">Ecosystem Identities Mapping</span>
            <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">จัดการการเชื่อมโยงระบบ (Account Settings)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Discord - Linked at signup */}
            <GlassCard className="p-6 flex flex-col justify-between h-72 border-l-2 border-l-indigo-500">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <Badge variant="cyan">Connected</Badge>
                </div>
                <div className="space-y-1">
                  <h4 className="font-display font-bold text-iris-pearl">Discord Link</h4>
                  <p className="text-xs text-iris-muted leading-relaxed">
                    เชื่อมต่ออยู่ด้วยบัญชี Discord หลัก ซึ่งรับประกันการกู้คืนไอดีและการตรวจสอบ VIP Status ในคอมมูนิตี้
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-iris-pearl">{user.discordUsername}</span>
                <span className="text-[9px] text-iris-muted">ผูกมัดถาวร</span>
              </div>
            </GlassCard>

            {/* Steam - Links client character */}
            <GlassCard
              className={`p-6 flex flex-col justify-between h-72 border-l-2 ${
                user.steamId ? 'border-l-iris-cyan' : 'border-l-iris-gold'
              }`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                    user.steamId
                      ? 'bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan'
                      : 'bg-iris-gold/10 border border-iris-gold/30 text-iris-gold'
                  }`}>
                    <Link2 className="h-6 w-6" />
                  </div>
                  {user.steamId ? (
                    <Badge variant="cyan">Connected</Badge>
                  ) : (
                    <Badge variant="warning">Action Required</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <h4 className="font-display font-bold text-iris-pearl">Steam Neural Link</h4>
                  <p className="text-xs text-iris-muted leading-relaxed">
                    จำเป็นต้องระบุ Steam ID เพื่อทำการซื้อสัตว์เลี้ยง ไอเท็มส่งเข้าตัวละครในเซิร์ฟเวอร์
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                {user.steamId ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-iris-pearl truncate max-w-[120px]">{user.steamId}</span>
                    <Badge variant="default" outline>Locked</Badge>
                  </div>
                ) : (
                  <a href={`${apiUrl}/auth/steam`} className="w-full inline-block">
                    <Button variant="gold" size="sm" className="w-full">
                      เชื่อมต่อ Steam ID
                    </Button>
                  </a>
                )}
              </div>
            </GlassCard>

            {/* Epic Games - Prototyped linking */}
            <GlassCard
              className={`p-6 flex flex-col justify-between h-72 border-l-2 ${
                epicConnectedUser ? 'border-l-iris-orchid' : 'border-l-white/10'
              }`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                    epicConnectedUser
                      ? 'bg-iris-orchid/10 border border-iris-orchid/30 text-iris-orchid'
                      : 'bg-white/5 border border-white/10 text-iris-muted'
                  }`}>
                    <Link2 className="h-6 w-6" />
                  </div>
                  {epicConnectedUser ? (
                    <Badge variant="orchid">Connected</Badge>
                  ) : (
                    <Badge variant="default" outline>Disconnected</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <h4 className="font-display font-bold text-iris-pearl">Epic Games ID</h4>
                  <p className="text-xs text-iris-muted leading-relaxed">
                    สำหรับการเล่นผ่านแพลตฟอร์ม Epic Games Store เพื่อส่งของรางวัลเข้าตัวละครเกม
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                {epicConnectedUser ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-iris-orchid truncate max-w-[120px]">
                      {epicConnectedUser}
                    </span>
                    <button
                      onClick={handleEpicUnlink}
                      className="text-[10px] font-bold text-rose-400 hover:underline"
                    >
                      ยกเลิกเชื่อมต่อ
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleEpicLink} className="flex gap-2">
                    <Input
                      placeholder="กรอกชื่อ Epic ID"
                      value={epicUsername}
                      onChange={(e) => setEpicUsername(e.target.value)}
                      disabled={isEpicLinking}
                      className="py-1 px-3 text-xs rounded-xl"
                    />
                    <Button
                      variant="orchid"
                      size="sm"
                      type="submit"
                      isLoading={isEpicLinking}
                      className="px-3 shrink-0"
                    >
                      ผูกมัด
                    </Button>
                  </form>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Account Policy warning banner */}
          <GlassCard variant="flat" className="p-5 border border-white/5 bg-black/20 text-xs leading-relaxed text-iris-muted flex items-start gap-3">
            <Shield className="h-5 w-5 text-iris-cyan shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-bold text-iris-pearl">มาตรการรักษาความปลอดภัยของระบบบัญชีกลาง IRIS ID</h5>
              <p>
                เพื่อป้องกันกิจกรรมการซื้อขายด้วยเงินจริงและการฟอกไอดีผ่านเซิร์ฟเวอร์ (Anti-RMT Framework) 
                บัญชี Steam และ Epic Games ที่ถูกเชื่อมโยงจะถูกล๊อคข้อมูลความสัมพันธ์ทันทีและไม่อนุญาตให้ทำการย้ายบัญชีได้โดยไม่มีเหตุกระบวนการร้องเรียนผ่านระบบตั๋วสนับสนุน (Support Tickets) 
                กรุณาตรวจสอบบัญชีตัวละครให้ถูกต้องก่อนการเชื่อมต่อ
              </p>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
