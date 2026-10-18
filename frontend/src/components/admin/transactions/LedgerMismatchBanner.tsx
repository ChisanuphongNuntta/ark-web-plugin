'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { hydrateLedgerAlert, useLedgerAlert } from '@/lib/realtime/ledgerAlertStore';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';

/**
 * Persistent warning shown on every admin page after 'admin:ledger:mismatch'
 * (the web process reconciles the ledger every 15 min). Root gets a link to the
 * reconcile view; admins are asked to tell root. Stays until hidden or until a
 * clean reconcile clears it; the next mismatch event shows it again.
 */
export function LedgerMismatchBanner() {
  const { isAdmin, isRoot } = usePermissions();
  const alert = useLedgerAlert((s) => s.alert);
  const dismiss = useLedgerAlert((s) => s.dismiss);

  React.useEffect(() => {
    hydrateLedgerAlert();
  }, []);

  if (!isAdmin || !alert || alert.dismissed) return null;

  const parts: string[] = [];
  if (alert.mismatchCount != null) parts.push(`บัญชีไม่ตรง ${alert.mismatchCount.toLocaleString('th-TH')} บัญชี`);
  if (alert.legacyCount != null && alert.legacyCount > 0) {
    parts.push(`ยอดระบบเดิมไม่ตรง ${alert.legacyCount.toLocaleString('th-TH')} บัญชี`);
  }
  if (alert.unbalancedCount != null && alert.unbalancedCount > 0) {
    parts.push(`ธุรกรรมไม่สมดุล ${alert.unbalancedCount.toLocaleString('th-TH')} รายการ`);
  }

  return (
    // Not the frame's last child, so `.frozen-page-admin > div:last-child` still targets the page.
    <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-8">
      <div
        role="alert"
        className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200/25 bg-amber-200/[0.06] px-4 py-3 text-sm"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-iris-pearl">ยอดเงินในบัญชีไม่ตรงกับสมุดบัญชี (ledger)</p>
            <p className="text-iris-muted">
              ตรวจพบเมื่อ {formatBangkokDateTime(alert.at)}
              {parts.length > 0 && ` · ${parts.join(' · ')}`}
              {isRoot ? '' : ' · โปรดแจ้งผู้ดูแลสูงสุด (Root) ให้ตรวจสอบ'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isRoot && (
            <Link href="/admin/transactions/reconcile" className="btn-secondary min-h-9 px-3.5 py-1.5 text-xs">
              ตรวจสอบยอด
            </Link>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2 py-1 text-xs text-iris-muted hover:bg-white/[0.05] hover:text-iris-pearl"
          >
            ซ่อน
          </button>
        </div>
      </div>
    </div>
  );
}
