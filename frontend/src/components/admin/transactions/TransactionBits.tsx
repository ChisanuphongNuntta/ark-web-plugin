'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/admin';
import { cn } from '@/lib/utils';
import {
  CATEGORY_TONE,
  amountSign,
  formatIc,
  referenceTypeLabel,
  resolveAdminLink,
  transactionCategory,
  type TransactionCategory,
} from '@/lib/adminTransactionsMath';

/** Signed IC amount: credit token for money in, debit token for money out, mono digits. */
export function TransactionAmount({
  value,
  signed = true,
  className,
  unit = false,
}: {
  value: string | null | undefined;
  signed?: boolean;
  className?: string;
  unit?: boolean;
}) {
  const sign = amountSign(value);
  const label = sign > 0 ? 'เข้า' : sign < 0 ? 'ออก' : '';
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        sign > 0 ? 'text-iris-credit' : sign < 0 ? 'text-iris-debit' : 'text-iris-muted',
        className,
      )}
    >
      {label && <span className="sr-only">{label} </span>}
      {formatIc(value, { signed })}
      {unit && value != null && <span className="ml-1 text-[11px] text-iris-muted">IC</span>}
    </span>
  );
}

/** Plain IC number (balances): pearl, mono. */
export function IcNumber({ value, className }: { value: string | null | undefined; className?: string }) {
  return <span className={cn('font-mono tabular-nums text-iris-pearl', className)}>{formatIc(value)}</span>;
}

export function TransactionTypeBadge({ type, label, category }: { type: string; label: string; category?: TransactionCategory }) {
  const tone = CATEGORY_TONE[transactionCategory(type, category)];
  return (
    <StatusBadge tone={tone} title={type}>
      {label}
    </StatusBadge>
  );
}

/** Reference cell: admin link when the server provided one, otherwise the reference id as text. */
export function TransactionReference({
  referenceType,
  referenceId,
  referenceLink,
  compact = false,
}: {
  referenceType: string | null;
  referenceId: string | null;
  referenceLink: string | null;
  compact?: boolean;
}) {
  if (!referenceType && !referenceId) return <span className="text-iris-muted">—</span>;
  const href = resolveAdminLink(referenceLink);
  const shortId = referenceId ? (referenceId.length > 14 && compact ? `${referenceId.slice(0, 12)}…` : referenceId) : '';
  const content = (
    <>
      <span className="text-iris-muted">{referenceTypeLabel(referenceType)}</span>
      {shortId && <span className="ml-1 font-mono text-xs">{shortId}</span>}
    </>
  );
  if (!href) return <span title={referenceId ?? undefined}>{content}</span>;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded text-iris-pearl hover:text-iris-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40"
      title={referenceId ?? undefined}
    >
      {content}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Small stat tile for the summary strip. */
export function SummaryTile({
  label,
  value,
  count,
  signed = false,
  loading = false,
}: {
  label: string;
  value: string | null | undefined;
  count?: number | null;
  signed?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <p className="truncate text-xs text-iris-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">
        {loading ? (
          <span className="text-iris-muted">…</span>
        ) : signed ? (
          <TransactionAmount value={value} />
        ) : (
          <IcNumber value={value} />
        )}
      </p>
      <p className="text-[11px] text-iris-muted">
        {loading || count == null ? ' ' : `${count.toLocaleString('th-TH')} รายการ`}
      </p>
    </div>
  );
}
