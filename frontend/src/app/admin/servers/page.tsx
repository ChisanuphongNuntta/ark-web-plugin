'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Pencil, Plus, Power, RotateCw, Trash2 } from 'lucide-react';
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
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store';
import {
  adminApi,
  api,
  GAME_MODE_FILTERS,
  SERVER_STATUS_FILTERS,
  type AdminServerRow,
  type GameMode,
  type GameModeFilter,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const MODE_LABEL: Record<GameModeFilter, string> = {
  PVE: 'PvE',
  PVE_MOD: 'PvE Mod',
  PVPVE: 'PvPvE',
  NONE: 'ไม่ระบุ',
};

const STATUS_OPTIONS = [
  { value: 'online', label: 'ออนไลน์' },
  { value: 'offline', label: 'ออฟไลน์' },
  { value: 'active', label: 'เปิดใช้งาน' },
  { value: 'inactive', label: 'ปิดใช้งาน' },
] as const;

const MAP_OPTIONS = [
  { value: 'TheIsland', label: 'The Island' },
  { value: 'TheCenter', label: 'The Center' },
  { value: 'ScorchedEarth', label: 'Scorched Earth' },
  { value: 'Ragnarok', label: 'Ragnarok' },
  { value: 'Aberration', label: 'Aberration' },
  { value: 'Extinction', label: 'Extinction' },
  { value: 'Valguero', label: 'Valguero' },
  { value: 'Genesis', label: 'Genesis' },
  { value: 'Genesis2', label: 'Genesis 2' },
  { value: 'CrystalIsles', label: 'Crystal Isles' },
  { value: 'LostIsland', label: 'Lost Island' },
  { value: 'Fjordur', label: 'Fjordur' },
];

const HOST_PATTERN = /^[A-Za-z0-9.-]*$/;
const COLS = 9;

interface ClusterOption {
  id: string;
  key: string;
  name: string;
}

interface ServerForm {
  name: string;
  displayName: string;
  map: string;
  gameMode: '' | GameMode;
  clusterId: string;
  connectHost: string;
  connectPort: string;
  chatTag: string;
  chatColor: string;
  chatIcon: string;
}

const EMPTY_FORM: ServerForm = {
  name: '',
  displayName: '',
  map: '',
  gameMode: '',
  clusterId: '',
  connectHost: '',
  connectPort: '',
  chatTag: '',
  chatColor: '#FF5722',
  chatIcon: '',
};

function formFromServer(s: AdminServerRow): ServerForm {
  return {
    name: s.name ?? '',
    displayName: s.displayName ?? '',
    map: s.map ?? '',
    gameMode: s.gameMode ?? '',
    clusterId: s.clusterId ?? '',
    connectHost: s.connectHost ?? '',
    connectPort: s.connectPort ? String(s.connectPort) : '',
    chatTag: s.chatTag ?? '',
    chatColor: s.chatColor || '#FF5722',
    chatIcon: s.chatIcon ?? '',
  };
}

type FormErrors = Partial<Record<keyof ServerForm, string>>;

function validateForm(f: ServerForm): FormErrors {
  const errors: FormErrors = {};
  if (!f.name.trim()) errors.name = 'กรุณากรอกชื่อเซิร์ฟเวอร์';
  if (!f.map) errors.map = 'กรุณาเลือกแมพ';
  if (f.connectHost.trim() && !HOST_PATTERN.test(f.connectHost.trim())) {
    errors.connectHost = 'ใช้ได้เฉพาะชื่อโฮสต์หรือ IPv4';
  }
  if (f.connectPort.trim()) {
    const port = Number(f.connectPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.connectPort = 'พอร์ตต้องอยู่ระหว่าง 1–65535';
  }
  return errors;
}

/** Body for POST/PUT /admin/servers. '' clears nullable text columns server-side. */
function formToPayload(f: ServerForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: f.name.trim(),
    map: f.map,
    displayName: f.displayName.trim(),
    clusterId: f.clusterId,
    connectHost: f.connectHost.trim() || null,
    connectPort: f.connectPort.trim() ? Number(f.connectPort) : null,
    chatTag: f.chatTag.trim(),
    chatColor: f.chatColor.trim(),
    chatIcon: f.chatIcon.trim(),
  };
  if (f.gameMode) payload.gameMode = f.gameMode;
  return payload;
}

function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; error?: string } } } | null;
  return e?.response?.data?.message || e?.response?.data?.error || fallback;
}

