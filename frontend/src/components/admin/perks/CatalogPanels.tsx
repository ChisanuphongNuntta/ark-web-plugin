'use client';

/**
 * /admin/perks catalog tabs: features (chat commands HeartShop gates), plans (= VIP packages,
 * monthly subscriptions sold for real money), Perk Token packs and promotions.
 * Contract: backend/contracts/entitlements-2026-10.md §1 and §5.
 */
import * as React from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, PowerOff } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminField,
  AdminIconButton,
  AdminNotice,
  AdminPanel,
  AdminSearchInput,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminToolbar,
  AdminTr,
  ConfirmDialog,
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
  type StatusTone,
} from '@/components/admin';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { apiErrorText } from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { VIP_FRAME_STYLES, durationLabel, formatThb, isZeroPrice, resolveFrameStyle } from '@/lib/vip';
import {
  FEATURE_KEY_RE,
  MONEY_RE,
  PERMISSION_GROUP_RE,
  PRODUCT_KEY_RE,
  PROMO_QUOTA_TYPES,
  QUOTA_TYPES,
  audienceLabel,
  bangkokInputFromIso,
  duplicateCommands,
  isoFromBangkokInput,
  isPromotionLive,
  isReservedGroup,
  parseCommandList,
  quotaLabel,
  type PerkFeature,
  type PerkPlan,
  type PerkPromotion,
  type Quota,
  type TokenPack,
} from '@/lib/perks';
import { perksAdminApi, type FeatureInput, type PlanInput, type PromotionInput, type TokenPackInput } from '@/lib/perksApi';
import {
  CheckRow,
  CommandList,
  FEATURES_KEY,
  PACKS_KEY,
  PLANS_KEY,
  PROMOS_KEY,
  QuotaEditor,
  isQuotaValid,
  useAdminFeatures,
  useAdminPlans,
} from './shared';

const MAX_DAYS = 3650;
type Notify = (text: string) => void;

