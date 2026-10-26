'use client';

/**
 * /admin/plugin-keys — HeartShop plugin credentials (ServerCredential), root only.
 *
 *   - list / filter by server and status, search key id or label
 *   - issue a new key for a server, rotate (new secret, old one stops working), revoke with reason
 *   - the secret is shown ONCE in a dialog (copy + warning) and never stored in the browser
 *   - every action is audited server-side (plugin_key_issue / _rotate / _revoke)
 */
import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, Plus, RefreshCw, ShieldOff } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminField,
  AdminFilterSelect,
  AdminIconButton,
  AdminNotice,
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
  ConfirmDialog,
  Pagination,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import { AdminAccessGate, CopyValueButton, IgnoredFiltersNotice } from '@/components/admin/console/ConsoleBits';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { adminApi } from '@/lib/api';
import {
  CREDENTIAL_STATUS_FILTERS,
  adminConsoleApi,
  apiErrorText,
  type AdminCredentialRow,
  type IssuedCredential,
} from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';

const LIST_KEY = 'admin-plugin-keys';
const COLS = 7;

interface ServerChoice {
  id: number;
  name: string;
}

function useAllServers() {
  // Root-only endpoint (this page is root-only), includes inactive / drained servers.
  return useQuery({
    queryKey: ['admin-plugin-key-servers'],
    staleTime: 60_000,
    queryFn: async (): Promise<ServerChoice[]> => {
      const { data } = await adminApi.getServers();
      const rows: unknown = data?.servers ?? data;
      if (!Array.isArray(rows)) return [];
      return rows
        .map((r: { id?: unknown; name?: unknown; displayName?: unknown }) => {
          const id = Number(r.id);
          if (!Number.isInteger(id)) return null;
          const name = typeof r.displayName === 'string' && r.displayName ? `${r.displayName} (${String(r.name)})` : String(r.name ?? `#${id}`);
          return { id, name };
        })
        .filter((x): x is ServerChoice => x !== null);
    },
  });
}

