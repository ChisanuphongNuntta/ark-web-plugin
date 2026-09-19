'use client';

import * as React from 'react';
import { useAuthStore } from '@/lib/store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { walletContractApi } from '@/lib/contracts/client';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  User,
  Coins,
  Award,
  Shield,
  Flame,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import ProtectionStatus from '@/components/ProtectionStatus';
import { WalletPanel } from '@/components/account/WalletPanel';
import { LinkedIdentities } from '@/components/account/LinkedIdentities';
import { DeviceSessions } from '@/components/account/DeviceSessions';

type ProfileTab = 'console' | 'wallet' | 'identity';

function ProfileContent() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const steamError = searchParams.get('error');
  const linkSteamRequested = searchParams.get('linkSteam') === 'true';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<ProfileTab>(() =>
    linkSteamRequested ? 'identity' : 'console'
  );
  const [claimMessage, setClaimMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => userApi.getProfile().then((res) => res.data),
    enabled: !!user,
  });

  // HUD balance via the contract client (decimal-string available balance).
  const { data: walletBalance } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: !!user,
  });

  const claimMutation = useMutation({
    mutationFn: () => userApi.claimPoints(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
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
      setClaimMessage({ type: 'error', text: 'เกิดข้อขัดข้องในการเชื่อมต่อระบบตรวจสอบเวลาเล่นเกม' });
    },
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4">
        <EmptyState
          title="กรุณาเข้าสู่ระบบก่อนทำรายการ"
          description="คุณจำเป็นต้องเชื่อมต่อบัญชีเข้าสู่ระบบเพื่อใช้งาน บัญชีผู้เล่น และกระเป๋าเงินดิจิทัล"
          actionText="เข้าสู่ระบบทันที"
          onAction={() => {
            window.location.href = `${apiUrl}/auth/discord`;
          }}
        />
      </div>
    );
  }

  // Level progression from backend-provided totalSpent (display only).
  const userSpent = Number(profileData?.user?.totalSpent || 0);
  const userLevel = Math.max(1, Math.min(100, Math.floor(userSpent / 1000) + 1));
  const currentLevelProgress = ((userSpent % 1000) / 1000) * 100;

  const tabs: Array<{ id: ProfileTab; label: string; accent: string }> = [
    { id: 'console', label: 'คอนโซลผู้เล่น (Console)', accent: 'border-iris-cyan text-iris-cyan' },
    { id: 'wallet', label: 'กระเป๋าเงิน (Wallet & Ledger)', accent: 'border-iris-gold text-iris-gold' },
    { id: 'identity', label: 'บัญชีและความปลอดภัย (Account Center)', accent: 'border-iris-orchid text-iris-orchid' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Header + balance HUD */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/5">
        <div>
          <span className="eyebrow">YOUR BASECAMP</span>
          <h1 className="font-display text-3xl font-extrabold text-iris-pearl uppercase tracking-tight flex items-center gap-2.5">
            <User className="h-8 w-8 text-iris-cyan" />
            <span>Account Center</span>
          </h1>
        </div>

        {walletBalance && (
          <GlassCard variant="gold" className="px-5 py-3 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-iris-gold/10 border border-iris-gold/25 flex items-center justify-center">
              <Coins className="h-5 w-5 text-iris-gold" />
            </div>
            <div>
              <p className="text-[10px] text-iris-muted uppercase font-bold tracking-wider">Available Balance</p>
              {/* decimal string — shown verbatim, no client math */}
              <p className="font-mono font-bold text-lg text-gradient-gold">
                {walletBalance.accounts?.available ?? '—'} <span className="text-xs text-iris-gold">{walletBalance.currency}</span>
              </p>
            </div>
          </GlassCard>
        )}
      </div>

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

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-white/5 gap-1.5" role="tablist">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 font-bold text-xs uppercase tracking-wider rounded-t-2xl transition-all ${
              activeTab === tab.id
                ? `bg-white/[0.04] border-t-2 ${tab.accent}`
                : 'text-iris-muted hover:text-iris-pearl hover:bg-white/[0.015]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-8 animate-slide-up">
          <GlassCard variant="prism" hasLattice className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {user.discordAvatar ? (
                  <div className="relative h-20 w-20 rounded-full border-2 border-iris-cyan/30 overflow-hidden shadow-lg">
                    <Image src={user.discordAvatar} alt={user.discordUsername || 'User Avatar'} width={80} height={80} />
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

              <div className="text-center md:text-right">
                <p className="text-[10px] text-iris-muted uppercase font-bold tracking-widest">ยอดใช้จ่ายสะสม</p>
                <p className="font-mono font-bold text-2xl text-gradient-primary">฿{userSpent.toLocaleString()}</p>
                <p className="text-[9px] text-iris-muted mt-1 uppercase">สะสม XP จากการซื้อสินค้าทางการ</p>
              </div>
            </div>

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

      {/* WALLET */}
      {activeTab === 'wallet' && (
        <div className="animate-slide-up">
          <WalletPanel />
        </div>
      )}

      {/* ACCOUNT CENTER: identities + device sessions */}
      {activeTab === 'identity' && (
        <div className="space-y-10 animate-slide-up">
          {linkSteamRequested && (
            <div className="rounded-xl border border-iris-cyan/25 bg-iris-cyan/10 px-4 py-3 text-sm text-iris-pearl">
              เชื่อมบัญชี Steam โดยกดปุ่มด้านล่าง ระบบจะพาไปยืนยันตัวตนกับ Steam โดยตรง
            </div>
          )}
          <LinkedIdentities />
          <DeviceSessions />
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <React.Suspense fallback={<div className="max-w-4xl mx-auto py-20 px-4 text-center text-iris-muted">กำลังโหลดข้อมูล...</div>}>
      <ProfileContent />
    </React.Suspense>
  );
}