function formatIcAmount(v: string | null): string {
  if (!v) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('th-TH')} IC` : `${v} IC`;
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
}

/* ================================================================== */
/* Features                                                            */
/* ================================================================== */

interface FeatureForm {
  key: string;
  name: string;
  category: string;
  description: string;
  commands: string;
  tokenCost: string;
  noTokens: boolean;
  permissionGroup: string;
  freeForAll: boolean;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY_FEATURE: FeatureForm = {
  key: 'cmd.',
  name: '',
  category: '',
  description: '',
  commands: '',
  tokenCost: '1',
  noTokens: false,
  permissionGroup: '',
  freeForAll: false,
  isActive: false,
  sortOrder: '0',
};

function featureForm(f: PerkFeature): FeatureForm {
  return {
    key: f.key,
    name: f.name,
    category: f.category ?? '',
    description: f.description ?? '',
    commands: f.commands.join(' '),
    tokenCost: f.tokenCost === null ? '1' : String(f.tokenCost),
    noTokens: f.tokenCost === null,
    permissionGroup: f.permissionGroup ?? '',
    freeForAll: f.isFree,
    isActive: f.isActive,
    sortOrder: String(f.sortOrder),
  };
}

function validateFeature(f: FeatureForm, others: PerkFeature[]): Partial<Record<keyof FeatureForm, string>> {
  const e: Partial<Record<keyof FeatureForm, string>> = {};
  if (!FEATURE_KEY_RE.test(f.key.trim())) e.key = 'ตัวพิมพ์เล็ก ตัวเลข . _ - (2–64 ตัว) เช่น cmd.pod';
  if (!f.name.trim()) e.name = 'กรอกชื่อ';
  const cmds = parseCommandList(f.commands);
  if (cmds.some((c) => c.length < 2 || c.length > 32)) e.commands = 'คำสั่งละ 2–32 ตัวอักษร ขึ้นต้นด้วย /';
  if (f.isActive && cmds.length === 0) e.commands = 'ต้องมีอย่างน้อย 1 คำสั่งก่อนเปิดใช้งาน';
  if (f.isActive) {
    const taken = cmds.filter((c) => others.some((o) => o.isActive && o.commands.includes(c)));
    if (taken.length) e.commands = `${taken.join(' ')} ถูกใช้โดยสิทธิ์อื่นที่เปิดอยู่แล้ว`;
  }
  if (!f.noTokens) {
    const n = Number(f.tokenCost);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) e.tokenCost = 'จำนวนเต็ม 0–100000';
  }
  const g = f.permissionGroup.trim();
  if (g && !PERMISSION_GROUP_RE.test(g)) e.permissionGroup = 'A-Z, 0-9, _ และ - เท่านั้น';
  if (g && isReservedGroup(g)) e.permissionGroup = 'ห้ามใช้กลุ่ม Admins หรือ Default';
  if (!/^-?\d{1,6}$/.test(f.sortOrder.trim())) e.sortOrder = 'จำนวนเต็ม';
  return e;
}

function featurePayload(f: FeatureForm): FeatureInput {
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    category: f.category.trim() || null,
    description: f.description.trim() || null,
    commands: parseCommandList(f.commands),
    permissionGroup: f.permissionGroup.trim() || null,
    tokenCost: f.noTokens ? null : Number(f.tokenCost),
    freeForAll: f.freeForAll,
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder),
  };
}

function FeatureDialog({
  editing,
  all,
  onClose,
  onSaved,
}: {
  editing: PerkFeature | null;
  all: PerkFeature[];
  onClose: () => void;
  onSaved: (f: PerkFeature | null, created: boolean) => void;
}) {
  const [form, setForm] = useState<FeatureForm>(editing ? featureForm(editing) : EMPTY_FEATURE);
  const [touched, setTouched] = useState(false);
  const others = all.filter((f) => f.key !== editing?.key);
  const errors = touched ? validateFeature(form, others) : {};
  const set = <K extends keyof FeatureForm>(k: K, v: FeatureForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const payload = featurePayload(form);
      // Features are addressed by key (PUT /features/:key; a rename cascades to plan grants).
      return editing ? perksAdminApi.features.update(editing.key, payload) : perksAdminApi.features.create(payload);
    },
    onSuccess: (f) => onSaved(f, !editing),
  });
  const submit = () => {
    setTouched(true);
    if (Object.keys(validateFeature(form, others)).length === 0) save.mutate();
  };
  return (
    <AdminDialog
      open
      onClose={onClose}
      busy={save.isPending}
      size="lg"
      title={editing ? `แก้ไขสิทธิ์ ${editing.name}` : 'เพิ่มสิทธิ์ (คำสั่งในเกม)'}
      description="สิทธิ์ที่เปิดใช้งาน HeartShop จะดักคำสั่งในแชทก่อนปลั๊กอินอื่น แล้วตรวจจากเว็บว่าผู้เล่นใช้ได้หรือไม่"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? 'บันทึก' : 'เพิ่มสิทธิ์'}
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
            {(field) => <input {...field} className={adminInputClass} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เก็บไดโนเข้าแคปซูล" />}
          </AdminField>
          <AdminField label="รหัส (key)" required error={errors.key} hint={editing ? 'เปลี่ยนได้ ระบบย้ายสิทธิ์ในแพ็กเกจให้อัตโนมัติ' : 'ใช้ในปลั๊กอิน เช่น cmd.pod'}>
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase().trim())} />}
          </AdminField>
          <AdminField label="คำสั่งในแชท" required={form.isActive} error={errors.commands} hint="คั่นด้วยเว้นวรรคหรือจุลภาค เช่น /pod /pods">
            {(field) => <input {...field} className={adminInputClass} maxLength={300} value={form.commands} onChange={(e) => set('commands', e.target.value)} placeholder="/pod" />}
          </AdminField>
          <AdminField label="Token ต่อครั้ง" error={errors.tokenCost}>
            {(field) => (
              <div className="flex items-center gap-3">
                <input
                  {...field}
                  className={adminInputClass}
                  inputMode="numeric"
                  disabled={form.noTokens}
                  value={form.noTokens ? '' : form.tokenCost}
                  onChange={(e) => set('tokenCost', e.target.value.replace(/\D/g, ''))}
                  placeholder={form.noTokens ? 'ใช้ Token ไม่ได้' : '1'}
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-iris-pearl">
                  <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={form.noTokens} onChange={(e) => set('noTokens', e.target.checked)} />
                  ห้ามใช้ Token
                </label>
              </div>
            )}
          </AdminField>
          <AdminField label="กลุ่ม Permissions (ไม่บังคับ)" error={errors.permissionGroup} hint="ใช้เมื่อปลั๊กอินคำสั่งตรวจกลุ่มเอง และเปิดให้ทุกคนไม่ได้">
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.permissionGroup} onChange={(e) => set('permissionGroup', e.target.value.trim())} />}
          </AdminField>
          <AdminField label="หมวด (ไม่บังคับ)">
            {(field) => <input {...field} className={adminInputClass} maxLength={60} value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="ไดโน / ตัวละคร / เก็บของ" />}
          </AdminField>
          <AdminField label="ลำดับการแสดง" error={errors.sortOrder}>
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />}
          </AdminField>
        </div>
        <AdminField label="คำอธิบาย (แสดงในหน้าสิทธิ์พิเศษ)">
          {(field) => <textarea {...field} rows={2} className={adminInputClass} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </AdminField>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckRow
            checked={form.isActive}
            onChange={(v) => set('isActive', v)}
            title="เปิดใช้งาน (HeartShop เริ่มตรวจสิทธิ์คำสั่งนี้)"
            hint="เปิดเมื่อติดตั้งปลั๊กอินที่ทำคำสั่งนี้บนเซิร์ฟเวอร์แล้วเท่านั้น"
          />
          <CheckRow checked={form.freeForAll} onChange={(v) => set('freeForAll', v)} title="ฟรีสำหรับทุกคน" hint="ไม่หักโควตาหรือ Token แต่ยังบันทึกการใช้งาน" />
        </div>
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

export function FeaturesPanel({ onNotice }: { onNotice: Notify }) {
  const features = useAdminFeatures();
  const invalidate = useInvalidate();
  const [q, setQ] = useState('');
  const [state, setState] = useState<'' | 'active' | 'inactive' | 'free'>('');
  const [dialog, setDialog] = useState<{ editing: PerkFeature | null; seq: number } | null>(null);
  const [toggling, setToggling] = useState<PerkFeature | null>(null);
  const all = useMemo(() => features.data ?? [], [features.data]);
  const dups = useMemo(() => duplicateCommands(all.filter((f) => f.isActive)), [all]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (f) =>
      (!needle || f.key.includes(needle) || f.name.toLowerCase().includes(needle) || f.commands.some((c) => c.includes(needle))) &&
      (state === '' || (state === 'active' ? f.isActive : state === 'inactive' ? !f.isActive : f.isFree)),
  );
  const toggle = useMutation({
    mutationFn: (f: PerkFeature) => perksAdminApi.features.update(f.key, { isActive: !f.isActive }),
    onSuccess: (_r, f) => {
      onNotice(f.isActive ? `ปิดสิทธิ์ ${f.name} แล้ว HeartShop จะไม่ดักคำสั่งนี้` : `เปิดสิทธิ์ ${f.name} แล้ว HeartShop จะตรวจสิทธิ์คำสั่งนี้ภายในไม่กี่วินาที`);
      invalidate(FEATURES_KEY, PLANS_KEY);
    },
  });
  const activeCount = all.filter((f) => f.isActive).length;

  return (
    <AdminPanel
      flush
      title="สิทธิ์ (คำสั่งในเกม)"
      description={`เปิดอยู่ ${activeCount.toLocaleString('th-TH')} จาก ${all.length.toLocaleString('th-TH')} คำสั่ง สิทธิ์ที่ปิดอยู่ HeartShop จะปล่อยคำสั่งผ่านโดยไม่ตรวจ`}
      actions={
        <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setDialog({ editing: null, seq: Date.now() })}>
          เพิ่มสิทธิ์
        </AdminButton>
      }
    >
      <AdminToolbar>
        <AdminSearchInput value={q} onChange={setQ} onClear={() => setQ('')} placeholder="ค้นหาคำสั่ง ชื่อ หรือรหัส…" label="ค้นหาสิทธิ์" />
        <SegmentedTabs
          aria-label="สถานะสิทธิ์"
          value={state}
          onChange={(v) => setState(v as typeof state)}
          options={[
            { value: '', label: 'ทั้งหมด', count: all.length },
            { value: 'active', label: 'เปิดอยู่', count: activeCount },
            { value: 'inactive', label: 'ปิดอยู่' },
            { value: 'free', label: 'ฟรี' },
          ]}
        />
      </AdminToolbar>
      <div className="space-y-3 px-5 pt-4">
        <AdminNotice tone="info" title="เปิดใช้งานเมื่อปลั๊กอินคำสั่งพร้อมแล้ว">
          คำสั่งเหล่านี้มาจากปลั๊กอินอื่น (ยังไม่ได้ติดตั้งบน Server1/2) เปิดสิทธิ์หลังติดตั้งและตั้งค่าปลั๊กอินนั้นให้ทุกคนใช้ได้ (เช่นกลุ่ม Default)
          แล้วให้ HeartShop เป็นผู้ตรวจแพ็กเกจ โควตา และ Token แทน
        </AdminNotice>
        {dups.size > 0 && (
          <AdminNotice tone="warning" title="มีคำสั่งซ้ำกันในสิทธิ์ที่เปิดอยู่">
            {[...dups.entries()].map(([c, keys]) => `${c} (${keys.join(', ')})`).join(' · ')}
          </AdminNotice>
        )}
      </div>
      <AdminTable caption="สิทธิ์คำสั่งในเกม" busy={features.isFetching} minWidth={980}>
        <AdminTableHead>
          <tr>
            <AdminTh>คำสั่ง</AdminTh>
            <AdminTh>ชื่อ / รหัส</AdminTh>
            <AdminTh align="right">Token/ครั้ง</AdminTh>
            <AdminTh>กลุ่ม Permissions</AdminTh>
            <AdminTh>อยู่ในแพ็กเกจ</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh align="right">จัดการ</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={7}
          isInitialLoading={features.isLoading}
          isError={features.isError}
          onRetry={() => void features.refetch()}
          errorMessage={features.isError ? apiErrorText(features.error, 'โหลดสิทธิ์ไม่สำเร็จ') : undefined}
          isEmpty={rows.length === 0}
          emptyTitle={all.length ? 'ไม่พบสิทธิ์ที่ตรงกับตัวกรอง' : 'ยังไม่มีสิทธิ์ (migration ยังไม่ได้รันหรือยังไม่ได้เพิ่ม)'}
          skeletonRows={8}
        >
          {rows.map((f) => (
            <AdminTr key={f.key}>
              <AdminTd>
                <CommandList commands={f.commands} />
              </AdminTd>
              <AdminTd>
                <div className="font-semibold">{f.name}</div>
                <div className="font-mono text-xs text-iris-muted">
                  {f.key}
                  {f.category ? ` · ${f.category}` : ''}
                </div>
              </AdminTd>
              <AdminTd align="right" mono>
                {f.tokenCost === null ? <span className="text-iris-muted">ห้าม</span> : f.tokenCost}
              </AdminTd>
              <AdminTd mono muted>
                {f.permissionGroup ?? '—'}
              </AdminTd>
              <AdminTd muted>{f.planKeys.length ? f.planKeys.join(', ') : '—'}</AdminTd>
              <AdminTd>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone={f.isActive ? 'success' : 'neutral'} dot>
                    {f.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                  </StatusBadge>
                  {f.isFree && <StatusBadge tone="info">ฟรี</StatusBadge>}
                </div>
              </AdminTd>
              <AdminTd align="right" nowrap>
                <AdminButton size="sm" variant="ghost" onClick={() => setToggling(f)}>
                  {f.isActive ? 'ปิด' : 'เปิด'}
                </AdminButton>
                <AdminIconButton aria-label={`แก้ไขสิทธิ์ ${f.name}`} onClick={() => setDialog({ editing: f, seq: Date.now() })}>
                  <Pencil />
                </AdminIconButton>
              </AdminTd>
            </AdminTr>
          ))}
        </AdminTableBody>
      </AdminTable>
      {dialog && (
        <FeatureDialog
          key={dialog.seq}
          editing={dialog.editing}
          all={all}
          onClose={() => setDialog(null)}
          onSaved={(f, created) => {
            setDialog(null);
            onNotice(created ? `เพิ่มสิทธิ์ ${f?.name ?? ''} แล้ว` : `บันทึกสิทธิ์ ${f?.name ?? ''} แล้ว`);
            invalidate(FEATURES_KEY, PLANS_KEY);
          }}
        />
      )}
      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        onConfirm={() => toggle.mutateAsync(toggling!)}
        tone={toggling?.isActive ? 'danger' : 'default'}
        title={toggling?.isActive ? `ปิดสิทธิ์ ${toggling?.name}?` : `เปิดสิทธิ์ ${toggling?.name ?? ''}?`}
        description={
          toggling?.isActive
            ? 'HeartShop จะหยุดตรวจคำสั่งนี้ ผู้เล่นทุกคนจะใช้ได้ตามที่ปลั๊กอินคำสั่งอนุญาต'
            : `HeartShop จะเริ่มบล็อก ${toggling?.commands.join(' ') ?? ''} สำหรับผู้เล่นที่ไม่มีแพ็กเกจ โปรโมชั่น หรือ Token ตรวจให้แน่ใจว่าติดตั้งปลั๊กอินคำสั่งแล้ว`
        }
        confirmText={toggling?.isActive ? 'ปิดสิทธิ์' : 'เปิดสิทธิ์'}
      />
    </AdminPanel>
  );
}

/* ================================================================== */
/* Plans                                                               */
/* ================================================================== */

interface PlanForm {
  key: string;
  name: string;
  description: string;
  priceThb: string;
  permanent: boolean;
  periodDays: string;
  syncGroup: boolean;
  permissionGroup: string;
  tierRank: string;
  frameStyle: string;
  badgeLabel: string;
  showBadge: boolean;
  isActive: boolean;
  sortOrder: string;
  grants: Record<string, Quota>;
}

const EMPTY_PLAN: PlanForm = {
  key: '',
  name: '',
  description: '',
  priceThb: '',
  permanent: false,
  periodDays: '30',
  syncGroup: false,
  permissionGroup: '',
  tierRank: '1',
  frameStyle: 'vip-gold',
  badgeLabel: 'VIP',
  showBadge: false,
  isActive: false,
  sortOrder: '0',
  grants: {},
};

function planForm(p: PerkPlan): PlanForm {
  return {
    key: p.key,
    name: p.name,
    description: p.description ?? '',
    priceThb: isZeroPrice(p.priceThb) ? '' : p.priceThb,
    permanent: p.periodDays === null,
    periodDays: p.periodDays === null ? '30' : String(p.periodDays),
    syncGroup: p.permissionGroup !== null,
    permissionGroup: p.permissionGroup ?? '',
    tierRank: String(p.tierRank),
    frameStyle: resolveFrameStyle(p.frameStyle),
    badgeLabel: p.badgeLabel,
    showBadge: p.showBadge,
    isActive: p.isActive,
    sortOrder: String(p.sortOrder),
    grants: Object.fromEntries(p.grants.map((g) => [g.featureKey, g.quota])),
  };
}

function validatePlan(f: PlanForm): Partial<Record<keyof PlanForm, string>> {
  const e: Partial<Record<keyof PlanForm, string>> = {};
  if (!PRODUCT_KEY_RE.test(f.key.trim())) e.key = 'ตัวพิมพ์เล็ก ตัวเลข และ - (2–64 ตัว) เช่น perk-monthly';
  if (!f.name.trim()) e.name = 'กรอกชื่อแพ็กเกจ';
  const price = f.priceThb.trim();
  if (price && !MONEY_RE.test(price)) e.priceThb = 'ตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง';
  if (f.isActive && (!price || isZeroPrice(price))) e.priceThb = 'ต้องตั้งราคามากกว่า 0 ก่อนเปิดขาย';
  if (!f.permanent) {
    const d = Number(f.periodDays);
    if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) e.periodDays = `จำนวนวัน 1–${MAX_DAYS}`;
  }
  if (f.syncGroup) {
    const g = f.permissionGroup.trim();
    if (!PERMISSION_GROUP_RE.test(g)) e.permissionGroup = 'ชื่อกลุ่มใน Permissions (A-Z, 0-9, _ และ -)';
    else if (isReservedGroup(g)) e.permissionGroup = 'ห้ามใช้กลุ่ม Admins หรือ Default';
  }
  const tier = Number(f.tierRank);
  if (!Number.isInteger(tier) || tier < 1 || tier > 1000) e.tierRank = 'จำนวนเต็ม 1–1000';
  if (!f.badgeLabel.trim() || f.badgeLabel.trim().length > 16) e.badgeLabel = '1–16 ตัวอักษร';
  if (!/^-?\d{1,6}$/.test(f.sortOrder.trim())) e.sortOrder = 'จำนวนเต็ม';
  if (Object.values(f.grants).some((q) => !isQuotaValid(q))) e.grants = 'โควตาต้องเป็นจำนวนเต็ม 1–100000';
  return e;
}

function planPayload(f: PlanForm): PlanInput {
  const days = f.permanent ? null : Number(f.periodDays);
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    description: f.description.trim() || null,
    priceThb: f.priceThb.trim() || '0',
    periodDays: days,
    durationDays: days,
    permissionGroup: f.syncGroup ? f.permissionGroup.trim() : null,
    tierRank: Number(f.tierRank),
    frameStyle: f.frameStyle,
    badgeLabel: f.badgeLabel.trim(),
    showBadge: f.showBadge,
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder),
    grants: Object.entries(f.grants).map(([featureKey, quota]) => ({ featureKey, quota })),
  };
}

function GrantsEditor({
  features,
  grants,
  onChange,
  error,
}: {
  features: PerkFeature[];
  grants: Record<string, Quota>;
  onChange: (next: Record<string, Quota>) => void;
  error?: string;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = features.filter((f) => !needle || f.key.includes(needle) || f.name.toLowerCase().includes(needle) || f.commands.some((c) => c.includes(needle)));
  const count = Object.keys(grants).length;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-semibold text-iris-muted">
        สิทธิ์ที่แพ็กเกจนี้ให้ ({count.toLocaleString('th-TH')} จาก {features.length.toLocaleString('th-TH')})
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${adminInputClass} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="กรองคำสั่ง…" aria-label="กรองสิทธิ์" />
        <AdminButton
          size="sm"
          variant="secondary"
          onClick={() => onChange({ ...grants, ...Object.fromEntries(rows.filter((f) => !grants[f.key]).map((f) => [f.key, { type: 'unlimited', limit: null } as Quota])) })}
        >
          เลือกที่แสดงทั้งหมด (ไม่จำกัด)
        </AdminButton>
        <AdminButton
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = { ...grants };
            rows.forEach((f) => delete next[f.key]);
            onChange(next);
          }}
        >
          ล้างที่แสดง
        </AdminButton>
      </div>
      {error && <p className="text-xs text-rose-200">{error}</p>}
      <ul className="max-h-80 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/[0.08]">
        {rows.map((f) => {
          const quota = grants[f.key];
          return (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-400"
                  checked={Boolean(quota)}
                  onChange={(e) => {
                    const next = { ...grants };
                    if (e.target.checked) next[f.key] = { type: 'unlimited', limit: null };
                    else delete next[f.key];
                    onChange(next);
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-iris-pearl">
                    <span className="mr-2 font-mono text-xs text-iris-cyan">{f.commands[0] ?? f.key}</span>
                    {f.name}
                  </span>
                  {!f.isActive && <span className="block text-[11px] text-iris-muted">ยังปิดอยู่ (ยังไม่ตรวจในเกม)</span>}
                </span>
              </label>
              {quota && <QuotaEditor idPrefix={`grant-${f.key}`} value={quota} types={QUOTA_TYPES} onChange={(qq) => onChange({ ...grants, [f.key]: qq })} label={f.name} />}
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-3 py-4 text-sm text-iris-muted">ไม่พบสิทธิ์</li>}
      </ul>
    </fieldset>
  );
}

function PlanDialog({
  editing,
  features,
  onClose,
  onSaved,
}: {
  editing: PerkPlan | null;
  features: PerkFeature[];
  onClose: () => void;
  onSaved: (p: PerkPlan | null, created: boolean) => void;
}) {
  const [form, setForm] = useState<PlanForm>(editing ? planForm(editing) : EMPTY_PLAN);
  const [touched, setTouched] = useState(false);
  const errors = touched ? validatePlan(form) : {};
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const payload = planPayload(form);
      return editing ? perksAdminApi.plans.update(editing.id, payload) : perksAdminApi.plans.create(payload);
    },
    onSuccess: (p) => onSaved(p, !editing),
  });
  const submit = () => {
    setTouched(true);
    if (Object.keys(validatePlan(form)).length === 0) save.mutate();
  };
  return (
    <AdminDialog
      open
      onClose={onClose}
      busy={save.isPending}
      size="lg"
      title={editing ? `แก้ไขแพ็กเกจ ${editing.name}` : 'สร้างแพ็กเกจรายเดือน'}
      description="แพ็กเกจคือแพ็กเกจ VIP แบบเดียวกัน (ชำระด้วยเงินจริงเท่านั้น ต่ออายุโดยต่อจากวันหมดอายุเดิม) การแก้ราคา/ระยะเวลามีผลกับการซื้อครั้งถัดไป การแก้สิทธิ์มีผลทันที"
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
            {(field) => <input {...field} className={adminInputClass} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Perk รายเดือน" />}
          </AdminField>
          <AdminField label="รหัสแพ็กเกจ (key)" required error={errors.key}>
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase().trim())} placeholder="perk-monthly" />}
          </AdminField>
          <AdminField label="ราคา (บาท)" required={form.isActive} error={errors.priceThb} hint="เว้นว่าง = ยังไม่ตั้งราคา (เปิดขายไม่ได้)">
            {(field) => <input {...field} className={adminInputClass} inputMode="decimal" value={form.priceThb} onChange={(e) => set('priceThb', e.target.value.trim())} placeholder="199" />}
          </AdminField>
          <AdminField label="ระยะเวลาต่อรอบ (วัน)" error={errors.periodDays} hint="30 = รายเดือน">
            {(field) => (
              <div className="flex items-center gap-3">
                <input
                  {...field}
                  className={adminInputClass}
                  inputMode="numeric"
                  disabled={form.permanent}
                  value={form.permanent ? '' : form.periodDays}
                  onChange={(e) => set('periodDays', e.target.value.replace(/\D/g, ''))}
                  placeholder={form.permanent ? 'ถาวร' : '30'}
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-iris-pearl">
                  <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={form.permanent} onChange={(e) => set('permanent', e.target.checked)} />
                  ถาวร
                </label>
              </div>
            )}
          </AdminField>
          <AdminField label="กลุ่มใน Permissions" error={errors.permissionGroup} hint="ซิงก์กลุ่มนี้เข้าเกมระหว่างที่แพ็กเกจยังใช้งาน (ระบบเดิมใช้ VIP)">
            {(field) => (
              <div className="flex items-center gap-3">
                <input
                  {...field}
                  className={adminInputClass}
                  maxLength={64}
                  disabled={!form.syncGroup}
                  value={form.syncGroup ? form.permissionGroup : ''}
                  onChange={(e) => set('permissionGroup', e.target.value.trim())}
                  placeholder={form.syncGroup ? 'VIP' : 'ไม่ซิงก์กลุ่ม'}
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-iris-pearl">
                  <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={form.syncGroup} onChange={(e) => set('syncGroup', e.target.checked)} />
                  ซิงก์
                </label>
              </div>
            )}
          </AdminField>
          <AdminField label="ลำดับการแสดง" error={errors.sortOrder}>
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />}
          </AdminField>
        </div>

        <CheckRow
          checked={form.showBadge}
          onChange={(v) => set('showBadge', v)}
          title="แสดงกรอบรูปและป้ายในแชท/โปรไฟล์"
          hint="ปิดไว้สำหรับแพ็กเกจที่ไม่ใช่ VIP (เช่นแพ็กเกจเก็บของรายเดือน)"
        />
        {form.showBadge && (
          <div className="space-y-3 rounded-xl border border-white/[0.08] p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="ป้ายใต้รูป / ในแชท" required error={errors.badgeLabel}>
                {(field) => <input {...field} className={adminInputClass} maxLength={16} value={form.badgeLabel} onChange={(e) => set('badgeLabel', e.target.value)} />}
              </AdminField>
              <AdminField label="ระดับ (tier)" required error={errors.tierRank} hint="เลขมาก = ระดับสูงกว่า">
                {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.tierRank} onChange={(e) => set('tierRank', e.target.value.replace(/\D/g, ''))} />}
              </AdminField>
            </div>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="กรอบรูปโปรไฟล์">
              {VIP_FRAME_STYLES.map((fs) => {
                const selected = form.frameStyle === fs.key;
                return (
                  <button
                    key={fs.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set('frameStyle', fs.key)}
                    className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 pb-2 pt-3 text-xs transition-colors ${
                      selected ? 'border-iris-cyan/50 bg-iris-cyan/[0.07] text-iris-pearl' : 'border-white/[0.08] text-iris-muted hover:border-white/20'
                    }`}
                  >
                    <VipAvatar size={40} name="IR" vip={{ tierRank: 1, frameStyle: fs.key, label: form.badgeLabel.trim() || 'VIP' }} />
                    <span className="mt-1">{fs.labelTh}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <GrantsEditor features={features} grants={form.grants} onChange={(g) => set('grants', g)} error={errors.grants} />

        <AdminField label="คำอธิบาย (แสดงในหน้าสิทธิ์พิเศษ)">
          {(field) => <textarea {...field} rows={3} className={adminInputClass} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </AdminField>
        <CheckRow checked={form.isActive} onChange={(v) => set('isActive', v)} title="เปิดขาย" hint="ผู้เล่นจะเห็นและซื้อได้ที่หน้าสิทธิ์พิเศษ (ต้องตั้งราคามากกว่า 0)" />
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

export function PlansPanel({ onNotice }: { onNotice: Notify }) {
  const plans = useAdminPlans();
  const features = useAdminFeatures();
  const invalidate = useInvalidate();
  const [dialog, setDialog] = useState<{ editing: PerkPlan | null; seq: number } | null>(null);
  const rows = plans.data ?? [];
  return (
    <AdminPanel
      flush
      title="แพ็กเกจรายเดือน"
      description="แพ็กเกจเดียวกับแพ็กเกจ VIP (vip-30d คือ VIP เดิม) ขายด้วยเงินจริงผ่านบัตรหรือโอน กำหนดได้ว่าแต่ละคำสั่งใช้ได้ไม่จำกัดหรือวันละ x ครั้ง"
      actions={
        <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setDialog({ editing: null, seq: Date.now() })}>
          สร้างแพ็กเกจ
        </AdminButton>
      }
    >
      <AdminTable caption="แพ็กเกจรายเดือน" busy={plans.isFetching} minWidth={1040} maxHeight="none">
        <AdminTableHead>
          <tr>
            <AdminTh>แพ็กเกจ</AdminTh>
            <AdminTh>กรอบ</AdminTh>
            <AdminTh align="right">ราคา</AdminTh>
            <AdminTh>ระยะเวลา</AdminTh>
            <AdminTh>กลุ่ม Permissions</AdminTh>
            <AdminTh>สิทธิ์</AdminTh>
            <AdminTh align="right">สมาชิกตอนนี้</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh align="right">แก้ไข</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={9}
          isInitialLoading={plans.isLoading}
          isError={plans.isError}
          onRetry={() => void plans.refetch()}
          errorMessage={plans.isError ? apiErrorText(plans.error, 'โหลดแพ็กเกจไม่สำเร็จ') : undefined}
          isEmpty={rows.length === 0}
          emptyTitle="ยังไม่มีแพ็กเกจ"
          skeletonRows={3}
        >
          {rows.map((p) => {
            const unlimited = p.grants.filter((g) => g.quota.type === 'unlimited').length;
            return (
              <AdminTr key={p.id}>
                <AdminTd>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-xs text-iris-muted">{p.key}</div>
                </AdminTd>
                <AdminTd>{p.badge ? <VipAvatar size={34} name={p.badgeLabel} vip={p.badge} showLabel={false} /> : <span className="text-iris-muted">—</span>}</AdminTd>
                <AdminTd align="right" mono nowrap>
                  {isZeroPrice(p.priceThb) ? <span className="text-amber-100">ยังไม่ตั้งราคา</span> : formatThb(p.priceThb)}
                </AdminTd>
                <AdminTd muted>{durationLabel(p.periodDays)}</AdminTd>
                <AdminTd mono muted>
                  {p.permissionGroup ?? '—'}
                </AdminTd>
                <AdminTd muted>
                  {p.grants.length.toLocaleString('th-TH')} คำสั่ง
                  {p.grants.length > 0 && unlimited < p.grants.length ? ` (มีโควตา ${p.grants.length - unlimited})` : ''}
                </AdminTd>
                <AdminTd align="right" mono>
                  {p.activeSubscriptions ?? '—'}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={p.isActive ? 'success' : 'neutral'} dot>
                    {p.isActive ? 'เปิดขาย' : 'ปิดอยู่'}
                  </StatusBadge>
                </AdminTd>
                <AdminTd align="right">
                  <AdminIconButton aria-label={`แก้ไขแพ็กเกจ ${p.name}`} onClick={() => setDialog({ editing: p, seq: Date.now() })} disabled={features.isLoading}>
                    <Pencil />
                  </AdminIconButton>
                </AdminTd>
              </AdminTr>
            );
          })}
        </AdminTableBody>
      </AdminTable>
      {dialog && (
        <PlanDialog
          key={dialog.seq}
          editing={dialog.editing}
          features={features.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={(p, created) => {
            setDialog(null);
            onNotice(created ? `สร้างแพ็กเกจ ${p?.name ?? ''} แล้ว` : `บันทึกแพ็กเกจ ${p?.name ?? ''} แล้ว`);
            invalidate(PLANS_KEY, FEATURES_KEY, 'admin-vip-packages');
          }}
        />
      )}
    </AdminPanel>
  );
}

/* ================================================================== */
/* Token packs                                                         */
/* ================================================================== */

interface PackForm {
  key: string;
  name: string;
  description: string;
  tokens: string;
  priceThb: string;
  priceIc: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY_PACK: PackForm = { key: '', name: '', description: '', tokens: '10', priceThb: '', priceIc: '', isActive: false, sortOrder: '0' };

function packForm(p: TokenPack): PackForm {
  return {
    key: p.key,
    name: p.name,
    description: p.description ?? '',
    tokens: String(p.tokens),
    priceThb: p.priceThb && !isZeroPrice(p.priceThb) ? p.priceThb : '',
    priceIc: p.priceIc && !isZeroPrice(p.priceIc) ? p.priceIc : '',
    isActive: p.isActive,
    sortOrder: String(p.sortOrder),
  };
}

function validatePack(f: PackForm): Partial<Record<keyof PackForm, string>> {
  const e: Partial<Record<keyof PackForm, string>> = {};
  if (!PRODUCT_KEY_RE.test(f.key.trim())) e.key = 'ตัวพิมพ์เล็ก ตัวเลข และ - (2–64 ตัว) เช่น tokens-10';
  if (!f.name.trim()) e.name = 'กรอกชื่อ';
  const t = Number(f.tokens);
  if (!Number.isInteger(t) || t < 1 || t > 100_000) e.tokens = 'จำนวนเต็ม 1–100000';
  if (f.priceThb.trim() && (!MONEY_RE.test(f.priceThb.trim()) || isZeroPrice(f.priceThb))) e.priceThb = 'ราคามากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง';
  if (f.priceIc.trim() && (!/^\d{1,12}$/.test(f.priceIc.trim()) || isZeroPrice(f.priceIc))) e.priceIc = 'จำนวนเต็มมากกว่า 0';
  if (f.isActive && !f.priceThb.trim() && !f.priceIc.trim()) e.priceThb = 'ตั้งราคาบาทหรือ IC อย่างน้อยหนึ่งอย่างก่อนเปิดขาย';
  if (!/^-?\d{1,6}$/.test(f.sortOrder.trim())) e.sortOrder = 'จำนวนเต็ม';
  return e;
}

function packPayload(f: PackForm): TokenPackInput {
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    description: f.description.trim() || null,
    tokens: Number(f.tokens),
    priceThb: f.priceThb.trim() || null,
    priceIc: f.priceIc.trim() || null,
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder),
  };
}

