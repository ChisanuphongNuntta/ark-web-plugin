'use client';

/**
 * /admin/vip — VIP console (admin | root). Contract: backend/contracts/vip-2026-10.md.
 *
 *   Packages: create / edit price (THB, real money only), duration, Permissions group,
 *             tier, frame, label, active. A package can be activated only with a price > 0.
 *   Members:  every membership (server-paginated, search + filters), grant / extend / revoke
 *             with a reason (audited), resync the player's group to the Permissions plugin.
 *   Live:     'admin:vip' refreshes the summary, packages and members.
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Crown, Pencil, Plus, RefreshCw, ShieldOff, UserPlus } from 'lucide-react';
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
  type StatusTone,
} from '@/components/admin';
import { AdminAccessGate, IgnoredFiltersNotice } from '@/components/admin/console/ConsoleBits';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';
import { adminApi } from '@/lib/api';
import { apiErrorText, httpStatus } from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { REALTIME_EVENTS } from '@/lib/realtime/events';
import {
  MEMBERSHIP_SOURCE_TH,
  MEMBERSHIP_STATUS_TH,
  SYNC_STATUS_TH,
  VIP_FRAME_STYLES,
  VIP_MEMBERSHIP_SOURCES,
  VIP_MEMBERSHIP_STATES,
  VIP_SYNC_STATUSES,
  daysRemaining,
  durationLabel,
  formatThb,
  isZeroPrice,
  resolveFrameStyle,
  type VipMembership,
  type VipPackage,
} from '@/lib/vip';
import { vipAdminApi, type VipPackageInput } from '@/lib/vipApi';

const PACKAGES_KEY = 'admin-vip-packages';
const MEMBERS_KEY = 'admin-vip-memberships';
const SUMMARY_KEY = 'admin-vip-summary';
const MEMBER_COLS = 8;
const PACKAGE_COLS = 8;
const MAX_DAYS = 3650;

type Tab = 'members' | 'packages';

function stateTone(state: string): StatusTone {
  switch (state) {
    case 'active':
      return 'success';
    case 'scheduled':
      return 'info';
    case 'expired':
      return 'neutral';
    case 'revoked':
      return 'danger';
    default:
      return 'neutral';
  }
}

function syncTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'synced':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'no_steam':
    case 'unqueued':
      return 'warning';
    default:
      return 'neutral';
  }
}

/* ------------------------------------------------------------------ */
/* Summary strip                                                       */
/* ------------------------------------------------------------------ */

