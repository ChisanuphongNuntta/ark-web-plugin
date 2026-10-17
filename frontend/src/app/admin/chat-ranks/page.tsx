'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Panel,
  Select,
  Switch,
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
import { AdminNoAccess, AdminToolbar } from '@/components/admin';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

interface ServerOption {
  id: number;
  name: string;
}

interface ChatRank {
  id: number;
  name: string;
  groupKey: string;
  color: string;
  icon: string | null;
  priority: number;
  serverId: number | null;
  isActive: boolean;
  server: { id: number; name: string } | null;
}

interface FormState {
  name: string;
  groupKey: string;
  color: string;
  icon: string;
  priority: string;
  serverId: string;
  isActive: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

function asArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export default function ChatRanksPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageChatRanks } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = React.useState('all');
  const [editor, setEditor] = React.useState<{ open: boolean; rank: ChatRank | null }>({ open: false, rank: null });
  const [deleteTarget, setDeleteTarget] = React.useState<ChatRank | null>(null);

  const ranksQuery = useQuery({
    queryKey: ['admin-chat-ranks'],
    queryFn: () => adminApi.getChatRanks().then((res) => asArray<ChatRank>(res.data, 'ranks')),
    enabled: canManageChatRanks,
  });
  const serversQuery = useQuery({
    queryKey: ['admin-chat-ranks-servers'],
    queryFn: () =>
      adminApi.getServers().then((res) => asArray<ServerOption>(res.data, 'servers').map((s) => ({ id: s.id, name: s.name }))),
    enabled: canManageChatRanks,
  });
  const servers = serversQuery.data ?? [];

  const ranks = React.useMemo(() => {
    const all = [...(ranksQuery.data ?? [])].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
    if (filter === 'all') return all;
    if (filter === 'global') return all.filter((r) => r.serverId === null);
    return all.filter((r) => String(r.serverId) === filter);
  }, [ranksQuery.data, filter]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-chat-ranks'] });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: Record<string, unknown> }) =>
      id === null ? adminApi.createChatRank(data) : adminApi.updateChatRank(id, data),
    onSuccess: (_d, vars) => {
      toast.success(vars.id === null ? 'เพิ่มแรงก์แล้ว' : 'บันทึกแรงก์แล้ว');
      setEditor({ open: false, rank: null });
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (rank: ChatRank) => adminApi.updateChatRank(rank.id, { isActive: !rank.isActive }),
    onSuccess: (_d, rank) => {
      toast.success(rank.isActive ? 'ปิดใช้งานแรงก์แล้ว' : 'เปิดใช้งานแรงก์แล้ว', rank.name);
      invalidate();
    },
    onError: (err) => toast.error('เปลี่ยนสถานะไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const deleteMutation = useMutation({
    mutationFn: (rank: ChatRank) => adminApi.deleteChatRank(rank.id),
    onSuccess: (_d, rank) => {
      toast.success('ลบแรงก์แล้ว', rank.name);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error('ลบไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const openCreate = () => {
    saveMutation.reset();
    setEditor({ open: true, rank: null });
  };
  const openEdit = (rank: ChatRank) => {
    saveMutation.reset();
    setEditor({ open: true, rank });
  };

  const header = (
    <PageHeader
      eyebrow="ระบบ"
      title="แชทแรงก์"
      description="ป้ายชื่อหน้าแชทในเกม ผูกกับกลุ่มของปลั๊กอิน Permissions"
      actions={
        canManageChatRanks ? (
          <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreate}>
            เพิ่มแรงก์
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

  if (!canManageChatRanks) {
    return (
      <div className="pb-16">
        {header}
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลสูงสุดเท่านั้น" />
      </div>
    );
  }

  const filterOptions = [
    { value: 'all', label: 'ทุกเซิร์ฟเวอร์' },
    { value: 'global', label: 'เฉพาะแรงก์ทั่วไป' },
    ...servers.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  return (
    <div className="min-w-0 pb-16">
      {header}

      <AdminToolbar>
        <Select
          label="เซิร์ฟเวอร์"
          hideLabel
          size="sm"
          wrapperClassName="w-full sm:w-64"
          options={filterOptions}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </AdminToolbar>

      {ranksQuery.isError ? (
        <ErrorMessage
          title="โหลดแรงก์ไม่สำเร็จ"
          message={apiErrorText(ranksQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void ranksQuery.refetch()}
        />
      ) : (
        <TableContainer aria-busy={ranksQuery.isLoading || undefined}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell align="right">ลำดับ</TableHeaderCell>
                <TableHeaderCell>ตัวอย่าง</TableHeaderCell>
                <TableHeaderCell>กลุ่ม</TableHeaderCell>
                <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                <TableHeaderCell>สถานะ</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">การทำงาน</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranksQuery.isLoading ? (
                <TableLoadingRows columns={6} rows={5} />
              ) : ranks.length === 0 ? (
                <TableEmptyRow
                  colSpan={6}
                  title={filter === 'all' ? 'ยังไม่มีแรงก์' : 'ไม่มีแรงก์ในตัวกรองนี้'}
                  description="เพิ่มแรงก์เพื่อกำหนดป้ายชื่อและสีของกลุ่มผู้เล่นในแชท"
                  action={
                    filter === 'all' ? (
                      <Button size="sm" onClick={openCreate}>
                        เพิ่มแรงก์
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                ranks.map((rank) => (
                  <TableRow key={rank.id} interactive onClick={() => openEdit(rank)}>
                    <TableCell align="right" mono muted>
                      {rank.priority}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <RankPreview name={rank.name} color={rank.color} icon={rank.icon} />
                    </TableCell>
                    <TableCell mono muted>
                      {rank.groupKey}
                    </TableCell>
                    <TableCell>{rank.server ? rank.server.name : <span className="text-fg-muted">ทุกเซิร์ฟเวอร์</span>}</TableCell>
                    <TableCell>{rank.isActive ? <span className="text-fg-muted">ใช้งาน</span> : <Badge>ปิดใช้งาน</Badge>}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1">
                        <Switch
                          checked={rank.isActive}
                          disabled={toggleMutation.isPending && toggleMutation.variables?.id === rank.id}
                          onCheckedChange={() => toggleMutation.mutate(rank)}
                          aria-label={`${rank.isActive ? 'ปิด' : 'เปิด'}ใช้งาน ${rank.name}`}
                        />
                        <IconButton aria-label={`แก้ไข ${rank.name}`} size="sm" onClick={() => openEdit(rank)}>
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </IconButton>
                        <IconButton aria-label={`ลบ ${rank.name}`} size="sm" onClick={() => setDeleteTarget(rank)}>
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                        </IconButton>
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Panel title="หลักการทำงาน" className="mt-8">
        <dl className="grid gap-6 text-sm leading-relaxed sm:grid-cols-3">
          <div>
            <dt className="font-medium text-fg">กลุ่ม</dt>
            <dd className="mt-1 text-fg-muted">
              ชื่อกลุ่มในปลั๊กอิน Permissions เช่น <span className="font-mono text-fg">VIP</span> หรือ{' '}
              <span className="font-mono text-fg">Admin</span> ผู้เล่นในกลุ่มจะแสดงป้ายของแรงก์นั้นในแชท
            </dd>
          </div>
          <div>
            <dt className="font-medium text-fg">ลำดับ</dt>
            <dd className="mt-1 text-fg-muted">
              ผู้เล่นที่อยู่หลายกลุ่มจะแสดงแรงก์ที่ลำดับสูงกว่า เช่น VIP (10) กับ Admin (100) จะแสดงเป็น Admin
            </dd>
          </div>
          <div>
            <dt className="font-medium text-fg">ทุกเซิร์ฟเวอร์หรือเฉพาะเซิร์ฟเวอร์</dt>
            <dd className="mt-1 text-fg-muted">แรงก์ที่ผูกกับเซิร์ฟเวอร์ใช้เฉพาะที่นั่น และแทนที่แรงก์ทั่วไปของกลุ่มเดียวกัน</dd>
          </div>
        </dl>
      </Panel>

      <Dialog
        open={editor.open}
        onOpenChange={(open) => !open && setEditor({ open: false, rank: null })}
        title={editor.rank ? `แก้ไข ${editor.rank.name}` : 'เพิ่มแรงก์'}
        size="md"
        loading={saveMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor({ open: false, rank: null })} disabled={saveMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-chat-rank-form" loading={saveMutation.isPending}>
              {editor.rank ? 'บันทึก' : 'เพิ่มแรงก์'}
            </Button>
          </>
        }
      >
        <RankForm
          key={editor.rank?.id ?? 'new'}
          rank={editor.rank}
          servers={servers}
          error={saveMutation.isError ? apiErrorText(saveMutation.error, 'บันทึกไม่สำเร็จ ลองอีกครั้ง') : null}
          onSubmit={(data) => saveMutation.mutate({ id: editor.rank?.id ?? null, data })}
        />
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="ลบแรงก์"
        description={deleteTarget ? `${deleteTarget.name} (${deleteTarget.groupKey}) จะถูกลบถาวร ผู้เล่นในกลุ่มนี้จะไม่มีป้ายในแชท` : undefined}
        variant="danger"
        confirmText="ลบแรงก์"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}

function RankPreview({ name, color, icon, message }: { name: string; color: string; icon: string | null; message?: string }) {
  const safeColor = HEX.test(color) ? color : undefined;
  return (
    <span className="font-mono text-[13px]">
      <span style={{ color: safeColor }}>
        {icon ? `${icon} ` : ''}[{name || 'RANK'}]
      </span>
      <span className="text-fg-muted"> Player{message ? `: ${message}` : ''}</span>
    </span>
  );
}

function RankForm({
  rank,
  servers,
  error,
  onSubmit,
}: {
  rank: ChatRank | null;
  servers: ServerOption[];
  error: string | null;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = React.useState<FormState>(() => ({
    name: rank?.name ?? '',
    groupKey: rank?.groupKey ?? '',
    color: rank?.color ?? '#C8A96A',
    icon: rank?.icon ?? '',
    priority: String(rank?.priority ?? 0),
    serverId: rank?.serverId ? String(rank.serverId) : '',
    isActive: rank?.isActive ?? true,
  }));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'กรอกชื่อที่แสดง';
    if (!form.groupKey.trim()) next.groupKey = 'กรอกชื่อกลุ่มใน Permissions';
    if (!HEX.test(form.color.trim())) next.color = 'ใช้รูปแบบ #RRGGBB';
    if (!/^-?\d+$/.test(form.priority.trim())) next.priority = 'ใส่เป็นจำนวนเต็ม';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      name: form.name.trim(),
      groupKey: form.groupKey.trim(),
      color: form.color.trim(),
      icon: form.icon.trim(),
      priority: Number(form.priority),
      serverId: form.serverId ? Number(form.serverId) : null,
      isActive: form.isActive,
    });
  };

  return (
    <form id="admin-chat-rank-form" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="ชื่อที่แสดง" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} placeholder="VIP" />
        <Input
          label="กลุ่มใน Permissions"
          required
          mono
          value={form.groupKey}
          onChange={(e) => set('groupKey', e.target.value)}
          error={errors.groupKey}
          placeholder="VIP"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-end gap-2">
          <Input
            label="สี"
            mono
            wrapperClassName="flex-1"
            value={form.color}
            onChange={(e) => set('color', e.target.value)}
            error={errors.color}
          />
          <input
            type="color"
            aria-label="เลือกสี"
            value={HEX.test(form.color) ? form.color : '#C8A96A'}
            onChange={(e) => set('color', e.target.value.toUpperCase())}
            className={`h-10 w-10 shrink-0 cursor-pointer rounded-control border border-line bg-surface-2 p-1 ${errors.color ? 'mb-6' : ''}`}
          />
        </div>
        <Input label="ไอคอน" value={form.icon} onChange={(e) => set('icon', e.target.value)} helperText="ไม่บังคับ" />
        <Input
          label="ลำดับ"
          mono
          inputMode="numeric"
          value={form.priority}
          onChange={(e) => set('priority', e.target.value)}
          error={errors.priority}
          helperText="มากกว่าแสดงก่อน"
        />
      </div>
      <Select
        label="เซิร์ฟเวอร์"
        value={form.serverId}
        onChange={(e) => set('serverId', e.target.value)}
        options={[{ value: '', label: 'ทุกเซิร์ฟเวอร์' }, ...servers.map((s) => ({ value: String(s.id), label: s.name }))]}
      />
      <div className="rounded-control border border-line bg-canvas px-3 py-2.5">
        <p className="mb-1 text-xs text-fg-subtle">ตัวอย่างในแชท</p>
        <RankPreview name={form.name} color={form.color} icon={form.icon || null} message="สวัสดีทุกคน" />
      </div>
      <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} label="เปิดใช้งาน" />
    </form>
  );
}