function PackDialog({ editing, onClose, onSaved }: { editing: TokenPack | null; onClose: () => void; onSaved: (p: TokenPack | null, created: boolean) => void }) {
  const [form, setForm] = useState<PackForm>(editing ? packForm(editing) : EMPTY_PACK);
  const [touched, setTouched] = useState(false);
  const errors = touched ? validatePack(form) : {};
  const set = <K extends keyof PackForm>(k: K, v: PackForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => (editing ? perksAdminApi.tokenPacks.update(editing.id, packPayload(form)) : perksAdminApi.tokenPacks.create(packPayload(form))),
    onSuccess: (p) => onSaved(p, !editing),
  });
  const submit = () => {
    setTouched(true);
    if (Object.keys(validatePack(form)).length === 0) save.mutate();
  };
  return (
    <AdminDialog
      open
      onClose={onClose}
      busy={save.isPending}
      title={editing ? `แก้ไขแพ็ก ${editing.name}` : 'สร้างแพ็ก Perk Token'}
      description="ขายด้วยเงินจริง (บัตร/โอน) หรือ IC หรือทั้งสองแบบ Token แยกจากกระเป๋า IC และไม่มีวันหมดอายุ"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? 'บันทึก' : 'สร้างแพ็ก'}
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
            {(field) => <input {...field} className={adminInputClass} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="10 Token" />}
          </AdminField>
          <AdminField label="รหัส (key)" required error={errors.key}>
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase().trim())} placeholder="tokens-10" />}
          </AdminField>
          <AdminField label="จำนวน Token" required error={errors.tokens}>
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.tokens} onChange={(e) => set('tokens', e.target.value.replace(/\D/g, ''))} />}
          </AdminField>
          <AdminField label="ลำดับการแสดง" error={errors.sortOrder}>
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />}
          </AdminField>
          <AdminField label="ราคาเงินจริง (บาท)" error={errors.priceThb} hint="เว้นว่าง = ไม่ขายด้วยเงินจริง">
            {(field) => <input {...field} className={adminInputClass} inputMode="decimal" value={form.priceThb} onChange={(e) => set('priceThb', e.target.value.trim())} placeholder="49" />}
          </AdminField>
          <AdminField label="ราคา IC" error={errors.priceIc} hint="เว้นว่าง = ไม่ขายด้วย IC">
            {(field) => <input {...field} className={adminInputClass} inputMode="numeric" value={form.priceIc} onChange={(e) => set('priceIc', e.target.value.replace(/\D/g, ''))} placeholder="500" />}
          </AdminField>
        </div>
        <AdminField label="คำอธิบาย">
          {(field) => <textarea {...field} rows={2} className={adminInputClass} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </AdminField>
        <CheckRow checked={form.isActive} onChange={(v) => set('isActive', v)} title="เปิดขาย" hint="ต้องมีราคาบาทหรือ IC อย่างน้อยหนึ่งอย่าง" />
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

export function TokenPacksPanel({ onNotice }: { onNotice: Notify }) {
  const packs = useQuery({ queryKey: [PACKS_KEY], queryFn: ({ signal }) => perksAdminApi.tokenPacks.list(signal), staleTime: 15_000 });
  const invalidate = useInvalidate();
  const [dialog, setDialog] = useState<{ editing: TokenPack | null; seq: number } | null>(null);
  const rows = packs.data ?? [];
  return (
    <AdminPanel
      flush
      title="แพ็ก Perk Token"
      description="Token ใช้จ่ายตามครั้งเมื่อผู้เล่นไม่มีโปรโมชั่นหรือแพ็กเกจที่ครอบคลุมคำสั่งนั้น ราคาต่อครั้งตั้งที่แท็บสิทธิ์"
      actions={
        <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setDialog({ editing: null, seq: Date.now() })}>
          สร้างแพ็ก
        </AdminButton>
      }
    >
      <AdminTable caption="แพ็ก Perk Token" busy={packs.isFetching} minWidth={820} maxHeight="none">
        <AdminTableHead>
          <tr>
            <AdminTh>แพ็ก</AdminTh>
            <AdminTh align="right">Token</AdminTh>
            <AdminTh align="right">ราคาเงินจริง</AdminTh>
            <AdminTh align="right">ราคา IC</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh align="right">แก้ไข</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={6}
          isInitialLoading={packs.isLoading}
          isError={packs.isError}
          onRetry={() => void packs.refetch()}
          errorMessage={packs.isError ? apiErrorText(packs.error, 'โหลดแพ็ก Token ไม่สำเร็จ') : undefined}
          isEmpty={rows.length === 0}
          emptyTitle="ยังไม่มีแพ็ก Perk Token"
          skeletonRows={3}
        >
          {rows.map((p) => (
            <AdminTr key={p.id}>
              <AdminTd>
                <div className="font-semibold">{p.name}</div>
                <div className="font-mono text-xs text-iris-muted">{p.key}</div>
              </AdminTd>
              <AdminTd align="right" mono>
                {p.tokens.toLocaleString('th-TH')}
              </AdminTd>
              <AdminTd align="right" mono nowrap>
                {p.priceThb && !isZeroPrice(p.priceThb) ? formatThb(p.priceThb) : '—'}
              </AdminTd>
              <AdminTd align="right" mono nowrap>
                {p.priceIc && !isZeroPrice(p.priceIc) ? formatIcAmount(p.priceIc) : '—'}
              </AdminTd>
              <AdminTd>
                <StatusBadge tone={p.isActive ? 'success' : 'neutral'} dot>
                  {p.isActive ? 'เปิดขาย' : 'ปิดอยู่'}
                </StatusBadge>
              </AdminTd>
              <AdminTd align="right">
                <AdminIconButton aria-label={`แก้ไขแพ็ก ${p.name}`} onClick={() => setDialog({ editing: p, seq: Date.now() })}>
                  <Pencil />
                </AdminIconButton>
              </AdminTd>
            </AdminTr>
          ))}
        </AdminTableBody>
      </AdminTable>
      {dialog && (
        <PackDialog
          key={dialog.seq}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={(p, created) => {
            setDialog(null);
            onNotice(created ? `สร้างแพ็ก ${p?.name ?? ''} แล้ว` : `บันทึกแพ็ก ${p?.name ?? ''} แล้ว`);
            invalidate(PACKS_KEY);
          }}
        />
      )}
    </AdminPanel>
  );
}

