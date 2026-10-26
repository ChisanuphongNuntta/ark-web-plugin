'use client';

/**
 * /admin/transactions/reconcile — root only.
 * Calls GET /api/admin/ledger/reconcile: WalletAccount cached balance and the
 * legacy User.pointsBalance projection vs the sum of LedgerEntry rows.
 */
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { ArrowLeft } from '@/components/tek/arrows';
import {
  AdminButton,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
  StatusBadge,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store';
import { useLedgerAlert } from '@/lib/realtime/ledgerAlertStore';
import { adminTransactionsApi, transactionsErrorText, type ReconcileMismatch } from '@/lib/adminTransactionsApi';
import { formatBangkokDateTime, toAmountString } from '@/lib/adminTransactionsMath';
import { IcNumber, TransactionAmount } from '@/components/admin/transactions/TransactionBits';

/** cached − ledger, computed only when the server did not send it (BigInt, no float math). */
function differenceOf(m: ReconcileMismatch): string | null {
  if (m.difference) return m.difference;
  const a = toAmountString(m.cachedBalance);
  const b = toAmountString(m.ledgerSum);
  if (!a || !b || a.includes('.') || b.includes('.')) return null;
  try {
    return (BigInt(a) - BigInt(b)).toString();
  } catch {
    return null;
  }
}

function MismatchTable({ rows, caption, cachedLabel }: { rows: ReconcileMismatch[]; caption: string; cachedLabel: string }) {
  return (
    <AdminTable caption={caption} maxHeight="min(60vh, 640px)" minWidth={760}>
      <AdminTableHead>
        <tr>
          <AdminTh>ผู้ใช้</AdminTh>
          <AdminTh>บัญชี</AdminTh>
          <AdminTh align="right">{cachedLabel}</AdminTh>
          <AdminTh align="right">ผลรวม ledger</AdminTh>
          <AdminTh align="right">ส่วนต่าง</AdminTh>
          <AdminTh align="right">
            <span className="sr-only">ธุรกรรม</span>
          </AdminTh>
        </tr>
      </AdminTableHead>
      <AdminTableBody colSpan={6} isEmpty={rows.length === 0} emptyTitle="ไม่พบยอดที่ไม่ตรง">
        {rows.map((m, i) => (
          <AdminTr key={`${m.accountId ?? ''}:${m.userId ?? ''}:${i}`}>
            <AdminTd>
              {m.userName ?? (m.userId ? <span className="font-mono text-xs">{m.userId}</span> : <span className="text-iris-muted">บัญชีระบบ</span>)}
            </AdminTd>
            <AdminTd mono muted>
              {m.accountId ?? '—'}
            </AdminTd>
            <AdminTd align="right" nowrap>
              <IcNumber value={m.cachedBalance} />
            </AdminTd>
            <AdminTd align="right" nowrap>
              <IcNumber value={m.ledgerSum} />
            </AdminTd>
            <AdminTd align="right" nowrap>
              <TransactionAmount value={differenceOf(m)} />
            </AdminTd>
            <AdminTd align="right" nowrap>
              {m.userId && (
                <Link
                  href={`/admin/transactions?userId=${encodeURIComponent(m.userId)}`}
                  className="text-xs text-iris-cyan hover:underline"
                >
                  ดูธุรกรรม
                </Link>
              )}
            </AdminTd>
          </AdminTr>
        ))}
      </AdminTableBody>
    </AdminTable>
  );
}

/** The server lists at most 500 rows per section; say so when the count is larger. */
function listNote(shown: number, total: number): string {
  return total > shown ? ` · แสดง ${shown.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} รายการ` : '';
}

function StatTile({ label, value, alert = false }: { label: string; value: number | null; alert?: boolean }) {
  const bad = alert && value != null && value > 0;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <dt className="text-xs text-iris-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-lg font-semibold tabular-nums ${bad ? 'text-iris-debit' : 'text-iris-pearl'}`}>
        {value != null ? value.toLocaleString('th-TH') : '—'}
      </dd>
    </div>
  );
}

