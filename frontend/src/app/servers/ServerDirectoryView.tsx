'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, LayoutGrid, List, Search } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatusDot,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { GameModeBadge, ServerAddress, serverStatusKind, useServerDirectory } from '@/components/servers';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { ServerDirectoryGroup, ServerSummary } from '@/lib/contracts/types';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------------ */
/* Tab slugs — stable URLs that the legacy redirects in next.config.js use. */
/* ------------------------------------------------------------------------ */

const ALL = 'all';

/** Directory group key → `?mode=` slug. Unknown groups fall back to their own key. */
const GROUP_SLUG: Record<string, string> = {
  'pve-x10': 'pve',
  'pve-mod-x10': 'pve-mod',
  'pvpve-x10': 'pvpve',
  'pvpve-pre-aqua': 'pre-aqua',
};

/** Short tab labels for known groups (proper nouns stay English). */
const SLUG_LABEL: Record<string, string> = {
  pve: 'PvE',
  'pve-mod': 'PvE Mod',
  pvpve: 'PvPvE',
  'pre-aqua': 'Pre-Aqua',
};

const VIEW_STORAGE_KEY = 'iris.servers.view.v1';
type ViewMode = 'list' | 'grid';

function slugFor(group: ServerDirectoryGroup): string {
  return GROUP_SLUG[group.key] ?? group.key;
}

function tabLabel(group: ServerDirectoryGroup): string {
  return SLUG_LABEL[slugFor(group)] ?? group.name ?? group.key;
}