/* ================================================================== */
/* Promotions                                                          */
/* ================================================================== */

interface PromoForm {
  key: string;
  name: string;
  description: string;
  featureKeys: string[];
  quota: Quota;
  audience: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

function promoForm(p: PerkPromotion | null): PromoForm {
  if (!p) {
    return {
      key: '',
      name: '',
      description: '',
      featureKeys: [],
      quota: { type: 'per_day', limit: 3 },
      audience: 'all',
      startsAt: bangkokInputFromIso(new Date().toISOString()),
      endsAt: '',
      isActive: true,
    };
  }
  return {
    key: p.key,
    name: p.name,
    description: p.description ?? '',
    featureKeys: p.featureKeys,
    quota: p.quota.type === 'unlimited' ? { type: 'per_day', limit: 1 } : p.quota,
    audience: p.audience,
    startsAt: bangkokInputFromIso(p.startsAt),
    endsAt: bangkokInputFromIso(p.endsAt),
    isActive: p.isActive,
  };
}

function validatePromo(f: PromoForm): Partial<Record<keyof PromoForm, string>> {
  const e: Partial<Record<keyof PromoForm, string>> = {};
  if (!PRODUCT_KEY_RE.test(f.key.trim())) e.key = 'ตัวพิมพ์เล็ก ตัวเลข และ - (2–64 ตัว) เช่น getbags-free';
  if (!f.name.trim()) e.name = 'กรอกชื่อโปรโมชั่น';
  if (f.featureKeys.length === 0) e.featureKeys = 'เลือกอย่างน้อย 1 คำสั่ง';
  if (!isQuotaValid(f.quota) || f.quota.type === 'unlimited') e.quota = 'วันละ/สัปดาห์ละ 1–100000 ครั้ง';
  const s = f.startsAt ? isoFromBangkokInput(f.startsAt) : null;
  const en = f.endsAt ? isoFromBangkokInput(f.endsAt) : null;
  if (f.startsAt && !s) e.startsAt = 'วันเวลาไม่ถูกต้อง';
  if (f.endsAt && !en) e.endsAt = 'วันเวลาไม่ถูกต้อง';
  if (s && en && en <= s) e.endsAt = 'ต้องหลังเวลาเริ่ม';
  return e;
}

function promoPayload(f: PromoForm): PromotionInput {
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    description: f.description.trim() || null,
    featureKeys: f.featureKeys,
    quota: f.quota,
    audience: f.audience,
    ...(f.startsAt ? { startsAt: isoFromBangkokInput(f.startsAt)! } : {}),
    endsAt: f.endsAt ? isoFromBangkokInput(f.endsAt) : null,
    isActive: f.isActive,
  };
}

