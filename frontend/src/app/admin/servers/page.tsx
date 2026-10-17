'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus, Search } from 'lucide-react';
import {
  Badge,
  Button,
  CopyField,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Stat,
  StatusDot,
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
  useToast,
} from '@/components/ui';
import { GAME_MODE_DESCRIPTION, GAME_MODE_LABEL, GAME_MODE_ORDER, GameModeBadge, ServerAddress } from '@/components/servers';
import { adminConsoleApi } from '@/lib/contracts/console';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import type { GameMode } from '@/lib/contracts/types';
import { ServerFormDialog, type ServerPayload } from './_components/ServerFormDialog';
import { ClusterFormDialog, type ClusterPayload } from './_components/ClusterFormDialog';
import { ServerDetailDrawer } from './_components/ServerDetailDrawer';
import { ConfirmByNameDialog } from './_components/ConfirmByNameDialog';
import {
  UNASSIGNED,
  addressKey,
  apiErrorText,
  deliverableNote,
  findDuplicateAddresses,
  serverTitle,
  sortClusters,
  sortServers,
  type ClusterRow,
  type ServerRow,
} from './_lib';

const SERVERS_KEY = ['admin', 'servers'] as const;
const CLUSTERS_KEY = ['admin', 'clusters'] as const;

type ModeFilter = 'ALL' | GameMode;
type ViewMode = 'grouped' | 'flat';

interface ConfirmState {
  kind: 'delete' | 'regenerate';
  server: ServerRow;
}

