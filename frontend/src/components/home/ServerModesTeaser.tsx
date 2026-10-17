'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GAME_MODE_DESCRIPTION, GameModeBadge, useServerDirectory } from '@/components/servers';
import { EmptyState, ErrorMessage, Skeleton, StatusDot, buttonVariants } from '@/components/ui';

/**
 * One tile per server set from GET /servers/directory (PvE, PvE Mod, PvPvE,
 * Pre-Aqua …): mode, rates, map count and how many maps are online now.
 * Each tile links to that set on /servers.
 */
export function ServerModesTeaser() {
  const directory = useServerDirectory();
  const groups = directory.data?.groups ?? [];

  return (
    <section aria-labelledby="servers-title" className="page-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="eyebrow">เซิร์ฟเวอร์</p>
          <h2 id="servers-title" className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-fg">
            เลือกโหมดที่เข้ากับวิธีเล่นของคุณ
          </h2>
          <p className="mt-2 text-sm text-fg-muted">ทุกชุดเซิร์ฟเวอร์มีครบทุกแผนที่ ซื้อของแล้วเลือกได้ว่าจะส่งเข้าแผนที่ไหน</p>
        </div>
        <Link href="/servers" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          รายชื่อเซิร์ฟเวอร์ทั้งหมด
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-6">
        {directory.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="กำลังโหลดเซิร์ฟเวอร์">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3 rounded-card border border-line bg-surface p-5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : directory.isError ? (
          <ErrorMessage
            title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ"
            message="ลองอีกครั้ง หรือดูหน้ารายชื่อเซิร์ฟเวอร์"
            onRetry={() => void directory.refetch()}
          />
        ) : groups.length === 0 ? (
          <EmptyState title="ยังไม่มีเซิร์ฟเวอร์ที่เปิดให้เห็น" description="ทีมงานกำลังเตรียมรายชื่อเซิร์ฟเวอร์ ติดตามประกาศได้ทาง Discord" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((group) => {
              const total = group.servers.length;
              const online = group.servers.filter((s) => s.available && s.online).length;
              return (
                <li key={group.key} className="min-w-0">
                  <Link
                    href={`/servers?mode=${encodeURIComponent(group.key)}`}
                    className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-colors duration-fast hover:border-line-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {group.gameMode ? <GameModeBadge mode={group.gameMode} /> : <span />}
                      {group.rates ? <span className="font-mono text-xs text-fg-muted">{group.rates}</span> : null}
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-fg transition-colors duration-fast group-hover:text-accent">
                      {group.name}
                    </h3>
                    <p className="mt-1 text-sm text-fg-muted">{group.description ?? (group.gameMode ? GAME_MODE_DESCRIPTION[group.gameMode] : 'เซิร์ฟเวอร์อื่น ๆ')}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs">
                      <span className="text-fg-subtle">
                        <span className="font-mono text-fg-muted">{total}</span> แผนที่
                      </span>
                      <StatusDot
                        status={online > 0 ? 'online' : 'offline'}
                        label={
                          <span>
                            ออนไลน์ <span className="font-mono">{online}</span>
                          </span>
                        }
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default ServerModesTeaser;
