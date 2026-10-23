'use client';

/**
 * /admin/audit — the audit log (admin | root): every audited admin action
 * (refunds, retries, slip approvals, settings, servers, plugin keys, VIP …).
 * GET /admin/audit-logs?action=&resource=&actorId=. Read-only.
 */
import * as React from 'react';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminFilterSelect,
  AdminIconButton,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminSuspense,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminToolbar,
  AdminTr,
  Pagination,
  StatusBadge,
} from '@/components/admin';
import {
  AdminAccessGate,
  CopyValueButton,
  DetailField,
  IgnoredFiltersNotice,
  JsonBlock,
} from '@/components/admin/console/ConsoleBits';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_RESOURCE_LABEL,
  adminConsoleApi,
  apiErrorText,
  shortId,
  type AdminAuditRow,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime, redactSecrets } from '@/lib/adminTransactionsMath';

const LIST_KEY = 'admin-audit';
const COLS = 7;
const FILTER_LABELS: Record<string, string> = { action: 'การกระทำ', resource: 'ประเภทข้อมูล', actorId: 'ผู้ดำเนินการ', status: 'ผลลัพธ์' };
const AUDIT_STATUS = ['success', 'failure'] as const;

function actionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

function AuditDrawer({ row, onClose }: { row: AdminAuditRow | null; onClose: () => void }) {
  return (
    <AdminDialog
      open={row !== null}
      onClose={onClose}
      placement="right"
      size="lg"
      title={row ? actionLabel(row.action) : ''}
      description={row ? `${row.action} · ${formatBangkokDateTime(row.createdAt)}` : undefined}
    >
      {row && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="ผู้ดำเนินการ">
              {row.actorName ?? (row.actorId ? <span className="font-mono text-xs">{row.actorId}</span> : 'ระบบ')}
              {row.actorId && <CopyValueButton value={row.actorId} label="คัดลอกรหัสผู้ดำเนินการ" />}
            </DetailField>
            <DetailField label="ข้อมูลที่ถูกแก้ไข">
              {row.resource ? AUDIT_RESOURCE_LABEL[row.resource] ?? row.resource : '—'}
              {row.resourceId && (
                <span className="block font-mono text-xs text-iris-muted">
                  {row.resourceId}
                  <CopyValueButton value={row.resourceId} label="คัดลอกรหัสข้อมูล" />
                </span>
              )}
            </DetailField>
            <DetailField label="ผลลัพธ์">
              <StatusBadge tone={row.status === 'failure' || row.status === 'failed' ? 'danger' : 'success'} dot>
                {row.status === 'failure' || row.status === 'failed' ? 'ไม่สำเร็จ' : 'สำเร็จ'}
              </StatusBadge>
              {row.errorMessage && <span className="mt-1 block text-xs text-rose-100">{row.errorMessage}</span>}
            </DetailField>
            <DetailField label="IP">{row.ipAddress ?? '—'}</DetailField>
          </dl>
          <JsonBlock label="ค่าเดิม" value={redactSecrets(row.oldValue)} />
          <JsonBlock label="ค่าใหม่" value={redactSecrets(row.newValue)} />
          <JsonBlock label="ข้อมูลเพิ่มเติม" value={redactSecrets(row.metadata)} />
        </div>
      )}
    </AdminDialog>
  );
}

function AuditAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getAuditPage,
    filters: { action: {}, resource: {}, actorId: {}, status: { values: AUDIT_STATUS } },
  });
  const [selected, setSelected] = useState<AdminAuditRow | null>(null);

  // Audited actions usually move money or deliveries: refresh on those admin events.
  useAdminLiveRefresh(['admin:transaction', 'admin:delivery:failed', 'admin:slip:created', 'admin:vip'], [LIST_KEY], {
    debounceMs: 3_000,
  });

  const actionOptions = Object.keys(AUDIT_ACTION_LABEL).map((a) => ({ value: a, label: AUDIT_ACTION_LABEL[a] }));
  if (list.filters.action && !AUDIT_ACTION_LABEL[list.filters.action]) {
    actionOptions.unshift({ value: list.filters.action, label: list.filters.action });
  }
  const resourceOptions = Object.keys(AUDIT_RESOURCE_LABEL).map((r) => ({ value: r, label: AUDIT_RESOURCE_LABEL[r] }));
  if (list.filters.resource && !AUDIT_RESOURCE_LABEL[list.filters.resource]) {
    resourceOptions.unshift({ value: list.filters.resource, label: list.filters.resource });
  }

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="AUDIT LOG"
        title="บันทึกการทำงาน"
        description="ทุกการกระทำของทีมงานที่ระบบบันทึกไว้ เช่น คืนเหรียญ ส่งของใหม่ อนุมัติสลิป ตั้งค่าเว็บ คีย์ปลั๊กอิน และ VIP (อ่านอย่างเดียว)"
      />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาการกระทำ รหัสข้อมูล รหัสผู้ดำเนินการ หรือข้อความ…">
          <AdminFilterSelect
            label="การกระทำ"
            value={list.filters.action}
            onChange={(v) => list.setFilter('action', v)}
            options={actionOptions}
          />
          <AdminFilterSelect
            label="ประเภทข้อมูล"
            value={list.filters.resource}
            onChange={(v) => list.setFilter('resource', v)}
            options={resourceOptions}
          />
          <AdminFilterSelect
            label="ผลลัพธ์"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={[
              { value: 'success', label: 'สำเร็จ' },
              { value: 'failure', label: 'ไม่สำเร็จ' },
            ]}
          />
          {list.filters.actorId && (
            <AdminButton size="sm" variant="ghost" onClick={() => list.setFilter('actorId', '')}>
              ล้างตัวกรองผู้ดำเนินการ
            </AdminButton>
          )}
        </AdminToolbar>
        <IgnoredFiltersNotice names={list.data?.ignoredFilters ?? []} labels={FILTER_LABELS} />

        <AdminTable caption="บันทึกการทำงาน" busy={list.isFetching} minWidth={900}>
          <AdminTableHead>
            <tr>
              <AdminTh>เวลา</AdminTh>
              <AdminTh>การกระทำ</AdminTh>
              <AdminTh>ข้อมูล</AdminTh>
              <AdminTh>ผู้ดำเนินการ</AdminTh>
              <AdminTh>ผล</AdminTh>
              <AdminTh>IP</AdminTh>
              <AdminTh align="right">ดู</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดบันทึกการทำงานไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบบันทึกที่ตรงกับตัวกรอง' : 'ยังไม่มีบันทึก'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((r) => {
              const failed = r.status === 'failure' || r.status === 'failed';
              return (
                <AdminTr key={r.id}>
                  <AdminTd muted nowrap>
                    {formatBangkokDateTime(r.createdAt)}
                  </AdminTd>
                  <AdminTd>
                    <div className="font-semibold">{actionLabel(r.action)}</div>
                    {AUDIT_ACTION_LABEL[r.action] && <div className="font-mono text-[11px] text-iris-muted">{r.action}</div>}
                  </AdminTd>
                  <AdminTd>
                    <div>{r.resource ? AUDIT_RESOURCE_LABEL[r.resource] ?? r.resource : '—'}</div>
                    {r.resourceId && <div className="font-mono text-xs text-iris-muted">{shortId(r.resourceId)}</div>}
                  </AdminTd>
                  <AdminTd>
                    {r.actorId ? (
                      <button
                        type="button"
                        className="text-left text-iris-cyan hover:underline"
                        onClick={() => list.setFilter('actorId', r.actorId!)}
                        title="แสดงเฉพาะของผู้ดำเนินการนี้"
                      >
                        {r.actorName ?? <span className="font-mono text-xs">{shortId(r.actorId)}</span>}
                      </button>
                    ) : (
                      <span className="text-iris-muted">ระบบ</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge tone={failed ? 'danger' : 'success'} dot>
                      {failed ? 'ไม่สำเร็จ' : 'สำเร็จ'}
                    </StatusBadge>
                  </AdminTd>
                  <AdminTd mono muted nowrap>
                    {r.ipAddress ?? '—'}
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminIconButton aria-label={`ดูรายละเอียดบันทึก ${r.id}`} onClick={() => setSelected(r)}>
                      <Eye />
                    </AdminIconButton>
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminTable>
        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <AuditDrawer row={selected} onClose={() => setSelected(null)} />
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <AuditAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
