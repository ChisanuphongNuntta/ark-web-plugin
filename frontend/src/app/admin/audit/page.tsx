'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  Button,
  Drawer,
  ErrorMessage,
  Input,
  PageHeader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
} from '@/components/ui';
import {
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_OPTIONS,
  AUDIT_ACTION_LABEL,
  AdminNoAccess,
  AdminToolbar,
  CodeBlock,
  DetailList,
  DrawerSection,
  MonoId,
  StatusBadge,
  adminKeys,
  auditActor,
  errorText,
  formatDateTime,
  prettyJson,
  type AuditRowFull,
} from '@/components/admin';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePermissions } from '@/hooks/usePermissions';
import { adminConsoleApi } from '@/lib/contracts/console';

export default function AdminAuditPage() {
  const { canViewOperations } = usePermissions();
  if (!canViewOperations) return <AdminNoAccess />;
  return <AuditScreen />;
}

function AuditScreen() {
  const [actionInput, setActionInput] = React.useState('');
  const [actorInput, setActorInput] = React.useState('');
  const [page, setPage] = React.useState(1);
  const action = useDebouncedValue(actionInput.trim(), 300);
  const actorId = useDebouncedValue(actorInput.trim(), 300);
  const [selected, setSelected] = React.useState<AuditRowFull | null>(null);

  const query = { action: action || undefined, actorId: actorId || undefined, page, pageSize: ADMIN_PAGE_SIZE };
  const list = useQuery({
    queryKey: adminKeys.audit(query),
    queryFn: () => adminConsoleApi.listAuditLogs(query),
    placeholderData: keepPreviousData,
    ...ADMIN_QUERY_OPTIONS,
  });
  const rows = (list.data?.items ?? []) as AuditRowFull[];
  const filtered = !!action || !!actorId;
  const listId = React.useId();

  return (
    <div>
      <PageHeader
        title="บันทึกการใช้งาน"
        description="ทุกการเปลี่ยนแปลงที่ผู้ดูแลทำผ่านคอนโซล เรียงจากล่าสุด ใช้ตรวจย้อนหลังว่าใครเปลี่ยนอะไรเมื่อไร"
      />

      <AdminToolbar
        actions={
          filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionInput('');
                setActorInput('');
                setPage(1);
              }}
            >
              ล้างตัวกรอง
            </Button>
          ) : null
        }
      >
        <Input
          label="การกระทำ"
          placeholder="เช่น delivery_retry"
          mono
          list={listId}
          value={actionInput}
          onChange={(e) => {
            setActionInput(e.target.value);
            setPage(1);
          }}
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
          wrapperClassName="w-60"
        />
        <datalist id={listId}>
          {Object.entries(AUDIT_ACTION_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </datalist>
        <Input
          label="ผู้ดำเนินการ (User ID)"
          placeholder="UUID ของผู้ดูแล"
          mono
          value={actorInput}
          onChange={(e) => {
            setActorInput(e.target.value);
            setPage(1);
          }}
          wrapperClassName="w-72 max-w-full"
        />
      </AdminToolbar>

      {list.isError ? (
        <ErrorMessage message={errorText(list.error, 'โหลดบันทึกไม่สำเร็จ')} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <TableContainer aria-busy={list.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>เวลา</TableHeaderCell>
                  <TableHeaderCell>การกระทำ</TableHeaderCell>
                  <TableHeaderCell>สิ่งที่เปลี่ยน</TableHeaderCell>
                  <TableHeaderCell>ผู้ดำเนินการ</TableHeaderCell>
                  <TableHeaderCell>IP</TableHeaderCell>
                  <TableHeaderCell>ผล</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.isLoading ? (
                  <TableLoadingRows columns={6} />
                ) : !rows.length ? (
                  <TableEmptyRow
                    colSpan={6}
                    title={filtered ? 'ไม่พบบันทึกที่ตรงกับตัวกรอง' : 'ยังไม่มีบันทึก'}
                    description={filtered ? 'ตรวจรหัสการกระทำหรือ User ID อีกครั้ง' : 'การแก้ไขผ่านคอนโซลจะถูกบันทึกไว้ที่นี่'}
                  />
                ) : (
                  rows.map((r) => {
                    const actor = auditActor(r);
                    return (
                      <TableRow key={r.id} interactive selected={selected?.id === r.id} onClick={() => setSelected(r)}>
                        <TableCell muted className="whitespace-nowrap text-xs">
                          <button
                            type="button"
                            className="rounded-[4px] text-left hover:text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(r);
                            }}
                            aria-label={`ดูรายละเอียดบันทึก ${AUDIT_ACTION_LABEL[r.action] ?? r.action}`}
                          >
                            {formatDateTime(r.createdAt)}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[14rem]">
                          <span className="block truncate">{AUDIT_ACTION_LABEL[r.action] ?? r.action}</span>
                          {AUDIT_ACTION_LABEL[r.action] ? (
                            <span className="block truncate font-mono text-xs text-fg-subtle">{r.action}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          <span className="block truncate text-fg-muted">{r.resource}</span>
                          {r.resourceId ? <MonoId value={r.resourceId} className="text-xs text-fg-subtle" /> : null}
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          {actor.label ? <span className="block truncate">{actor.label}</span> : null}
                          <MonoId value={actor.id} className={actor.label ? 'text-xs text-fg-subtle' : undefined} />
                        </TableCell>
                        <TableCell mono muted className="whitespace-nowrap">
                          {r.ipAddress ?? '—'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="audit" status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination className="mt-4" page={page} pageSize={ADMIN_PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        size="lg"
        title={selected ? AUDIT_ACTION_LABEL[selected.action] ?? selected.action : 'รายละเอียดบันทึก'}
        description={selected ? formatDateTime(selected.createdAt, true) : undefined}
      >
        {selected ? <AuditDetail row={selected} /> : null}
      </Drawer>
    </div>
  );
}

function AuditDetail({ row }: { row: AuditRowFull }) {
  const actor = auditActor(row);
  const oldValue = prettyJson(row.oldValue);
  const newValue = prettyJson(row.newValue);
  const metadata = prettyJson(row.metadata);
  return (
    <>
      <DrawerSection title="สรุป">
        <DetailList
          items={[
            { label: 'การกระทำ', value: row.action, mono: true },
            { label: 'ผล', value: <StatusBadge kind="audit" status={row.status} /> },
            { label: 'ทรัพยากร', value: row.resource, mono: true },
            { label: 'รหัสทรัพยากร', value: row.resourceId, mono: true },
            { label: 'ผู้ดำเนินการ', value: actor.label },
            { label: 'User ID', value: actor.id, mono: true },
            { label: 'IP', value: row.ipAddress, mono: true },
            { label: 'รหัสบันทึก', value: row.id, mono: true },
            {
              label: 'ข้อผิดพลาด',
              value: row.errorMessage ? <CodeBlock tone="danger">{row.errorMessage}</CodeBlock> : null,
              wide: true,
            },
          ]}
        />
      </DrawerSection>
      {oldValue || newValue ? (
        <DrawerSection title="การเปลี่ยนแปลง">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="mb-1.5 text-xs text-fg-muted">ค่าเดิม</p>
              {oldValue ? <CodeBlock>{oldValue}</CodeBlock> : <p className="text-sm text-fg-subtle">—</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs text-fg-muted">ค่าใหม่</p>
              {newValue ? <CodeBlock>{newValue}</CodeBlock> : <p className="text-sm text-fg-subtle">—</p>}
            </div>
          </div>
        </DrawerSection>
      ) : null}
      {metadata ? (
        <DrawerSection title="ข้อมูลประกอบ">
          <CodeBlock>{metadata}</CodeBlock>
        </DrawerSection>
      ) : null}
    </>
  );
}
