'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Copy, Filter, Loader2 } from 'lucide-react';
import { ExternalLink } from '@/components/tek/arrows';
import {
  AdminButton,
  AdminDialog,
  AdminNotice,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
  StatusBadge,
} from '@/components/admin';
import { adminTransactionsApi, transactionsErrorText, type AdminTransactionRow, type RelatedRef } from '@/lib/adminTransactionsApi';
import { accountTypeLabel, formatBangkokDateTime, referenceTypeLabel, resolveAdminLink } from '@/lib/adminTransactionsMath';
import { IcNumber, TransactionAmount, TransactionReference, TransactionTypeBadge } from './TransactionBits';

const RELATED_LABEL: Record<string, string> = {
  order: 'คำสั่งซื้อ',
  checkout: 'ตะกร้า',
  quote: 'ใบเสนอราคาในเกม',
  payment: 'การชำระเงิน',
  listing: 'ประกาศขายไดโน',
  delivery: 'การส่งของเข้าเกม',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-iris-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-iris-pearl">{children}</dd>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        );
      }}
      aria-label={label}
      className="ml-1 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl"
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {copied ? 'คัดลอกแล้ว' : null}
    </button>
  );
}

function RelatedItem({ item }: { item: RelatedRef }) {
  const href = resolveAdminLink(item.link);
  const title = RELATED_LABEL[item.kind] ?? referenceTypeLabel(item.kind);
  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-iris-pearl">{title}</span>
        <span className="block truncate font-mono text-[11px] text-iris-muted">{item.id}</span>
        {item.label && <span className="block truncate text-xs text-iris-muted">{item.label}</span>}
        {item.note && <span className="block break-words text-[11px] text-iris-muted">{item.note}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {item.status && <StatusBadge tone="neutral">{item.status}</StatusBadge>}
        {item.amount && <IcNumber value={item.amount} className="text-xs" />}
      </span>
    </>
  );
  const cls = 'flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3';
  if (!href) return <li className={cls}>{body}</li>;
  return (
    <li>
      <Link href={href} className={`${cls} transition-colors hover:border-iris-cyan/30 hover:bg-white/[0.05]`}>
        {body}
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-iris-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

export interface TransactionDetailDrawerProps {
  /** The row that was clicked (shown immediately while the detail loads). */
  row: AdminTransactionRow | null;
  onClose: () => void;
  /** Filter the table to this customer. */
  onFilterUser?: (userId: string) => void;
}

/** Side drawer with every LedgerEntry, the metadata and related order / payment / delivery links. */
export function TransactionDetailDrawer({ row, onClose, onFilterUser }: TransactionDetailDrawerProps) {
  const id = row?.id ?? '';
  const q = useQuery({
    queryKey: ['admin-transaction-detail', id],
    queryFn: ({ signal }) => adminTransactionsApi.getDetail(id, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
    // Live rows arrive right after commit; allow a couple of retries in case a replica lags.
    retry: row?.live ? 3 : 1,
    retryDelay: 1500,
  });
  const d = q.data;
  const base = d ?? row;

  const metadataText = React.useMemo(() => {
    if (!d || d.metadata === null || d.metadata === undefined) return null;
    try {
      return JSON.stringify(d.metadata, null, 2);
    } catch {
      return String(d.metadata);
    }
  }, [d]);

  return (
    <AdminDialog
      open={row !== null}
      onClose={onClose}
      placement="right"
      size="lg"
      title="รายละเอียดธุรกรรม"
      description={base ? <span className="font-mono text-xs">{base.id}</span> : undefined}
      footer={
        <>
          {base?.user && onFilterUser && (
            <AdminButton variant="secondary" size="sm" icon={<Filter />} onClick={() => onFilterUser(base.user!.id)}>
              ดูธุรกรรมทั้งหมดของลูกค้านี้
            </AdminButton>
          )}
          <AdminButton variant="ghost" size="sm" onClick={onClose}>
            ปิด
          </AdminButton>
        </>
      }
    >
      {base && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="space-y-1.5">
              <TransactionTypeBadge type={base.type} label={base.typeLabelTh} category={base.category} />
              <p className="text-xs text-iris-muted">{formatBangkokDateTime(base.postedAt ?? base.createdAt)} (เวลาไทย)</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-iris-muted">ยอดฝั่งลูกค้า</p>
              <p className="text-2xl font-semibold">
                <TransactionAmount value={base.amount} unit />
              </p>
              {base.balanceAfter && (
                <p className="text-xs text-iris-muted">
                  คงเหลือหลังรายการ <IcNumber value={base.balanceAfter} className="text-xs" /> IC
                </p>
              )}
              {base.refundableAfter && (
                <p className="text-xs text-iris-muted">
                  ยอดคืนเงิน (refundable) หลังรายการ <IcNumber value={base.refundableAfter} className="text-xs" /> IC
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="ลูกค้า">
              {base.user ? (
                <>
                  {base.user.name ?? 'ไม่มีชื่อ'}
                  <span className="block font-mono text-[11px] text-iris-muted">
                    {base.user.steamId ? `Steam ${base.user.steamId}` : base.user.id}
                  </span>
                </>
              ) : (
                <span className="text-iris-muted">ไม่มี (รายการของระบบ)</span>
              )}
            </Field>
            <Field label="ทำรายการโดย">
              {base.createdBy ? base.createdBy.name ?? base.createdBy.id : <span className="text-iris-muted">ระบบอัตโนมัติ</span>}
            </Field>
            <Field label="อ้างอิง">
              <TransactionReference
                referenceType={base.referenceType}
                referenceId={base.referenceId}
                referenceLink={base.referenceLink}
              />
              {base.referenceId && <CopyButton value={base.referenceId} label="คัดลอกรหัสอ้างอิง" />}
            </Field>
            <Field label="รหัสธุรกรรม">
              <span className="font-mono text-xs">{base.id}</span>
              <CopyButton value={base.id} label="คัดลอกรหัสธุรกรรม" />
            </Field>
            <Field label="บันทึกเมื่อ">{formatBangkokDateTime(base.createdAt)}</Field>
            <Field label="ลงบัญชีเมื่อ">{formatBangkokDateTime(base.postedAt)}</Field>
            {base.description && (
              <div className="sm:col-span-2">
                <Field label="คำอธิบาย">{base.description}</Field>
              </div>
            )}
            {d?.idempotencyKey && (
              <div className="sm:col-span-2">
                <Field label="Idempotency key">
                  <span className="font-mono text-xs text-iris-muted">{d.idempotencyKey}</span>
                </Field>
              </div>
            )}
          </dl>

          {d?.balanced === false && (
            <AdminNotice tone="danger" title="ธุรกรรมนี้ไม่สมดุล">
              ผลรวมรายการบัญชีไม่เท่ากับศูนย์ โปรดแจ้งผู้ดูแลสูงสุดให้ตรวจสอบยอดบัญชี
            </AdminNotice>
          )}

          {q.isError && (
            <AdminNotice tone="danger" title="โหลดรายละเอียดไม่สำเร็จ">
              {transactionsErrorText(q.error, 'โปรดลองอีกครั้ง')}
            </AdminNotice>
          )}

          <section aria-labelledby="txn-entries-heading" className="space-y-2">
            <h3 id="txn-entries-heading" className="text-sm font-semibold text-iris-pearl">
              รายการบัญชี (Ledger entries)
              {d && <span className="ml-2 text-xs font-normal text-iris-muted">{d.entries.length} รายการ</span>}
            </h3>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <AdminTable caption="รายการบัญชีของธุรกรรมนี้" maxHeight="none" minWidth={520}>
                <AdminTableHead>
                  <tr>
                    <AdminTh>บัญชี</AdminTh>
                    <AdminTh>เจ้าของ</AdminTh>
                    <AdminTh align="right">จำนวน</AdminTh>
                    <AdminTh align="right">คงเหลือหลังรายการ</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody
                  colSpan={4}
                  isInitialLoading={q.isLoading}
                  isError={q.isError && !d}
                  onRetry={() => void q.refetch()}
                  isEmpty={Boolean(d) && d!.entries.length === 0}
                  emptyTitle="ไม่มีรายการบัญชี"
                  skeletonRows={2}
                >
                  {d?.entries.map((e) => (
                    <AdminTr key={e.id}>
                      <AdminTd>
                        <div className="text-sm">{e.accountLabelTh ?? accountTypeLabel(e.accountType)}</div>
                        {e.accountKey && <div className="font-mono text-[11px] text-iris-muted">{e.accountKey}</div>}
                      </AdminTd>
                      <AdminTd muted={!e.owner}>
                        {e.owner ? (
                          <>
                            <div>{e.owner.name ?? 'ไม่มีชื่อ'}</div>
                            <div className="font-mono text-[11px] text-iris-muted">{e.owner.steamId ?? e.owner.id.slice(0, 12)}</div>
                          </>
                        ) : (
                          'ระบบ'
                        )}
                      </AdminTd>
                      <AdminTd align="right" nowrap>
                        <TransactionAmount value={e.amount} />
                      </AdminTd>
                      <AdminTd align="right" nowrap>
                        <IcNumber value={e.balanceAfter} />
                      </AdminTd>
                    </AdminTr>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </div>
          </section>

          {d && d.related.length > 0 && (
            <section aria-labelledby="txn-related-heading" className="space-y-2">
              <h3 id="txn-related-heading" className="text-sm font-semibold text-iris-pearl">
                รายการที่เกี่ยวข้อง
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {d.related.map((r) => (
                  <RelatedItem key={`${r.kind}:${r.id}`} item={r} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="txn-meta-heading" className="space-y-2">
            <h3 id="txn-meta-heading" className="text-sm font-semibold text-iris-pearl">
              ข้อมูลเพิ่มเติม (metadata)
            </h3>
            {q.isLoading ? (
              <p className="flex items-center gap-2 text-xs text-iris-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                กำลังโหลด…
              </p>
            ) : metadataText ? (
              <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-iris-midnight/60 p-3 font-mono text-[11px] leading-relaxed text-iris-muted">
                {metadataText}
              </pre>
            ) : (
              <p className="text-xs text-iris-muted">ไม่มีข้อมูลเพิ่มเติม</p>
            )}
          </section>
        </div>
      )}
    </AdminDialog>
  );
}