export default function AdminServersPage() {
  const { isLoading: authLoading } = useAuthStore();
  const { canManageServers } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = React.useState<'servers' | 'clusters'>('servers');
  const [search, setSearch] = React.useState('');
  const [mode, setMode] = React.useState<ModeFilter>('ALL');
  const [clusterFilter, setClusterFilter] = React.useState<string>('all');
  const [view, setView] = React.useState<ViewMode>('grouped');

  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [serverForm, setServerForm] = React.useState<{ open: boolean; server: ServerRow | null }>({ open: false, server: null });
  const [clusterForm, setClusterForm] = React.useState<{ open: boolean; cluster: ClusterRow | null }>({ open: false, cluster: null });
  const [confirm, setConfirm] = React.useState<ConfirmState | null>(null);
  const [newKey, setNewKey] = React.useState<{ server: ServerRow; key: string } | null>(null);

  const serversQuery = useQuery({
    queryKey: SERVERS_KEY,
    queryFn: async () => (await adminConsoleApi.listServers()) as ServerRow[],
    enabled: canManageServers,
    refetchInterval: 60_000,
  });
  const clustersQuery = useQuery({
    queryKey: CLUSTERS_KEY,
    queryFn: async () => (await adminConsoleApi.listClusters()) as ClusterRow[],
    enabled: canManageServers,
  });

  const servers = React.useMemo(() => sortServers(serversQuery.data ?? []), [serversQuery.data]);
  const clusters = React.useMemo(() => sortClusters(clustersQuery.data ?? []), [clustersQuery.data]);
  const clusterById = React.useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: SERVERS_KEY });
    void queryClient.invalidateQueries({ queryKey: CLUSTERS_KEY });
    // Public server list, picker and directory read the same rows.
    void queryClient.invalidateQueries({ queryKey: ['servers'] });
  };

  /* ---------------------------- mutations ---------------------------- */

  const saveServer = useMutation({
    mutationFn: async ({ id, payload }: { id: number | null; payload: ServerPayload }) => {
      if (id === null) {
        return adminConsoleApi.createServer(payload as ServerPayload & { name: string; map: string });
      }
      return adminConsoleApi.updateServer(id, payload);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.id === null ? 'เพิ่มเซิร์ฟเวอร์แล้ว' : 'บันทึกการแก้ไขแล้ว');
      setServerForm({ open: false, server: null });
      invalidate();
    },
  });

  const saveCluster = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: ClusterPayload }) => {
      if (id === null) {
        return adminConsoleApi.createCluster(payload as ClusterPayload & { key: string; name: string });
      }
      return adminConsoleApi.updateCluster(id, payload);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.id === null ? 'เพิ่มกลุ่มแล้ว' : 'บันทึกกลุ่มแล้ว');
      setClusterForm({ open: false, cluster: null });
      invalidate();
    },
  });

  const deleteServer = useMutation({
    mutationFn: (server: ServerRow) => adminApi.deleteServer(server.id),
    onSuccess: (_data, server) => {
      toast.success('ลบเซิร์ฟเวอร์แล้ว', serverTitle(server));
      setConfirm(null);
      setDetailId(null);
      invalidate();
    },
    onError: (err) => toast.error('ลบเซิร์ฟเวอร์ไม่สำเร็จ', apiErrorText(err, 'เซิร์ฟเวอร์อาจยังมีคำสั่งซื้อหรือข้อมูลที่อ้างอิงอยู่')),
  });

  const regenerateKey = useMutation({
    mutationFn: async (server: ServerRow) => {
      const res = await adminApi.regenerateServerKey(server.id);
      const key = (res.data?.server?.apiKey as string | undefined) ?? '';
      return { server, key };
    },
    onSuccess: (result) => {
      setConfirm(null);
      if (result.key) setNewKey(result);
      else toast.success('สร้างคีย์ใหม่แล้ว', 'คัดลอกคีย์ได้จากรายละเอียดเซิร์ฟเวอร์');
      invalidate();
    },
    onError: (err) => toast.error('สร้างคีย์ใหม่ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  /* ----------------------------- derived ----------------------------- */

  const duplicates = React.useMemo(() => findDuplicateAddresses(servers), [servers]);
  const duplicateIds = React.useMemo(() => new Set(duplicates.flatMap((d) => d.servers.map((s) => s.id))), [duplicates]);
  const missingAddress = React.useMemo(
    () => servers.filter((s) => s.isListed && s.isAvailable && !addressKey(s)),
    [servers]
  );
  const modeMismatch = React.useMemo(
    () =>
      servers.filter((s) => {
        const c = s.clusterId ? clusterById.get(s.clusterId) : undefined;
        return !!c?.gameMode && c.gameMode !== s.gameMode;
      }),
    [servers, clusterById]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((s) => {
      if (mode !== 'ALL' && s.gameMode !== mode) return false;
      if (clusterFilter === UNASSIGNED && s.clusterId) return false;
      if (clusterFilter !== 'all' && clusterFilter !== UNASSIGNED && s.clusterId !== clusterFilter) return false;
      if (!q) return true;
      return [s.name, s.displayName, s.map, s.connectHost, s.connectPort ? String(s.connectPort) : null, s.cluster?.name, String(s.id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [servers, mode, clusterFilter, search]);

  const modeCounts = React.useMemo(() => {
    const counts: Record<GameMode, number> = { PVE: 0, PVE_MOD: 0, PVPVE: 0 };
    servers.forEach((s) => {
      counts[s.gameMode] += 1;
    });
    return counts;
  }, [servers]);

  const sections = React.useMemo(() => {
    return GAME_MODE_ORDER.map((m) => {
      const inMode = filtered.filter((s) => s.gameMode === m);
      const groups: Array<{ cluster: ClusterRow | null; servers: ServerRow[] }> = [];
      clusters.forEach((c) => {
        const list = inMode.filter((s) => s.clusterId === c.id);
        if (list.length) groups.push({ cluster: c, servers: list });
      });
      const loose = inMode.filter((s) => !s.clusterId || !clusterById.has(s.clusterId));
      if (loose.length) groups.push({ cluster: null, servers: loose });
      return { mode: m, total: inMode.length, groups };
    }).filter((section) => section.total > 0);
  }, [filtered, clusters, clusterById]);

  const detail = detailId !== null ? servers.find((s) => s.id === detailId) ?? null : null;
  const detailDuplicates = detail
    ? servers.filter((s) => s.id !== detail.id && addressKey(s) !== null && addressKey(s) === addressKey(detail))
    : [];

  const stats = {
    total: servers.length,
    online: servers.filter((s) => s.online).length,
    deliverable: servers.filter((s) => s.deliverable).length,
    listed: servers.filter((s) => s.isListed).length,
  };

  const filtersActive = search.trim() !== '' || mode !== 'ALL' || clusterFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setMode('ALL');
    setClusterFilter('all');
  };

  /* ------------------------------ render ----------------------------- */

  if (authLoading) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="ระบบ" title="เซิร์ฟเวอร์" />
      </div>
    );
  }

  if (!canManageServers) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="ระบบ" title="เซิร์ฟเวอร์" />
        <EmptyState
          title="หน้านี้สำหรับผู้ดูแลระดับ Root"
          description="การเพิ่ม ลบ หรือเปลี่ยนคีย์ของเซิร์ฟเวอร์กระทบการส่งของ จึงจำกัดไว้เฉพาะ Root ติดต่อผู้ดูแลระบบหากต้องการแก้ไข"
        />
      </div>
    );
  }

  const openCreateServer = () => {
    saveServer.reset();
    setServerForm({ open: true, server: null });
  };
  const openEditServer = (server: ServerRow) => {
    saveServer.reset();
    setServerForm({ open: true, server });
  };
  const openCreateCluster = () => {
    saveCluster.reset();
    setClusterForm({ open: true, cluster: null });
  };
  const openEditCluster = (cluster: ClusterRow) => {
    saveCluster.reset();
    setClusterForm({ open: true, cluster });
  };

  const flat = view === 'flat';
  const columnCount = flat ? 14 : 12;

  const renderRows = (rows: ServerRow[]) =>
    rows.map((s) => {
      const note = deliverableNote(s);
      const cluster = s.clusterId ? clusterById.get(s.clusterId) : undefined;
      const mismatch = !!cluster?.gameMode && cluster.gameMode !== s.gameMode;
      return (
        <TableRow key={s.id} interactive onClick={() => setDetailId(s.id)}>
          <TableCell className="min-w-[200px]">
            <button
              type="button"
              className="text-left font-medium text-fg hover:text-accent"
              onClick={(e) => {
                e.stopPropagation();
                setDetailId(s.id);
              }}
            >
              {serverTitle(s)}
            </button>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
              <span className="font-mono">#{s.id}</span>
              {s.displayName && s.displayName !== s.name ? <span className="truncate">{s.name}</span> : null}
              {!s.isActive ? (
                <Badge tone="danger" outline>
                  ปิดใช้งาน
                </Badge>
              ) : null}
              {mismatch ? <span className="text-warning">โหมดไม่ตรงกับกลุ่ม</span> : null}
            </div>
          </TableCell>
          <TableCell mono muted>
            {s.map ?? '—'}
          </TableCell>
          {flat ? (
            <>
              <TableCell>
                <GameModeBadge mode={s.gameMode} />
              </TableCell>
              <TableCell muted className="whitespace-nowrap">
                {s.cluster?.name ?? cluster?.name ?? '—'}
              </TableCell>
            </>
          ) : null}
          <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <span className="inline-flex items-center gap-1.5">
              {duplicateIds.has(s.id) ? (
                <span className="inline-flex text-warning" title="ที่อยู่ซ้ำกับเซิร์ฟเวอร์อื่น">
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">ที่อยู่ซ้ำกับเซิร์ฟเวอร์อื่น</span>
                </span>
              ) : null}
              <ServerAddress host={s.connectHost} port={s.connectPort} showConnect={false} />
            </span>
          </TableCell>
          <TableCell mono muted>
            {s.rates ?? '—'}
          </TableCell>
          <TableCell muted>{s.isModded ? 'ม็อด' : '—'}</TableCell>
          <TableCell>{s.isListed ? <span className="text-fg-muted">แสดง</span> : <Badge>ซ่อน</Badge>}</TableCell>
          <TableCell>
            {s.isAvailable ? <span className="text-fg-muted">เปิด</span> : <Badge tone="warning" outline>ปิดให้บริการ</Badge>}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <span className="inline-flex items-center gap-2">
              <StatusDot status={s.online ? 'online' : 'offline'} />
              <span className="font-mono text-[13px] tabular-nums">{s.online ? s.playerCount : '—'}</span>
            </span>
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {s.deliverable ? (
              <Badge tone="success">รับของได้</Badge>
            ) : (
              <span className="text-xs text-fg-subtle" title={note ?? undefined}>
                {note ?? 'ไม่พร้อม'}
              </span>
            )}
          </TableCell>
          <TableCell mono muted>
            {s.pluginVersion ?? '—'}
          </TableCell>
          <TableCell>{s.drainMode ? <Badge tone="warning">พักรับของ</Badge> : <span className="text-fg-subtle">—</span>}</TableCell>
          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
            <IconButton aria-label={`แก้ไข ${serverTitle(s)}`} size="sm" onClick={() => openEditServer(s)}>
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </IconButton>
          </TableCell>
        </TableRow>
      );
    });

  const tableHead = (
    <TableHead>
      <TableRow>
        <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
        <TableHeaderCell>แผนที่</TableHeaderCell>
        {flat ? (
          <>
            <TableHeaderCell>โหมด</TableHeaderCell>
            <TableHeaderCell>กลุ่ม</TableHeaderCell>
          </>
        ) : null}
        <TableHeaderCell>ที่อยู่</TableHeaderCell>
        <TableHeaderCell>อัตรา</TableHeaderCell>
        <TableHeaderCell>ม็อด</TableHeaderCell>
        <TableHeaderCell>รายชื่อ</TableHeaderCell>
        <TableHeaderCell>ให้บริการ</TableHeaderCell>
        <TableHeaderCell>ผู้เล่น</TableHeaderCell>
        <TableHeaderCell>รับของ</TableHeaderCell>
        <TableHeaderCell>ปลั๊กอิน</TableHeaderCell>
        <TableHeaderCell>พักรับของ</TableHeaderCell>
        <TableHeaderCell>
          <span className="sr-only">การทำงาน</span>
        </TableHeaderCell>
      </TableRow>
    </TableHead>
  );

  const hasAnomalies = duplicates.length > 0 || missingAddress.length > 0 || modeMismatch.length > 0;
  const loading = serversQuery.isLoading || clustersQuery.isLoading;

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="ระบบ"
        title="เซิร์ฟเวอร์"
        description="จัดการรายชื่อเซิร์ฟเวอร์ตามโหมดเกมและกลุ่ม รวมถึงสถานะการรับของจากร้านค้า"
        actions={
          tab === 'servers' ? (
            <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreateServer}>
              เพิ่มเซิร์ฟเวอร์
            </Button>
          ) : (
            <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreateCluster}>
              เพิ่มกลุ่ม
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="เซิร์ฟเวอร์ทั้งหมด" value={stats.total} loading={serversQuery.isLoading} />
        <Stat label="ออนไลน์ตอนนี้" value={stats.online} loading={serversQuery.isLoading} hint="heartbeat ภายใน 3 นาที" />
        <Stat label="รับของได้" value={stats.deliverable} loading={serversQuery.isLoading} hint="พร้อมรับของจากร้านค้า" />
        <Stat label="แสดงในรายชื่อ" value={stats.listed} loading={serversQuery.isLoading} />
      </div>

      {hasAnomalies && !loading ? (
        <section
          aria-labelledby="server-anomalies"
          className="mt-6 rounded-card border border-warning/30 bg-warning/[0.06] px-5 py-4"
        >
          <h2 id="server-anomalies" className="flex items-center gap-2 text-sm font-semibold text-fg">
            <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.5} aria-hidden="true" />
            ข้อมูลที่ควรตรวจสอบ
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            {duplicates.map((d) => (
              <li key={d.address}>
                ที่อยู่ <span className="font-mono text-fg">{d.address}</span> ซ้ำกันใน{' '}
                {d.servers.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 ? ', ' : ''}
                    <button type="button" className="text-fg underline-offset-4 hover:underline" onClick={() => setDetailId(s.id)}>
                      {s.cluster?.name ? `${s.cluster.name} · ` : ''}
                      {serverTitle(s)}
                    </button>
                  </React.Fragment>
                ))}{' '}
                — ยืนยันพอร์ตจริงก่อนเปิดให้ผู้เล่นเห็น
              </li>
            ))}
            {missingAddress.length ? (
              <li>
                แสดงในรายชื่อแต่ยังไม่มีที่อยู่ <span className="font-mono text-fg">{missingAddress.length}</span> เซิร์ฟเวอร์:{' '}
                {missingAddress.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 ? ', ' : ''}
                    <button type="button" className="text-fg underline-offset-4 hover:underline" onClick={() => setDetailId(s.id)}>
                      {serverTitle(s)}
                    </button>
                  </React.Fragment>
                ))}
              </li>
            ) : null}
            {modeMismatch.length ? (
              <li>
                โหมดเกมไม่ตรงกับกลุ่ม:{' '}
                {modeMismatch.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 ? ', ' : ''}
                    <button type="button" className="text-fg underline-offset-4 hover:underline" onClick={() => setDetailId(s.id)}>
                      {serverTitle(s)}
                    </button>
                  </React.Fragment>
                ))}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'servers' | 'clusters')} className="mt-8">
        <TabsList aria-label="ส่วนของการจัดการเซิร์ฟเวอร์">
          <TabsTrigger value="servers" count={servers.length}>
            เซิร์ฟเวอร์
          </TabsTrigger>
          <TabsTrigger value="clusters" count={clusters.length}>
            กลุ่มเซิร์ฟเวอร์
          </TabsTrigger>
        </TabsList>

        <TabsPanel value="servers">
          <div className="flex flex-wrap items-end gap-3 pb-6">
            <Input
              label="ค้นหา"
              hideLabel
              placeholder="ชื่อ แผนที่ โฮสต์ หรือพอร์ต"
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="w-full sm:w-72"
            />
            <SegmentedControl<ModeFilter>
              aria-label="โหมดเกม"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'ALL', label: 'ทั้งหมด', count: servers.length },
                ...GAME_MODE_ORDER.map((m) => ({ value: m, label: GAME_MODE_LABEL[m], count: modeCounts[m] })),
              ]}
            />
            <Select
              label="กลุ่ม"
              hideLabel
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              wrapperClassName="w-full sm:w-56"
              options={[
                { value: 'all', label: 'ทุกกลุ่ม' },
                ...clusters.map((c) => ({ value: c.id, label: c.name })),
                { value: UNASSIGNED, label: 'ไม่อยู่ในกลุ่ม' },
              ]}
            />
            <SegmentedControl<ViewMode>
              aria-label="มุมมอง"
              size="sm"
              value={view}
              onChange={setView}
              className="sm:ml-auto"
              options={[
                { value: 'grouped', label: 'จัดกลุ่ม' },
                { value: 'flat', label: 'ตารางเดียว' },
              ]}
            />
          </div>

          {serversQuery.isError ? (
            <ErrorMessage
              title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ"
              message={apiErrorText(serversQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
              onRetry={() => void serversQuery.refetch()}
            />
          ) : loading ? (
            <TableContainer aria-busy="true">
              <Table>
                {tableHead}
                <TableBody>
                  <TableLoadingRows columns={columnCount} rows={6} />
                </TableBody>
              </Table>
            </TableContainer>
          ) : servers.length === 0 ? (
            <EmptyState
              title="ยังไม่มีเซิร์ฟเวอร์"
              description="เพิ่มเซิร์ฟเวอร์ทีละเครื่อง หรือนำเข้ารายชื่อจากชุดข้อมูลด้วยคำสั่ง seed:servers ของ backend"
              action={
                <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreateServer}>
                  เพิ่มเซิร์ฟเวอร์
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="ไม่พบเซิร์ฟเวอร์ที่ตรงกับตัวกรอง"
              description="ลองเปลี่ยนคำค้นหรือเลือกโหมดเกมอื่น"
              action={
                filtersActive ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    ล้างตัวกรอง
                  </Button>
                ) : undefined
              }
            />
          ) : flat ? (
            <TableContainer>
              <Table>
                {tableHead}
                <TableBody>{renderRows(filtered)}</TableBody>
              </Table>
            </TableContainer>
          ) : (
            <div className="space-y-12">
              {sections.map((section) => (
                <section key={section.mode} aria-labelledby={`mode-${section.mode}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
                    <h2 id={`mode-${section.mode}`} className="text-lg font-semibold tracking-[-0.015em] text-fg">
                      {GAME_MODE_LABEL[section.mode]}
                    </h2>
                    <span className="font-mono text-xs text-fg-subtle">{section.total}</span>
                    <p className="w-full text-xs text-fg-muted sm:ml-auto sm:w-auto">{GAME_MODE_DESCRIPTION[section.mode]}</p>
                  </div>
                  <div className="mt-6 space-y-8">
                    {section.groups.map((group) => (
                      <div key={group.cluster?.id ?? 'unassigned'}>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-fg">{group.cluster?.name ?? 'ไม่อยู่ในกลุ่ม'}</h3>
                          {group.cluster?.rates ? (
                            <Badge mono outline>
                              {group.cluster.rates}
                            </Badge>
                          ) : null}
                          {group.cluster?.isModded ? <Badge outline>ม็อด</Badge> : null}
                          {group.cluster?.isActive === false ? (
                            <Badge tone="danger" outline>
                              ปิดใช้งาน
                            </Badge>
                          ) : null}
                          <span className="font-mono text-xs text-fg-subtle">{group.servers.length} เซิร์ฟเวอร์</span>
                          {group.cluster ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto"
                              onClick={() => group.cluster && openEditCluster(group.cluster)}
                            >
                              แก้ไขกลุ่ม
                            </Button>
                          ) : null}
                        </div>
                        <TableContainer>
                          <Table>
                            {tableHead}
                            <TableBody>{renderRows(group.servers)}</TableBody>
                          </Table>
                        </TableContainer>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabsPanel>

        <TabsPanel value="clusters">
          {clustersQuery.isError ? (
            <ErrorMessage
              title="โหลดกลุ่มเซิร์ฟเวอร์ไม่สำเร็จ"
              message={apiErrorText(clustersQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
              onRetry={() => void clustersQuery.refetch()}
            />
          ) : (
            <TableContainer aria-busy={clustersQuery.isLoading || undefined}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>กลุ่ม</TableHeaderCell>
                    <TableHeaderCell>คีย์</TableHeaderCell>
                    <TableHeaderCell>โหมด</TableHeaderCell>
                    <TableHeaderCell>อัตรา</TableHeaderCell>
                    <TableHeaderCell>ม็อด</TableHeaderCell>
                    <TableHeaderCell align="right">ลำดับ</TableHeaderCell>
                    <TableHeaderCell align="right">เซิร์ฟเวอร์</TableHeaderCell>
                    <TableHeaderCell>สถานะ</TableHeaderCell>
                    <TableHeaderCell>
                      <span className="sr-only">การทำงาน</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clustersQuery.isLoading ? (
                    <TableLoadingRows columns={9} rows={4} />
                  ) : clusters.length === 0 ? (
                    <TableEmptyRow
                      colSpan={9}
                      title="ยังไม่มีกลุ่มเซิร์ฟเวอร์"
                      description="สร้างกลุ่มเช่น PvE X10 (No Mod) เพื่อจัดหัวข้อในหน้ารายชื่อ"
                      action={
                        <Button variant="secondary" size="sm" onClick={openCreateCluster}>
                          เพิ่มกลุ่ม
                        </Button>
                      }
                    />
                  ) : (
                    clusters.map((c) => {
                      const count = c.serverCount || servers.filter((s) => s.clusterId === c.id).length;
                      return (
                        <TableRow key={c.id} interactive onClick={() => openEditCluster(c)}>
                          <TableCell className="min-w-[200px]">
                            <p className="font-medium text-fg">{c.name}</p>
                            {c.description ? <p className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{c.description}</p> : null}
                          </TableCell>
                          <TableCell mono muted>
                            {c.key}
                          </TableCell>
                          <TableCell>{c.gameMode ? <GameModeBadge mode={c.gameMode} /> : <span className="text-fg-subtle">—</span>}</TableCell>
                          <TableCell mono muted>
                            {c.rates ?? '—'}
                          </TableCell>
                          <TableCell muted>{c.isModded ? 'ม็อด' : '—'}</TableCell>
                          <TableCell align="right" mono>
                            {c.sortOrder}
                          </TableCell>
                          <TableCell align="right" mono>
                            {count}
                          </TableCell>
                          <TableCell>
                            {c.isActive === false ? <Badge tone="danger" outline>ปิดใช้งาน</Badge> : <span className="text-fg-muted">ใช้งาน</span>}
                          </TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <IconButton aria-label={`แก้ไขกลุ่ม ${c.name}`} size="sm" onClick={() => openEditCluster(c)}>
                              <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <p className="mt-4 text-xs text-fg-subtle">
            ยังลบกลุ่มจากหน้านี้ไม่ได้ ปิดใช้งานกลุ่มแทนเพื่อซ่อนจากหน้ารายชื่อ
          </p>
        </TabsPanel>
      </Tabs>

      <ServerDetailDrawer
        server={detail}
        duplicateOf={detailDuplicates}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={openEditServer}
        onRegenerateKey={(server) => setConfirm({ kind: 'regenerate', server })}
        onDelete={(server) => setConfirm({ kind: 'delete', server })}
      />

      <ServerFormDialog
        open={serverForm.open}
        onOpenChange={(open) => !open && setServerForm({ open: false, server: null })}
        server={serverForm.server}
        servers={servers}
        clusters={clusters}
        submitting={saveServer.isPending}
        error={saveServer.isError ? apiErrorText(saveServer.error, 'บันทึกไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ ลองอีกครั้ง') : null}
        onSubmit={(payload) => {
          const id = serverForm.server?.id ?? null;
          if (id !== null && Object.keys(payload).length === 0) {
            toast.info('ไม่มีการเปลี่ยนแปลง');
            setServerForm({ open: false, server: null });
            return;
          }
          saveServer.mutate({ id, payload });
        }}
      />

      <ClusterFormDialog
        open={clusterForm.open}
        onOpenChange={(open) => !open && setClusterForm({ open: false, cluster: null })}
        cluster={clusterForm.cluster}
        submitting={saveCluster.isPending}
        error={saveCluster.isError ? apiErrorText(saveCluster.error, 'บันทึกไม่สำเร็จ ลองอีกครั้ง') : null}
        onSubmit={(payload) => {
          const id = clusterForm.cluster?.id ?? null;
          if (id !== null && Object.keys(payload).length === 0) {
            toast.info('ไม่มีการเปลี่ยนแปลง');
            setClusterForm({ open: false, cluster: null });
            return;
          }
          saveCluster.mutate({ id, payload });
        }}
      />

      <ConfirmByNameDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(open) => !open && !deleteServer.isPending && setConfirm(null)}
        title="ลบเซิร์ฟเวอร์ถาวร"
        description={
          confirm ? (
            <>
              ลบ <span className="text-fg">{serverTitle(confirm.server)}</span> ออกจากระบบ ปลั๊กอินของเซิร์ฟเวอร์นี้จะเชื่อมต่อไม่ได้
              และย้อนกลับไม่ได้ หากต้องการซ่อนชั่วคราว ให้ปิด แสดงในหน้ารายชื่อ แทน
            </>
          ) : null
        }
        confirmValue={confirm?.server.name ?? ''}
        confirmText="ลบถาวร"
        loading={deleteServer.isPending}
        onConfirm={() => confirm && deleteServer.mutate(confirm.server)}
      />

      <ConfirmByNameDialog
        open={confirm?.kind === 'regenerate'}
        onOpenChange={(open) => !open && !regenerateKey.isPending && setConfirm(null)}
        title="สร้างคีย์ API ใหม่"
        description={
          confirm ? (
            <>
              คีย์เดิมของ <span className="text-fg">{serverTitle(confirm.server)}</span> จะใช้ไม่ได้ทันที
              ต้องนำคีย์ใหม่ไปใส่ในปลั๊กอินก่อนเซิร์ฟเวอร์จะเชื่อมต่อได้อีกครั้ง
            </>
          ) : null
        }
        confirmValue={confirm?.server.name ?? ''}
        confirmText="สร้างคีย์ใหม่"
        loading={regenerateKey.isPending}
        onConfirm={() => confirm && regenerateKey.mutate(confirm.server)}
      />

      <Dialog
        open={!!newKey}
        onOpenChange={(open) => !open && setNewKey(null)}
        title="สร้างคีย์ใหม่แล้ว"
        description={newKey ? `คัดลอกคีย์ไปใส่ในปลั๊กอินของ ${serverTitle(newKey.server)} ตอนนี้ คีย์เดิมใช้ไม่ได้แล้ว` : undefined}
        variant="success"
        size="md"
        footer={<Button onClick={() => setNewKey(null)}>เสร็จแล้ว</Button>}
      >
        {newKey ? (
          <CopyField label="คีย์ API ใหม่" value={newKey.key} display={`••••••••${newKey.key.slice(-4)}`} copyLabel="คัดลอกคีย์ API" />
        ) : null}
      </Dialog>
    </div>
  );
}
