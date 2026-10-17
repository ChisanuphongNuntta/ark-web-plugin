'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
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
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAuthStore } from '@/lib/store';
import { adminApi, type AdminChatRankRow } from '@/lib/api';

const COLS = 7;
const DEFAULT_COLOR = '#FFD700';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

interface ServerOption {
  id: number;
  name: string;
  displayName?: string | null;
}

interface RankForm {
  name: string;
  groupKey: string;
  color: string;
  icon: string;
  priority: string;
  serverId: string;
  isActive: boolean;
}

const EMPTY_FORM: RankForm = {
  name: '',
  groupKey: '',
  color: DEFAULT_COLOR,
  icon: '',
  priority: '0',
  serverId: '',
  isActive: true,
};

function formFromRank(r: AdminChatRankRow): RankForm {
  return {
    name: r.name,
    groupKey: r.groupKey,
    color: r.color || DEFAULT_COLOR,
    icon: r.icon ?? '',
    priority: String(r.priority ?? 0),
    serverId: r.serverId ? String(r.serverId) : '',
    isActive: r.isActive,
  };
}

type FormErrors = Partial<Record<keyof RankForm, string>>;

function validateForm(f: RankForm): FormErrors {
  const errors: FormErrors = {};
  if (!f.name.trim()) errors.name = 'กรุณากรอกชื่อที่แสดง';
  if (!f.groupKey.trim()) errors.groupKey = 'กรุณากรอก Group key';
  if (!f.color.trim()) errors.color = 'กรุณาเลือกสี';
  if (f.priority.trim() && !/^-?\d+$/.test(f.priority.trim())) errors.priority = 'ต้องเป็นจำนวนเต็ม';
  return errors;
}

function formToPayload(f: RankForm) {
  return {
    name: f.name.trim(),
    groupKey: f.groupKey.trim(),
    color: f.color.trim(),
    icon: f.icon.trim(),
    priority: Number.parseInt(f.priority, 10) || 0,
    serverId: f.serverId ? Number.parseInt(f.serverId, 10) : null,
    isActive: f.isActive,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string; error?: string } } } | null;
  return e?.response?.data?.message || e?.response?.data?.error || fallback;
}

function RankPreview({ color, icon, name, player }: { color: string; icon: string | null; name: string; player: string }) {
  return (
    <span className="whitespace-nowrap">
      <span style={{ color }}>
        {icon ? `${icon} ` : ''}[{name || 'RANK'}]
      </span>
      <span className="text-iris-pearl"> {player}</span>
    </span>
  );
}

