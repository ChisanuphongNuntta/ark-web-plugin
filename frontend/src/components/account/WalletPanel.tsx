'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  Wallet,
  Clock,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { walletContractApi } from '@/lib/contracts/client';
import type { LedgerTransaction } from '@/lib/contracts/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

/**
 * Display metadata per known sub-account. Unknown keys still render with a
 * neutral style so additive contract sub-accounts are surfaced automatically.
 * NOTE: every balance is a backend decimal STRING and is rendered verbatim —
 * the panel performs NO arithmetic on money (TEAM_OWNERSHIP.md §2).
 */
const ACCOUNT_META: Record<string, { label: string; accent: string; hint: string }> = {
  available: {
    label: 'Available',
    accent: 'border-l-iris-cyan text-iris-cyan',
    hint: 'ยอดที่พร้อมใช้ซื้อของได้ทันที',
  },
  held: {
    label: 'Held / Escrow',
    accent: 'border-l-amber-400 text-amber-400',
    hint: 'เงินที่ถูกกันไว้ระหว่างทำรายการ P2P หรือรอรับสินค้า',
  },
  promotional: {
    label: 'Promotional',
    accent: 'border-l-iris-orchid text-iris-orchid',
    hint: 'เครดิตโบนัสจากกิจกรรม ใช้ได้ตามเงื่อนไข',
  },
  refundable: {
    label: 'Refundable',
    accent: 'border-l-rose-400 text-rose-400',
    hint: 'ยอดที่ขอคืนได้ตามเงื่อนไข',
  },
  pending: {
    label: 'Pending',
    accent: 'border-l-blue-400 text-blue-400',
    hint: 'รายการที่ยังไม่ชำระเสร็จสมบูรณ์',
  },
};

const SUB_ACCOUNT_ORDER = ['available', 'held', 'promotional', 'refundable', 'pending'];

// UI-only top-up presets (NOT a price calculation — fixed package definitions).
const TOPUP_PRESETS = [100, 300, 500, 1000];