function PromoDialog({
  editing,
  features,
  plans,
  onClose,
  onSaved,
}: {
  editing: PerkPromotion | null;
  features: PerkFeature[];
  plans: PerkPlan[];
  onClose: () => void;
  onSaved: (p: PerkPromotion | null, created: boolean) => void;
}) {
  const [form, setForm] = useState<PromoForm>(() => promoForm(editing));
  const [touched, setTouched] = useState(false);
  const [filter, setFilter] = useState('');
  const errors = touched ? validatePromo(form) : {};
  const set = <K extends keyof PromoForm>(k: K, v: PromoForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => (editing ? perksAdminApi.promotions.update(editing.id, promoPayload(form)) : perksAdminApi.promotions.create(promoPayload(form))),
    onSuccess: (p) => onSaved(p, !editing),
  });
  const submit = () => {
    setTouched(true);
    if (Object.keys(validatePromo(form)).length === 0) save.mutate();
  };
  const needle = filter.trim().toLowerCase();
  const visible = features.filter((f) => !needle || f.key.includes(needle) || f.name.toLowerCase().includes(needle) || f.commands.some((c) => c.includes(needle)));
  return (
    <AdminDialog
      open
      onClose={onClose}
      busy={save.isPending}
      size="lg"
      title={editing ? `แก้ไขโปรโมชั่น ${editing.name}` : 'สร้างโปรโมชั่น'}
      description="เช่น /getbags ใช้ฟรีวันละ 3 ครั้งสำหรับทุกคน นับโควตาต่อ Steam ID ตามวัน/สัปดาห์เวลาประเทศไทย (สัปดาห์เริ่มวันจันทร์)"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? 'บันทึก' : 'สร้างโปรโมชั่น'}
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
          <AdminField label="ชื่อโปรโมชั่น" required error={errors.name}>
            {(field) => <input {...field} className={adminInputClass} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="/getbags ฟรีวันละ 3 ครั้ง" />}
          </AdminField>
          <AdminField label="รหัส (key)" required error={errors.key}>
            {(field) => <input {...field} className={adminInputClass} maxLength={64} value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase().trim())} placeholder="getbags-free" />}
          </AdminField>
          <AdminField label="โควตา" required error={errors.quota}>
            {() => <QuotaEditor idPrefix="promo-quota" value={form.quota} types={PROMO_QUOTA_TYPES} onChange={(q) => set('quota', q)} />}
          </AdminField>
          <AdminField label="ใช้ได้กับ">
            {(field) => (
              <select {...field} className={`${adminInputClass} pr-8`} value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                <option value="all">ทุกคน (รวม Steam ID ที่ยังไม่เชื่อมเว็บ)</option>
                <option value="linked">ผู้เล่นที่เชื่อม Steam กับเว็บแล้ว</option>
                {plans.map((p) => (
                  <option key={p.key} value={`plan:${p.key}`}>
                    สมาชิก {p.name}
                  </option>
                ))}
              </select>
            )}
          </AdminField>
          <AdminField label="เริ่ม (เวลาไทย)" error={errors.startsAt} hint="เว้นว่าง = เริ่มทันที">
            {(field) => <input {...field} type="datetime-local" className={adminInputClass} value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}
          </AdminField>
          <AdminField label="สิ้นสุด (เวลาไทย)" error={errors.endsAt} hint="เว้นว่าง = ไม่มีกำหนด">
            {(field) => <input {...field} type="datetime-local" className={adminInputClass} value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />}
          </AdminField>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-semibold text-iris-muted">คำสั่งที่ร่วมโปรโมชั่น ({form.featureKeys.length.toLocaleString('th-TH')})</legend>
          <input className={`${adminInputClass} max-w-xs`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="กรองคำสั่ง…" aria-label="กรองคำสั่ง" />
          {errors.featureKeys && <p className="text-xs text-rose-200">{errors.featureKeys}</p>}
          <ul className="grid max-h-60 gap-1 overflow-auto rounded-xl border border-white/[0.08] p-2 sm:grid-cols-2">
            {visible.map((f) => (
              <li key={f.key}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-iris-pearl hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-400"
                    checked={form.featureKeys.includes(f.key)}
                    onChange={(e) =>
                      set('featureKeys', e.target.checked ? [...form.featureKeys, f.key] : form.featureKeys.filter((k) => k !== f.key))
                    }
                  />
                  <span className="font-mono text-xs text-iris-cyan">{f.commands[0] ?? f.key}</span>
                  <span className="truncate">{f.name}</span>
                  {!f.isActive && <span className="text-[11px] text-iris-muted">(ปิด)</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <AdminField label="คำอธิบาย (แสดงในหน้าสิทธิ์พิเศษ)">
          {(field) => <textarea {...field} rows={2} className={adminInputClass} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </AdminField>
        <CheckRow checked={form.isActive} onChange={(v) => set('isActive', v)} title="เปิดใช้งาน" hint="ทำงานเฉพาะช่วงเวลาที่กำหนดและเมื่อคำสั่งนั้นเปิดใช้งาน" />
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

function promoState(p: PerkPromotion, now: number): { label: string; tone: StatusTone } {
  if (!p.isActive) return { label: 'ปิดอยู่', tone: 'neutral' };
  if (isPromotionLive(p, now)) return { label: 'กำลังใช้งาน', tone: 'success' };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: 'รอเริ่ม', tone: 'info' };
  return { label: 'สิ้นสุดแล้ว', tone: 'neutral' };
}

export function PromotionsPanel({ onNotice }: { onNotice: Notify }) {
  const promos = useQuery({ queryKey: [PROMOS_KEY], queryFn: ({ signal }) => perksAdminApi.promotions.list(signal), staleTime: 15_000 });
  const features = useAdminFeatures();
  const plans = useAdminPlans();
  const invalidate = useInvalidate();
  const [dialog, setDialog] = useState<{ editing: PerkPromotion | null; seq: number } | null>(null);
  const [ending, setEnding] = useState<PerkPromotion | null>(null);
  const [now] = useState(() => Date.now());
  const rows = promos.data ?? [];
  const featureList = features.data ?? [];
  const end = useMutation({
    mutationFn: (p: PerkPromotion) => perksAdminApi.promotions.remove(p.id),
    onSuccess: (_r, p) => {
      onNotice(`ปิดโปรโมชั่น ${p.name} แล้ว (ประวัติการใช้งานยังอยู่)`);
      invalidate(PROMOS_KEY);
    },
  });
  return (
    <AdminPanel
      flush
      title="โปรโมชั่น"
      description="ให้ใช้คำสั่งฟรีตามโควตา เช่นวันละ x ครั้ง ระบบใช้โควตาโปรก่อนแพ็กเกจและ Token เสมอ"
      actions={
        <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setDialog({ editing: null, seq: Date.now() })} disabled={features.isLoading}>
          สร้างโปรโมชั่น
        </AdminButton>
      }
    >
      <AdminTable caption="โปรโมชั่น" busy={promos.isFetching} minWidth={1000} maxHeight="none">
        <AdminTableHead>
          <tr>
            <AdminTh>โปรโมชั่น</AdminTh>
            <AdminTh>คำสั่ง</AdminTh>
            <AdminTh>โควตา</AdminTh>
            <AdminTh>ใช้ได้กับ</AdminTh>
            <AdminTh>ช่วงเวลา</AdminTh>
            <AdminTh>สถานะ</AdminTh>
            <AdminTh align="right">จัดการ</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody
          colSpan={7}
          isInitialLoading={promos.isLoading}
          isError={promos.isError}
          onRetry={() => void promos.refetch()}
          errorMessage={promos.isError ? apiErrorText(promos.error, 'โหลดโปรโมชั่นไม่สำเร็จ') : undefined}
          isEmpty={rows.length === 0}
          emptyTitle="ยังไม่มีโปรโมชั่น"
          skeletonRows={3}
        >
          {rows.map((p) => {
            const st = promoState(p, now);
            const cmds = p.featureKeys.flatMap((k) => featureList.find((f) => f.key === k)?.commands ?? [k]);
            return (
              <AdminTr key={p.id}>
                <AdminTd>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-xs text-iris-muted">{p.key}</div>
                </AdminTd>
                <AdminTd>
                  <CommandList commands={cmds} />
                </AdminTd>
                <AdminTd nowrap>{quotaLabel(p.quota)}</AdminTd>
                <AdminTd muted>{audienceLabel(p.audience, plans.data ?? [])}</AdminTd>
                <AdminTd muted nowrap>
                  <div>{p.startsAt ? formatBangkokDateTime(p.startsAt) : 'ทันที'}</div>
                  <div>ถึง {p.endsAt ? formatBangkokDateTime(p.endsAt) : 'ไม่มีกำหนด'}</div>
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={st.tone} dot>
                    {st.label}
                  </StatusBadge>
                </AdminTd>
                <AdminTd align="right" nowrap>
                  {p.isActive && (
                    <AdminIconButton aria-label={`ปิดโปรโมชั่น ${p.name}`} tone="danger" onClick={() => setEnding(p)}>
                      <PowerOff />
                    </AdminIconButton>
                  )}
                  <AdminIconButton aria-label={`แก้ไขโปรโมชั่น ${p.name}`} onClick={() => setDialog({ editing: p, seq: Date.now() })}>
                    <Pencil />
                  </AdminIconButton>
                </AdminTd>
              </AdminTr>
            );
          })}
        </AdminTableBody>
      </AdminTable>
      {dialog && (
        <PromoDialog
          key={dialog.seq}
          editing={dialog.editing}
          features={featureList}
          plans={plans.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={(p, created) => {
            setDialog(null);
            onNotice(created ? `สร้างโปรโมชั่น ${p?.name ?? ''} แล้ว` : `บันทึกโปรโมชั่น ${p?.name ?? ''} แล้ว`);
            invalidate(PROMOS_KEY);
          }}
        />
      )}
      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        onConfirm={() => end.mutateAsync(ending!)}
        tone="danger"
        title={`ปิดโปรโมชั่น ${ending?.name ?? ''}?`}
        description="ผู้เล่นจะใช้โควตาโปรนี้ไม่ได้ทันที ประวัติการใช้งานยังเก็บไว้ เปิดใหม่ได้จากปุ่มแก้ไข"
        confirmText="ปิดโปรโมชั่น"
      />
    </AdminPanel>
  );
}
