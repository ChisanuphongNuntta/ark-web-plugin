'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ReceiptText } from 'lucide-react';
import { AdminPanel } from '@/components/admin';
import { onSocketEvent } from '@/lib/socket';
import { REALTIME_EVENTS } from '@/lib/realtime/events';
import { adminTransactionsApi } from '@/lib/adminTransactionsApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { TransactionAmount, TransactionTypeBadge } from './TransactionBits';

const RECENT_KEY = ['admin-recent-transactions'] as const;
const LIMIT = 10;
const REFRESH_DEBOUNCE_MS = 2_000;

/** Dashboard overview: the latest 10 ledger transactions, refreshed live on 'admin:transaction'. */
export function RecentTransactionsPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: RECENT_KEY,
    queryFn: ({ signal }) => adminTransactionsApi.getPage({ page: 1, pageSize: LIMIT }, signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  React.useEffect(() => {
    let timer: number | null = null;
    const off = onSocketEvent(REALTIME_EVENTS.adminTransaction, () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: RECENT_KEY });
      }, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [queryClient]);

  const rows = (q.data?.items ?? []).slice(0, LIMIT);

  return (
    <AdminPanel
      title={
        <span className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
          ธุรกรรมล่าสุด
        </span>
      }
      description="10 รายการล่าสุดในสมุดบัญชี อัปเดตอัตโนมัติ"
      actions={
        <Link href="/admin/transactions" className="text-xs font-medium text-iris-cyan hover:underline">
          ดูทั้งหมด
        </Link>
      }
    >
      {q.isError ? (
        <p className="text-sm text-iris-muted">โหลดธุรกรรมล่าสุดไม่สำเร็จ ลองเปิดหน้าธุรกรรมอีกครั้ง</p>
      ) : q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-iris-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          กำลังโหลด…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-iris-muted">ยังไม่มีธุรกรรม</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <span className="hidden w-[9.5rem] shrink-0 font-mono text-[11px] tabular-nums text-iris-muted sm:block">
                  {formatBangkokDateTime(t.postedAt ?? t.createdAt)}
                </span>
                <span className="min-w-0">
                  <TransactionTypeBadge type={t.type} label={t.typeLabelTh} category={t.category} />
                  <span className="mt-0.5 block truncate text-xs text-iris-muted">
                    {t.user?.name ?? (t.user ? t.user.id.slice(0, 12) : 'ระบบ')}
                    <span className="sm:hidden"> · {formatBangkokDateTime(t.postedAt ?? t.createdAt)}</span>
                  </span>
                </span>
              </span>
              <TransactionAmount value={t.amount} className="shrink-0 text-sm font-semibold" unit />
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