function matches(server: ServerSummary, group: ServerDirectoryGroup, q: string): boolean {
  const hay = [
    server.displayName,
    server.name,
    server.map ?? '',
    group.name,
    server.connect ? `${server.connect.host}:${server.connect.port}` : '',
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part));
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function statusPageLabel(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? `${u.hostname} · ${last}` : u.hostname;
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

export function ServerDirectoryView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const directory = useServerDirectory();

  const [query, setQuery] = React.useState('');
  const [storedView, setStoredView] = useLocalStorage<ViewMode>(VIEW_STORAGE_KEY, 'list');
  const view: ViewMode = storedView === 'grid' ? 'grid' : 'list';

  const groups = React.useMemo(
    () => (directory.data?.groups ?? []).filter((g) => g.servers.length > 0),
    [directory.data]
  );
  const statusPages = directory.data?.statusPages ?? [];

  const requested = (searchParams.get('mode') ?? '').toLowerCase();
  const activeGroup = groups.find((g) => slugFor(g) === requested || g.key.toLowerCase() === requested) ?? null;
  const tab = activeGroup ? slugFor(activeGroup) : ALL;

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL) params.delete('mode');
    else params.set('mode', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const changeView = (next: ViewMode) => setStoredView(next);

  const q = query.trim();
  const visibleGroups = React.useMemo(() => {
    const scoped = tab === ALL ? groups : groups.filter((g) => slugFor(g) === tab);
    if (!q) return scoped;
    return scoped
      .map((g) => ({ ...g, servers: g.servers.filter((s) => matches(s, g, q)) }))
      .filter((g) => g.servers.length > 0);
  }, [groups, tab, q]);

  const totals = React.useMemo(() => {
    const all = groups.flatMap((g) => g.servers);
    return {
      maps: all.length,
      online: all.filter((s) => s.available && s.online).length,
      players: all.reduce((sum, s) => sum + (s.online ? s.playerCount : 0), 0),
    };
  }, [groups]);

  const tabOptions = [
    { value: ALL, label: 'ทั้งหมด', count: totals.maps },
    ...groups.map((g) => ({ value: slugFor(g), label: tabLabel(g), count: g.servers.length })),
  ];

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="เซิร์ฟเวอร์"
        title="เซิร์ฟเวอร์ IRIS"
        description="แมพทั้งหมดของ IRIS แยกตามโหมดการเล่น คัดลอกที่อยู่หรือกดเข้าเกมผ่าน Steam ได้ทันที"
      >
        <dl className="grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
          <SummaryItem label="แมพทั้งหมด" value={directory.isLoading ? null : totals.maps} />
          <SummaryItem label="ออนไลน์ตอนนี้" value={directory.isLoading ? null : totals.online} />
          <SummaryItem label="ผู้เล่นในเกม" value={directory.isLoading ? null : totals.players} />
        </dl>
      </PageHeader>

      {/* Controls */}
      <div className="z-10 -mx-4 flex flex-col gap-3 border-b border-line bg-canvas px-4 py-3 sm:mx-0 sm:px-0 md:sticky md:top-16 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          aria-label="โหมดการเล่น"
          value={tab}
          onChange={setTab}
          options={tabOptions}
          className="max-w-full"
        />
        <div className="flex items-center gap-2">
          <Input
            aria-label="ค้นหาแมพ"
            placeholder="ค้นหาแมพหรือพอร์ต"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
            wrapperClassName="w-full md:w-64"
            type="search"
          />
          <SegmentedControl
            aria-label="รูปแบบการแสดงผล"
            value={view}
            onChange={changeView}
            size="sm"
            className="hidden md:inline-flex"
            options={[
              { value: 'list', label: <>
                    <List className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    <span className="sr-only">แบบตาราง</span>
                  </> },
              { value: 'grid', label: <>
                    <LayoutGrid className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    <span className="sr-only">แบบการ์ด</span>
                  </> },
            ]}
          />
        </div>
      </div>

      <div className="mt-8 space-y-12" aria-busy={directory.isLoading || undefined}>
        {directory.isLoading ? (
          <DirectorySkeleton />
        ) : directory.isError ? (
          <ErrorMessage
            title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ"
            message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง หรือดูสถานะจากหน้าสถานะภายนอกด้านล่าง"
            onRetry={() => void directory.refetch()}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="ยังไม่มีเซิร์ฟเวอร์ในรายชื่อ"
            description="ทีมงานกำลังเตรียมรายชื่อแมพ กลับมาดูอีกครั้งภายหลัง หรือติดตามประกาศใน Discord"
          />
        ) : visibleGroups.length === 0 ? (
          <EmptyState
            title="ไม่พบแมพที่ค้นหา"
            description={`ไม่มีแมพที่ตรงกับ “${q}” ลองค้นด้วยชื่อแมพภาษาอังกฤษหรือหมายเลขพอร์ต`}
          />
        ) : (
          visibleGroups.map((group) => <GroupSection key={group.key} group={group} view={view} />)
        )}
      </div>

      {/* Footer meta: freshness + external status pages */}
      <div className="mt-14 grid gap-6 border-t border-line pt-8 md:grid-cols-[1fr_auto]">
        <div className="space-y-1 text-sm text-fg-muted">
          <p>
            สถานะอัปเดตอัตโนมัติทุกนาที · ล่าสุด{' '}
            <span className="font-mono tabular-nums text-fg">{formatTime(directory.dataUpdatedAt)}</span>
          </p>
          <p className="text-xs text-fg-subtle">
            “ออนไลน์” หมายถึงเซิร์ฟเวอร์ส่งสัญญาณมาในช่วง 3 นาทีที่ผ่านมา จำนวนผู้เล่นแสดงเมื่อเซิร์ฟเวอร์ออนไลน์
          </p>
        </div>
        {statusPages.length > 0 ? (
          <nav aria-label="หน้าสถานะภายนอก" className="min-w-0">
            <p className="mb-2 text-xs font-medium text-fg-muted">หน้าสถานะภายนอก</p>
            <ul className="space-y-1.5">
              {statusPages.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-sm text-fg underline-offset-4 transition-colors duration-fast hover:text-accent hover:underline"
                  >
                    <span className="truncate font-mono text-[13px]">{statusPageLabel(url)}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
                    <span className="sr-only">(เปิดในแท็บใหม่)</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pieces                                                                    */
/* ------------------------------------------------------------------------ */

function SummaryItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-fg">
        {value === null ? <Skeleton className="h-6 w-10" /> : value.toLocaleString('th-TH')}
      </dd>
    </div>
  );
}

function GroupSection({ group, view }: { group: ServerDirectoryGroup; view: ViewMode }) {
  const headingId = `group-${group.key}`;
  const online = group.servers.filter((s) => s.available && s.online).length;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold tracking-[-0.015em] text-fg">
            {group.name || group.key}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {group.gameMode ? <GameModeBadge mode={group.gameMode} /> : null}
            {group.rates ? (
              <Badge tone="neutral" mono>
                {group.rates}
              </Badge>
            ) : null}
            <Badge tone={group.isModded ? 'info' : 'neutral'}>{group.isModded ? 'ลงม็อด' : 'ไม่ลงม็อด'}</Badge>
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          ออนไลน์ <span className="font-mono tabular-nums text-fg">{online}</span> จาก{' '}
          <span className="font-mono tabular-nums text-fg">{group.servers.length}</span> แมพ
        </p>
      </div>

      {/* Mobile: always stacked cards. Desktop: table or grid. */}
      <ul className={cn('grid gap-3 sm:grid-cols-2', view === 'list' && 'md:hidden', view === 'grid' && 'lg:grid-cols-3')}>
        {group.servers.map((server) => (
          <li key={server.id}>
            <ServerCard server={server} />
          </li>
        ))}
      </ul>

      {view === 'list' ? (
        <TableContainer className="hidden md:block">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-[32%]">แมพ</TableHeaderCell>
                <TableHeaderCell>สถานะ</TableHeaderCell>
                <TableHeaderCell align="right">ผู้เล่น</TableHeaderCell>
                <TableHeaderCell>ที่อยู่สำหรับเข้าเกม</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.servers.map((server) => (
                <TableRow key={server.id} className={cn(!server.available && 'text-fg-muted')}>
                  <TableCell>
                    <MapName server={server} />
                  </TableCell>
                  <TableCell>
                    <ServerStatus server={server} />
                  </TableCell>
                  <TableCell align="right" mono>
                    <Players server={server} />
                  </TableCell>
                  <TableCell>
                    <ServerAddress host={server.connect?.host} port={server.connect?.port} showConnect={server.available} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}
    </section>
  );
}

function MapName({ server }: { server: ServerSummary }) {
  const showMapId = server.map && server.map.replace(/\s+/g, '').toLowerCase() !== server.displayName.replace(/\s+/g, '').toLowerCase();
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{server.displayName}</p>
      {showMapId ? <p className="truncate font-mono text-xs text-fg-subtle">{server.map}</p> : null}
    </div>
  );
}

function ServerStatus({ server }: { server: ServerSummary }) {
  if (!server.available) {
    return (
      <Badge tone="neutral" outline>
        ไม่เปิดให้บริการ
      </Badge>
    );
  }
  return <StatusDot status={serverStatusKind(server)} label={server.online ? 'ออนไลน์' : 'ออฟไลน์'} />;
}

function Players({ server }: { server: ServerSummary }) {
  if (!server.available || !server.online) return <span className="text-fg-subtle">—</span>;
  return (
    <span>
      {server.playerCount.toLocaleString('th-TH')}
      <span className="sr-only"> คน</span>
    </span>
  );
}

function ServerCard({ server }: { server: ServerSummary }) {
  return (
    <Card padding="sm" className={cn('h-full', !server.available && 'bg-surface/60')}>
      <div className="flex items-start justify-between gap-3">
        <MapName server={server} />
        <div className="shrink-0 text-right">
          <ServerStatus server={server} />
          {server.available && server.online ? (
            <p className="mt-1 text-xs text-fg-muted">
              <span className="font-mono tabular-nums text-fg">{server.playerCount}</span> คน
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <ServerAddress host={server.connect?.host} port={server.connect?.port} showConnect={server.available} />
      </div>
    </Card>
  );
}

function DirectorySkeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="space-y-2 rounded-card border border-line p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