function SummaryTile({ label, value, hint, href }: { label: string; value: number | null | undefined; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-iris-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-iris-pearl">{value === null || value === undefined ? '—' : value.toLocaleString('th-TH')}</p>
      {hint && <p className="text-[11px] text-iris-muted">{hint}</p>}
    </>
  );
  const cls = 'block rounded-xl border border-white/[0.06] bg-white/[0.03] p-3';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-iris-cyan/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function VipSummaryStrip() {
  const summary = useQuery({
    queryKey: [SUMMARY_KEY],
    queryFn: ({ signal }) => vipAdminApi.getSummary(signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const s = summary.data;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <SummaryTile label="ผู้เล่น VIP ตอนนี้" value={s?.activeUsers} />
      <SummaryTile label="หมดอายุใน 7 วัน" value={s?.expiringIn7Days} />
      <SummaryTile label="รอซิงก์เข้าเกม" value={s?.sync.pending} hint="รอเซิร์ฟเวอร์ที่ออนไลน์รับงาน" />
      <SummaryTile
        label="ซิงก์ไม่สำเร็จ"
        value={(s?.sync.failed ?? 0) + (s?.permissionJobsFailed ?? 0) || (s ? 0 : null)}
        href="/admin/deliveries?deliveryType=permission_grant&status=dead_letter"
      />
      <SummaryTile label="ยังไม่เชื่อม Steam" value={s?.sync.noSteam} hint="สิทธิ์ในเกมรอจนกว่าจะเชื่อม" />
      <SummaryTile label="สลิป VIP รออนุมัติ" value={s?.pendingVipSlips} href="/admin?tab=slips" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Package form                                                        */
/* ------------------------------------------------------------------ */

interface PackageForm {
  key: string;
  name: string;
  description: string;
  permissionGroup: string;
  tierRank: string;
  frameStyle: string;
  badgeLabel: string;
  priceThb: string;
  permanent: boolean;
  durationDays: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY_PACKAGE: PackageForm = {
  key: '',
  name: '',
  description: '',
  permissionGroup: 'VIP',
  tierRank: '1',
  frameStyle: 'vip-gold',
  badgeLabel: 'VIP',
  priceThb: '',
  permanent: false,
  durationDays: '30',
  isActive: false,
  sortOrder: '0',
};

function formFromPackage(p: VipPackage): PackageForm {
  return {
    key: p.key,
    name: p.name,
    description: p.description ?? '',
    permissionGroup: p.permissionGroup,
    tierRank: String(p.tierRank),
    frameStyle: resolveFrameStyle(p.frameStyle),
    badgeLabel: p.badgeLabel,
    priceThb: isZeroPrice(p.priceThb) ? '' : p.priceThb,
    permanent: p.durationDays === null,
    durationDays: p.durationDays === null ? '30' : String(p.durationDays),
    isActive: p.isActive,
    sortOrder: String(p.sortOrder),
  };
}

type PackageErrors = Partial<Record<keyof PackageForm, string>>;

function validatePackage(f: PackageForm): PackageErrors {
  const e: PackageErrors = {};
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(f.key.trim())) e.key = 'ตัวพิมพ์เล็ก ตัวเลข และ - เท่านั้น (2–64 ตัว) เช่น vip-30d';
  if (!f.name.trim()) e.name = 'กรอกชื่อแพ็กเกจ';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(f.permissionGroup.trim())) e.permissionGroup = 'ชื่อกลุ่มใน Permissions (A-Z, 0-9, _ และ -)';
  const tier = Number(f.tierRank);
  if (!Number.isInteger(tier) || tier < 1 || tier > 1000) e.tierRank = 'จำนวนเต็ม 1–1000';
  if (!f.badgeLabel.trim() || f.badgeLabel.trim().length > 16) e.badgeLabel = '1–16 ตัวอักษร';
  const price = f.priceThb.trim();
  if (price && !/^\d{1,8}(\.\d{1,2})?$/.test(price)) e.priceThb = 'ตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 199 หรือ 199.50';
  if (f.isActive && (!price || isZeroPrice(price))) e.priceThb = 'ต้องตั้งราคามากกว่า 0 ก่อนเปิดขาย';
  if (!f.permanent) {
    const d = Number(f.durationDays);
    if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) e.durationDays = `จำนวนวัน 1–${MAX_DAYS}`;
  }
  if (!/^-?\d{1,6}$/.test(f.sortOrder.trim())) e.sortOrder = 'จำนวนเต็ม';
  return e;
}

function packagePayload(f: PackageForm): VipPackageInput {
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    description: f.description.trim() || null,
    permissionGroup: f.permissionGroup.trim(),
    tierRank: Number(f.tierRank),
    frameStyle: f.frameStyle,
    badgeLabel: f.badgeLabel.trim(),
    priceThb: f.priceThb.trim() || '0',
    durationDays: f.permanent ? null : Number(f.durationDays),
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder),
  };
}

function PackageDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: VipPackage | null;
  onClose: () => void;
  onSaved: (pkg: VipPackage | null, created: boolean) => void;
}) {
  const [form, setForm] = useState<PackageForm>(editing ? formFromPackage(editing) : EMPTY_PACKAGE);
  const [touched, setTouched] = useState(false);
  const errors = touched ? validatePackage(form) : {};
  const set = <K extends keyof PackageForm>(k: K, v: PackageForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload = packagePayload(form);
      return editing ? vipAdminApi.updatePackage(editing.id, payload) : vipAdminApi.createPackage(payload);
    },
    onSuccess: (pkg) => onSaved(pkg, !editing),
  });

  const submit = () => {
    setTouched(true);
    if (Object.keys(validatePackage(form)).length === 0) save.mutate();
  };

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      busy={save.isPending}
      size="lg"
      title={editing ? `แก้ไขแพ็กเกจ ${editing.name}` : 'สร้างแพ็กเกจ VIP'}
      description="ราคาเป็นเงินบาท (ชำระด้วยเงินจริงผ่านบัตรหรือโอนเท่านั้น) การแก้ราคา/ระยะเวลามีผลกับการซื้อครั้งถัดไป"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? 'บันทึก' : 'สร้างแพ็กเกจ'}
          </AdminButton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="ชื่อที่แสดง" required error={errors.name}>
            {(field) => <input {...field} className={adminInputClass} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VIP 30 วัน" />}
          </AdminField>
          <AdminField label="รหัสแพ็กเกจ (key)" required error={errors.key} hint={editing ? 'เปลี่ยนได้ แต่ต้องไม่ซ้ำ' : undefined}>
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="vip-30d" />}
          </AdminField>
          <AdminField label="ราคา (บาท)" required={form.isActive} error={errors.priceThb} hint="เว้นว่าง = ยังไม่ตั้งราคา (เปิดขายไม่ได้)">
            {(field) => (
              <input {...field} className={adminInputClass} inputMode="decimal" value={form.priceThb} onChange={(e) => set('priceThb', e.target.value.trim())} placeholder="199" />
            )}
          </AdminField>
          <AdminField label="ระยะเวลา (วัน)" error={errors.durationDays}>
            {(field) => (
              <div className="flex items-center gap-3">
                <input
                  {...field}
                  className={adminInputClass}
                  inputMode="numeric"
                  disabled={form.permanent}
                  value={form.permanent ? '' : form.durationDays}
                  onChange={(e) => set('durationDays', e.target.value.replace(/\D/g, ''))}
                  placeholder={form.permanent ? 'ถาวร' : '30'}
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-iris-pearl">
                  <input type="checkbox" className="h-4 w-4 accent-[#37E5D2]" checked={form.permanent} onChange={(e) => set('permanent', e.target.checked)} />
                  ถาวร
                </label>
              </div>
            )}
          </AdminField>
          <AdminField label="กลุ่มใน Permissions" required error={errors.permissionGroup} hint="ชื่อกลุ่มที่ปลั๊กอินอื่นใช้ตรวจสิทธิ์ (ระบบเดิมใช้ VIP)">
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.permissionGroup} onChange={(e) => set('permissionGroup', e.target.value.trim())} />}
          </AdminField>
          <AdminField label="ระดับ (tier)" required error={errors.tierRank} hint="เลขมาก = ระดับสูงกว่า (ใช้เลือกกรอบเมื่อมีหลายแพ็กเกจ)">
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.tierRank} onChange={(e) => set('tierRank', e.target.value.replace(/\D/g, ''))} />}
          </AdminField>
          <AdminField label="ป้ายใต้รูป / ในแชท" required error={errors.badgeLabel}>
            {(field) => <input {...field} className={adminInputClass} maxLength={16} value={form.badgeLabel} onChange={(e) => set('badgeLabel', e.target.value)} />}
          </AdminField>
          <AdminField label="ลำดับการแสดง" error={errors.sortOrder}>
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />}
          </AdminField>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-iris-muted">กรอบรูปโปรไฟล์</legend>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="กรอบรูปโปรไฟล์">
            {VIP_FRAME_STYLES.map((f) => {
              const selected = form.frameStyle === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('frameStyle', f.key)}
                  className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 pb-2 pt-3 text-xs transition-colors ${
                    selected ? 'border-iris-cyan/50 bg-iris-cyan/[0.07] text-iris-pearl' : 'border-white/[0.08] text-iris-muted hover:border-white/20'
                  }`}
                >
                  <VipAvatar size={44} name="IR" vip={{ tierRank: 1, frameStyle: f.key, label: form.badgeLabel.trim() || 'VIP' }} />
                  <span className="mt-1">{f.labelTh}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <AdminField label="คำอธิบาย (แสดงในหน้า VIP)">
          {(field) => (
            <textarea {...field} rows={3} className={adminInputClass} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="เช่น ใช้คำสั่ง /pod /hatch /imprint ฟรี" />
          )}
        </AdminField>

        <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-iris-pearl">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#37E5D2]" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          <span>
            เปิดขาย
            <span className="block text-xs text-iris-muted">ผู้เล่นจะเห็นและซื้อแพ็กเกจนี้ได้ที่หน้า VIP (ต้องตั้งราคามากกว่า 0)</span>
          </span>
        </label>

        {save.isError && (
          <AdminNotice tone="danger" title="บันทึกไม่สำเร็จ">
            {apiErrorText(save.error, 'ลองใหม่อีกครั้ง')}
          </AdminNotice>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </AdminDialog>
  );
}

function PackagesPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const queryClient = useQueryClient();
  const packages = useQuery({ queryKey: [PACKAGES_KEY], queryFn: ({ signal }) => vipAdminApi.getPackages(signal), staleTime: 15_000 });
  const [dialog, setDialog] = useState<{ editing: VipPackage | null; seq: number } | null>(null);
  const rows = packages.data ?? [];

  return (
    <AdminPanel
      flush
      title="แพ็กเกจ VIP"
      description="กำหนดราคา ระยะเวลา กลุ่มสิทธิ์ในเกม และกรอบรูป แพ็กเกจที่ปิดอยู่หรือยังไม่ตั้งราคาจะไม่แสดงให้ผู้เล่นซื้อ"
      actions={
        <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setDialog({ editing: null, seq: Date.now() })}>
          สร้างแพ็กเกจ
        </AdminButton>
      }
    >
      <AdminTable caption="แพ็กเกจ VIP" busy={packages.isFetching} minWidth={960} maxHeight="none">
        <AdminTableHead>
          <tr>
            <AdminTh>แพ็กเกจ</AdminTh>
            <AdminTh>กรอบ</AdminTh>
            <AdminTh>กลุ่ม Permissions</AdminTh>
            <AdminTh align="right">ราคา</AdminTh>
            <AdminTh>ระยะเวลา</AdminTh>
            <AdminTh align="right">สมาชิกตอนนี้</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh align="right">แก้ไข</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={PACKAGE_COLS}
          isInitialLoading={packages.isLoading}
          isError={packages.isError}
          onRetry={() => void packages.refetch()}
          errorMessage={packages.isError ? apiErrorText(packages.error, 'โหลดแพ็กเกจไม่สำเร็จ') : undefined}
          isEmpty={rows.length === 0}
          emptyTitle="ยังไม่มีแพ็กเกจ VIP"
          skeletonRows={3}
        >
          {rows.map((p) => {
            const unpriced = isZeroPrice(p.priceThb);
            return (
              <AdminTr key={p.id}>
                <AdminTd>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-xs text-iris-muted">
                    {p.key} · tier {p.tierRank}
                  </div>
                </AdminTd>
                <AdminTd>
                  <VipAvatar size={36} name={p.badgeLabel} vip={{ tierRank: p.tierRank, frameStyle: p.frameStyle, label: p.badgeLabel }} showLabel={false} />
                </AdminTd>
                <AdminTd mono>{p.permissionGroup}</AdminTd>
                <AdminTd align="right" mono nowrap>
                  {unpriced ? <span className="text-amber-100">ยังไม่ตั้งราคา</span> : formatThb(p.priceThb)}
                </AdminTd>
                <AdminTd muted>{durationLabel(p.durationDays)}</AdminTd>
                <AdminTd align="right" mono>
                  {p.activeMemberships ?? '—'}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={p.isActive ? 'success' : 'neutral'} dot>
                    {p.isActive ? 'เปิดขาย' : 'ปิดอยู่'}
                  </StatusBadge>
                </AdminTd>
                <AdminTd align="right">
                  <AdminIconButton aria-label={`แก้ไขแพ็กเกจ ${p.name}`} onClick={() => setDialog({ editing: p, seq: Date.now() })}>
                    <Pencil />
                  </AdminIconButton>
                </AdminTd>
              </AdminTr>
            );
          })}
        </AdminTableBody>
      </AdminTable>

      {dialog && (
        <PackageDialog
          key={dialog.seq}
          open
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={(pkg, created) => {
            setDialog(null);
            onNotice(created ? `สร้างแพ็กเกจ ${pkg?.name ?? ''} แล้ว` : `บันทึกแพ็กเกจ ${pkg?.name ?? ''} แล้ว`);
            void queryClient.invalidateQueries({ queryKey: [PACKAGES_KEY] });
            void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
          }}
        />
      )}
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Grant / extend / revoke / resync                                    */
/* ------------------------------------------------------------------ */

interface PickedUser {
  id: string;
  name: string | null;
  steamId: string | null;
}

function UserPicker({ value, onChange }: { value: PickedUser | null; onChange: (u: PickedUser | null) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [manualId, setManualId] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['admin-vip-user-search', debounced],
    enabled: debounced.length >= 2,
    retry: false,
    staleTime: 30_000,
    queryFn: ({ signal }) => adminApi.getUsersPage({ page: 1, pageSize: 10, search: debounced }, signal),
  });
  // GET /admin/users is server_admin|root: an admin falls back to typing the user id.
  const forbidden = results.isError && httpStatus(results.error) === 403;

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-iris-cyan/25 bg-iris-cyan/[0.05] px-3 py-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-iris-pearl">{value.name ?? value.id}</span>
          <span className="block truncate font-mono text-xs text-iris-muted">{value.steamId ?? value.id}</span>
        </span>
        <AdminButton size="sm" variant="ghost" onClick={() => onChange(null)}>
          เปลี่ยน
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!forbidden ? (
        <>
          <input
            className={adminInputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ Discord หรือ Steam ID (อย่างน้อย 2 ตัวอักษร)"
            aria-label="ค้นหาผู้เล่น"
          />
          {results.isFetching && <p className="text-xs text-iris-muted">กำลังค้นหา…</p>}
          {results.data && results.data.items.length === 0 && <p className="text-xs text-iris-muted">ไม่พบผู้เล่น</p>}
          {results.data && results.data.items.length > 0 && (
            <ul className="max-h-56 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/[0.08]">
              {results.data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05]"
                    onClick={() => onChange({ id: u.id, name: u.discordUsername, steamId: u.steamId })}
                  >
                    <VipAvatar size={28} src={u.discordAvatar} name={u.discordUsername} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-iris-pearl">{u.discordUsername ?? u.discordId}</span>
                      <span className="block truncate font-mono text-xs text-iris-muted">{u.steamId ?? 'ยังไม่เชื่อม Steam'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-iris-muted">บัญชีนี้ค้นหาผู้ใช้ไม่ได้ (เฉพาะผู้ดูแลเซิร์ฟเวอร์/Root) กรอก User ID แทน</p>
      )}
      <div className="flex gap-2">
        <input
          className={adminInputClass}
          value={manualId}
          onChange={(e) => setManualId(e.target.value.trim())}
          placeholder="หรือกรอก User ID โดยตรง"
          aria-label="User ID"
          maxLength={64}
        />
        <AdminButton size="sm" variant="secondary" disabled={!manualId} onClick={() => onChange({ id: manualId, name: null, steamId: null })}>
          ใช้ ID นี้
        </AdminButton>
      </div>
    </div>
  );
}

function GrantDialog({
  open,
  onClose,
  onDone,
  packages,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
  packages: VipPackage[];
}) {
  const [user, setUser] = useState<PickedUser | null>(null);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [mode, setMode] = useState<'package' | 'custom' | 'permanent'>('package');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [touched, setTouched] = useState(false);
  const pkg = packages.find((p) => p.id === packageId) ?? null;

  const daysNum = Number(days);
  const errors = {
    user: touched && !user ? 'เลือกผู้เล่น' : undefined,
    pkg: touched && !pkg ? 'เลือกแพ็กเกจ' : undefined,
    days: touched && mode === 'custom' && (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > MAX_DAYS) ? `1–${MAX_DAYS} วัน` : undefined,
    reason: touched && reason.trim().length < 3 ? 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษร' : undefined,
  };
  const valid = Boolean(user && pkg && reason.trim().length >= 3 && (mode !== 'custom' || (Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= MAX_DAYS)));

  const grant = useMutation({
    mutationFn: () =>
      vipAdminApi.grant({
        userId: user!.id,
        packageId: pkg!.id,
        ...(mode === 'custom' ? { durationDays: daysNum } : mode === 'permanent' ? { durationDays: null } : {}),
        ...(legacy ? { source: 'legacy' as const } : {}),
        reason: reason.trim(),
      }),
    onSuccess: (m) => {
      const until = m?.expiresAt ? `ถึง ${formatBangkokDateTime(m.expiresAt)}` : 'แบบถาวร';
      onDone(`มอบ ${pkg?.name ?? 'VIP'} ให้ ${user?.name ?? user?.id} ${until} แล้ว (ระบบจะซิงก์สิทธิ์เข้าเกมผ่านเซิร์ฟเวอร์ที่ออนไลน์)`);
    },
  });

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      busy={grant.isPending}
      title="มอบ VIP ให้ผู้เล่น"
      description="ถ้าผู้เล่นมี VIP อยู่แล้ว ระยะเวลาจะต่อจากวันหมดอายุเดิม ทุกการมอบถูกบันทึกพร้อมเหตุผล"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={grant.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton
            variant="primary"
            icon={<UserPlus />}
            loading={grant.isPending}
            onClick={() => {
              setTouched(true);
              if (valid) grant.mutate();
            }}
          >
            มอบ VIP
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-iris-muted">ผู้เล่น *</span>
          <UserPicker value={user} onChange={setUser} />
          {errors.user && <p className="text-xs text-rose-200">{errors.user}</p>}
        </div>
        <AdminField label="แพ็กเกจ" required error={errors.pkg}>
          {(field) => (
            <select {...field} className={adminInputClass} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              <option value="">เลือกแพ็กเกจ…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.permissionGroup} · {durationLabel(p.durationDays)}
                  {p.isActive ? '' : ' (ปิดขาย)'}
                </option>
              ))}
            </select>
          )}
        </AdminField>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-iris-muted">ระยะเวลา</span>
          <SegmentedTabs
            aria-label="ระยะเวลา"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: 'package', label: pkg ? `ตามแพ็กเกจ (${durationLabel(pkg.durationDays)})` : 'ตามแพ็กเกจ' },
              { value: 'custom', label: 'กำหนดวันเอง' },
              { value: 'permanent', label: 'ถาวร' },
            ]}
          />
          {mode === 'custom' && (
            <div className="mt-3">
              <AdminField label="จำนวนวัน" required error={errors.days}>
                {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />}
              </AdminField>
            </div>
          )}
        </div>
        <AdminField label="เหตุผล" required error={errors.reason}>
          {(field) => (
            <input {...field} className={adminInputClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ย้ายจากระบบเดิม / ชดเชยเซิร์ฟเวอร์ล่ม" />
          )}
        </AdminField>
        <label className="flex items-start gap-3 text-sm text-iris-pearl">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#37E5D2]" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
          <span>
            ย้ายมาจากระบบเดิม
            <span className="block text-xs text-iris-muted">บันทึกที่มาเป็น &quot;ระบบเดิม&quot; สำหรับผู้เล่นที่เป็น VIP อยู่แล้วในเว็บเก่า</span>
          </span>
        </label>
        {grant.isError && (
          <AdminNotice tone="danger" title="มอบ VIP ไม่สำเร็จ">
            {apiErrorText(grant.error, 'ลองใหม่อีกครั้ง')}
          </AdminNotice>
        )}
      </div>
    </AdminDialog>
  );
}

function ExtendDialog({ membership, onClose, onDone }: { membership: VipMembership | null; onClose: () => void; onDone: (text: string) => void }) {
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const n = Number(days);
  const daysError = touched && (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) ? `1–${MAX_DAYS} วัน` : undefined;
  const reasonError = touched && reason.trim().length < 3 ? 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษร' : undefined;
  const extend = useMutation({
    mutationFn: () => vipAdminApi.extend(membership!.id, n, reason.trim()),
    onSuccess: (m) => onDone(`ต่ออายุ ${n} วันแล้ว${m?.expiresAt ? ` หมดอายุ ${formatBangkokDateTime(m.expiresAt)}` : ''}`),
  });
  return (
    <AdminDialog
      open={membership !== null}
      onClose={onClose}
      busy={extend.isPending}
      size="sm"
      title="ต่ออายุ VIP"
      description={membership ? `${membership.user?.name ?? membership.userId} · ${membership.package?.name ?? membership.permissionGroup}` : undefined}
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={extend.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton
            variant="primary"
            icon={<CalendarPlus />}
            loading={extend.isPending}
            onClick={() => {
              setTouched(true);
              if (Number.isInteger(n) && n >= 1 && n <= MAX_DAYS && reason.trim().length >= 3) extend.mutate();
            }}
          >
            ต่ออายุ
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        {membership?.expiresAt === null && <AdminNotice tone="info">สมาชิกภาพนี้เป็นแบบถาวรอยู่แล้ว</AdminNotice>}
        <AdminField label="เพิ่มกี่วัน" required error={daysError}>
          {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />}
        </AdminField>
        <AdminField label="เหตุผล" required error={reasonError}>
          {(field) => <input {...field} className={adminInputClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </AdminField>
        {extend.isError && (
          <AdminNotice tone="danger" title="ต่ออายุไม่สำเร็จ">
            {apiErrorText(extend.error, 'ลองใหม่อีกครั้ง')}
          </AdminNotice>
        )}
      </div>
    </AdminDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

function MembersPanel({ packages, onNotice }: { packages: VipPackage[]; onNotice: (text: string) => void }) {
  const queryClient = useQueryClient();
  const list = usePaginatedQuery({
    key: MEMBERS_KEY,
    fetcher: vipAdminApi.getMembershipsPage,
    filters: {
      state: { values: VIP_MEMBERSHIP_STATES },
      source: { values: VIP_MEMBERSHIP_SOURCES },
      syncStatus: { values: VIP_SYNC_STATUSES },
      packageId: {},
      userId: {},
    },
  });
  const [extending, setExtending] = useState<VipMembership | null>(null);
  const [revoking, setRevoking] = useState<VipMembership | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [resyncing, setResyncing] = useState<VipMembership | null>(null);

  const refreshAll = () => {
    list.invalidate();
    void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [PACKAGES_KEY] });
  };

  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => vipAdminApi.revoke(id, reason),
    onSuccess: () => {
      onNotice('เพิกถอน VIP แล้ว ถ้าไม่มีสมาชิกภาพอื่นถือกลุ่มเดียวกัน ระบบจะถอดกลุ่มออกจาก Permissions');
      refreshAll();
    },
  });
  const resync = useMutation({
    mutationFn: (userId: string) => vipAdminApi.resyncUser(userId, 'manual resync from /admin/vip'),
    onSuccess: (res) => {
      onNotice(
        res.steamLinked
          ? `ส่งงานซิงก์ ${res.jobs} งานแล้ว เซิร์ฟเวอร์ที่ออนไลน์จะอัปเดตกลุ่มใน Permissions`
          : 'ผู้เล่นยังไม่เชื่อม Steam จึงซิงก์เข้าเกมไม่ได้',
      );
      refreshAll();
    },
  });

  return (
    <AdminPanel flush>
      <AdminToolbar list={list} searchPlaceholder="ชื่อผู้เล่น, Steam ID, รหัสสมาชิก หรือรหัสการชำระเงิน…">
        <AdminFilterSelect
          label="แพ็กเกจ"
          value={list.filters.packageId}
          onChange={(v) => list.setFilter('packageId', v)}
          options={packages.map((p) => ({ value: p.id, label: p.name }))}
        />
        <AdminFilterSelect
          label="ที่มา"
          value={list.filters.source}
          onChange={(v) => list.setFilter('source', v)}
          options={VIP_MEMBERSHIP_SOURCES.map((s) => ({ value: s, label: MEMBERSHIP_SOURCE_TH[s] ?? s }))}
        />
        <AdminFilterSelect
          label="การซิงก์เข้าเกม"
          value={list.filters.syncStatus}
          onChange={(v) => list.setFilter('syncStatus', v)}
          options={VIP_SYNC_STATUSES.map((s) => ({ value: s, label: SYNC_STATUS_TH[s] ?? s }))}
        />
        {list.filters.userId && (
          <AdminButton size="sm" variant="ghost" onClick={() => list.setFilter('userId', '')}>
            ล้างตัวกรองผู้เล่น
          </AdminButton>
        )}
      </AdminToolbar>
      <div className="border-b border-white/[0.06] px-5 py-3">
        <SegmentedTabs
          aria-label="สถานะสมาชิกภาพ"
          value={list.filters.state}
          onChange={(v) => list.setFilter('state', v)}
          options={[{ value: '', label: 'ทั้งหมด' }, ...VIP_MEMBERSHIP_STATES.map((s) => ({ value: s, label: MEMBERSHIP_STATUS_TH[s] ?? s }))]}
        />
      </div>
      <IgnoredFiltersNotice
        names={list.data?.ignoredFilters ?? []}
        labels={{ state: 'สถานะ', source: 'ที่มา', syncStatus: 'การซิงก์', packageId: 'แพ็กเกจ', userId: 'ผู้เล่น' }}
      />

      <AdminTable caption="สมาชิก VIP" busy={list.isFetching} minWidth={1040}>
        <AdminTableHead>
          <tr>
            <AdminTh>ผู้เล่น</AdminTh>
            <AdminTh>แพ็กเกจ / กลุ่ม</AdminTh>
            <AdminTh>ช่วงเวลา</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh>ที่มา</AdminTh>
            <AdminTh>ซิงก์เข้าเกม</AdminTh>
            <AdminTh>เหตุผล</AdminTh>
            <AdminTh align="right">จัดการ</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={MEMBER_COLS}
          isInitialLoading={list.isInitialLoading}
          isPlaceholderData={list.isPlaceholderData}
          isError={list.isError}
          onRetry={list.refetch}
          errorMessage={list.isError ? apiErrorText(list.error, 'โหลดสมาชิก VIP ไม่สำเร็จ') : undefined}
          isEmpty={list.items.length === 0}
          emptyTitle={list.isFiltered ? 'ไม่พบสมาชิกที่ตรงกับตัวกรอง' : 'ยังไม่มีสมาชิก VIP'}
          emptyAction={list.isFiltered ? <AdminButton size="sm" onClick={list.resetAll}>ล้างตัวกรอง</AdminButton> : undefined}
          skeletonRows={Math.min(list.pageSize, 10)}
        >
          {list.items.map((m) => {
            const live = m.state === 'active' || m.state === 'scheduled';
            const left = daysRemaining(m.expiresAt);
            return (
              <AdminTr key={m.id}>
                <AdminTd>
                  <div className="flex items-center gap-3">
                    <VipAvatar
                      size={34}
                      src={m.user?.avatar}
                      name={m.user?.name}
                      vip={m.state === 'active' && m.package ? { tierRank: m.package.tierRank, frameStyle: m.package.frameStyle, label: m.package.badgeLabel } : null}
                      showLabel={false}
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="block max-w-[11rem] truncate text-left font-semibold text-iris-pearl hover:text-iris-cyan"
                        onClick={() => list.setFilter('userId', m.userId)}
                        title="แสดงเฉพาะผู้เล่นนี้"
                      >
                        {m.user?.name ?? m.userId}
                      </button>
                      <div className="font-mono text-xs text-iris-muted">{m.user?.steamId ?? 'ยังไม่เชื่อม Steam'}</div>
                    </div>
                  </div>
                </AdminTd>
                <AdminTd>
                  <div>{m.package?.name ?? '—'}</div>
                  <div className="font-mono text-xs text-iris-muted">{m.permissionGroup}</div>
                </AdminTd>
                <AdminTd muted nowrap>
                  <div>เริ่ม {formatBangkokDateTime(m.startsAt)}</div>
                  <div>
                    {m.expiresAt === null ? 'ถาวร' : `ถึง ${formatBangkokDateTime(m.expiresAt)}`}
                    {live && left !== null && <span className="text-iris-pearl"> · เหลือ {left} วัน</span>}
                  </div>
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={stateTone(m.state)} dot>
                    {MEMBERSHIP_STATUS_TH[m.state] ?? m.state}
                  </StatusBadge>
                </AdminTd>
                <AdminTd muted>
                  {MEMBERSHIP_SOURCE_TH[m.source] ?? m.source}
                  {m.paymentIntentId && (
                    <Link href={`/admin/payments?q=${encodeURIComponent(m.paymentIntentId)}`} className="block text-xs text-iris-cyan hover:underline">
                      ดูการชำระเงิน
                    </Link>
                  )}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={syncTone(m.sync?.status)} dot>
                    {m.sync?.status ? SYNC_STATUS_TH[m.sync.status] ?? m.sync.status : '—'}
                  </StatusBadge>
                  {m.sync?.lastError && <div className="mt-1 max-w-[12rem] break-words text-xs text-rose-100">{m.sync.lastError}</div>}
                  {m.sync?.syncedAt && <div className="mt-1 text-xs text-iris-muted">{formatBangkokDateTime(m.sync.syncedAt)}</div>}
                </AdminTd>
                <AdminTd muted>
                  <div className="max-w-[12rem] break-words text-xs">{m.reason ?? '—'}</div>
                </AdminTd>
                <AdminTd align="right" nowrap>
                  {live && (
                    <AdminIconButton aria-label={`ต่ออายุ VIP ของ ${m.user?.name ?? m.userId}`} onClick={() => setExtending(m)}>
                      <CalendarPlus />
                    </AdminIconButton>
                  )}
                  <AdminIconButton aria-label={`ซิงก์กลุ่ม Permissions ของ ${m.user?.name ?? m.userId}`} onClick={() => setResyncing(m)}>
                    <RefreshCw />
                  </AdminIconButton>
                  {live && (
                    <AdminIconButton
                      tone="danger"
                      aria-label={`เพิกถอน VIP ของ ${m.user?.name ?? m.userId}`}
                      onClick={() => {
                        setRevokeReason('');
                        setRevoking(m);
                      }}
                    >
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

      <ExtendDialog
        key={extending?.id ?? 'none'}
        membership={extending}
        onClose={() => setExtending(null)}
        onDone={(text) => {
          setExtending(null);
          onNotice(text);
          refreshAll();
        }}
      />

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revokeReason.trim().length < 3) throw new Error('ระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
          await revoke.mutateAsync({ id: revoking!.id, reason: revokeReason.trim() });
        }}
        title="เพิกถอน VIP นี้?"
        description={
          revoking
            ? `${revoking.user?.name ?? revoking.userId} · ${revoking.package?.name ?? revoking.permissionGroup} — สิทธิ์ในเกมจะถูกถอดเมื่อเซิร์ฟเวอร์รับงาน ไม่มีการคืนเงินอัตโนมัติ`
            : undefined
        }
        confirmText="เพิกถอน"
      >
        <AdminField label="เหตุผล" required>
          {(field) => (
            <input {...field} className={adminInputClass} maxLength={500} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="เช่น ขอคืนเงิน / ทำผิดกฎ" />
          )}
        </AdminField>
      </ConfirmDialog>

      <ConfirmDialog
        open={resyncing !== null}
        onClose={() => setResyncing(null)}
        onConfirm={() => resync.mutateAsync(resyncing!.userId)}
        tone="default"
        title="ซิงก์สิทธิ์เข้า Permissions ใหม่?"
        description={
          resyncing
            ? `ส่งสถานะ VIP ปัจจุบันของ ${resyncing.user?.name ?? resyncing.userId} (เพิ่มหรือถอดกลุ่ม) ไปยังเซิร์ฟเวอร์ที่ออนไลน์อีกครั้ง ใช้เมื่อกลุ่มในเกมไม่ตรงกับเว็บ`
            : undefined
        }
        confirmText="ซิงก์ใหม่"
      />
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function VipAdmin() {
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'packages' ? 'packages' : 'members';
  const [notice, setNotice] = useState<string | null>(null);
  const [grantSeq, setGrantSeq] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const packages = useQuery({ queryKey: [PACKAGES_KEY], queryFn: ({ signal }) => vipAdminApi.getPackages(signal), staleTime: 15_000 });

  useAdminLiveRefresh([REALTIME_EVENTS.adminVip], [MEMBERS_KEY, SUMMARY_KEY, PACKAGES_KEY]);

  const setTab = (next: Tab) => {
    const url = new URL(window.location.href);
    if (next === 'members') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="VIP"
        title="จัดการ VIP"
        description="แพ็กเกจ VIP (ซื้อด้วยเงินจริง) และสมาชิกทั้งหมด ระบบซิงก์กลุ่มเข้าปลั๊กอิน Permissions ผ่านเซิร์ฟเวอร์ที่ออนไลน์อยู่ ใช้ได้แม้ผู้เล่นออฟไลน์"
        actions={
          <AdminButton variant="primary" icon={<Crown />} onClick={() => setGrantSeq(Date.now())} disabled={!packages.data?.length}>
            มอบ VIP
          </AdminButton>
        }
      />

      <VipSummaryStrip />

      {notice && (
        <AdminNotice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </AdminNotice>
      )}

      <SegmentedTabs
        aria-label="ส่วนของหน้า VIP"
        value={tab}
        onChange={(v) => setTab(v === 'packages' ? 'packages' : 'members')}
        options={[
          { value: 'members', label: 'สมาชิก' },
          { value: 'packages', label: 'แพ็กเกจ', count: packages.data?.length },
        ]}
      />

      {tab === 'packages' ? (
        <PackagesPanel onNotice={setNotice} />
      ) : (
        <MembersPanel packages={packages.data ?? []} onNotice={setNotice} />
      )}

      {grantSeq !== null && (
        <GrantDialog
          key={grantSeq}
          open
          packages={packages.data ?? []}
          onClose={() => setGrantSeq(null)}
          onDone={(text) => {
            setGrantSeq(null);
            setNotice(text);
            void queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY] });
            void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
            void queryClient.invalidateQueries({ queryKey: [PACKAGES_KEY] });
          }}
        />
      )}
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <VipAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