export default function LedgerReconcilePage() {
  const authLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const { isRoot } = usePermissions();
  const clearAlert = useLedgerAlert((s) => s.clear);

  const q = useQuery({
    queryKey: ['admin-ledger-reconcile'],
    queryFn: ({ signal }) => adminTransactionsApi.reconcile(signal),
    enabled: isRoot,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // A clean run clears the persistent banner.
  const clean =
    q.data?.ok === true &&
    q.data.mismatchCount === 0 &&
    q.data.legacyPointsMismatchCount === 0 &&
    q.data.unbalancedTransactionCount === 0;
  React.useEffect(() => {
    if (clean) clearAlert();
  }, [clean, clearAlert]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-iris-muted">
        <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" aria-hidden="true" />
        <span className="text-sm">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }
  if (!user || !isRoot) {
    return (
      <AdminPanel className="text-center">
        <div className="py-8">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-200" aria-hidden="true" />
          <p className="text-base font-semibold text-iris-pearl">หน้านี้สำหรับผู้ดูแลสูงสุด (Root) เท่านั้น</p>
        </div>
      </AdminPanel>
    );
  }

  const d = q.data;
  const checkedAt = d?.checkedAt ?? (q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null);

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="LEDGER RECONCILE"
        title="ตรวจสอบยอดบัญชี"
        description="เทียบยอดคงเหลือที่เก็บไว้ (WalletAccount และ User.pointsBalance เดิม) กับผลรวมรายการใน ledger ระบบตรวจอัตโนมัติทุก 15 นาที และแจ้งเตือนเมื่อพบยอดไม่ตรง"
        actions={
          <>
            <Link href="/admin/transactions" className="btn-secondary min-h-9 gap-1.5 px-3.5 py-1.5 text-xs">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              กลับไปหน้าธุรกรรม
            </Link>
            <AdminButton variant="primary" icon={<RefreshCw />} loading={q.isFetching} onClick={() => void q.refetch()}>
              ตรวจสอบตอนนี้
            </AdminButton>
          </>
        }
      />

      {q.isError && (
        <AdminNotice tone="danger" title="ตรวจสอบยอดไม่สำเร็จ">
          {transactionsErrorText(q.error, 'โปรดลองอีกครั้ง')}
        </AdminNotice>
      )}

      <AdminPanel
        title="ผลการตรวจสอบ"
        description={checkedAt ? `ตรวจเมื่อ ${formatBangkokDateTime(checkedAt)} (เวลาไทย)` : 'กำลังตรวจสอบ…'}
        actions={
          d ? (
            clean ? (
              <StatusBadge tone="success" dot>
                ยอดตรงกันทั้งหมด
              </StatusBadge>
            ) : (
              <StatusBadge tone="danger" dot>
                พบยอดไม่ตรง
              </StatusBadge>
            )
          ) : undefined
        }
      >
        {q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-iris-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            กำลังคำนวณผลรวม ledger ของทุกบัญชี อาจใช้เวลาสักครู่…
          </p>
        ) : d ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="บัญชีที่ตรวจ" value={d.checkedAccounts} />
            <StatTile label="ยอดบัญชีไม่ตรง ledger" value={d.mismatchCount} alert />
            <StatTile label="pointsBalance เดิมไม่ตรง ledger" value={d.legacyPointsMismatchCount} alert />
            <StatTile label="ธุรกรรมที่ผลรวมไม่เป็นศูนย์" value={d.unbalancedTransactionCount} alert />
          </dl>
        ) : null}
        {d && d.refundableBalanceCount > 0 && (
          <p className="mt-4 text-sm text-iris-muted">
            มียอดค้างในบัญชีย่อย &quot;ยอดคืนเงิน&quot; (refundable) {d.refundableBalanceCount.toLocaleString('th-TH')} บัญชี
            {d.refundableTotal && (
              <>
                {' '}รวม <IcNumber value={d.refundableTotal} /> IC
              </>
            )}
            {' '}— เป็นการคืนเงินแบบเดิมก่อน ต.ค. 2026 ซึ่งลูกค้ายังนำไปใช้ไม่ได้ ตั้งแต่นโยบายใหม่ การคืนเงินจะเข้ายอดใช้ได้ (available) โดยตรง
          </p>
        )}
        {clean && (
          <p className="mt-4 flex items-center gap-2 text-sm text-iris-muted">
            <CheckCircle2 className="h-4 w-4 text-iris-credit" aria-hidden="true" />
            ยอดคงเหลือทุกบัญชีตรงกับ ledger แล้ว ป้ายเตือนถูกปิดให้อัตโนมัติ
          </p>
        )}
      </AdminPanel>

      {d && d.unbalancedTransactions.length > 0 && (
        <AdminPanel
          flush
          title="ธุรกรรมที่ไม่สมดุล"
          description={`ผลรวมรายการ (entries) ของธุรกรรมต้องเป็นศูนย์เสมอ${listNote(d.unbalancedTransactions.length, d.unbalancedTransactionCount)}`}
        >
          <AdminTable caption="ธุรกรรมที่ผลรวมไม่เป็นศูนย์" maxHeight="min(60vh, 640px)" minWidth={560}>
            <AdminTableHead>
              <tr>
                <AdminTh>รหัสธุรกรรม</AdminTh>
                <AdminTh align="right">ผลรวม entries</AdminTh>
                <AdminTh align="right">
                  <span className="sr-only">ธุรกรรม</span>
                </AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody colSpan={3} isEmpty={false}>
              {d.unbalancedTransactions.map((u) => (
                <AdminTr key={u.transactionId}>
                  <AdminTd mono>{u.transactionId}</AdminTd>
                  <AdminTd align="right" nowrap>
                    <TransactionAmount value={u.sum} />
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <Link
                      href={`/admin/transactions?q=${encodeURIComponent(u.transactionId)}`}
                      className="text-xs text-iris-cyan hover:underline"
                    >
                      ดูธุรกรรม
                    </Link>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTableBody>
          </AdminTable>
        </AdminPanel>
      )}

      {d && d.mismatches.length > 0 && (
        <AdminPanel
          flush
          title="ยอดบัญชี (WalletAccount) ไม่ตรงกับ ledger"
          description={`ส่วนต่าง = ยอดที่เก็บไว้ − ผลรวม ledger${listNote(d.mismatches.length, d.mismatchCount)}`}
        >
          <MismatchTable rows={d.mismatches} caption="บัญชีที่ยอดไม่ตรง" cachedLabel="ยอดที่เก็บไว้" />
        </AdminPanel>
      )}

      {d && d.legacyPointsMismatches.length > 0 && (
        <AdminPanel
          flush
          title="User.pointsBalance (ระบบเดิม) ไม่ตรงกับ ledger"
          description={`ยอดที่ระบบเดิมเขียนตรงโดยไม่ผ่าน ledger ส่วนต่าง = pointsBalance − ผลรวม ledger${listNote(
            d.legacyPointsMismatches.length,
            d.legacyPointsMismatchCount,
          )}`}
        >
          <MismatchTable rows={d.legacyPointsMismatches} caption="ผู้ใช้ที่ pointsBalance ไม่ตรง" cachedLabel="pointsBalance" />
        </AdminPanel>
      )}
    </AdminPage>
  );
}
