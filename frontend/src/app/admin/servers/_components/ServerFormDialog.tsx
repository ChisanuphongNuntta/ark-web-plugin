'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, ErrorMessage, Input, Select, Switch } from '@/components/ui';
import type { AdminServerInput, GameMode } from '@/lib/contracts/types';
import {
  GAME_MODE_OPTIONS,
  KNOWN_MAPS,
  UNASSIGNED,
  addressKey,
  serverTitle,
  type ClusterRow,
  type ServerRow,
} from '../_lib';

/** AdminServerInput + `displayName` (accepted by the backend, see contract §5). */
export type ServerPayload = AdminServerInput & { displayName?: string | null };

interface FormState {
  name: string;
  displayName: string;
  map: string;
  gameMode: GameMode;
  clusterId: string;
  sortOrder: string;
  connectHost: string;
  connectPort: string;
  rates: string;
  imageUrl: string;
  isModded: boolean;
  isListed: boolean;
  isAvailable: boolean;
  isActive: boolean;
  chatTag: string;
  chatColor: string;
  chatIcon: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const HOST_RE = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function initialState(server: ServerRow | null): FormState {
  return {
    name: server?.name ?? '',
    displayName: server?.displayName ?? '',
    map: server?.map ?? '',
    gameMode: server?.gameMode ?? 'PVE',
    clusterId: server?.clusterId ?? UNASSIGNED,
    sortOrder: String(server?.sortOrder ?? 0),
    connectHost: server?.connectHost ?? '',
    connectPort: server?.connectPort ? String(server.connectPort) : '',
    rates: server?.rates ?? '',
    imageUrl: server?.imageUrl ?? '',
    isModded: server?.isModded ?? false,
    isListed: server?.isListed ?? true,
    isAvailable: server?.isAvailable ?? true,
    isActive: server?.isActive ?? true,
    chatTag: server?.chatTag ?? '',
    chatColor: server ? server.chatColor ?? '' : '#C8A96A',
    chatIcon: server?.chatIcon ?? '',
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'กรอกชื่อเซิร์ฟเวอร์';
  else if (f.name.trim().length > 120) e.name = 'ยาวได้ไม่เกิน 120 ตัวอักษร';
  if (!f.map.trim()) e.map = 'กรอกรหัสแผนที่ เช่น TheIsland';
  else if (f.map.trim().length > 120) e.map = 'ยาวได้ไม่เกิน 120 ตัวอักษร';
  if (f.displayName.trim().length > 120) e.displayName = 'ยาวได้ไม่เกิน 120 ตัวอักษร';
  if (!/^-?\d+$/.test(f.sortOrder.trim())) e.sortOrder = 'ใส่เป็นจำนวนเต็ม';
  const host = f.connectHost.trim();
  const port = f.connectPort.trim();
  if (host && !HOST_RE.test(host)) e.connectHost = 'ใช้ชื่อโดเมนหรือ IPv4 เท่านั้น';
  if (port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) e.connectPort = 'พอร์ตต้องอยู่ระหว่าง 1–65535';
  }
  if (host && !port && !e.connectPort) e.connectPort = 'กรอกพอร์ตคู่กับโฮสต์';
  if (port && !host && !e.connectHost) e.connectHost = 'กรอกโฮสต์คู่กับพอร์ต';
  if (f.rates.trim().length > 32) e.rates = 'ยาวได้ไม่เกิน 32 ตัวอักษร';
  const img = f.imageUrl.trim();
  if (img && !(/^https:\/\/\S+$/.test(img) || (/^\/[^/]\S*$/.test(img)))) {
    e.imageUrl = 'ใช้ https://… หรือพาธในเว็บที่ขึ้นต้นด้วย /';
  } else if (img.length > 1024) e.imageUrl = 'ยาวได้ไม่เกิน 1024 ตัวอักษร';
  if (f.chatTag.trim().length > 32) e.chatTag = 'ยาวได้ไม่เกิน 32 ตัวอักษร';
  if (f.chatIcon.trim().length > 32) e.chatIcon = 'ยาวได้ไม่เกิน 32 ตัวอักษร';
  if (f.chatColor.trim() && !HEX_RE.test(f.chatColor.trim())) e.chatColor = 'ใช้รหัสสีแบบ #RRGGBB';
  return e;
}

const nullable = (v: string) => (v.trim() ? v.trim() : null);

function toPayload(f: FormState): ServerPayload {
  return {
    name: f.name.trim(),
    displayName: nullable(f.displayName),
    map: f.map.trim(),
    gameMode: f.gameMode,
    clusterId: f.clusterId === UNASSIGNED ? null : f.clusterId,
    sortOrder: Number(f.sortOrder.trim()),
    connectHost: nullable(f.connectHost),
    connectPort: f.connectPort.trim() ? Number(f.connectPort.trim()) : null,
    rates: nullable(f.rates),
    imageUrl: nullable(f.imageUrl),
    isModded: f.isModded,
    isListed: f.isListed,
    isAvailable: f.isAvailable,
    isActive: f.isActive,
    chatTag: nullable(f.chatTag),
    chatColor: nullable(f.chatColor),
    chatIcon: nullable(f.chatIcon),
  };
}

/** Only the fields that differ from the stored server (keeps the audit log meaningful). */
function diffPayload(server: ServerRow, payload: ServerPayload): ServerPayload {
  const out: Record<string, unknown> = {};
  const original = server as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(payload)) {
    const before = original[key] ?? null;
    if ((value ?? null) !== before) out[key] = value;
  }
  return out as ServerPayload;
}

export interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  server: ServerRow | null;
  servers: ServerRow[];
  clusters: ClusterRow[];
  submitting: boolean;
  error: string | null;
  /** Receives the full payload on create, or only changed fields on edit (empty = nothing changed). */
  onSubmit: (payload: ServerPayload) => void;
}

const FORM_ID = 'admin-server-form';

export function ServerFormDialog({ open, onOpenChange, server, servers, clusters, submitting, error, onSubmit }: ServerFormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={server ? `แก้ไข ${serverTitle(server)}` : 'เพิ่มเซิร์ฟเวอร์'}
      description={
        server
          ? 'การเปลี่ยนโหมด กลุ่ม หรือการแสดงผล มีผลกับหน้ารายชื่อเซิร์ฟเวอร์ทันทีหลังบันทึก'
          : 'เซิร์ฟเวอร์ใหม่จะยังรับของจากร้านค้าไม่ได้ จนกว่าจะออก credential และติดตั้งปลั๊กอิน'
      }
      size="lg"
      loading={submitting}
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {server ? 'บันทึก' : 'เพิ่มเซิร์ฟเวอร์'}
          </Button>
        </>
      }
    >
      <ServerForm
        key={server?.id ?? 'new'}
        server={server}
        servers={servers}
        clusters={clusters}
        error={error}
        onSubmit={onSubmit}
      />
    </Dialog>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-fg">{children}</h3>
      {hint ? <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

function ServerForm({
  server,
  servers,
  clusters,
  error,
  onSubmit,
}: Pick<ServerFormDialogProps, 'server' | 'servers' | 'clusters' | 'error' | 'onSubmit'>) {
  const [form, setForm] = React.useState<FormState>(() => initialState(server));
  const [errors, setErrors] = React.useState<Errors>({});
  const [clusterNote, setClusterNote] = React.useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onClusterChange = (clusterId: string) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    setForm((f) => {
      const next = { ...f, clusterId };
      if (cluster?.gameMode) next.gameMode = cluster.gameMode;
      if (cluster?.rates && !f.rates.trim()) next.rates = cluster.rates;
      if (typeof cluster?.isModded === 'boolean') next.isModded = cluster.isModded;
      return next;
    });
    setClusterNote(cluster?.gameMode ? 'ตั้งโหมดเกม อัตรา และม็อดตามกลุ่มแล้ว ปรับเองได้' : null);
  };

  const duplicate = React.useMemo(() => {
    const key = addressKey({ connectHost: form.connectHost.trim() || null, connectPort: Number(form.connectPort) || null });
    if (!key) return [];
    return servers.filter((s) => s.id !== server?.id && addressKey(s) === key);
  }, [form.connectHost, form.connectPort, servers, server?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload = toPayload(form);
    onSubmit(server ? diffPayload(server, payload) : payload);
  };

  const clusterOptions = [
    { value: UNASSIGNED, label: 'ไม่อยู่ในกลุ่ม' },
    ...clusters.map((c) => ({ value: c.id, label: c.isActive === false ? `${c.name} (ปิดใช้งาน)` : c.name })),
  ];

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-8">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}

      <section>
        <SectionTitle>ข้อมูลหลัก</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="ชื่อภายใน"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            helperText="ใช้ในหลังบ้านและ log เช่น PvE X10 - The Island"
          />
          <Input
            label="ชื่อที่แสดง"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            error={errors.displayName}
            helperText="เว้นว่างเพื่อใช้ชื่อแผนที่"
          />
          <Input
            label="รหัสแผนที่"
            required
            mono
            list="admin-known-maps"
            value={form.map}
            onChange={(e) => set('map', e.target.value)}
            error={errors.map}
            helperText="รหัสแผนที่ใน ARK เช่น TheIsland, Genesis2"
          />
          <datalist id="admin-known-maps">
            {KNOWN_MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          <Select
            label="กลุ่มเซิร์ฟเวอร์"
            value={form.clusterId}
            onChange={(e) => onClusterChange(e.target.value)}
            options={clusterOptions}
            helperText={clusterNote ?? undefined}
          />
          <Select
            label="โหมดเกม"
            value={form.gameMode}
            onChange={(e) => set('gameMode', e.target.value as GameMode)}
            options={GAME_MODE_OPTIONS}
          />
          <Input
            label="ลำดับการแสดง"
            mono
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
            error={errors.sortOrder}
            helperText="เลขน้อยแสดงก่อนภายในกลุ่ม"
          />
        </div>
      </section>

      <section>
        <SectionTitle hint="หน้ารายชื่อจะแสดงที่อยู่เมื่อกรอกครบทั้งโฮสต์และพอร์ต">การเชื่อมต่อ</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Input
            label="โฮสต์"
            mono
            autoComplete="off"
            spellCheck={false}
            placeholder="ark.iris-th.cloud"
            value={form.connectHost}
            onChange={(e) => set('connectHost', e.target.value)}
            error={errors.connectHost}
          />
          <Input
            label="พอร์ต"
            mono
            inputMode="numeric"
            placeholder="27015"
            value={form.connectPort}
            onChange={(e) => set('connectPort', e.target.value)}
            error={errors.connectPort}
          />
        </div>
        {duplicate.length ? (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>
              ที่อยู่นี้ซ้ำกับ {duplicate.map((s) => serverTitle(s)).join(', ')} ตรวจสอบพอร์ตก่อนบันทึก
            </span>
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="อัตรา"
            mono
            placeholder="X10"
            value={form.rates}
            onChange={(e) => set('rates', e.target.value)}
            error={errors.rates}
            helperText="เว้นว่างเพื่อใช้อัตราของกลุ่ม"
          />
          <Input
            label="รูปภาพ"
            mono
            placeholder="https://… หรือ /images/…"
            value={form.imageUrl}
            onChange={(e) => set('imageUrl', e.target.value)}
            error={errors.imageUrl}
          />
        </div>
      </section>

      <section>
        <SectionTitle>สถานะและการแสดงผล</SectionTitle>
        <div className="divide-y divide-line rounded-card border border-line">
          <Switch
            className="px-4 py-3"
            checked={form.isListed}
            onCheckedChange={(v) => set('isListed', v)}
            label="แสดงในหน้ารายชื่อเซิร์ฟเวอร์"
            description="ปิดเพื่อซ่อนจากผู้เล่น โดยไม่กระทบการส่งของ"
          />
          <Switch
            className="px-4 py-3"
            checked={form.isAvailable}
            onCheckedChange={(v) => set('isAvailable', v)}
            label="เปิดให้บริการ"
            description="ปิดเมื่อเซิร์ฟเวอร์ยังไม่พร้อม หน้ารายชื่อจะแสดงว่า ปิดให้บริการ"
          />
          <Switch
            className="px-4 py-3"
            checked={form.isModded}
            onCheckedChange={(v) => set('isModded', v)}
            label="ลงม็อด"
          />
          <Switch
            className="px-4 py-3"
            checked={form.isActive}
            onCheckedChange={(v) => set('isActive', v)}
            label="เปิดใช้งาน"
            description="ปิดแล้วร้านค้าจะไม่ส่งของเข้าเซิร์ฟเวอร์นี้"
          />
        </div>
      </section>

      <section>
        <SectionTitle hint="ป้ายที่แสดงหน้าชื่อผู้เล่นในแชทข้ามเซิร์ฟเวอร์">แชทในเกม</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="แท็ก"
            mono
            placeholder="[ISL]"
            value={form.chatTag}
            onChange={(e) => set('chatTag', e.target.value)}
            error={errors.chatTag}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="server-chat-color" className="text-xs font-medium text-fg-muted">
              สี
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="เลือกสีแท็ก"
                value={HEX_RE.test(form.chatColor) ? form.chatColor : '#C8A96A'}
                onChange={(e) => set('chatColor', e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-control border border-line-strong bg-canvas p-1"
              />
              <Input
                id="server-chat-color"
                mono
                wrapperClassName="min-w-0"
                value={form.chatColor}
                onChange={(e) => set('chatColor', e.target.value)}
                error={errors.chatColor}
              />
            </div>
          </div>
          <Input
            label="ไอคอน"
            value={form.chatIcon}
            onChange={(e) => set('chatIcon', e.target.value)}
            error={errors.chatIcon}
          />
        </div>
        {form.chatTag.trim() || form.chatIcon.trim() ? (
          <p className="mt-3 rounded-control border border-line bg-canvas px-3 py-2 text-sm">
            <span className="mr-2 text-xs text-fg-subtle">ตัวอย่าง</span>
            <span style={{ color: HEX_RE.test(form.chatColor) ? form.chatColor : undefined }}>
              {form.chatIcon.trim() ? `${form.chatIcon.trim()} ` : ''}
              {form.chatTag.trim() || '[TAG]'}
            </span>
            <span className="text-fg-muted"> PlayerName: สวัสดี</span>
          </p>
        ) : null}
      </section>
    </form>
  );
}

export default ServerFormDialog;
