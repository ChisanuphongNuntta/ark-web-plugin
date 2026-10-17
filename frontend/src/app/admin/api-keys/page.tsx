'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Drawer,
  ErrorMessage,
  IconButton,
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
  useToast,
} from '@/components/ui';
import { AdminNoAccess, AdminToolbar, DetailList, DrawerSection, formatDateTime } from '@/components/admin';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

interface ApiKeyUser {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  apiKey: string | null;
  apiKeyIp: string | null;
  apiKeyCreatedAt: string | null;
  apiKeyServerId: number | null;
  apiKeyServerName: string | null;
  apiKeyServerMap: string | null;
  apiKeyServerPort: number | null;
  apiKeyLastUsed: string | null;
  isBanned: boolean;
}

interface ApiKeysResponse {
  apiKeys?: ApiKeyUser[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

/** Blob error bodies (download endpoint) need to be read before they can be shown. */
async function blobErrorText(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string; error?: string };
      return parsed.message || parsed.error || fallback;
    } catch {
      return fallback;
    }
  }
  return apiErrorText(err, fallback);
}

function saveBlob(data: BlobPart, contentDisposition: string | undefined, fallbackName: string) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const match = contentDisposition?.match(/filename="?([^";]+)"?/);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', match?.[1] ?? fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function AdminApiKeysPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageApiKeys, isRoot } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [searchInput, setSearchInput] = React.useState('');
  const search = React.useDeferredValue(searchInput.trim());
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<ApiKeyUser | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: 'reset' | 'revoke'; target: ApiKeyUser } | null>(null);

  const query = useQuery({
    queryKey: ['admin-api-keys', page, search],
    queryFn: () => adminApi.getApiKeys(page, search || undefined).then((res) => res.data as ApiKeysResponse),
    enabled: canManageApiKeys,
    placeholderData: (prev) => prev,
  });

  const rows = query.data?.apiKeys ?? [];
  const total = query.data?.pagination?.total ?? 0;
  const pageSize = query.data?.pagination?.limit ?? PAGE_SIZE;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });

  const resetIpMutation = useMutation({
    mutationFn: (target: ApiKeyUser) => adminApi.resetApiKeyIp(target.id),
    onSuccess: (_d, target) => {
      toast.success('รีเซ็ต IP แล้ว', `${target.discordUsername ?? 'ผู้ใช้'} — ปลั๊กอินจะลงทะเบียน IP ใหม่เมื่อเชื่อมต่อครั้งถัดไป`);
      setConfirm(null);
      setSelected((s) => (s && s.id === target.id ? { ...s, apiKeyIp: null } : s));
      invalidate();
    },
    onError: (err) => toast.error('รีเซ็ต IP ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const revokeMutation = useMutation({
    mutationFn: (target: ApiKeyUser) => adminApi.revokeApiKey(target.id),
    onSuccess: (_d, target) => {
      toast.success('ยกเลิก API key แล้ว', target.discordUsername ?? undefined);
      setConfirm(null);
      setSelected(null);
      invalidate();
    },
    onError: (err) => toast.error('ยกเลิก API key ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const downloadMutation = useMutation({
    mutationFn: (target: ApiKeyUser) => adminApi.downloadPlugin(target.id),
    onSuccess: (response) => {
      saveBlob(response.data as BlobPart, response.headers?.['content-disposition'] as string | undefined, 'HeartShop_Plugin.zip');
      toast.success('เริ่มดาวน์โหลดแพ็กเกจปลั๊กอินแล้ว');
    },
    onError: async (err) => toast.error('ดาวน์โหลดไม่สำเร็จ', await blobErrorText(err, 'ลองอีกครั้ง')),
  });

  if (authLoading || !user) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="ระบบ" title="คีย์ API" />
      </div>
    );
  }

  if (!canManageApiKeys) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="ระบบ" title="คีย์ API" />
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลเซิร์ฟเวอร์และผู้ดูแลสูงสุด" />
      </div>
    );
  }

  const busyFor = (id: string) =>
    (resetIpMutation.isPending && resetIpMutation.variables?.id === id) ||
    (revokeMutation.isPending && revokeMutation.variables?.id === id);

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="ระบบ"
        title="คีย์ API"
        description="คีย์ที่ปลั๊กอินในเซิร์ฟเวอร์ใช้เชื่อมต่อกับระบบ คีย์แสดงแบบย่อเพื่อความปลอดภัย"
      />

      <AdminToolbar
        actions={
          <span className="text-sm text-fg-muted">
            ทั้งหมด <span className="font-mono tabular-nums text-fg">{total.toLocaleString('th-TH')}</span> คีย์
          </span>
        }
      >
        <Input
          label="ค้นหา"
          hideLabel
          size="sm"
          wrapperClassName="w-full sm:w-80"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
          placeholder="ชื่อ Discord, Steam ID หรือชื่อเซิร์ฟเวอร์"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
      </AdminToolbar>

      {query.isError ? (
        <ErrorMessage
          title="โหลดรายการ API key ไม่สำเร็จ"
          message={apiErrorText(query.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <TableContainer aria-busy={query.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ผู้ใช้</TableHeaderCell>
                  <TableHeaderCell>คีย์</TableHeaderCell>
                  <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                  <TableHeaderCell>IP ที่ลงทะเบียน</TableHeaderCell>
                  <TableHeaderCell>ใช้งานล่าสุด</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">การทำงาน</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.isLoading ? (
                  <TableLoadingRows columns={6} rows={6} />
                ) : rows.length === 0 ? (
                  <TableEmptyRow
                    colSpan={6}
                    title={search ? 'ไม่พบคีย์ที่ตรงกับคำค้น' : 'ยังไม่มี API key'}
                    description={search ? 'ลองค้นด้วยชื่อ Discord หรือ Steam ID' : 'คีย์จะปรากฏเมื่อผู้ดูแลเซิร์ฟเวอร์สร้างคีย์จากบัญชีของตน'}
                  />
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} interactive onClick={() => setSelected(row)}>
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <Avatar src={row.discordAvatar} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="rounded-[4px] text-left hover:text-accent block max-w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(row);
                              }}
                              aria-label={`ดูคีย์ของ ${row.discordUsername || 'ไม่ทราบชื่อ'}`}
                            >
                              <span className="block truncate font-medium text-fg">{row.discordUsername || 'ไม่ทราบชื่อ'}</span>
                            </button>
                            <p className="truncate font-mono text-xs text-fg-subtle">{row.steamId || '—'}</p>
                          </div>
                          {row.isBanned ? <Badge tone="danger">ถูกแบน</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell mono muted>
                        {row.apiKey || '—'}
                      </TableCell>
                      <TableCell>
                        {row.apiKeyServerName ? (
                          <>
                            <p className="text-fg">{row.apiKeyServerName}</p>
                            <p className="text-xs text-fg-subtle">{row.apiKeyServerMap || '—'}</p>
                          </>
                        ) : (
                          <span className="text-fg-subtle">ยังไม่เชื่อมต่อ</span>
                        )}
                      </TableCell>
                      <TableCell mono muted>
                        {row.apiKeyIp || <span className="font-sans text-fg-subtle">รอเชื่อมต่อ</span>}
                      </TableCell>
                      <TableCell mono muted>
                        {formatDateTime(row.apiKeyLastUsed)}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1">
                          {isRoot ? (
                            <IconButton
                              aria-label={`ดาวน์โหลดแพ็กเกจปลั๊กอินของ ${row.discordUsername ?? 'ผู้ใช้'}`}
                              size="sm"
                              disabled={downloadMutation.isPending}
                              onClick={() => downloadMutation.mutate(row)}
                            >
                              <Download className="h-4 w-4" strokeWidth={1.5} />
                            </IconButton>
                          ) : null}
                          <IconButton
                            aria-label={`รีเซ็ต IP ของ ${row.discordUsername ?? 'ผู้ใช้'}`}
                            size="sm"
                            disabled={busyFor(row.id)}
                            onClick={() => setConfirm({ kind: 'reset', target: row })}
                          >
                            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                          <IconButton
                            aria-label={`ยกเลิก API key ของ ${row.discordUsername ?? 'ผู้ใช้'}`}
                            size="sm"
                            disabled={busyFor(row.id)}
                            onClick={() => setConfirm({ kind: 'revoke', target: row })}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {total > pageSize ? (
            <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.discordUsername || 'API key'}
        description="รายละเอียดคีย์และการเชื่อมต่อล่าสุด"
        footer={
          selected ? (
            <>
              {isRoot ? (
                <Button
                  variant="secondary"
                  leftIcon={<Download className="h-4 w-4" strokeWidth={1.5} />}
                  loading={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate(selected)}
                >
                  แพ็กเกจปลั๊กอิน
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setConfirm({ kind: 'reset', target: selected })}>
                รีเซ็ต IP
              </Button>
              <Button variant="danger" onClick={() => setConfirm({ kind: 'revoke', target: selected })}>
                ยกเลิกคีย์
              </Button>
            </>
          ) : null
        }
      >
        {selected ? (
          <>
            <DrawerSection title="บัญชี">
              <DetailList
                items={[
                  { label: 'Discord', value: selected.discordUsername },
                  { label: 'Discord ID', value: selected.discordId, mono: true },
                  { label: 'Steam ID', value: selected.steamId, mono: true },
                  { label: 'สถานะบัญชี', value: selected.isBanned ? <Badge tone="danger">ถูกแบน</Badge> : 'ปกติ' },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="คีย์">
              <DetailList
                items={[
                  { label: 'คีย์ (ย่อ)', value: selected.apiKey, mono: true },
                  { label: 'สร้างเมื่อ', value: formatDateTime(selected.apiKeyCreatedAt), mono: true },
                  { label: 'IP ที่ลงทะเบียน', value: selected.apiKeyIp ?? 'รอการเชื่อมต่อครั้งแรก', mono: !!selected.apiKeyIp },
                  { label: 'ใช้งานล่าสุด', value: formatDateTime(selected.apiKeyLastUsed), mono: true },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="เซิร์ฟเวอร์ที่ผูกไว้">
              <DetailList
                items={[
                  { label: 'ชื่อ', value: selected.apiKeyServerName },
                  { label: 'แผนที่', value: selected.apiKeyServerMap },
                  { label: 'พอร์ต', value: selected.apiKeyServerPort, mono: true },
                  { label: 'Server ID', value: selected.apiKeyServerId, mono: true },
                ]}
              />
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      <Dialog
        open={confirm?.kind === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="รีเซ็ต IP ที่ลงทะเบียน"
        description={
          confirm?.kind === 'reset'
            ? `IP ของ ${confirm.target.discordUsername ?? 'ผู้ใช้'} จะถูกล้าง ปลั๊กอินจะลงทะเบียน IP ใหม่อัตโนมัติเมื่อเชื่อมต่อครั้งถัดไป`
            : undefined
        }
        variant="warning"
        confirmText="รีเซ็ต IP"
        loading={resetIpMutation.isPending}
        onConfirm={() => confirm && resetIpMutation.mutate(confirm.target)}
      />

      <Dialog
        open={confirm?.kind === 'revoke'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="ยกเลิก API key"
        description={
          confirm?.kind === 'revoke'
            ? `ปลั๊กอินที่ใช้คีย์ของ ${confirm.target.discordUsername ?? 'ผู้ใช้'} จะเชื่อมต่อไม่ได้ทันที จนกว่าจะสร้างคีย์ใหม่และใส่ใน config ของเซิร์ฟเวอร์`
            : undefined
        }
        variant="danger"
        confirmText="ยกเลิกคีย์"
        loading={revokeMutation.isPending}
        onConfirm={() => confirm && revokeMutation.mutate(confirm.target)}
      />
    </div>
  );
}

function Avatar({ src }: { src: string | null }) {
  if (!src) return <span className="h-8 w-8 shrink-0 rounded-full border border-line bg-surface-2" aria-hidden="true" />;
  return (
    // Discord CDN avatars; next/image would need a remote pattern for every CDN host.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line object-cover" loading="lazy" />
  );
}
