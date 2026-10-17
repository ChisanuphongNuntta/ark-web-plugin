'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Shield, ShieldOff, Users } from 'lucide-react';
import {
  AdminButton,
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
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
  formatCount,
  type PageRequest,
  type StatusTone,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { protectionAdminApi, type AdminProtectionLogRow, type AdminProtectionRow } from '@/lib/api';

interface ProtectionRow extends AdminProtectionRow {
  id: number;
  steamId: string;
  protectionDays: number;
  protectionStartAt: string;
  protectionEndAt: string;
  protectionType: string;
  isActive: boolean;
  grantedBy: string | null;
  grantedReason: string | null;
  tribeProtection: { tribeId: string; tribeName: string | null; serverId: number } | null;
}

interface LogRow extends AdminProtectionLogRow {
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

type Tab = 'list' | 'logs' | 'grant';

const TABS: { value: Tab; label: string }[] = [
  { value: 'list', label: 'รายการคุ้มครอง' },
  { value: 'logs', label: 'ประวัติเหตุการณ์' },
  { value: 'grant', label: 'มอบการคุ้มครอง' },
];

const PROTECTION_TYPES = ['new_player', 'admin_granted'] as const;
const TYPE_META: Record<string, { label: string; tone: StatusTone }> = {
  new_player: { label: 'ผู้เล่นใหม่', tone: 'info' },
  admin_granted: { label: 'แอดมินมอบให้', tone: 'warning' },
};

const EVENT_TYPES = [
  'protection_started',
  'protection_ended',
  'damage_blocked',
  'tribe_protected',
  'admin_grant',
  'admin_revoke',
] as const;
const EVENT_META: Record<string, { label: string; tone: StatusTone }> = {
  protection_started: { label: 'เริ่มคุ้มครอง', tone: 'success' },
  protection_ended: { label: 'สิ้นสุด', tone: 'neutral' },
  damage_blocked: { label: 'บล็อกความเสียหาย', tone: 'info' },
  tribe_protected: { label: 'คุ้มครองเผ่า', tone: 'info' },
  admin_grant: { label: 'แอดมินมอบ', tone: 'warning' },
  admin_revoke: { label: 'แอดมินยกเลิก', tone: 'danger' },
};

const EMPTY_GRANT = {
  steamId: '',
  protectionDays: 7,
  reason: '',
  protectTribe: false,
  tribeId: '',
  tribeName: '',
  serverId: 1,
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function apiErrorText(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | null;
  const fromApi = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof fromApi === 'string' && fromApi ? fromApi : fallback;
}

/** search -> exact steamId mapping happens inside getLogsPage (request stays unchanged). */
const fetchLogsPage = (request: PageRequest, signal: AbortSignal) => protectionAdminApi.getLogsPage(request, signal);

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="glass-card p-4">
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-iris-cyan [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xl font-semibold text-iris-pearl">{value === undefined ? '—' : formatCount(value)}</p>
          <p className="truncate text-xs text-iris-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ProtectionAdmin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [notice, setNotice] = useState<string | null>(null);
  const [grantForm, setGrantForm] = useState(EMPTY_GRANT);
  const [revoking, setRevoking] = useState<ProtectionRow | null>(null);

  const { data: statsData } = useQuery({
    queryKey: ['protection-stats'],
    queryFn: () => protectionAdminApi.getStats().then((res) => res.data),
  });
  const stats: Partial<Stats> = statsData?.stats ?? {};

  const list = usePaginatedQuery({
    key: 'admin-protections',
    fetcher: protectionAdminApi.getProtectionsPage,
    filters: {
      isActive: { values: ['true', 'false'] },
      type: { values: PROTECTION_TYPES },
    },
  });

  const logs = usePaginatedQuery({
    key: 'admin-protection-logs',
    paramPrefix: 'logs_',
    fetcher: fetchLogsPage,
    filters: {
      eventType: { values: EVENT_TYPES },
      serverId: {},
    },
    enabled: tab === 'logs',
  });

  const refreshAll = () => {
    list.invalidate();
    logs.invalidate();
    queryClient.invalidateQueries({ queryKey: ['protection-stats'] });
  };

  const grantMutation = useMutation({
    mutationFn: () =>
      protectionAdminApi.grantProtection({
        steamId: grantForm.steamId.trim(),
        protectionDays: grantForm.protectionDays,
        reason: grantForm.reason.trim() || undefined,
        protectTribe: grantForm.protectTribe,
        tribeId: grantForm.protectTribe ? grantForm.tribeId.trim() : undefined,
        tribeName: grantForm.protectTribe ? grantForm.tribeName.trim() : undefined,
        serverId: grantForm.protectTribe ? grantForm.serverId : undefined,
      }),
    onSuccess: () => {
      refreshAll();
      setNotice(`มอบการคุ้มครอง ${grantForm.protectionDays} วันให้ ${grantForm.steamId.trim()} แล้ว`);
      setGrantForm(EMPTY_GRANT);
      setTab('list');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (steamId: string) => protectionAdminApi.revokeProtection(steamId, { revokeTribe: true }),
    onSuccess: () => refreshAll(),
  });

  const steamIdValid = grantForm.steamId.trim() !== '' && grantForm.steamId.trim().length <= 64;
  const tribeValid = !grantForm.protectTribe || grantForm.tribeId.trim() !== '';
  const canGrant = steamIdValid && tribeValid && !grantMutation.isPending;

  const LIST_COLS = 6;
  const LOG_COLS = 5;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="PROTECTION"
        title="ระบบคุ้มครองผู้เล่น"
        description="ดูและจัดการการคุ้มครองผู้เล่นใหม่และเผ่า รวมถึงประวัติเหตุการณ์จากเซิร์ฟเวอร์"
        actions={
          <AdminButton variant="primary" icon={<Plus />} onClick={() => setTab('grant')}>
            มอบการคุ้มครอง
          </AdminButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={<Users />} label="ผู้เล่นที่คุ้มครองอยู่" value={stats.activePlayers} />
        <StatTile icon={<Building2 />} label="เผ่าที่คุ้มครองอยู่" value={stats.activeTribes} />
        <StatTile icon={<Shield />} label="บล็อกความเสียหายวันนี้" value={stats.damageBlockedToday} />
        <StatTile icon={<Users />} label="ผู้เล่นทั้งหมด" value={stats.totalPlayers} />
        <StatTile icon={<Building2 />} label="เผ่าทั้งหมด" value={stats.totalTribes} />
      </div>

      <SegmentedTabs aria-label="ส่วนของหน้า" value={tab} onChange={setTab} options={TABS} />

      {notice && (
        <AdminNotice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </AdminNotice>
      )}

      {tab === 'list' && (
        <AdminPanel flush>
          <AdminToolbar list={list} searchPlaceholder="ค้นหา Steam ID หรือชื่อเผ่า…">
            <AdminFilterSelect
              label="สถานะ"
              value={list.filters.isActive}
              onChange={(v) => list.setFilter('isActive', v)}
              options={[
                { value: 'true', label: 'กำลังคุ้มครอง' },
                { value: 'false', label: 'หมดอายุ/ยกเลิก' },
              ]}
            />
            <AdminFilterSelect
              label="ประเภท"
              value={list.filters.type}
              onChange={(v) => list.setFilter('type', v)}
              options={PROTECTION_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
            />
          </AdminToolbar>

          <AdminTable caption="รายการคุ้มครอง" busy={list.isFetching}>
            <AdminTableHead>
              <tr>
                <AdminTh>Steam ID</AdminTh>
                <AdminTh>ประเภท</AdminTh>
                <AdminTh>สถานะ</AdminTh>
                <AdminTh>เผ่า</AdminTh>
                <AdminTh>สิ้นสุด</AdminTh>
                <AdminTh align="right">จัดการ</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody
              colSpan={LIST_COLS}
              isInitialLoading={list.isInitialLoading}
              isPlaceholderData={list.isPlaceholderData}
              isError={list.isError}
              onRetry={list.refetch}
              isEmpty={list.items.length === 0}
              emptyTitle={list.isFiltered ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีการคุ้มครอง'}
              emptyAction={
                list.isFiltered ? (
                  <AdminButton size="sm" onClick={list.resetAll}>
                    ล้างตัวกรอง
                  </AdminButton>
                ) : undefined
              }
              skeletonRows={Math.min(list.pageSize, 10)}
            >
              {(list.items as ProtectionRow[]).map((p) => {
                const active = p.isActive && new Date(p.protectionEndAt) > new Date();
                const type = TYPE_META[p.protectionType] ?? { label: p.protectionType, tone: 'neutral' as const };
                return (
                  <AdminTr key={p.id}>
                    <AdminTd mono nowrap>
                      {p.steamId}
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge tone={active ? 'success' : 'neutral'} dot>
                        {active ? 'กำลังคุ้มครอง' : 'หมดอายุ'}
                      </StatusBadge>
                    </AdminTd>
                    <AdminTd muted={!p.tribeProtection}>
                      {p.tribeProtection ? p.tribeProtection.tribeName || p.tribeProtection.tribeId : '—'}
                    </AdminTd>
                    <AdminTd muted nowrap>
                      {formatDate(p.protectionEndAt)}
                    </AdminTd>
                    <AdminTd align="right" nowrap>
                      {active && (
                        <AdminIconButton tone="danger" aria-label={`ยกเลิกการคุ้มครอง ${p.steamId}`} onClick={() => setRevoking(p)}>
                          <ShieldOff />
                        </AdminIconButton>
                      )}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTableBody>
          </AdminTable>

          <Pagination {...list.paginationProps} />
        </AdminPanel>
      )}

      {tab === 'logs' && (
        <AdminPanel flush>
          <AdminToolbar list={logs} searchPlaceholder="Steam ID (ตรงทั้งหมด)…" searchLabel="ค้นหาด้วย Steam ID">
            <AdminFilterSelect
              label="เหตุการณ์"
              value={logs.filters.eventType}
              onChange={(v) => logs.setFilter('eventType', v)}
              options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_META[t].label }))}
            />
          </AdminToolbar>

          <AdminTable caption="ประวัติเหตุการณ์การคุ้มครอง" busy={logs.isFetching}>
            <AdminTableHead>
              <tr>
                <AdminTh>เหตุการณ์</AdminTh>
                <AdminTh>ผู้เล่น / เผ่า</AdminTh>
                <AdminTh>ผู้โจมตี</AdminTh>
                <AdminTh>เซิร์ฟเวอร์</AdminTh>
                <AdminTh>เวลา</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody
              colSpan={LOG_COLS}
              isInitialLoading={logs.isInitialLoading}
              isPlaceholderData={logs.isPlaceholderData}
              isError={logs.isError}
              onRetry={logs.refetch}
              isEmpty={logs.items.length === 0}
              emptyTitle={logs.isFiltered ? 'ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง' : 'ยังไม่มีประวัติเหตุการณ์'}
              emptyAction={
                logs.isFiltered ? (
                  <AdminButton size="sm" onClick={logs.resetAll}>
                    ล้างตัวกรอง
                  </AdminButton>
                ) : undefined
              }
              skeletonRows={Math.min(logs.pageSize, 10)}
            >
              {(logs.items as LogRow[]).map((log) => {
                const ev = EVENT_META[log.eventType] ?? { label: log.eventType, tone: 'neutral' as const };
                return (
                  <AdminTr key={log.id}>
                    <AdminTd>
                      <StatusBadge tone={ev.tone}>{ev.label}</StatusBadge>
                    </AdminTd>
                    <AdminTd>
                      <div className="font-mono">{log.steamId || '—'}</div>
                      {log.tribeId && <div className="text-xs text-iris-muted">เผ่า {log.tribeId}</div>}
                    </AdminTd>
                    <AdminTd mono muted>
                      {log.attackerSteamId || log.attackerTribeId || '—'}
                    </AdminTd>
                    <AdminTd muted nowrap>
                      #{log.serverId}
                    </AdminTd>
                    <AdminTd muted nowrap>
                      {formatDate(log.createdAt)}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTableBody>
          </AdminTable>

          <Pagination {...logs.paginationProps} />
        </AdminPanel>
      )}

      {tab === 'grant' && (
        <AdminPanel title="มอบการคุ้มครอง" description="ผู้เล่นจะได้รับการคุ้มครองทันที และบันทึกในประวัติเหตุการณ์">
          <form
            className="max-w-xl space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canGrant) grantMutation.mutate();
            }}
          >
            <AdminField
              label="Steam ID"
              required
              error={grantForm.steamId.trim().length > 64 ? 'Steam ID ยาวเกินไป' : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="text"
                  value={grantForm.steamId}
                  onChange={(e) => setGrantForm({ ...grantForm, steamId: e.target.value })}
                  placeholder="76561198000000000"
                  className={adminInputClass}
                />
              )}
            </AdminField>

            <AdminField label="จำนวนวัน" hint="1–365 วัน">
              {(field) => (
                <input
                  {...field}
                  type="number"
                  min={1}
                  max={365}
                  value={grantForm.protectionDays}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    setGrantForm({ ...grantForm, protectionDays: Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 7 });
                  }}
                  className={adminInputClass}
                />
              )}
            </AdminField>

            <AdminField label="เหตุผล (ไม่บังคับ)">
              {(field) => (
                <input
                  {...field}
                  type="text"
                  maxLength={200}
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  placeholder="เช่น ชดเชยเซิร์ฟเวอร์ล่ม"
                  className={adminInputClass}
                />
              )}
            </AdminField>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-iris-pearl">
              <input
                type="checkbox"
                checked={grantForm.protectTribe}
                onChange={(e) => setGrantForm({ ...grantForm, protectTribe: e.target.checked })}
                className="h-4 w-4 accent-iris-cyan"
              />
              คุ้มครองเผ่าด้วย
            </label>

            {grantForm.protectTribe && (
              <div className="space-y-4 border-l border-white/10 pl-4">
                <AdminField label="Tribe ID" required>
                  {(field) => (
                    <input
                      {...field}
                      type="text"
                      value={grantForm.tribeId}
                      onChange={(e) => setGrantForm({ ...grantForm, tribeId: e.target.value })}
                      className={adminInputClass}
                    />
                  )}
                </AdminField>
                <AdminField label="ชื่อเผ่า">
                  {(field) => (
                    <input
                      {...field}
                      type="text"
                      value={grantForm.tribeName}
                      onChange={(e) => setGrantForm({ ...grantForm, tribeName: e.target.value })}
                      className={adminInputClass}
                    />
                  )}
                </AdminField>
                <AdminField label="Server ID">
                  {(field) => (
                    <input
                      {...field}
                      type="number"
                      min={1}
                      value={grantForm.serverId}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        setGrantForm({ ...grantForm, serverId: Number.isFinite(n) && n >= 1 ? n : 1 });
                      }}
                      className={adminInputClass}
                    />
                  )}
                </AdminField>
              </div>
            )}

            {grantMutation.isError && (
              <AdminNotice tone="danger">{apiErrorText(grantMutation.error, 'มอบการคุ้มครองไม่สำเร็จ โปรดลองอีกครั้ง')}</AdminNotice>
            )}

            <div className="flex gap-2 pt-2">
              <AdminButton type="submit" variant="primary" icon={<Shield />} loading={grantMutation.isPending} disabled={!canGrant}>
                มอบการคุ้มครอง
              </AdminButton>
              <AdminButton variant="ghost" onClick={() => setTab('list')} disabled={grantMutation.isPending}>
                ยกเลิก
              </AdminButton>
            </div>
          </form>
        </AdminPanel>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revokeMutation.mutateAsync(revoking!.steamId)}
        title="ยกเลิกการคุ้มครอง?"
        description={revoking ? `Steam ID ${revoking.steamId} จะไม่ได้รับการคุ้มครองอีก รวมถึงการคุ้มครองเผ่า` : undefined}
        confirmText="ยกเลิกการคุ้มครอง"
        cancelText="ไม่ใช่"
      />
    </AdminPage>
  );
}

export default function ProtectionAdminPage() {
  return (
    <AdminSuspense>
      <ProtectionAdmin />
    </AdminSuspense>
  );
}
