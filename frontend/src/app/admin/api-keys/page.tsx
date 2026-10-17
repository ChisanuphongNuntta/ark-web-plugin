'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import {
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
  AdminButton,
  ConfirmDialog,
  Pagination,
  StatusBadge,
  formatCount,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store';
import { adminApi, type AdminApiKeyRow } from '@/lib/api';

const COLS = 7;

function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; error?: string } } } | null;
  return e?.response?.data?.message || e?.response?.data?.error || fallback;
}

function formatDateTime(iso: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    : d.toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

/** Error bodies of blob downloads arrive as a Blob; read the JSON message out of it. */
async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string; error?: string };
      return parsed.message || parsed.error || fallback;
    } catch {
      return fallback;
    }
  }
  return errorMessage(error, fallback);
}

function ApiKeysAdmin() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageApiKeys } = usePermissions();
  const isRoot = user?.role === 'root';

  const list = usePaginatedQuery({
    key: 'admin-api-keys',
    fetcher: adminApi.getApiKeysPage,
    enabled: !authLoading && canManageApiKeys,
  });

  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [resetting, setResetting] = useState<AdminApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState<AdminApiKeyRow | null>(null);

  const confirmResetIp = async () => {
    if (!resetting) return;
    await adminApi.resetApiKeyIp(resetting.id);
    setNotice({ tone: 'success', text: `รีเซ็ต IP ของ ${resetting.discordUsername || resetting.discordId} แล้ว` });
    await list.invalidate();
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    await adminApi.revokeApiKey(revoking.id);
    setNotice({ tone: 'success', text: `ยกเลิก API key ของ ${revoking.discordUsername || revoking.discordId} แล้ว` });
    await list.invalidate();
  };

  const download = useMutation({
    mutationFn: (userId: string) => adminApi.downloadPlugin(userId),
    onSuccess: (response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition: unknown = response.headers['content-disposition'];
      let fileName = 'HeartShop_Plugin.zip';
      if (typeof disposition === 'string') {
        const match = disposition.match(/filename="(.+)"/);
        if (match && match[1]) fileName = match[1];
      }
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setNotice({ tone: 'success', text: 'เริ่มดาวน์โหลดแพ็กเกจปลั๊กอินแล้ว' });
    },
    onError: async (error) => {
      setNotice({ tone: 'danger', text: await blobErrorMessage(error, 'ดาวน์โหลดไม่สำเร็จ') });
    },
  });

  if (authLoading) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="API KEYS" title="จัดการ API key" description="กำลังตรวจสอบสิทธิ์…" />
      </AdminPage>
    );
  }

  if (!canManageApiKeys) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="API KEYS" title="จัดการ API key" />
        <AdminNotice tone="danger" title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
          เฉพาะ Server Admin และ Root เท่านั้น
        </AdminNotice>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="API KEYS"
        title="จัดการ API key"
        description={
          list.pagination.total > 0
            ? `API key ของผู้ใช้ที่ผูกกับปลั๊กอิน ทั้งหมด ${formatCount(list.pagination.total)} รายการ`
            : 'API key ของผู้ใช้ที่ผูกกับปลั๊กอิน'
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อ Discord, Steam ID หรือเซิร์ฟเวอร์…" />

        <AdminTable caption="รายการ API key" busy={list.isFetching} minWidth={980}>
          <AdminTableHead>
            <tr>
              <AdminTh>ผู้ใช้</AdminTh>
              <AdminTh>API key</AdminTh>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh>IP ที่ลงทะเบียน</AdminTh>
              <AdminTh>ใช้งานล่าสุด</AdminTh>
              <AdminTh>สร้างเมื่อ</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? errorMessage(list.error, 'โหลดรายการ API key ไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบ API key ที่ตรงกับคำค้น' : 'ยังไม่มี API key'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างคำค้น
                </AdminButton>
              ) : undefined
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((k) => {
              const name = k.discordUsername || 'ไม่ทราบชื่อ';
              const downloadingThis = download.isPending && download.variables === k.id;
              return (
                <AdminTr key={k.id}>
                  <AdminTd>
                    <div className="flex items-center gap-3">
                      {k.discordAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={k.discordAvatar} alt="" className="h-9 w-9 shrink-0 rounded-full border border-white/10" />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-iris-river/40" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{name}</span>
                          {k.isBanned && <StatusBadge tone="danger">ถูกแบน</StatusBadge>}
                        </div>
                        <div className="truncate font-mono text-xs text-iris-muted">{k.steamId || 'ไม่มี Steam ID'}</div>
                      </div>
                    </div>
                  </AdminTd>
                  <AdminTd mono muted nowrap>
                    {k.apiKey || '—'}
                  </AdminTd>
                  <AdminTd>
                    {k.apiKeyServerName ? (
                      <>
                        <div className="flex items-center gap-2">
                          <StatusBadge tone="success" dot>
                            เชื่อมต่อแล้ว
                          </StatusBadge>
                          <span className="font-semibold">{k.apiKeyServerName}</span>
                        </div>
                        <div className="text-xs text-iris-muted">
                          {k.apiKeyServerMap || '—'}
                          {k.apiKeyServerPort ? ` · พอร์ต ${k.apiKeyServerPort}` : ''}
                        </div>
                      </>
                    ) : (
                      <StatusBadge tone="neutral">ยังไม่เชื่อมต่อ</StatusBadge>
                    )}
                  </AdminTd>
                  <AdminTd mono nowrap muted={!k.apiKeyIp}>
                    {k.apiKeyIp || 'รอการเชื่อมต่อ'}
                  </AdminTd>
                  <AdminTd nowrap muted>
                    {formatDateTime(k.apiKeyLastUsed)}
                  </AdminTd>
                  <AdminTd nowrap muted>
                    {formatDateTime(k.apiKeyCreatedAt, false)}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    {isRoot && (
                      <AdminIconButton
                        aria-label={`ดาวน์โหลดแพ็กเกจปลั๊กอินของ ${name}`}
                        title="ดาวน์โหลดแพ็กเกจปลั๊กอิน"
                        onClick={() => download.mutate(k.id)}
                        disabled={download.isPending}
                        aria-busy={downloadingThis || undefined}
                      >
                        <Download />
                      </AdminIconButton>
                    )}
                    <AdminIconButton
                      aria-label={`รีเซ็ต IP ของ ${name}`}
                      title="รีเซ็ต IP"
                      onClick={() => setResetting(k)}
                      disabled={!k.apiKeyIp}
                    >
                      <RefreshCw />
                    </AdminIconButton>
                    <AdminIconButton
                      tone="danger"
                      aria-label={`ยกเลิก API key ของ ${name}`}
                      title="ยกเลิก API key"
                      onClick={() => setRevoking(k)}
                    >
                      <Trash2 />
                    </AdminIconButton>
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminTable>

        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <ConfirmDialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        onConfirm={confirmResetIp}
        tone="default"
        title="รีเซ็ต IP?"
        description={
          resetting
            ? `ล้าง IP ที่ลงทะเบียนของ ${resetting.discordUsername || resetting.discordId} ปลั๊กอินจะลงทะเบียน IP ใหม่เมื่อเชื่อมต่อครั้งถัดไป`
            : undefined
        }
        confirmText="รีเซ็ต IP"
      />

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={confirmRevoke}
        title="ยกเลิก API key?"
        description={
          revoking
            ? `ปลั๊กอินที่ใช้คีย์ของ ${revoking.discordUsername || revoking.discordId} จะใช้งานไม่ได้ทันที การยกเลิกไม่สามารถย้อนกลับได้`
            : undefined
        }
        confirmText="ยกเลิกคีย์"
      />
    </AdminPage>
  );
}

export default function AdminApiKeysPage() {
  return (
    <AdminSuspense>
      <ApiKeysAdmin />
    </AdminSuspense>
  );
}
