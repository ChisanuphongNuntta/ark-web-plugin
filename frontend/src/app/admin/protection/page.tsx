'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  ErrorMessage,
  Input,
  PageHeader,
  Pagination,
  Select,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Textarea,
  useToast,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { AdminNoAccess, AdminToolbar, formatDateTime } from '@/components/admin';
import { useServers } from '@/components/servers';
import { protectionAdminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

interface ProtectionRow {
  id: number;
  steamId: string;
  protectionDays: number;
  protectionStartAt: string;
  protectionEndAt: string;
  protectionType: string;
  isActive: boolean;
  grantedBy: string | null;
  grantedReason: string | null;
  tribeProtection: { tribeId: string; tribeName: string; serverId: number } | null;
}

interface ProtectionLog {
  id: number;
  serverId: number;
  eventType: string;
  steamId: string | null;
  tribeId: string | null;
  attackerSteamId: string | null;
  attackerTribeId: string | null;
  details: string | null;
  createdAt: string;
}

interface Stats {
  totalPlayers: number;
  activePlayers: number;
  totalTribes: number;
  activeTribes: number;
  damageBlockedToday: number;
}

interface Paged {
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

const LIST_LIMIT = 50;
const LOG_LIMIT = 50;

const TYPE_LABEL: Record<string, string> = {
  new_player: 'ผู้เล่นใหม่',
  admin_granted: 'ผู้ดูแลให้',
};

const EVENT_LOOK: Record<string, { label: string; tone: BadgeTone }> = {
  protection_started: { label: 'เริ่มคุ้มครอง', tone: 'success' },
  protection_ended: { label: 'หมดการคุ้มครอง', tone: 'neutral' },
  damage_blocked: { label: 'กันความเสียหาย', tone: 'info' },
  tribe_protected: { label: 'คุ้มครองเผ่า', tone: 'info' },
  admin_grant: { label: 'ผู้ดูแลให้', tone: 'accent' },
  admin_revoke: { label: 'ผู้ดูแลยกเลิก', tone: 'warning' },
};

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

function isCurrentlyActive(p: ProtectionRow): boolean {
  return p.isActive && new Date(p.protectionEndAt).getTime() > Date.now();
}

export default function ProtectionAdminPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = React.useState<'list' | 'logs'>('list');
  const [status, setStatus] = React.useState<'all' | 'active' | 'expired'>('active');
  const [search, setSearch] = React.useState('');
  const [listPage, setListPage] = React.useState(1);
  const [logPage, setLogPage] = React.useState(1);
  const [eventType, setEventType] = React.useState('');
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<ProtectionRow | null>(null);

  const statsQuery = useQuery({
    queryKey: ['protection-stats'],
    queryFn: () => protectionAdminApi.getStats().then((res) => (res.data?.stats ?? null) as Stats | null),
    enabled: isAdmin,
  });

  const listQuery = useQuery({
    queryKey: ['protections', status, listPage],
    queryFn: () =>
      protectionAdminApi
        .getProtections({
          isActive: status === 'all' ? undefined : status === 'active' ? 'true' : 'false',
          page: listPage,
          limit: LIST_LIMIT,
        })
        .then((res) => res.data as Paged & { protections?: ProtectionRow[] }),
    enabled: isAdmin,
    placeholderData: (prev) => prev,
  });

  const logsQuery = useQuery({
    queryKey: ['protection-logs', eventType, logPage],
    queryFn: () =>
      protectionAdminApi
        .getLogs({ eventType: eventType || undefined, page: logPage, limit: LOG_LIMIT })
        .then((res) => res.data as Paged & { logs?: ProtectionLog[] }),
    enabled: isAdmin && tab === 'logs',
    placeholderData: (prev) => prev,
  });

  const servers = useServers({ enabled: isAdmin });
  const serverName = React.useCallback(
    (id: number | null | undefined) => {
      if (id === null || id === undefined) return '—';
      return servers.data?.find((s) => s.id === id)?.displayName ?? `#${id}`;
    },
    [servers.data]
  );

  const rows = React.useMemo(() => {
    const all = listQuery.data?.protections ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.steamId.includes(q) ||
        p.tribeProtection?.tribeName?.toLowerCase().includes(q) ||
        p.tribeProtection?.tribeId?.toLowerCase().includes(q)
    );
  }, [listQuery.data, search]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['protections'] });
    void queryClient.invalidateQueries({ queryKey: ['protection-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['protection-logs'] });
  };

  const grantMutation = useMutation({
    mutationFn: (data: Parameters<typeof protectionAdminApi.grantProtection>[0]) => protectionAdminApi.grantProtection(data),
    onSuccess: (_d, vars) => {
      toast.success('ให้การคุ้มครองแล้ว', `${vars.steamId} — ${vars.protectionDays} วัน`);
      setGrantOpen(false);
      invalidate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (p: ProtectionRow) => protectionAdminApi.revokeProtection(p.steamId, { revokeTribe: true }),
    onSuccess: (_d, p) => {
      toast.success('ยกเลิกการคุ้มครองแล้ว', p.steamId);
      setRevokeTarget(null);
      invalidate();
    },
    onError: (err) => toast.error('ยกเลิกไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const header = (
    <PageHeader
      eyebrow="ผู้เล่น"
      title="การป้องกันผู้เล่นใหม่"
      description="ระยะคุ้มครองจากการโจมตีของผู้เล่นและเผ่า ปลั๊กอินตรวจสอบสถานะนี้ในเกม"
      actions={
        isAdmin ? (
          <Button
            leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}
            onClick={() => {
              grantMutation.reset();
              setGrantOpen(true);
            }}
          >
            ให้การคุ้มครอง
          </Button>
        ) : undefined
      }
    />
  );

  if (authLoading || !user) {
    return (
      <div className="pb-16" aria-busy="true">
        {header}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="pb-16">
        {header}
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลเว็บไซต์และผู้ดูแลสูงสุด" />
      </div>
    );
  }

  const stats = statsQuery.data;
  const listTotal = listQuery.data?.pagination?.total ?? 0;
  const logs = logsQuery.data?.logs ?? [];
  const logTotal = logsQuery.data?.pagination?.total ?? 0;

  return (
    <div className="min-w-0 pb-16">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="ผู้เล่นที่คุ้มครองอยู่" value={stats?.activePlayers ?? '—'} loading={statsQuery.isLoading} />
        <Stat label="เผ่าที่คุ้มครองอยู่" value={stats?.activeTribes ?? '—'} loading={statsQuery.isLoading} />
        <Stat label="กันความเสียหายวันนี้" value={stats?.damageBlockedToday ?? '—'} loading={statsQuery.isLoading} />
        <Stat label="ผู้เล่นทั้งหมด" value={stats?.totalPlayers ?? '—'} loading={statsQuery.isLoading} />
        <Stat label="เผ่าทั้งหมด" value={stats?.totalTribes ?? '—'} loading={statsQuery.isLoading} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'list' | 'logs')} className="mt-8">
        <TabsList aria-label="ส่วนของการป้องกัน">
          <TabsTrigger value="list">รายการคุ้มครอง</TabsTrigger>
          <TabsTrigger value="logs">บันทึกเหตุการณ์</TabsTrigger>
        </TabsList>

        <TabsPanel value="list" className="pt-6">
          <AdminToolbar>
            <Input
              label="ค้นหา"
              hideLabel
              size="sm"
              wrapperClassName="w-full sm:w-72"
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
              placeholder="Steam ID หรือชื่อเผ่าในหน้านี้"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="สถานะ"
              hideLabel
              size="sm"
              wrapperClassName="w-full sm:w-44"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status);
                setListPage(1);
              }}
              options={[
                { value: 'active', label: 'กำลังคุ้มครอง' },
                { value: 'expired', label: 'หมดแล้ว' },
                { value: 'all', label: 'ทั้งหมด' },
              ]}
            />
          </AdminToolbar>

          {listQuery.isError ? (
            <ErrorMessage
              title="โหลดรายการไม่สำเร็จ"
              message={apiErrorText(listQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
              onRetry={() => void listQuery.refetch()}
            />
          ) : (
            <>
              <TableContainer aria-busy={listQuery.isFetching || undefined}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Steam ID</TableHeaderCell>
                      <TableHeaderCell>ประเภท</TableHeaderCell>
                      <TableHeaderCell>สถานะ</TableHeaderCell>
                      <TableHeaderCell>เผ่า</TableHeaderCell>
                      <TableHeaderCell>สิ้นสุด</TableHeaderCell>
                      <TableHeaderCell>เหตุผล</TableHeaderCell>
                      <TableHeaderCell>
                        <span className="sr-only">การทำงาน</span>
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listQuery.isLoading ? (
                      <TableLoadingRows columns={7} rows={6} />
                    ) : rows.length === 0 ? (
                      <TableEmptyRow
                        colSpan={7}
                        title={search ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ไม่มีรายการในสถานะนี้'}
                        description="ผู้เล่นใหม่จะได้รับการคุ้มครองอัตโนมัติเมื่อเข้าเกมครั้งแรก"
                      />
                    ) : (
                      rows.map((p) => {
                        const active = isCurrentlyActive(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell mono>{p.steamId}</TableCell>
                            <TableCell>
                              <Badge outline>{TYPE_LABEL[p.protectionType] ?? p.protectionType}</Badge>
                            </TableCell>
                            <TableCell>
                              {active ? <Badge tone="success">คุ้มครองอยู่</Badge> : <span className="text-fg-muted">หมดแล้ว</span>}
                            </TableCell>
                            <TableCell>
                              {p.tribeProtection ? (
                                <>
                                  <p className="text-fg">{p.tribeProtection.tribeName || p.tribeProtection.tribeId}</p>
                                  <p className="text-xs text-fg-subtle">{serverName(p.tribeProtection.serverId)}</p>
                                </>
                              ) : (
                                <span className="text-fg-subtle">—</span>
                              )}
                            </TableCell>
                            <TableCell mono muted>
                              {formatDateTime(p.protectionEndAt)}
                            </TableCell>
                            <TableCell muted className="max-w-[220px]">
                              <span className="line-clamp-1">{p.grantedReason || '—'}</span>
                            </TableCell>
                            <TableCell align="right">
                              {active ? (
                                <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(p)}>
                                  ยกเลิก
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
              {listTotal > LIST_LIMIT ? (
                <Pagination className="mt-4" page={listPage} pageSize={LIST_LIMIT} total={listTotal} onPageChange={setListPage} />
              ) : null}
            </>
          )}
        </TabsPanel>

        <TabsPanel value="logs" className="pt-6">
          <AdminToolbar>
            <Select
              label="เหตุการณ์"
              hideLabel
              size="sm"
              wrapperClassName="w-full sm:w-56"
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setLogPage(1);
              }}
              options={[
                { value: '', label: 'ทุกเหตุการณ์' },
                ...Object.entries(EVENT_LOOK).map(([value, look]) => ({ value, label: look.label })),
              ]}
            />
          </AdminToolbar>
          {logsQuery.isError ? (
            <ErrorMessage
              title="โหลดบันทึกไม่สำเร็จ"
              message={apiErrorText(logsQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
              onRetry={() => void logsQuery.refetch()}
            />
          ) : (
            <>
              <TableContainer aria-busy={logsQuery.isFetching || undefined}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>เวลา</TableHeaderCell>
                      <TableHeaderCell>เหตุการณ์</TableHeaderCell>
                      <TableHeaderCell>ผู้เล่น / เผ่า</TableHeaderCell>
                      <TableHeaderCell>ผู้โจมตี</TableHeaderCell>
                      <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logsQuery.isLoading ? (
                      <TableLoadingRows columns={5} rows={8} />
                    ) : logs.length === 0 ? (
                      <TableEmptyRow colSpan={5} title="ยังไม่มีบันทึก" />
                    ) : (
                      logs.map((log) => {
                        const look = EVENT_LOOK[log.eventType] ?? { label: log.eventType, tone: 'neutral' as BadgeTone };
                        return (
                          <TableRow key={log.id}>
                            <TableCell mono muted className="whitespace-nowrap">
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Badge tone={look.tone}>{look.label}</Badge>
                            </TableCell>
                            <TableCell mono>
                              {log.steamId || '—'}
                              {log.tribeId ? <span className="block text-xs text-fg-subtle">เผ่า {log.tribeId}</span> : null}
                            </TableCell>
                            <TableCell mono muted>
                              {log.attackerSteamId || log.attackerTribeId || '—'}
                            </TableCell>
                            <TableCell muted>{serverName(log.serverId)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {logTotal > LOG_LIMIT ? (
                <Pagination className="mt-4" page={logPage} pageSize={LOG_LIMIT} total={logTotal} onPageChange={setLogPage} />
              ) : null}
            </>
          )}
        </TabsPanel>
      </Tabs>

      <Dialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        title="ให้การคุ้มครอง"
        description="ใช้กับผู้เล่นที่ต้องการระยะคุ้มครองเพิ่ม เช่น ชดเชยเหตุขัดข้องของเซิร์ฟเวอร์"
        size="md"
        loading={grantMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrantOpen(false)} disabled={grantMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-protection-grant" loading={grantMutation.isPending}>
              ให้การคุ้มครอง
            </Button>
          </>
        }
      >
        {grantOpen ? (
          <GrantForm
            servers={(servers.data ?? []).map((s) => ({ value: String(s.id), label: s.displayName || s.name }))}
            error={grantMutation.isError ? apiErrorText(grantMutation.error, 'ให้การคุ้มครองไม่สำเร็จ ลองอีกครั้ง') : null}
            onSubmit={(data) => grantMutation.mutate(data)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="ยกเลิกการคุ้มครอง"
        description={
          revokeTarget
            ? `${revokeTarget.steamId} จะโดนโจมตีได้ทันที${revokeTarget.tribeProtection ? ' รวมถึงการคุ้มครองของเผ่า' : ''}`
            : undefined
        }
        variant="danger"
        confirmText="ยกเลิกการคุ้มครอง"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
      />
    </div>
  );
}

interface GrantState {
  steamId: string;
  days: string;
  reason: string;
  protectTribe: boolean;
  tribeId: string;
  tribeName: string;
  serverId: string;
}

function GrantForm({
  servers,
  error,
  onSubmit,
}: {
  servers: { value: string; label: string }[];
  error: string | null;
  onSubmit: (data: Parameters<typeof protectionAdminApi.grantProtection>[0]) => void;
}) {
  const [form, setForm] = React.useState<GrantState>({
    steamId: '',
    days: '7',
    reason: '',
    protectTribe: false,
    tribeId: '',
    tribeName: '',
    serverId: '',
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof GrantState, string>>>({});

  const set = <K extends keyof GrantState>(key: K, value: GrantState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof GrantState, string>> = {};
    if (!/^\d{17}$/.test(form.steamId.trim())) next.steamId = 'Steam ID ต้องเป็นตัวเลข 17 หลัก';
    const days = Number(form.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) next.days = 'ใส่ 1–365 วัน';
    if (form.protectTribe) {
      if (!form.tribeId.trim()) next.tribeId = 'กรอก Tribe ID';
      if (!form.serverId) next.serverId = 'เลือกเซิร์ฟเวอร์ของเผ่า';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      steamId: form.steamId.trim(),
      protectionDays: days,
      reason: form.reason.trim() || undefined,
      protectTribe: form.protectTribe,
      tribeId: form.protectTribe ? form.tribeId.trim() : undefined,
      tribeName: form.protectTribe ? form.tribeName.trim() || undefined : undefined,
      serverId: form.protectTribe ? Number(form.serverId) : undefined,
    });
  };

  return (
    <form id="admin-protection-grant" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <Input
          label="Steam ID"
          required
          mono
          inputMode="numeric"
          placeholder="76561198000000000"
          value={form.steamId}
          onChange={(e) => set('steamId', e.target.value)}
          error={errors.steamId}
        />
        <Input
          label="จำนวนวัน"
          required
          mono
          inputMode="numeric"
          value={form.days}
          onChange={(e) => set('days', e.target.value)}
          error={errors.days}
        />
      </div>
      <Textarea label="เหตุผล" rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} helperText="บันทึกไว้ในประวัติ" />
      <Checkbox
        checked={form.protectTribe}
        onChange={(e) => set('protectTribe', e.target.checked)}
        label="คุ้มครองเผ่าของผู้เล่นด้วย"
      />
      {form.protectTribe ? (
        <div className="grid gap-4 border-l border-line pl-4 sm:grid-cols-2">
          <Input label="Tribe ID" required mono value={form.tribeId} onChange={(e) => set('tribeId', e.target.value)} error={errors.tribeId} />
          <Input label="ชื่อเผ่า" value={form.tribeName} onChange={(e) => set('tribeName', e.target.value)} />
          <Select
            label="เซิร์ฟเวอร์"
            required
            wrapperClassName="sm:col-span-2"
            placeholder="เลือกเซิร์ฟเวอร์"
            options={servers}
            value={form.serverId}
            onChange={(e) => set('serverId', e.target.value)}
            error={errors.serverId}
          />
        </div>
      ) : null}
    </form>
  );
}
