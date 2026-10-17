'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { orderContractApi, walletContractApi } from '@/lib/contracts/client';
import type { OrderStatus } from '@/lib/contracts/types';
import { useAuthStore } from '@/lib/store';
import { config } from '@/lib/config';
import { Amount, Badge, Skeleton, buttonVariants } from '@/components/ui';

/** Orders the player is still waiting on (paid but not yet in game). */
const IN_FLIGHT: readonly OrderStatus[] = ['pending', 'paid', 'queued', 'delivering'];

/**
 * Personal strip under the hero. Signed in: wallet balance, orders in flight,
 * Steam link state and the two next actions. Signed out: one sentence and the
 * Discord sign-in button.
 */
export function AccountStrip() {
  const { user, isLoading } = useAuthStore();

  const wallet = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: walletContractApi.getBalance,
    enabled: !!user,
    staleTime: 30_000,
  });
  const orders = useQuery({
    queryKey: ['orders', 'home-in-flight'],
    queryFn: () => orderContractApi.list({ page: 1, limit: 20 }),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="page-shell" aria-busy="true">
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
          <Skeleton variant="circle" className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-fg">เข้าสู่ระบบเพื่อสั่งซื้อและติดตามการส่งของ</h2>
            <p className="mt-1 text-sm text-fg-muted">ใช้บัญชี Discord แล้วเชื่อม Steam เพื่อให้ระบบรู้ว่าต้องส่งของให้ตัวละครไหน</p>
          </div>
          <a href={`${config.apiUrl}/auth/discord`} className={buttonVariants({ className: 'shrink-0' })}>
            เข้าสู่ระบบด้วย Discord
          </a>
        </div>
      </div>
    );
  }

  const inFlight = (orders.data?.orders ?? []).filter((o) => IN_FLIGHT.includes(o.status)).length;
  const name = user.discordUsername ?? 'ผู้เล่น IRIS';

  return (
    <div className="page-shell">
      <section
        aria-label="บัญชีของฉัน"
        className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
      >
        <div className="flex items-center gap-4 bg-surface p-5">
          {user.discordAvatar ? (
            <Image src={user.discordAvatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-line" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2 text-sm font-medium text-fg-muted" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{name}</p>
            <div className="mt-1">
              {user.steamId ? (
                <Badge tone="success" outline>เชื่อม Steam แล้ว</Badge>
              ) : (
                <Link href="/profile" className="text-xs text-accent underline-offset-4 hover:underline">
                  ยังไม่เชื่อม Steam · เชื่อมตอนนี้
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface p-5">
          <p className="text-xs text-fg-subtle">ยอด IC ที่ใช้ได้</p>
          <div className="mt-1.5">
            {wallet.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : wallet.isError ? (
              <span className="text-sm text-fg-muted">โหลดยอดไม่สำเร็จ</span>
            ) : (
              <Amount value={wallet.data?.accounts?.available ?? '0'} size="lg" />
            )}
          </div>
        </div>

        <div className="bg-surface p-5">
          <p className="text-xs text-fg-subtle">รอส่งเข้าเกม</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            {orders.isLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <>
                <span className="font-mono text-xl font-medium text-fg">{orders.isError ? '—' : inFlight}</span>
                <span className="text-xs text-fg-subtle">รายการ</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-surface p-5 sm:col-span-2 lg:col-span-1">
          <Link href="/topup" className={buttonVariants({ size: 'sm' })}>
            เติม IC
          </Link>
          <Link href="/orders" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            คำสั่งซื้อ
          </Link>
        </div>
      </section>
    </div>
  );
}

export default AccountStrip;