const relativeFormatter = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('th', { numeric: 'auto' }) : null;

function formatRelativeThai(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.round((time - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'เมื่อสักครู่';
  if (!relativeFormatter) return new Date(iso).toLocaleString('th-TH');
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return relativeFormatter.format(Math.round(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function formatExact(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }) : '';
}

/** Current time, refreshed on an interval so relative labels stay correct. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ServersAdmin() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { isRoot } = usePermissions();

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push('/login');
    else if (!user.isAdmin) router.push('/');
  }, [user, authLoading, router]);

  const canView = !authLoading && !!user && isRoot;

  const list = usePaginatedQuery({
    key: 'admin-servers',
    fetcher: adminApi.getServersPage,
    filters: {
      gameMode: { values: GAME_MODE_FILTERS },
      status: { values: SERVER_STATUS_FILTERS },
      clusterId: {},
    },
    enabled: canView,
    refetchInterval: 30_000,
  });

  const clustersQuery = useQuery({
    queryKey: ['admin-clusters'],
    queryFn: async (): Promise<ClusterOption[]> => {
      const { data } = await api.get('/admin/clusters');
      return Array.isArray(data?.clusters) ? data.clusters : [];
    },
    enabled: canView,
    staleTime: 60_000,
  });
  const clusters = clustersQuery.data ?? [];

  const now = useNow(30_000);
  const counts = list.data?.counts;

  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // --- Add / edit -----------------------------------------------------------
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; server: AdminServerRow } | null>(null);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: 'create' });
  };
  const openEdit = (server: AdminServerRow) => {
    setForm(formFromServer(server));
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: 'edit', server });
  };

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editor?.mode === 'edit') return adminApi.updateServer(editor.server.id, payload);
      return adminApi.createServer(payload as { name: string; map?: string });
    },
    onSuccess: async () => {
      const wasEdit = editor?.mode === 'edit';
      setEditor(null);
      setNotice({ tone: 'success', text: wasEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มเซิร์ฟเวอร์แล้ว (เริ่มต้นในโหมดพักการส่งของ)' });
      await list.invalidate();
    },
    onError: (error) => setFormError(errorMessage(error, 'บันทึกไม่สำเร็จ กรุณาลองใหม่')),
  });

  const submitForm = () => {
    const errors = validateForm(form);
    setFormErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;
    save.mutate(formToPayload(form));
  };

  const setField = <K extends keyof ServerForm>(key: K, value: ServerForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // --- Toggle active ----------------------------------------------------------
  const toggleActive = useMutation({
    mutationFn: (server: AdminServerRow) => adminApi.updateServer(server.id, { isActive: !server.isActive }),
    onSuccess: async (_res, server) => {
      setNotice({ tone: 'success', text: `${server.isActive ? 'ปิด' : 'เปิด'}ใช้งาน ${server.displayName || server.name} แล้ว` });
      await list.invalidate();
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, 'เปลี่ยนสถานะไม่สำเร็จ') }),
  });

  // --- Delete -----------------------------------------------------------------
  const [deleting, setDeleting] = useState<AdminServerRow | null>(null);
  const confirmDelete = async () => {
    if (!deleting) return;
    await adminApi.deleteServer(deleting.id);
    setNotice({ tone: 'success', text: `ลบ ${deleting.displayName || deleting.name} แล้ว` });
    await list.invalidate();
  };

  // --- API key (regenerate / copy) -------------------------------------------
  // List rows only carry apiKeyLast4. The full key is known only right after a
  // regenerate in this session; it is kept in memory and never persisted.
  const [revealedKeys, setRevealedKeys] = useState<Record<number, string>>({});
  const [regenerating, setRegenerating] = useState<AdminServerRow | null>(null);
  const [newKey, setNewKey] = useState<{ server: AdminServerRow; key: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const confirmRegenerate = async () => {
    if (!regenerating) return;
    const target = regenerating;
    const res = await adminApi.regenerateServerKey(target.id);
    const key: unknown = res.data?.server?.apiKey;
    if (typeof key === 'string' && key) {
      setRevealedKeys((prev) => ({ ...prev, [target.id]: key }));
      setNewKey({ server: target, key });
    } else {
      setNotice({ tone: 'success', text: 'สร้าง API key ใหม่แล้ว' });
    }
    await list.invalidate();
  };

  const handleCopy = async (id: number, key: string) => {
    if (await copyText(key)) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } else {
      setNotice({ tone: 'danger', text: 'คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง' });
    }
  };

  // --- Render -----------------------------------------------------------------
  if (authLoading || !user) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="SERVERS" title="จัดการเซิร์ฟเวอร์" description="กำลังตรวจสอบสิทธิ์…" />
      </AdminPage>
    );
  }

  if (!isRoot) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="SERVERS" title="จัดการเซิร์ฟเวอร์" />
        <AdminNotice tone="danger" title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
          เฉพาะผู้ดูแลระดับ Root เท่านั้น
        </AdminNotice>
      </AdminPage>
    );
  }

  const clusterFilterOptions = [
    ...clusters.map((c) => ({ value: c.id, label: c.name })),
    { value: 'none', label: 'ไม่มีคลัสเตอร์' },
  ];
  // Keep a cluster id from the URL selectable even before/if the cluster list loads.
  if (list.filters.clusterId && !clusterFilterOptions.some((o) => o.value === list.filters.clusterId)) {
    clusterFilterOptions.unshift({ value: list.filters.clusterId, label: 'คลัสเตอร์ที่เลือก' });
  }

  const mapOptions =
    form.map && !MAP_OPTIONS.some((m) => m.value === form.map) ? [{ value: form.map, label: form.map }, ...MAP_OPTIONS] : MAP_OPTIONS;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="SERVERS"
        title="จัดการเซิร์ฟเวอร์"
        description="เซิร์ฟเวอร์ทั้งหมดแยกตามโหมดเกมและคลัสเตอร์ สถานะออนไลน์อัปเดตทุก 30 วินาที"
        actions={
          <AdminButton variant="primary" icon={<Plus />} onClick={openCreate}>
            เพิ่มเซิร์ฟเวอร์
          </AdminButton>
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อ แมพ หรือโฮสต์…">
          <AdminFilterSelect
            label="คลัสเตอร์"
            value={list.filters.clusterId ?? ''}
            onChange={(v) => list.setFilter('clusterId', v)}
            options={clusterFilterOptions}
          />
          <AdminFilterSelect
            label="สถานะ"
            value={list.filters.status ?? ''}
            onChange={(v) => list.setFilter('status', v)}
            options={STATUS_OPTIONS}
          />
        </AdminToolbar>

        <div className="border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามโหมดเกม"
            value={list.filters.gameMode ?? ''}
            onChange={(v) => list.setFilter('gameMode', v)}
            options={[
              { value: '', label: 'ทั้งหมด', count: counts?.all },
              // 'ไม่ระบุ' (NONE) only appears while some server actually has no mode, or it is the active filter.
              ...GAME_MODE_FILTERS.filter((m) => m !== 'NONE' || (counts?.NONE ?? 0) > 0 || list.filters.gameMode === 'NONE').map(
                (m) => ({ value: m, label: MODE_LABEL[m], count: counts?.[m] }),
              ),
            ]}
          />
        </div>

        <AdminTable caption="รายการเซิร์ฟเวอร์" busy={list.isFetching} minWidth={1080}>
          <AdminTableHead>
            <tr>
              <AdminTh>ID</AdminTh>
              <AdminTh>ชื่อ</AdminTh>
              <AdminTh>แมพ</AdminTh>
              <AdminTh>โหมด</AdminTh>
              <AdminTh>ที่อยู่</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>Heartbeat ล่าสุด</AdminTh>
              <AdminTh>API key</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? errorMessage(list.error, 'โหลดรายการเซิร์ฟเวอร์ไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบเซิร์ฟเวอร์ที่ตรงกับตัวกรอง' : 'ยังไม่มีเซิร์ฟเวอร์'}
            emptyDescription={list.isFiltered ? undefined : 'กด “เพิ่มเซิร์ฟเวอร์” เพื่อเริ่มต้น'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างตัวกรอง
                </AdminButton>
              ) : undefined
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((s) => {
              const label = s.displayName || s.name;
              const revealed = revealedKeys[s.id];
              const togglingThis = toggleActive.isPending && toggleActive.variables?.id === s.id;
              return (
                <AdminTr key={s.id}>
                  <AdminTd mono muted nowrap>
                    {s.id}
                  </AdminTd>
                  <AdminTd>
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs text-iris-muted">
                      {s.displayName && s.displayName !== s.name ? `${s.name} · ` : ''}
                      {s.cluster?.name ?? 'ไม่มีคลัสเตอร์'}
                    </div>
                  </AdminTd>
                  <AdminTd muted nowrap>
                    {s.map || '—'}
                  </AdminTd>
                  <AdminTd nowrap>
                    <StatusBadge tone={s.gameMode ? 'info' : 'neutral'}>{MODE_LABEL[s.gameMode ?? 'NONE']}</StatusBadge>
                  </AdminTd>
                  <AdminTd mono nowrap muted={!s.connectHost}>
                    {s.connectHost ? `${s.connectHost}${s.connectPort ? `:${s.connectPort}` : ''}` : '—'}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={s.online ? 'success' : 'neutral'} dot>
                        {s.online ? 'ออนไลน์' : 'ออฟไลน์'}
                      </StatusBadge>
                      <StatusBadge tone={s.isActive ? 'info' : 'danger'}>{s.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</StatusBadge>
                      {s.drainMode && (
                        <StatusBadge tone="warning" title="หยุดรับคิวส่งของชั่วคราว (drain)">
                          พักการส่งของ
                        </StatusBadge>
                      )}
                    </div>
                  </AdminTd>
                  <AdminTd nowrap muted>
                    {s.lastHeartbeat ? (
                      <time dateTime={s.lastHeartbeat} title={formatExact(s.lastHeartbeat)}>
                        {formatRelativeThai(s.lastHeartbeat, now)}
                      </time>
                    ) : (
                      'ยังไม่เคยเชื่อมต่อ'
                    )}
                  </AdminTd>
                  <AdminTd nowrap>
                    <div className="flex items-center gap-1">
                      <code
                        className="rounded-md border border-white/[0.06] bg-iris-ink/60 px-2 py-1 font-mono text-xs text-iris-muted"
                        title={revealed ? 'คีย์ใหม่ที่สร้างในรอบนี้' : 'แสดงเฉพาะ 4 ตัวท้าย'}
                      >
                        {s.apiKeyLast4 ? `••••${s.apiKeyLast4}` : '—'}
                      </code>
                      {revealed && (
                        <AdminIconButton aria-label={`คัดลอก API key ของ ${label}`} onClick={() => handleCopy(s.id, revealed)}>
                          {copiedId === s.id ? <Check /> : <Copy />}
                        </AdminIconButton>
                      )}
                      <AdminIconButton aria-label={`สร้าง API key ใหม่ให้ ${label}`} onClick={() => setRegenerating(s)}>
                        <RotateCw />
                      </AdminIconButton>
                    </div>
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <AdminIconButton aria-label={`แก้ไข ${label}`} onClick={() => openEdit(s)}>
                      <Pencil />
                    </AdminIconButton>
                    <AdminIconButton
                      aria-label={`${s.isActive ? 'ปิด' : 'เปิด'}ใช้งาน ${label}`}
                      onClick={() => toggleActive.mutate(s)}
                      disabled={togglingThis}
                    >
                      <Power />
                    </AdminIconButton>
                    <AdminIconButton tone="danger" aria-label={`ลบ ${label}`} onClick={() => setDeleting(s)}>
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

      <AdminPanel title="ตั้งค่าปลั๊กอิน" description="คัดลอก API key และ Server ID ไปใส่ใน config.json ของปลั๊กอิน">
        <pre className="overflow-x-auto rounded-xl border border-white/[0.06] bg-iris-ink/60 p-4 font-mono text-xs text-iris-pearl">
          {`{
  "HeartShop": {
    "ApiUrl": "https://localhost:8443/api/plugin",
    "ApiKey": "<PASTE_API_KEY_HERE>",
    "ServerId": <SERVER_ID>,
    ...
  }
}`}
        </pre>
      </AdminPanel>

      {/* Add / edit */}
      <AdminDialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        busy={save.isPending}
        size="lg"
        title={editor?.mode === 'edit' ? `แก้ไข ${editor.server.displayName || editor.server.name}` : 'เพิ่มเซิร์ฟเวอร์'}
        description={editor?.mode === 'create' ? 'เซิร์ฟเวอร์ใหม่จะเริ่มในโหมดพักการส่งของ จนกว่าจะออกคีย์และทดสอบเสร็จ' : undefined}
        footer={
          <>
            <AdminButton variant="ghost" onClick={() => setEditor(null)} disabled={save.isPending}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="primary" onClick={submitForm} loading={save.isPending}>
              {editor?.mode === 'edit' ? 'บันทึก' : 'เพิ่มเซิร์ฟเวอร์'}
            </AdminButton>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
        >
          {formError && <AdminNotice tone="danger">{formError}</AdminNotice>}

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="ชื่อระบบ" required error={formErrors.name} hint="ใช้อ้างอิงภายใน เช่น IslandPVE">
              {(field) => (
                <input
                  {...field}
                  className={adminInputClass}
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => setField('name', e.target.value)}
                />
              )}
            </AdminField>
            <AdminField label="ชื่อที่แสดง" hint="ชื่อที่ผู้เล่นเห็นในหน้าร้าน">
              {(field) => (
                <input
                  {...field}
                  className={adminInputClass}
                  value={form.displayName}
                  maxLength={120}
                  onChange={(e) => setField('displayName', e.target.value)}
                />
              )}
            </AdminField>
            <AdminField label="แมพ" required error={formErrors.map}>
              {(field) => (
                <select {...field} className={adminInputClass} value={form.map} onChange={(e) => setField('map', e.target.value)}>
                  <option value="">เลือกแมพ</option>
                  {mapOptions.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </AdminField>
            <AdminField label="โหมดเกม">
              {(field) => (
                <select
                  {...field}
                  className={adminInputClass}
                  value={form.gameMode}
                  onChange={(e) => setField('gameMode', e.target.value as ServerForm['gameMode'])}
                >
                  {editor?.mode !== 'edit' && <option value="">ค่าเริ่มต้น</option>}
                  <option value="PVE">PvE</option>
                  <option value="PVE_MOD">PvE Mod</option>
                  <option value="PVPVE">PvPvE</option>
                </select>
              )}
            </AdminField>
            <AdminField label="คลัสเตอร์">
              {(field) => (
                <select {...field} className={adminInputClass} value={form.clusterId} onChange={(e) => setField('clusterId', e.target.value)}>
                  <option value="">ไม่มีคลัสเตอร์</option>
                  {form.clusterId && !clusters.some((c) => c.id === form.clusterId) && (
                    <option value={form.clusterId}>
                      {editor?.mode === 'edit' ? editor.server.cluster?.name ?? form.clusterId : form.clusterId}
                    </option>
                  )}
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </AdminField>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <AdminField label="โฮสต์สำหรับเชื่อมต่อ" error={formErrors.connectHost}>
                {(field) => (
                  <input
                    {...field}
                    className={`${adminInputClass} font-mono`}
                    value={form.connectHost}
                    maxLength={253}
                    placeholder="play.example.com"
                    onChange={(e) => setField('connectHost', e.target.value)}
                  />
                )}
              </AdminField>
              <AdminField label="พอร์ต" error={formErrors.connectPort}>
                {(field) => (
                  <input
                    {...field}
                    className={`${adminInputClass} font-mono`}
                    inputMode="numeric"
                    value={form.connectPort}
                    placeholder="7777"
                    onChange={(e) => setField('connectPort', e.target.value.replace(/[^0-9]/g, ''))}
                  />
                )}
              </AdminField>
            </div>
          </div>

          <fieldset className="space-y-3 border-t border-white/[0.06] pt-4">
            <legend className="text-sm font-semibold text-iris-pearl">การแสดงผลในแชท</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <AdminField label="แท็ก">
                {(field) => (
                  <input
                    {...field}
                    className={adminInputClass}
                    value={form.chatTag}
                    maxLength={32}
                    placeholder="[PVE1]"
                    onChange={(e) => setField('chatTag', e.target.value)}
                  />
                )}
              </AdminField>
              <AdminField label="สี">
                {(field) => (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label="เลือกสี"
                      value={/^#[0-9a-fA-F]{6}$/.test(form.chatColor) ? form.chatColor : '#FF5722'}
                      onChange={(e) => setField('chatColor', e.target.value)}
                      className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                    <input
                      {...field}
                      className={`${adminInputClass} font-mono`}
                      value={form.chatColor}
                      maxLength={32}
                      onChange={(e) => setField('chatColor', e.target.value)}
                    />
                  </div>
                )}
              </AdminField>
              <AdminField label="ไอคอน">
                {(field) => (
                  <input
                    {...field}
                    className={adminInputClass}
                    value={form.chatIcon}
                    maxLength={32}
                    onChange={(e) => setField('chatIcon', e.target.value)}
                  />
                )}
              </AdminField>
            </div>
            {(form.chatTag || form.chatIcon) && (
              <p className="rounded-xl border border-white/[0.06] bg-iris-ink/60 px-3 py-2 text-sm">
                <span className="text-xs text-iris-muted">ตัวอย่าง: </span>
                <span style={{ color: form.chatColor }}>
                  {form.chatIcon && `${form.chatIcon} `}
                  {form.chatTag || '[TAG]'}
                </span>
                <span className="text-iris-pearl"> PlayerName: สวัสดี!</span>
              </p>
            )}
          </fieldset>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </AdminDialog>

      {/* Delete */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="ลบเซิร์ฟเวอร์นี้?"
        description={
          deleting
            ? `ลบ ${deleting.displayName || deleting.name} (ID ${deleting.id}) ถาวร การลบไม่สามารถย้อนกลับได้`
            : undefined
        }
        confirmText="ลบเซิร์ฟเวอร์"
        confirmPhrase={deleting?.name}
      />

      {/* Regenerate API key */}
      <ConfirmDialog
        open={regenerating !== null}
        onClose={() => setRegenerating(null)}
        onConfirm={confirmRegenerate}
        tone="default"
        title="สร้าง API key ใหม่?"
        description={
          regenerating
            ? `คีย์เดิมของ ${regenerating.displayName || regenerating.name} จะใช้ไม่ได้ทันที ต้องอัปเดต config ของปลั๊กอินด้วยคีย์ใหม่`
            : undefined
        }
        confirmText="สร้างคีย์ใหม่"
      />

      {/* New key (shown once) */}
      <AdminDialog
        open={newKey !== null}
        onClose={() => setNewKey(null)}
        title="API key ใหม่"
        description={newKey ? `สำหรับ ${newKey.server.displayName || newKey.server.name} (Server ID ${newKey.server.id}) คัดลอกเก็บไว้ คีย์เต็มจะไม่แสดงในรายการอีก` : undefined}
        footer={
          <>
            <AdminButton variant="ghost" onClick={() => setNewKey(null)}>
              ปิด
            </AdminButton>
            <AdminButton
              variant="primary"
              icon={newKey && copiedId === newKey.server.id ? <Check /> : <Copy />}
              onClick={() => newKey && handleCopy(newKey.server.id, newKey.key)}
            >
              {newKey && copiedId === newKey.server.id ? 'คัดลอกแล้ว' : 'คัดลอกคีย์'}
            </AdminButton>
          </>
        }
      >
        {newKey && (
          <code className="block break-all rounded-xl border border-white/[0.06] bg-iris-ink/60 p-3 font-mono text-xs text-iris-pearl">
            {newKey.key}
          </code>
        )}
      </AdminDialog>
    </AdminPage>
  );
}

export default function ServersPage() {
  return (
    <AdminSuspense>
      <ServersAdmin />
    </AdminSuspense>
  );
}