export function WalletPanel() {
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [topupPreset, setTopupPreset] = React.useState<number | null>(null);

  const {
    data: balance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
  });

  const {
    data: history,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['wallet', 'transactions', page],
    queryFn: () => walletContractApi.getTransactions(page, 10),
  });

  const accountKeys = React.useMemo(() => {
    if (!balance) return [];
    const keys = Object.keys(balance.accounts);
    return [
      ...SUB_ACCOUNT_ORDER.filter((k) => keys.includes(k)),
      ...keys.filter((k) => !SUB_ACCOUNT_ORDER.includes(k)),
    ];
  }, [balance]);

  return (
    <div className="space-y-8">
      {/* -------------------- Balance cards -------------------- */}
      <section className="space-y-4">
        <div>
          <span className="eyebrow">IRIS Wallet — Sub-accounts</span>
          <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">ยอดบัญชีแยกประเภท</h3>
        </div>

        {isBalanceLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <GlassCard key={i} className="p-5">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </GlassCard>
            ))}
          </div>
        )}

        {isBalanceError && (
          <ErrorMessage
            title="ไม่สามารถโหลดยอดกระเป๋าเงินได้"
            message="การดึงสถานะ Ledger ผิดพลาด หรือเซสชันหมดอายุ กรุณาลองใหม่อีกครั้ง"
            onRetry={refetchBalance}
          />
        )}

        {balance && !isBalanceLoading && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {accountKeys.map((key) => {
                const meta = ACCOUNT_META[key] ?? {
                  label: key,
                  accent: 'border-l-white/20 text-iris-pearl',
                  hint: 'ยอดบัญชีย่อย',
                };
                // Rendered verbatim — decimal string, no Number()/math.
                const value = balance.accounts[key];
                return (
                  <GlassCard key={key} className={`p-5 border-l-2 ${meta.accent.split(' ')[0]}`}>
                    <p className="text-[10px] text-iris-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                      {meta.label}
                      <span className="cursor-help" title={meta.hint}>
                        <HelpCircle className="h-3 w-3 text-iris-muted hover:text-white" />
                      </span>
                    </p>
                    <p className={`font-mono font-bold text-2xl mt-1.5 ${meta.accent.split(' ')[1]}`}>
                      {value}
                      <span className="text-xs ml-1 text-iris-muted">{balance.currency}</span>
                    </p>
                    <p className="text-[9px] text-iris-muted mt-2">{meta.hint}</p>
                  </GlassCard>
                );
              })}
            </div>

            <GlassCard variant="gold" className="p-5 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-bold text-iris-gold uppercase tracking-wider">ยอดรวมทั้งหมด (Total)</h4>
                <p className="text-xs text-iris-muted mt-0.5">ผลรวมที่คำนวณโดยระบบหลังบ้าน</p>
              </div>
              {/* total is a backend decimal string — shown as-is. */}
              <p className="font-mono font-black text-2xl text-gradient-gold">
                {balance.total} <span className="text-xs text-iris-gold">{balance.currency}</span>
              </p>
            </GlassCard>
          </>
        )}
      </section>

      {/* -------------------- Top-up start (UI only) -------------------- */}
      <section>
        <GlassCard variant="prism" className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-iris-cyan" />
            <h3 className="font-display text-sm font-bold text-iris-pearl uppercase tracking-wider">เติมเงินเข้ากระเป๋า (Top-up)</h3>
          </div>
          <p className="text-xs text-iris-muted leading-relaxed">
            เลือกจำนวนเหรียญที่ต้องการเติม แล้วไปยังหน้าชำระเงินเพื่อดำเนินการต่อ
            (ส่วนนี้เป็นจุดเริ่มต้น UI — การชำระเงินจริงจะดำเนินการที่หน้าเติมเงิน)
          </p>

          <div className="flex flex-wrap gap-2">
            {TOPUP_PRESETS.map((amount) => (
              <button
                type="button"
                key={amount}
                onClick={() => setTopupPreset(amount)}
                aria-pressed={topupPreset === amount}
                className={`px-4 py-2 rounded-full text-xs font-bold font-mono border transition ${
                  topupPreset === amount
                    ? 'bg-iris-cyan/15 border-iris-cyan/40 text-iris-cyan'
                    : 'bg-black/30 border-white/10 text-iris-muted hover:border-white/20'
                }`}
              >
                +{amount.toLocaleString()} IC
              </button>
            ))}
          </div>

          <Link href="/topup" className="inline-block">
            <Button variant="cyan" leftIcon={<PlusCircle className="h-4 w-4" />} rightIcon={<ArrowRight className="h-4 w-4" />}>
              {topupPreset ? `ดำเนินการเติม ${topupPreset.toLocaleString()} IC ที่หน้าเติมเงิน` : 'ไปหน้าเติมเงิน'}
            </Button>
          </Link>
          {topupPreset && (
            <p className="text-[10px] text-iris-muted">
              เลือกแพ็กเกจ +{topupPreset.toLocaleString()} IC ไว้แล้ว — ระบบชำระเงินจริงจะดำเนินการที่หน้าเติมเงิน
            </p>
          )}
        </GlassCard>
      </section>

      {/* -------------------- Transaction timeline -------------------- */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="eyebrow">Immutable Ledger</span>
            <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">ไทม์ไลน์ธุรกรรม</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetchHistory()} leftIcon={<Clock className="h-3.5 w-3.5" />}>
            รีเฟรช
          </Button>
        </div>

        {isHistoryLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
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
            title="ดึงประวัติธุรกรรมไม่สำเร็จ"
            message="ไม่สามารถเชื่อมต่อกับบัญชีแยกประเภทได้ในขณะนี้"
            onRetry={refetchHistory}
          />
        )}

        {history && !isHistoryLoading && (
          <>
            {history.transactions.length === 0 ? (
              <EmptyState
                title="ยังไม่มีรายการธุรกรรม"
                description="บัญชีนี้ยังไม่มีประวัติเงินเข้าหรือออกในระบบ"
              />
            ) : (
              <ul className="space-y-3">
                {history.transactions.map((tx) => (
                  <li key={tx.id}>
                    <TransactionRow
                      tx={tx}
                      currency={balance?.currency ?? 'IC'}
                      isExpanded={!!expanded[tx.id]}
                      onToggle={() => setExpanded((p) => ({ ...p, [tx.id]: !p[tx.id] }))}
                    />
                  </li>
                ))}
              </ul>
            )}

            {history.pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </Button>
                <span className="text-xs text-iris-muted font-bold font-mono">
                  หน้า {history.pagination.page} จาก {history.pagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= history.pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(history.pagination.totalPages, p + 1))}
                >
                  ถัดไป
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TransactionRow({
  tx,
  currency,
  isExpanded,
  onToggle,
}: {
  tx: LedgerTransaction;
  currency: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isCredit = tx.type.includes('credit') || tx.type.includes('recharge') || tx.type.includes('topup');
  const isHold = tx.type.includes('hold');

  return (
    <GlassCard className={`border transition-all ${isExpanded ? 'border-iris-cyan/30' : 'border-white/5 hover:border-white/10'}`}>
      <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isCredit ? 'success' : isHold ? 'warning' : 'default'}>{tx.type}</Badge>
            <span className="font-mono text-[10px] text-iris-muted bg-black/40 px-2 py-0.5 rounded">
              ID: {tx.id.substring(0, 8)}…
            </span>
          </div>
          <p className="text-sm font-bold text-iris-pearl mt-1">{tx.description || 'Ledger entry'}</p>
          <p className="text-[10px] text-iris-muted flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(tx.createdAt).toLocaleString('th-TH')}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition shrink-0"
          aria-label="แสดงรายละเอียดบัญชีสองด้าน"
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="bg-black/50 border-t border-white/5 px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] font-bold text-iris-cyan uppercase tracking-wider">รายการบัญชีสองด้าน (Entries)</h4>
            <span className="font-mono text-[9px] text-iris-muted truncate max-w-[50%]" title={tx.idempotencyKey}>
              Idempotency: {tx.idempotencyKey}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-iris-muted text-[10px]">
                  <th className="pb-2">Account / Type</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody>
                {tx.entries.map((entry) => {
                  // amount/balanceAfter are decimal strings — display verbatim,
                  // sign read from the leading '-' only (no numeric coercion).
                  const isNegative = entry.amount.trim().startsWith('-');
                  return (
                    <tr key={entry.id} className="border-b border-white/5">
                      <td className="py-2.5">
                        <p className="text-iris-pearl text-[11px] truncate max-w-xs md:max-w-md" title={entry.account.key}>
                          {entry.account.key}
                        </p>
                        <span className="text-[9px] bg-white/5 text-iris-muted px-1.5 py-0.5 rounded uppercase">
                          {entry.account.type}
                        </span>
                      </td>
                      <td className={`py-2.5 text-right font-bold ${isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {entry.amount} {entry.account.currency}
                      </td>
                      <td className="py-2.5 text-right text-iris-muted">
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
    </GlassCard>
  );
}
