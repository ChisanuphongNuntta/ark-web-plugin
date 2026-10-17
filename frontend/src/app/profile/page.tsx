'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { userApi } from '@/lib/api';
import { walletContractApi } from '@/lib/contracts/client';
import {
  Amount,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Spinner,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  buttonVariants,
  useToast,
} from '@/components/ui';
import ProtectionStatus from '@/components/ProtectionStatus';
import { WalletPanel } from '@/components/account/WalletPanel';
import { LinkedIdentities } from '@/components/account/LinkedIdentities';
import { DeviceSessions } from '@/components/account/DeviceSessions';

type ProfileTab = 'overview' | 'wallet' | 'security';

const TABS: ProfileTab[] = ['overview', 'wallet', 'security'];

function resolveTab(raw: string | null, linkSteam: boolean): ProfileTab {
  if (linkSteam) return 'security';
  if (raw === 'console') return 'overview';
  if (raw === 'identity') return 'security';
  return TABS.includes(raw as ProfileTab) ? (raw as ProfileTab) : 'overview';
}

function steamErrorText(code: string): string {
  if (code === 'steam_cancelled') return 'คุณยกเลิกการยืนยันกับ Steam ลองเชื่อมใหม่ได้ทุกเมื่อ';
  return 'ยืนยันกับ Steam ไม่สำเร็จ หรือ Steam ID นี้ผูกกับบัญชีอื่นอยู่แล้ว';
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function ProfileContent() {
  const { user, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const steamError = searchParams.get('error');
  const linkSteamRequested = searchParams.get('linkSteam') === 'true';
  const tab = resolveTab(searchParams.get('tab'), linkSteamRequested);

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('linkSteam');
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `/profile?${qs}` : '/profile', { scroll: false });
  };

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => userApi.getProfile().then((res) => res.data),
    enabled: Boolean(user),
  });

  const balance = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: Boolean(user),
  });

  const claim = useMutation({
    mutationFn: () => userApi.claimPoints(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      if (res.data.success) {
        toast.success('รับเหรียญจากเวลาเล่นแล้ว', `${res.data.pointsEarned} IC เข้ากระเป๋าของคุณ`);
      } else {
        toast.error('ยังไม่มีเวลาเล่นที่รับได้', res.data.message || 'เล่นบนเซิร์ฟเวอร์ IRIS แล้วกลับมารับภายหลัง');
      }
    },
    onError: () => toast.error('ตรวจเวลาเล่นไม่สำเร็จ', 'ลองอีกครั้งในอีกสักครู่'),
  });

  if (!user) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="บัญชีของฉัน" title="บัญชี IRIS ID" />
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อจัดการบัญชี"
            description="กระเป๋าเงิน บัญชีที่เชื่อมไว้ และอุปกรณ์ที่ใช้งานอยู่ ผูกกับ IRIS ID ของคุณ"
            action={
              <Link href="/login" className={buttonVariants()}>
                เข้าสู่ระบบ
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const totalSpent = profile.data?.user?.totalSpent;

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="บัญชีของฉัน"
        title="บัญชี IRIS ID"
        description="ดูยอดคงเหลือ เชื่อมบัญชีเกม และจัดการอุปกรณ์ที่เข้าสู่ระบบ"
        actions={
          <div className="text-left sm:text-right">
            <p className="text-xs text-fg-subtle">ยอดที่ใช้ได้</p>
            {balance.isLoading ? (
              <p className="mt-1 text-sm text-fg-muted">กำลังโหลด</p>
            ) : (
              <Amount
                value={balance.data?.accounts?.available ?? null}
                unit={balance.data?.currency ?? 'IC'}
                size="lg"
                className="mt-1"
              />
            )}
          </div>
        }
      />

      {steamError && (
        <ErrorMessage
          className="mb-6"
          title="เชื่อมบัญชี Steam ไม่สำเร็จ"
          message={steamErrorText(steamError)}
          errorCode={steamError}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="ส่วนของบัญชี">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="wallet">กระเป๋าเงิน</TabsTrigger>
          <TabsTrigger value="security">บัญชีและความปลอดภัย</TabsTrigger>
        </TabsList>

        <TabsPanel value="overview" className="space-y-6 pt-6">
          <Card padding="lg">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                {user.discordAvatar ? (
                  <Image
                    src={user.discordAvatar}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-full border border-line"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-lg font-semibold text-fg-muted"
                  >
                    {(user.discordUsername || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-[-0.015em] text-fg">{user.discordUsername}</h2>
                  <p className="text-sm text-fg-muted">{user.steamId ? 'เชื่อม Steam แล้ว' : 'ยังไม่ได้เชื่อม Steam'}</p>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-fg-subtle">ยอดใช้จ่ายสะสม</p>
                {profile.isLoading ? (
                  <p className="mt-1 text-sm text-fg-muted">กำลังโหลด</p>
                ) : (
                  <p className="mt-1 font-mono text-lg tabular-nums text-fg">
                    ฿{Number(totalSpent ?? 0).toLocaleString('th-TH')}
                  </p>
                )}
              </div>
            </div>
            <dl className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
              <Detail label="Discord ID" value={user.discordId || '—'} />
              <Detail label="Steam ID" value={user.steamId || '—'} />
            </dl>
          </Card>

          {user.steamId ? (
            <ProtectionStatus />
          ) : (
            <Card padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">เชื่อมบัญชี Steam</h3>
                <p className="mt-1 max-w-xl text-sm text-fg-muted">
                  ต้องเชื่อม Steam ก่อน ระบบจึงส่งของเข้าตัวละคร ดูสถานะป้องกันฐาน และนับเวลาเล่นให้คุณได้
                </p>
              </div>
              <Button variant="secondary" onClick={() => setTab('security')}>
                ไปเชื่อม Steam
              </Button>
            </Card>
          )}

          <Card padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-fg">รับเหรียญจากเวลาเล่น</h3>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                ระบบนับชั่วโมงที่คุณออนไลน์บนเซิร์ฟเวอร์ IRIS แล้วเปลี่ยนเป็น IC เข้ากระเป๋า กดรับได้เมื่อมีเวลาสะสม
              </p>
            </div>
            <Button
              onClick={() => claim.mutate()}
              loading={claim.isPending}
              leftIcon={<Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            >
              รับเหรียญ
            </Button>
          </Card>
        </TabsPanel>

        <TabsPanel value="wallet" className="pt-6">
          <WalletPanel />
        </TabsPanel>

        <TabsPanel value="security" className="space-y-10 pt-6">
          {linkSteamRequested && (
            <p className="rounded-card border border-info/25 bg-info/10 px-4 py-3 text-sm text-fg">
              กดเชื่อม Steam ด้านล่าง ระบบจะพาไปยืนยันตัวตนกับ Steam โดยตรง
            </p>
          )}
          <LinkedIdentities />
          <DeviceSessions />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <React.Suspense
      fallback={
        <div className="page-shell py-16">
          <Spinner label="กำลังโหลดบัญชี" />
        </div>
      }
    >
      <ProfileContent />
    </React.Suspense>
  );
}
