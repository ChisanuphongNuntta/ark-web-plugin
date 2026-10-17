'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { walletContractApi } from '@/lib/contracts/client';
import type { LedgerTransaction } from '@/lib/contracts/types';
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Pagination,
  Skeleton,
  buttonVariants,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Sub-account labels. Unknown keys still render so additive contract
 * sub-accounts appear automatically. Every balance is a backend decimal
 * STRING rendered verbatim — no arithmetic on money (TEAM_OWNERSHIP.md §2).
 */
const ACCOUNT_META: Record<string, { label: string; hint: string }> = {
  available: { label: 'ใช้ได้', hint: 'ใช้ซื้อของได้ทันที' },
  held: { label: 'กันไว้', hint: 'กันไว้ระหว่างซื้อขายในตลาดผู้เล่นหรือรอส่งของ' },
  promotional: { label: 'โบนัส', hint: 'เครดิตจากกิจกรรม ใช้ได้ตามเงื่อนไข' },
  refundable: { label: 'เงินคืน', hint: 'ยอดที่ได้คืนจากคำสั่งซื้อที่ส่งไม่สำเร็จ' },
  pending: { label: 'รอยืนยัน', hint: 'รายการที่ยังชำระไม่เสร็จ' },
};

const SUB_ACCOUNT_ORDER = ['available', 'held', 'promotional', 'refundable', 'pending'];
const PAGE_SIZE = 10;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function WalletPanel() {
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const balance = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
  });

  const history = useQuery({
    queryKey: ['wallet', 'transactions', page],
    queryFn: () => walletContractApi.getTransactions(page, PAGE_SIZE),
  });

  const accountKeys = React.useMemo(() => {
    if (!balance.data) return [];
    const keys = Object.keys(balance.data.accounts);
    return [...SUB_ACCOUNT_ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !SUB_ACCOUNT_ORDER.includes(k))];
  }, [balance.data]);

  const currency = balance.data?.currency ?? 'IC';

  return (
    <div className="space-y-10">
      <section aria-labelledby="wallet-balances" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="wallet-balances" className="text-lg font-semibold tracking-[-0.015em] text-fg">
              ยอดในกระเป๋า
            </h2>
            <p className="mt-1 text-sm text-fg-muted">ยอดทุกบัญชีย่อยมาจากระบบบัญชีหลังบ้านโดยตรง</p>
          </div>
          <Link href="/topup" className={buttonVariants()}>
            เติมเงิน
          </Link>
        </div>

        {balance.isError ? (
          <ErrorMessage
            title="โหลดยอดกระเป๋าไม่สำเร็จ"
            message="เซสชันอาจหมดอายุ หรือการเชื่อมต่อขัดข้อง ลองอีกครั้ง"
            onRetry={() => void balance.refetch()}
          />
        ) : (
          <Card padding="none" aria-busy={balance.isLoading || undefined}>
            <dl className="grid grid-cols-2 divide-line lg:grid-cols-5 [&>div]:border-line">
              {balance.isLoading
                ? Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="border-b p-5 lg:border-b-0 lg:border-r">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="mt-3 h-6 w-24" />
                    </div>
                  ))
                : accountKeys.map((key) => {
                    const meta = ACCOUNT_META[key] ?? { label: key, hint: 'บัญชีย่อย' };
                    return (
                      <div key={key} className="border-b p-5 lg:border-b-0 lg:border-r last:border-r-0">
                        <dt className="text-xs text-fg-muted">{meta.label}</dt>
                        <dd className="mt-2">
                          <Amount value={balance.data?.accounts[key]} unit={currency} size="lg" />
                          <p className="mt-1 text-xs text-fg-subtle">{meta.hint}</p>
                        </dd>
                      </div>
                    );
                  })}
            </dl>
            {balance.data && (
              <div className="flex items-center justify-between gap-4 border-t border-line bg-surface-2 px-5 py-4">
                <p className="text-sm text-fg-muted">ยอดรวมทุกบัญชี</p>
                <Amount value={balance.data.total} unit={currency} size="lg" tone="accent" />
              </div>
            )}
          </Card>
        )}
      </section>

      <section aria-labelledby="wallet-history" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="wallet-history" className="text-lg font-semibold tracking-[-0.015em] text-fg">
              ประวัติธุรกรรม
            </h2>
            <p className="mt-1 text-sm text-fg-muted">ทุกรายการบันทึกแบบบัญชีคู่ แก้ไขย้อนหลังไม่ได้</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void history.refetch()}
            loading={history.isFetching && !history.isLoading}
            leftIcon={<RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          >
            รีเฟรช
          </Button>
        </div>

        {history.isError ? (
          <ErrorMessage
            title="โหลดประวัติธุรกรรมไม่สำเร็จ"
            message="ลองอีกครั้งในอีกสักครู่"
            onRetry={() => void history.refetch()}
          />
        ) : history.isLoading ? (
          <Card padding="none" aria-busy>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="border-b border-line p-5 last:border-b-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </Card>
        ) : !history.data?.transactions.length ? (
          <EmptyState
            title="ยังไม่มีธุรกรรม"
            description="เมื่อเติมเงิน ซื้อของ หรือได้รับเงินคืน รายการจะแสดงที่นี่"
          />
        ) : (
          <>
            <Card as="section" padding="none">
              <ul>
                {history.data.transactions.map((tx) => (
                  <li key={tx.id} className="border-b border-line last:border-b-0">
                    <TransactionRow
                      tx={tx}
                      isExpanded={Boolean(expanded[tx.id])}
                      onToggle={() => setExpanded((p) => ({ ...p, [tx.id]: !p[tx.id] }))}
                    />
                  </li>
                ))}
              </ul>
            </Card>
            <Pagination
              page={history.data.pagination.page}
              pageSize={history.data.pagination.limit || PAGE_SIZE}
              total={history.data.pagination.total}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

function TransactionRow({
  tx,
  isExpanded,
  onToggle,
}: {
  tx: LedgerTransaction;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isCredit = tx.type.includes('credit') || tx.type.includes('recharge') || tx.type.includes('topup');
  const isHold = tx.type.includes('hold');
  const panelId = `tx-${tx.id}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors duration-fast hover:bg-surface-2"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isCredit ? 'success' : isHold ? 'warning' : 'neutral'} mono>
              {tx.type}
            </Badge>
            <span className="font-mono text-xs text-fg-subtle">{tx.id.slice(0, 8)}</span>
          </div>
          <p className="text-sm text-fg">{tx.description || 'รายการบัญชี'}</p>
          <p className="text-xs text-fg-subtle">{formatDate(tx.createdAt)}</p>
        </div>
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={cn('mt-1 h-4 w-4 shrink-0 text-fg-muted transition-transform duration-fast', isExpanded && 'rotate-180')}
        />
        <span className="sr-only">{isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</span>
      </button>

      {isExpanded && (
        <div id={panelId} className="space-y-3 border-t border-line bg-surface-2 px-5 py-4">
          <p className="truncate font-mono text-xs text-fg-subtle" title={tx.idempotencyKey}>
            Idempotency: {tx.idempotencyKey}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className="pb-2 font-medium">บัญชี</th>
                  <th scope="col" className="pb-2 text-right font-medium">จำนวน</th>
                  <th scope="col" className="pb-2 text-right font-medium">คงเหลือหลังรายการ</th>
                </tr>
              </thead>
              <tbody>
                {tx.entries.map((entry) => {
                  // Decimal strings shown verbatim; sign read from the leading '-' only.
                  const isNegative = entry.amount.trim().startsWith('-');
                  return (
                    <tr key={entry.id} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 pr-4">
                        <p className="max-w-xs truncate font-mono text-fg" title={entry.account.key}>
                          {entry.account.key}
                        </p>
                        <p className="text-fg-subtle">{entry.account.type}</p>
                      </td>
                      <td
                        className={cn(
                          'py-2.5 text-right font-mono tabular-nums',
                          isNegative ? 'text-danger' : 'text-success'
                        )}
                      >
                        {entry.amount} {entry.account.currency}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-fg-muted">
                        {entry.balanceAfter} {entry.account.currency}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