/** The once-only secret. Closing it drops the value from memory. */
function SecretDialog({ issued, onClose }: { issued: (IssuedCredential & { title: string }) | null; onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <AdminDialog
      open={issued !== null}
      onClose={() => {
        if (acknowledged) onClose();
      }}
      role="alertdialog"
      title={issued?.title ?? ''}
      description="คัดลอกค่าด้านล่างไปใส่ในไฟล์ ArkApi/Plugins/HeartShop/config.json ของเซิร์ฟเวอร์นี้ แล้วรีโหลดปลั๊กอิน"
      footer={
        <AdminButton variant="primary" disabled={!acknowledged} onClick={onClose}>
          ปิด (จะไม่แสดงซีเคร็ตนี้อีก)
        </AdminButton>
      }
    >
      {issued && (
        <div className="space-y-4">
          <AdminNotice tone="warning" title="ซีเคร็ตแสดงครั้งเดียวเท่านั้น">
            ระบบเก็บซีเคร็ตแบบเข้ารหัสและจะไม่แสดงซ้ำ ถ้าทำหายต้องหมุนคีย์ใหม่ อย่าส่งในแชทสาธารณะหรือเก็บไว้ในที่ที่คนอื่นเปิดได้
          </AdminNotice>
          <div>
            <p className="mb-1 text-xs text-iris-muted">KeyId</p>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-iris-pearl">{issued.keyId ?? issued.credential?.keyId ?? '—'}</code>
              {(issued.keyId ?? issued.credential?.keyId) && (
                <CopyValueButton value={(issued.keyId ?? issued.credential?.keyId)!} label="คัดลอก KeyId" />
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-iris-muted">ApiKey (ซีเคร็ต HMAC)</p>
            <div className="flex items-center gap-2 rounded-xl border border-amber-200/25 bg-amber-200/[0.05] px-3 py-2">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-iris-pearl">{issued.secret}</code>
              <CopyValueButton value={issued.secret} label="คัดลอกซีเคร็ต" />
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm text-iris-pearl">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-cyan-400"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            ฉันคัดลอกและเก็บซีเคร็ตไว้อย่างปลอดภัยแล้ว
          </label>
        </div>
      )}
    </AdminDialog>
  );
}

function IssueDialog({
  open,
  onClose,
  onIssued,
  servers,
}: {
  open: boolean;
  onClose: () => void;
  onIssued: (issued: IssuedCredential) => void;
  servers: ServerChoice[];
}) {
  const [serverId, setServerId] = useState('');
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const issue = useMutation({
    mutationFn: () => adminConsoleApi.issuePluginKey({ serverId: Number(serverId), ...(label.trim() ? { label: label.trim() } : {}) }),
    onSuccess: (res) => {
      setServerId('');
      setLabel('');
      setTouched(false);
      onIssued(res);
    },
  });
  const serverError = touched && !serverId ? 'เลือกเซิร์ฟเวอร์' : undefined;

  return (
    <AdminDialog
      open={open}
      onClose={() => {
        issue.reset();
        onClose();
      }}
      busy={issue.isPending}
      title="ออกคีย์ปลั๊กอินใหม่"
      description="คีย์ใหม่ใช้ได้ทันทีคู่กับคีย์เดิมของเซิร์ฟเวอร์ (เพิกถอนคีย์เดิมเมื่อเปลี่ยนในเกมเสร็จแล้ว)"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={issue.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton
            variant="primary"
            icon={<KeyRound />}
            loading={issue.isPending}
            onClick={() => {
              setTouched(true);
              if (serverId) issue.mutate();
            }}
          >
            ออกคีย์
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <AdminField label="เซิร์ฟเวอร์" required error={serverError}>
          {(field) => (
            <select {...field} className={adminInputClass} value={serverId} onChange={(e) => setServerId(e.target.value)}>
              <option value="">เลือกเซิร์ฟเวอร์…</option>
              {servers.map((sv) => (
                <option key={sv.id} value={sv.id}>
                  #{sv.id} {sv.name}
                </option>
              ))}
            </select>
          )}
        </AdminField>
        <AdminField label="ป้ายชื่อ (ไม่บังคับ)" hint="เช่น Server1 rotation ต.ค. 2026">
          {(field) => <input {...field} className={adminInputClass} maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />}
        </AdminField>
        {issue.isError && (
          <AdminNotice tone="danger" title="ออกคีย์ไม่สำเร็จ">
            {apiErrorText(issue.error, 'ลองใหม่อีกครั้ง')}
          </AdminNotice>
        )}
      </div>
    </AdminDialog>
  );
}

function PluginKeysAdmin() {
  const list = usePaginatedQuery({
    key: LIST_KEY,
    fetcher: adminConsoleApi.getPluginKeysPage,
    filters: { serverId: {}, status: { values: CREDENTIAL_STATUS_FILTERS } },
  });
  const servers = useAllServers();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issued, setIssuedState] = useState<(IssuedCredential & { title: string }) | null>(null);
  // Remount the secret dialog per issue so the "I saved it" checkbox starts unchecked.
  const [issuedSeq, setIssuedSeq] = useState(0);
  const setIssued = (value: (IssuedCredential & { title: string }) | null) => {
    if (value) setIssuedSeq((n) => n + 1);
    setIssuedState(value);
  };
  const [rotating, setRotating] = useState<AdminCredentialRow | null>(null);
  const [revokePrevious, setRevokePrevious] = useState(false);
  const [revoking, setRevoking] = useState<AdminCredentialRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const rotate = useMutation({
    mutationFn: ({ id, revoke: revokeOld }: { id: string; revoke: boolean }) => adminConsoleApi.rotatePluginKey(id, revokeOld),
    onSuccess: (res, vars) => {
      setIssued({ ...res, title: vars.revoke ? 'หมุนคีย์แล้ว (คีย์เดิมถูกเพิกถอน)' : 'หมุนคีย์แล้ว: คีย์ใหม่' });
      list.invalidate();
    },
  });
  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminConsoleApi.revokePluginKey(id, reason),
    onSuccess: () => list.invalidate(),
  });

  const serverName = (row: AdminCredentialRow) =>
    row.serverName ?? servers.data?.find((sv) => sv.id === row.serverId)?.name ?? (row.serverId ? `#${row.serverId}` : '—');

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="PLUGIN KEYS"
        title="คีย์ปลั๊กอิน HeartShop"
        description="คีย์ HMAC ที่เซิร์ฟเวอร์เกมใช้เชื่อมต่อเกตเวย์ /api/plugin ออก หมุน และเพิกถอนได้ที่นี่ ทุกการกระทำถูกบันทึก (เฉพาะผู้ดูแลสูงสุด)"
        actions={
          <AdminButton variant="primary" icon={<Plus />} onClick={() => setIssueOpen(true)}>
            ออกคีย์ใหม่
          </AdminButton>
        }
      />

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหา KeyId หรือป้ายชื่อ…">
          <AdminFilterSelect
            label="เซิร์ฟเวอร์"
            value={list.filters.serverId}
            onChange={(v) => list.setFilter('serverId', v)}
            options={(servers.data ?? []).map((sv) => ({ value: String(sv.id), label: `#${sv.id} ${sv.name}` }))}
          />
          <AdminFilterSelect
            label="สถานะ"
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
            options={[
              { value: 'active', label: 'ใช้งานอยู่' },
              { value: 'revoked', label: 'เพิกถอนแล้ว' },
            ]}
          />
        </AdminToolbar>
        <IgnoredFiltersNotice names={list.data?.ignoredFilters ?? []} labels={{ serverId: 'เซิร์ฟเวอร์', status: 'สถานะ' }} />

        <AdminTable caption="คีย์ปลั๊กอิน" busy={list.isFetching} minWidth={900}>
          <AdminTableHead>
            <tr>
              <AdminTh>KeyId</AdminTh>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh>ป้ายชื่อ</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>ใช้ล่าสุด</AdminTh>
              <AdminTh>สร้าง / หมุน</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? apiErrorText(list.error, 'โหลดคีย์ปลั๊กอินไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบคีย์ที่ตรงกับตัวกรอง' : 'ยังไม่มีคีย์ปลั๊กอิน'}
            emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((k) => {
              const active = k.status === 'active';
              return (
                <AdminTr key={k.id}>
                  <AdminTd mono nowrap>
                    {k.keyId}
                    <CopyValueButton value={k.keyId} label={`คัดลอก KeyId ${k.keyId}`} />
                  </AdminTd>
                  <AdminTd>{serverName(k)}</AdminTd>
                  <AdminTd muted>{k.label ?? '—'}</AdminTd>
                  <AdminTd>
                    <StatusBadge tone={active ? 'success' : 'danger'} dot>
                      {active ? 'ใช้งานอยู่' : 'เพิกถอนแล้ว'}
                    </StatusBadge>
                    {k.revokedAt && <div className="mt-1 text-xs text-iris-muted">{formatBangkokDateTime(k.revokedAt)}</div>}
                  </AdminTd>
                  <AdminTd muted nowrap>
                    {k.lastUsedAt ? formatBangkokDateTime(k.lastUsedAt) : 'ยังไม่เคยใช้'}
                  </AdminTd>
                  <AdminTd muted nowrap>
                    {formatBangkokDateTime(k.createdAt)}
                    {k.rotatedAt && <div className="text-xs">หมุน {formatBangkokDateTime(k.rotatedAt)}</div>}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    {active ? (
                      <>
                        <AdminIconButton
                          aria-label={`หมุนคีย์ ${k.keyId}`}
                          onClick={() => {
                            setRevokePrevious(false);
                            setRotating(k);
                          }}
                        >
                          <RefreshCw />
                        </AdminIconButton>
                        <AdminIconButton
                          tone="danger"
                          aria-label={`เพิกถอนคีย์ ${k.keyId}`}
                          onClick={() => {
                            setRevokeReason('');
                            revoke.reset();
                            setRevoking(k);
                          }}
                        >
                          <ShieldOff />
                        </AdminIconButton>
                      </>
                    ) : (
                      <span className="text-xs text-iris-muted">—</span>
                    )}
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminTable>
        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <IssueDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        servers={servers.data ?? []}
        onIssued={(res) => {
          setIssueOpen(false);
          setIssued({ ...res, title: 'ออกคีย์ใหม่แล้ว' });
          list.invalidate();
        }}
      />

      <ConfirmDialog
        open={rotating !== null}
        onClose={() => {
          setRotating(null);
          rotate.reset();
        }}
        onConfirm={async () => {
          await rotate.mutateAsync({ id: rotating!.id, revoke: revokePrevious });
        }}
        title="หมุนคีย์นี้?"
        description={
          rotating ? (
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
              <span>
                ระบบจะออกคีย์ใหม่ (KeyId + ซีเคร็ต) ให้ {serverName(rotating)} คีย์เดิม {rotating.keyId} ยังใช้ได้ต่อจนกว่าจะเพิกถอน
                เพื่อให้เปลี่ยน config.json ในเกมได้โดยไม่หลุดการเชื่อมต่อ
              </span>
            </span>
          ) : undefined
        }
        confirmText="หมุนคีย์"
      >
        <label className="flex items-start gap-3 text-sm text-iris-pearl">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-cyan-400"
            checked={revokePrevious}
            onChange={(e) => setRevokePrevious(e.target.checked)}
          />
          <span>
            เพิกถอนคีย์เดิมทันที
            <span className="block text-xs text-iris-muted">เลือกเมื่อสงสัยว่าซีเคร็ตเดิมรั่ว เซิร์ฟเวอร์จะเชื่อมต่อไม่ได้จนกว่าจะใส่คีย์ใหม่</span>
          </span>
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revokeReason.trim().length < 3) throw new Error('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
          await revoke.mutateAsync({ id: revoking!.id, reason: revokeReason.trim() });
        }}
        title="เพิกถอนคีย์นี้?"
        description={
          revoking
            ? `${revoking.keyId} (${serverName(revoking)}) จะใช้เชื่อมต่อไม่ได้อีกและย้อนกลับไม่ได้ พิมพ์ KeyId เพื่อยืนยัน`
            : undefined
        }
        confirmText="เพิกถอนคีย์"
        confirmPhrase={revoking?.keyId}
      >
        <AdminField label="เหตุผล" required>
          {(field) => (
            <input
              {...field}
              className={adminInputClass}
              maxLength={240}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="เช่น ซีเคร็ตรั่ว / ปิดเซิร์ฟเวอร์ถาวร"
            />
          )}
        </AdminField>
      </ConfirmDialog>

      <SecretDialog key={issuedSeq} issued={issued} onClose={() => setIssued(null)} />
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['root']}>
        <PluginKeysAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
