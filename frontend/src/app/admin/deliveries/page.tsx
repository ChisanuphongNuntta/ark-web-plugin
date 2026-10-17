'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  Drawer,
  ErrorMessage,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
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
import {
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_OPTIONS,
  AdminNoAccess,
  AdminToolbar,
  CodeBlock,
  DELIVERY_STATUS_OPTIONS,
  DELIVERY_TYPE_LABEL,
  DetailList,
  DrawerSection,
  MonoId,
  StatusBadge,
  adminKeys,
  errorText,
  formatDateTime,
  type DeliveryRowFull,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { adminConsoleApi, serverDirectoryApi } from '@/lib/contracts/console';
import type { DeliveryJobStatus, DeliveryQuery } from '@/lib/contracts/types';

const STATUSES = new Set<string>(['pending', 'leased', 'completed', 'failed', 'dead_letter']);

/** Backend contract: only failed / dead_letter can be retried, never P2P dino jobs (escrow already refunded). */
function retryBlockReason(row: DeliveryRowFull): string | null {
  if (row.status !== 'failed' && row.status !== 'dead_letter') return 'ส่งอีกครั้งได้เฉพาะงานที่ล้มเหลว';
  if (row.deliveryType === 'dino_marketplace') return 'งานสัตว์จากตลาด P2P คืนเงินผู้ซื้อแล้ว ส่งซ้ำไม่ได้';
  return null;
}

export default function AdminDeliveriesPage() {
  const { canViewOperations } = usePermissions();
  if (!canViewOperations) return <AdminNoAccess />;
  return (
    <React.Suspense fallback={<Skeleton className="mt-10 h-64 rounded-card" />}>
      <DeliveriesScreen />
    </React.Suspense>
  );
}

function DeliveriesScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/deliveries';
  const params = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  // The URL is the single source of truth for filters, so links like ?status=failed work.
  const rawStatus = params?.get('status') ?? '';
  const status = STATUSES.has(rawStatus) ? (rawStatus as DeliveryJobStatus) : undefined;
  const serverIdRaw = Number(params?.get('serverId'));
  const serverId = Number.isInteger(serverIdRaw) && serverIdRaw > 0 ? serverIdRaw : undefined;
  const pageRaw = Number(params?.get('page'));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const query: DeliveryQuery = { status, serverId, page, pageSize: ADMIN_PAGE_SIZE };

  const setFilters = (next: { status?: string; serverId?: string; page?: number }) => {
    const sp = new URLSearchParams(params?.toString() ?? '');
    const apply = (key: string, value: string | undefined) => (value ? sp.set(key, value) : sp.delete(key));
    if ('status' in next) apply('status', next.status);
    if ('serverId' in next) apply('serverId', next.serverId);
    apply('page', next.page && next.page > 1 ? String(next.page) : undefined);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const list = useQuery({
    queryKey: adminKeys.deliveries(query),
    queryFn: () => adminConsoleApi.listDeliveries(query),
    placeholderData: keepPreviousData,
    ...ADMIN_QUERY_OPTIONS,
  });
  const servers = useQuery({
    queryKey: adminKeys.publicServers,
    queryFn: () => serverDirectoryApi.listServers(),
    ...ADMIN_QUERY_OPTIONS,
  });

  const rows = (list.data?.items ?? []) as DeliveryRowFull[];
  const [selected, setSelected] = React.useState<DeliveryRowFull | null>(null);
  const [confirming, setConfirming] = React.useState<DeliveryRowFull | null>(null);

  const retry = useMutation({
    mutationFn: (row: DeliveryRowFull) => adminConsoleApi.retryDelivery(row.id),
    onSuccess: (res) => {
      if (res.alreadyQueued) toast.info('งานนี้อยู่ในคิวแล้ว', 'ไม่ได้สร้างงานซ้ำ');
      else toast.success('ส่งเข้าคิวอีกครั้งแล้ว', 'ระบบจะส่งของเมื่อผู้เล่นออนไลน์ในเซิร์ฟเวอร์นั้น');
      setConfirming(null);
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
    onError: (err) => toast.error('ส่งอีกครั้งไม่สำเร็จ', errorText(err)),
  });

  const serverOptions = (servers.data ?? []).map((s) => ({ value: String(s.id), label: s.displayName || s.name }));
  const filtered = !!status || !!serverId;

  return (
    <div>
      <PageHeader
        title="การส่งของ"
        description="งานส่งของเข้าเกมทุกงาน งานที่ล้มเหลวส่งเข้าคิวใหม่ได้โดยไม่สร้างของซ้ำ"
      />

      <AdminToolbar
        actions={
          filtered ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters({ status: undefined, serverId: undefined })}>
              ล้างตัวกรอง
            </Button>
          ) : null
        }
      >
        <Select
          label="สถานะ"
          placeholder="ทุกสถานะ"
          options={DELIVERY_STATUS_OPTIONS}
          value={status ?? ''}
          onChange={(e) => setFilters({ status: e.target.value || undefined })}
          wrapperClassName="w-44"
        />
        <Select
          label="เซิร์ฟเวอร์"
          placeholder={servers.isLoading ? 'กำลังโหลด' : 'ทุกเซิร์ฟเวอร์'}
          options={serverOptions}
          value={serverId ? String(serverId) : ''}
          onChange={(e) => setFilters({ serverId: e.target.value || undefined })}
          wrapperClassName="w-56"
        />
      </AdminToolbar>

      {list.isError ? (
        <ErrorMessage message={errorText(list.error, 'โหลดงานส่งของไม่สำเร็จ')} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <TableContainer aria-busy={list.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>งาน</TableHeaderCell>
                  <TableHeaderCell>ประเภท</TableHeaderCell>
                  <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                  <TableHeaderCell>Steam ID</TableHeaderCell>
                  <TableHeaderCell align="right">ครั้งที่ลอง</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell>อัปเดต</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">การทำงาน</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.isLoading ? (
                  <TableLoadingRows columns={8} />
                ) : !rows.length ? (
                  <TableEmptyRow
                    colSpan={8}
                    title={status === 'failed' || status === 'dead_letter' ? 'ไม่มีงานที่ล้มเหลว' : 'ไม่มีงานส่งของ'}
                    description={filtered ? 'ไม่มีงานที่ตรงกับตัวกรองนี้' : 'งานจะเกิดขึ้นเมื่อมีคำสั่งซื้อที่ต้องส่งเข้าเกม'}
                  />
                ) : (
                  rows.map((d) => {
                    const blocked = retryBlockReason(d);
                    return (
                      <TableRow key={d.id} interactive selected={selected?.id === d.id} onClick={() => setSelected(d)}>
                        <TableCell>
                          <button
                            type="button"
                            className="rounded-[4px] text-left hover:text-accent text-fg"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(d);
                            }}
                            aria-label={`ดูงานส่งของ ${d.id}`}
                          >
                            <MonoId value={d.id} />
                          </button>
                        </TableCell>
                        <TableCell muted className="whitespace-nowrap">
                          {d.deliveryType ? DELIVERY_TYPE_LABEL[d.deliveryType] ?? d.deliveryType : '—'}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">{d.serverName ?? `#${d.serverId}`}</TableCell>
                        <TableCell mono muted>
                          {d.steamId}
                        </TableCell>
                        <TableCell align="right" mono>
                          {d.attempts}
                          {d.maxAttempts ? <span className="text-fg-subtle">/{d.maxAttempts}</span> : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="delivery" status={d.status} />
                        </TableCell>
                        <TableCell muted className="whitespace-nowrap text-xs">
                          {formatDateTime(d.updatedAt)}
                        </TableCell>
                        <TableCell align="right">
                          {d.status === 'failed' || d.status === 'dead_letter' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!!blocked}
                              title={blocked ?? undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirming(d);
                              }}
                            >
                              ส่งอีกครั้ง
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            className="mt-4"
            page={page}
            pageSize={ADMIN_PAGE_SIZE}
            total={list.data?.total ?? 0}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        size="lg"
        title="รายละเอียดงานส่งของ"
        description={selected ? <span className="font-mono">{selected.id}</span> : undefined}
        footer={
          selected && (selected.status === 'failed' || selected.status === 'dead_letter') ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-fg-muted">{retryBlockReason(selected) ?? 'ส่งเข้าคิวใหม่โดยใช้ระบบส่งของเดิม'}</p>
              <Button
                leftIcon={<RotateCcw className="h-4 w-4" strokeWidth={1.5} />}
                disabled={!!retryBlockReason(selected)}
                onClick={() => setConfirming(selected)}
              >
                ส่งอีกครั้ง
              </Button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <DrawerSection title="สถานะ">
              <DetailList
                items={[
                  { label: 'สถานะ', value: <StatusBadge kind="delivery" status={selected.status} /> },
                  {
                    label: 'ครั้งที่ลอง',
                    value: `${selected.attempts}${selected.maxAttempts ? ` / ${selected.maxAttempts}` : ''}`,
                    mono: true,
                  },
                  { label: 'ลองครั้งถัดไป', value: selected.nextRetryAt ? formatDateTime(selected.nextRetryAt) : null },
                  { label: 'อัปเดตล่าสุด', value: formatDateTime(selected.updatedAt) },
                  { label: 'สร้างเมื่อ', value: formatDateTime(selected.createdAt) },
                  {
                    label: 'ข้อผิดพลาดล่าสุด',
                    value: selected.lastError ? <CodeBlock tone="danger">{selected.lastError}</CodeBlock> : null,
                    wide: true,
                  },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="ปลายทาง">
              <DetailList
                items={[
                  {
                    label: 'ประเภท',
                    value: selected.deliveryType ? DELIVERY_TYPE_LABEL[selected.deliveryType] ?? selected.deliveryType : null,
                  },
                  { label: 'เซิร์ฟเวอร์', value: selected.serverName ?? `#${selected.serverId}` },
                  { label: 'Steam ID', value: selected.steamId, mono: true },
                  { label: 'คำสั่งซื้อ', value: selected.orderId, mono: true },
                  { label: 'อ้างอิง', value: selected.referenceId, mono: true, wide: true },
                ]}
              />
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      <Dialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="ส่งงานนี้อีกครั้ง?"
        description={
          confirming
            ? `งาน ${confirming.id.slice(0, 8)} จะกลับเข้าคิวและส่งไปที่ ${confirming.serverName ?? `เซิร์ฟเวอร์ #${confirming.serverId}`} ให้ Steam ID ${confirming.steamId} เมื่อผู้เล่นออนไลน์ คำสั่งซื้อจะกลับเป็นสถานะรอส่ง ถ้างานอยู่ในคิวแล้วระบบจะไม่สร้างซ้ำ`
            : undefined
        }
        onConfirm={() => confirming && retry.mutate(confirming)}
        confirmText="ส่งอีกครั้ง"
        variant="warning"
        loading={retry.isPending}
      />
    </div>
  );
}
