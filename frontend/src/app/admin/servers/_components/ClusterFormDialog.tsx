'use client';

import * as React from 'react';
import { Button, Dialog, ErrorMessage, Input, Select, Switch, Textarea } from '@/components/ui';
import type { AdminClusterInput, GameMode } from '@/lib/contracts/types';
import { GAME_MODE_OPTIONS, type ClusterRow } from '../_lib';

/** AdminClusterInput + rates / isModded / isActive (accepted by the backend, contract §5). */
export type ClusterPayload = AdminClusterInput & {
  rates?: string | null;
  isModded?: boolean;
  isActive?: boolean;
};

interface FormState {
  key: string;
  name: string;
  gameMode: GameMode | '';
  rates: string;
  isModded: boolean;
  isActive: boolean;
  sortOrder: string;
  description: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function initialState(cluster: ClusterRow | null): FormState {
  return {
    key: cluster?.key ?? '',
    name: cluster?.name ?? '',
    gameMode: cluster?.gameMode ?? '',
    rates: cluster?.rates ?? '',
    isModded: cluster?.isModded ?? false,
    isActive: cluster?.isActive ?? true,
    sortOrder: String(cluster?.sortOrder ?? 0),
    description: cluster?.description ?? '',
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!KEY_RE.test(f.key.trim())) e.key = 'ใช้ a-z, 0-9 และ - ยาว 2–64 ตัว ขึ้นต้นด้วยตัวอักษรหรือตัวเลข';
  if (!f.name.trim()) e.name = 'กรอกชื่อกลุ่ม';
  else if (f.name.trim().length > 120) e.name = 'ยาวได้ไม่เกิน 120 ตัวอักษร';
  if (f.rates.trim().length > 32) e.rates = 'ยาวได้ไม่เกิน 32 ตัวอักษร';
  if (!/^-?\d+$/.test(f.sortOrder.trim())) e.sortOrder = 'ใส่เป็นจำนวนเต็ม';
  if (f.description.length > 1000) e.description = 'ยาวได้ไม่เกิน 1000 ตัวอักษร';
  return e;
}

function toPayload(f: FormState): ClusterPayload {
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    gameMode: f.gameMode || null,
    rates: f.rates.trim() || null,
    isModded: f.isModded,
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder.trim()),
    description: f.description.trim() || null,
  };
}

function diffPayload(cluster: ClusterRow, payload: ClusterPayload): ClusterPayload {
  const out: Record<string, unknown> = {};
  const original = cluster as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(payload)) {
    if ((value ?? null) !== (original[key] ?? null)) out[key] = value;
  }
  return out as ClusterPayload;
}

export interface ClusterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: ClusterRow | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: ClusterPayload) => void;
}

const FORM_ID = 'admin-cluster-form';

export function ClusterFormDialog({ open, onOpenChange, cluster, submitting, error, onSubmit }: ClusterFormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={cluster ? `แก้ไขกลุ่ม ${cluster.name}` : 'เพิ่มกลุ่มเซิร์ฟเวอร์'}
      description="กลุ่มใช้จัดหัวข้อในหน้ารายชื่อและตัวเลือกเซิร์ฟเวอร์ เช่น PvE X10 (No Mod)"
      size="md"
      loading={submitting}
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {cluster ? 'บันทึก' : 'เพิ่มกลุ่ม'}
          </Button>
        </>
      }
    >
      <ClusterForm key={cluster?.id ?? 'new'} cluster={cluster} error={error} onSubmit={onSubmit} />
    </Dialog>
  );
}

function ClusterForm({ cluster, error, onSubmit }: Pick<ClusterFormDialogProps, 'cluster' | 'error' | 'onSubmit'>) {
  const [form, setForm] = React.useState<FormState>(() => initialState(cluster));
  const [errors, setErrors] = React.useState<Errors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload = toPayload(form);
    onSubmit(cluster ? diffPayload(cluster, payload) : payload);
  };

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="ชื่อกลุ่ม"
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <Input
          label="คีย์"
          required
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder="pve-x10"
          value={form.key}
          onChange={(e) => set('key', e.target.value.toLowerCase())}
          error={errors.key}
          helperText={cluster ? 'เปลี่ยนคีย์จะกระทบลิงก์และข้อมูล seed' : 'ใช้อ้างอิงถาวร เปลี่ยนภายหลังไม่แนะนำ'}
        />
        <Select
          label="โหมดเกม"
          value={form.gameMode}
          onChange={(e) => set('gameMode', e.target.value as GameMode | '')}
          options={[{ value: '', label: 'ไม่กำหนด' }, ...GAME_MODE_OPTIONS]}
        />
        <Input
          label="อัตรา"
          mono
          placeholder="X10"
          value={form.rates}
          onChange={(e) => set('rates', e.target.value)}
          error={errors.rates}
        />
        <Input
          label="ลำดับการแสดง"
          mono
          inputMode="numeric"
          value={form.sortOrder}
          onChange={(e) => set('sortOrder', e.target.value)}
          error={errors.sortOrder}
          helperText="เลขน้อยแสดงก่อน"
        />
      </div>
      <Textarea
        label="คำอธิบาย"
        rows={3}
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        error={errors.description}
      />
      <div className="divide-y divide-line rounded-card border border-line">
        <Switch className="px-4 py-3" checked={form.isModded} onCheckedChange={(v) => set('isModded', v)} label="กลุ่มนี้ลงม็อด" />
        <Switch
          className="px-4 py-3"
          checked={form.isActive}
          onCheckedChange={(v) => set('isActive', v)}
          label="เปิดใช้งาน"
          description="ปิดแล้วเซิร์ฟเวอร์ในกลุ่มนี้จะไม่แสดงในหน้ารายชื่อ"
        />
      </div>
    </form>
  );
}

export default ClusterFormDialog;