function ChatRanksAdmin() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push('/login');
    else if (!user.isAdmin) router.push('/');
  }, [user, authLoading, router]);

  const canView = !authLoading && !!user?.isAdmin;

  const list = usePaginatedQuery({
    key: 'admin-chat-ranks',
    fetcher: adminApi.getChatRanksPage,
    filters: { serverId: {} },
    enabled: canView,
  });

  const serversQuery = useQuery({
    queryKey: ['admin-server-options'],
    queryFn: async (): Promise<ServerOption[]> => {
      const { data } = await adminApi.getServers();
      const rows: unknown = data?.servers ?? data;
      return Array.isArray(rows) ? (rows as ServerOption[]) : [];
    },
    enabled: canView,
    staleTime: 60_000,
  });
  const servers = serversQuery.data ?? [];
  const serverLabel = (s: ServerOption) => s.displayName || s.name;

  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // --- Add / edit -------------------------------------------------------------
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; rank: AdminChatRankRow } | null>(null);
  const [form, setForm] = useState<RankForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: 'create' });
  };
  const openEdit = (rank: AdminChatRankRow) => {
    setForm(formFromRank(rank));
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: 'edit', rank });
  };
  const setField = <K extends keyof RankForm>(key: K, value: RankForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async (payload: ReturnType<typeof formToPayload>) => {
      if (editor?.mode === 'edit') return adminApi.updateChatRank(editor.rank.id, payload);
      return adminApi.createChatRank(payload);
    },
    onSuccess: async () => {
      const wasEdit = editor?.mode === 'edit';
      setEditor(null);
      setNotice({ tone: 'success', text: wasEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มแรงก์แชทแล้ว' });
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

  // --- Toggle / delete ------------------------------------------------------------
  const toggleActive = useMutation({
    mutationFn: (rank: AdminChatRankRow) => adminApi.updateChatRank(rank.id, { isActive: !rank.isActive }),
    onSuccess: async (_res, rank) => {
      setNotice({ tone: 'success', text: `${rank.isActive ? 'ปิด' : 'เปิด'}ใช้งานแรงก์ ${rank.name} แล้ว` });
      await list.invalidate();
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, 'เปลี่ยนสถานะไม่สำเร็จ') }),
  });

  const [deleting, setDeleting] = useState<AdminChatRankRow | null>(null);
  const confirmDelete = async () => {
    if (!deleting) return;
    await adminApi.deleteChatRank(deleting.id);
    setNotice({ tone: 'success', text: `ลบแรงก์ ${deleting.name} แล้ว` });
    await list.invalidate();
  };

  if (authLoading || !user) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="CHAT RANKS" title="แรงก์ในแชท" description="กำลังตรวจสอบสิทธิ์…" />
      </AdminPage>
    );
  }

  const serverFilterOptions = [
    { value: '0', label: 'เฉพาะแรงก์ทั่วไป' },
    ...servers.map((s) => ({ value: String(s.id), label: serverLabel(s) })),
  ];
  if (list.filters.serverId && !serverFilterOptions.some((o) => o.value === list.filters.serverId)) {
    serverFilterOptions.push({ value: list.filters.serverId, label: `เซิร์ฟเวอร์ ID ${list.filters.serverId}` });
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="CHAT RANKS"
        title="แรงก์ในแชท"
        description="กำหนดสี ไอคอน และลำดับการแสดงผลในแชท ตามกลุ่มของปลั๊กอิน Permissions"
        actions={
          <AdminButton variant="primary" icon={<Plus />} onClick={openCreate}>
            เพิ่มแรงก์
          </AdminButton>
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อหรือ Group key…">
          <AdminFilterSelect
            label="เซิร์ฟเวอร์"
            value={list.filters.serverId ?? ''}
            onChange={(v) => list.setFilter('serverId', v)}
            options={serverFilterOptions}
            allLabel="ทุกเซิร์ฟเวอร์"
          />
        </AdminToolbar>

        <AdminTable caption="รายการแรงก์ในแชท" busy={list.isFetching} minWidth={900}>
          <AdminTableHead>
            <tr>
              <AdminTh align="right">ลำดับ</AdminTh>
              <AdminTh>ตัวอย่าง</AdminTh>
              <AdminTh>ชื่อ</AdminTh>
              <AdminTh>Group key</AdminTh>
              <AdminTh>เซิร์ฟเวอร์</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            errorMessage={list.isError ? errorMessage(list.error, 'โหลดรายการแรงก์ไม่สำเร็จ') : undefined}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบแรงก์ที่ตรงกับตัวกรอง' : 'ยังไม่มีแรงก์ในแชท'}
            emptyDescription={list.isFiltered ? undefined : 'กด “เพิ่มแรงก์” เพื่อเริ่มต้น'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างตัวกรอง
                </AdminButton>
              ) : undefined
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((rank) => {
              const togglingThis = toggleActive.isPending && toggleActive.variables?.id === rank.id;
              return (
                <AdminTr key={rank.id}>
                  <AdminTd align="right" mono nowrap>
                    {rank.priority}
                  </AdminTd>
                  <AdminTd>
                    <RankPreview color={rank.color} icon={rank.icon} name={rank.name} player="Player" />
                  </AdminTd>
                  <AdminTd>
                    <span className="font-semibold">{rank.name}</span>
                  </AdminTd>
                  <AdminTd mono muted nowrap>
                    {rank.groupKey}
                  </AdminTd>
                  <AdminTd nowrap>
                    {rank.server ? (
                      <span>{rank.server.name}</span>
                    ) : rank.serverId ? (
                      <span className="text-iris-muted">ID {rank.serverId}</span>
                    ) : (
                      <StatusBadge tone="info">ทุกเซิร์ฟเวอร์</StatusBadge>
                    )}
                  </AdminTd>
                  <AdminTd nowrap>
                    <StatusBadge tone={rank.isActive ? 'success' : 'neutral'}>
                      {rank.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </StatusBadge>
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <AdminIconButton aria-label={`แก้ไขแรงก์ ${rank.name}`} onClick={() => openEdit(rank)}>
                      <Pencil />
                    </AdminIconButton>
                    <AdminIconButton
                      aria-label={`${rank.isActive ? 'ปิด' : 'เปิด'}ใช้งานแรงก์ ${rank.name}`}
                      onClick={() => toggleActive.mutate(rank)}
                      disabled={togglingThis}
                    >
                      <Power />
                    </AdminIconButton>
                    <AdminIconButton tone="danger" aria-label={`ลบแรงก์ ${rank.name}`} onClick={() => setDeleting(rank)}>
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

      <AdminPanel title="วิธีการทำงาน">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-iris-pearl">Group key</dt>
            <dd className="mt-1 text-iris-muted">
              ชื่อกลุ่มในปลั๊กอิน Permissions เช่น VIP, Admin ผู้เล่นในกลุ่มนี้จะแสดงในแชทด้วยรูปแบบของแรงก์
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-iris-pearl">ลำดับ</dt>
            <dd className="mt-1 text-iris-muted">
              ถ้าผู้เล่นอยู่หลายกลุ่ม แรงก์ที่ลำดับสูงกว่าจะแสดงก่อน เช่น Admin (100) แสดงแทน VIP (10)
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-iris-pearl">เฉพาะเซิร์ฟเวอร์ / ทั่วไป</dt>
            <dd className="mt-1 text-iris-muted">
              แรงก์ทั่วไปใช้กับทุกเซิร์ฟเวอร์ แรงก์เฉพาะเซิร์ฟเวอร์ใช้กับเซิร์ฟเวอร์นั้นและมีผลเหนือแรงก์ทั่วไป
            </dd>
          </div>
        </dl>
      </AdminPanel>

      {/* Add / edit */}
      <AdminDialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        busy={save.isPending}
        title={editor?.mode === 'edit' ? `แก้ไขแรงก์ ${editor.rank.name}` : 'เพิ่มแรงก์'}
        footer={
          <>
            <AdminButton variant="ghost" onClick={() => setEditor(null)} disabled={save.isPending}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="primary" onClick={submitForm} loading={save.isPending}>
              {editor?.mode === 'edit' ? 'บันทึก' : 'เพิ่มแรงก์'}
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
            <AdminField label="ชื่อที่แสดง" required error={formErrors.name}>
              {(field) => (
                <input
                  {...field}
                  className={adminInputClass}
                  value={form.name}
                  maxLength={64}
                  placeholder="VIP"
                  onChange={(e) => setField('name', e.target.value)}
                />
              )}
            </AdminField>
            <AdminField label="Group key" required error={formErrors.groupKey} hint="ชื่อกลุ่มในปลั๊กอิน Permissions">
              {(field) => (
                <input
                  {...field}
                  className={`${adminInputClass} font-mono`}
                  value={form.groupKey}
                  maxLength={64}
                  placeholder="VIP"
                  onChange={(e) => setField('groupKey', e.target.value)}
                />
              )}
            </AdminField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <AdminField label="สี" required error={formErrors.color}>
              {(field) => (
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="เลือกสี"
                    value={HEX_COLOR.test(form.color) ? form.color : DEFAULT_COLOR}
                    onChange={(e) => setField('color', e.target.value)}
                    className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  />
                  <input
                    {...field}
                    className={`${adminInputClass} font-mono`}
                    value={form.color}
                    maxLength={32}
                    onChange={(e) => setField('color', e.target.value)}
                  />
                </div>
              )}
            </AdminField>
            <AdminField label="ไอคอน">
              {(field) => (
                <input
                  {...field}
                  className={adminInputClass}
                  value={form.icon}
                  maxLength={32}
                  onChange={(e) => setField('icon', e.target.value)}
                />
              )}
            </AdminField>
            <AdminField label="ลำดับ" error={formErrors.priority} hint="ยิ่งสูงยิ่งแสดงก่อน">
              {(field) => (
                <input
                  {...field}
                  className={`${adminInputClass} font-mono`}
                  inputMode="numeric"
                  value={form.priority}
                  onChange={(e) => setField('priority', e.target.value.replace(/[^0-9-]/g, ''))}
                />
              )}
            </AdminField>
          </div>

          <AdminField label="เซิร์ฟเวอร์" hint="เว้นว่างเพื่อใช้กับทุกเซิร์ฟเวอร์">
            {(field) => (
              <select {...field} className={adminInputClass} value={form.serverId} onChange={(e) => setField('serverId', e.target.value)}>
                <option value="">ทุกเซิร์ฟเวอร์ (ทั่วไป)</option>
                {form.serverId && !servers.some((s) => String(s.id) === form.serverId) && (
                  <option value={form.serverId}>
                    {editor?.mode === 'edit' && editor.rank.server ? editor.rank.server.name : `เซิร์ฟเวอร์ ID ${form.serverId}`}
                  </option>
                )}
                {servers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {serverLabel(s)}
                  </option>
                ))}
              </select>
            )}
          </AdminField>

          <label className="flex items-center gap-2 text-sm text-iris-pearl">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
              className="h-4 w-4 accent-iris-cyan"
            />
            เปิดใช้งาน
          </label>

          <p className="rounded-xl border border-white/[0.06] bg-iris-ink/60 px-3 py-2 text-sm">
            <span className="text-xs text-iris-muted">ตัวอย่าง: </span>
            <RankPreview color={form.color} icon={form.icon} name={form.name} player="PlayerName: สวัสดี!" />
          </p>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="ลบแรงก์นี้?"
        description={deleting ? `ลบแรงก์ ${deleting.name} (${deleting.groupKey}) การลบไม่สามารถย้อนกลับได้` : undefined}
        confirmText="ลบแรงก์"
      />
    </AdminPage>
  );
}

export default function ChatRanksPage() {
  return (
    <AdminSuspense>
      <ChatRanksAdmin />
    </AdminSuspense>
  );
}
