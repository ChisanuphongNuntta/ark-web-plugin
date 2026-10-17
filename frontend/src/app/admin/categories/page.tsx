'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Loader2, Pencil, Plus, Save } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminField,
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
import { adminApi, type AdminCategoryRow } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface CategoryForm {
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: CategoryForm = { name: '', description: '', icon: '', sortOrder: 0, isActive: true };
const COLS = 5;

function apiErrorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof msg === 'string' && msg ? msg : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง';
}

function CategoriesAdmin() {
  const { user, isLoading: authLoading } = useAuthStore();
  const isAdmin = Boolean(user?.isAdmin);
  const queryClient = useQueryClient();

  const list = usePaginatedQuery({
    key: 'admin-categories',
    fetcher: adminApi.getCategoriesPage,
    enabled: isAdmin,
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<AdminCategoryRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const afterChange = () => {
    void list.invalidate();
    // Product page filter/form list and the public shop categories.
    void queryClient.invalidateQueries({ queryKey: ['admin-categories-all'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: CategoryForm }) =>
      id === null ? adminApi.createCategory(data) : adminApi.updateCategory(id, data),
    onSuccess: (_res, vars) => {
      afterChange();
      setEditorOpen(false);
      setNotice(vars.id === null ? 'เพิ่มหมวดหมู่แล้ว' : 'บันทึกการแก้ไขแล้ว');
    },
    onError: (error) => setFormError(apiErrorText(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteCategory(id),
    onSuccess: () => {
      afterChange();
      setNotice('ปิดใช้งานหมวดหมู่แล้ว');
    },
  });

  const openEditor = (category: AdminCategoryRow | null) => {
    setEditing(category);
    setFormError(null);
    saveMutation.reset();
    setForm(
      category
        ? {
            name: category.name,
            description: category.description ?? '',
            icon: category.icon ?? '',
            sortOrder: category.sortOrder ?? 0,
            isActive: category.isActive,
          }
        : EMPTY_FORM,
    );
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (!saveMutation.isPending) setEditorOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveMutation.isPending) return;
    const name = form.name.trim();
    if (!name) {
      setFormError('กรุณากรอกชื่อหมวดหมู่');
      return;
    }
    setFormError(null);
    saveMutation.mutate({
      id: editing?.id ?? null,
      data: { ...form, name, description: form.description.trim(), icon: form.icon.trim(), sortOrder: Math.trunc(Number(form.sortOrder) || 0) },
    });
  };

  const set = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="กำลังโหลด">
        <Loader2 className="h-7 w-7 animate-spin text-iris-cyan" aria-hidden="true" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <AdminPage>
        <AdminNotice tone="danger" title="ไม่มีสิทธิ์เข้าถึงหน้านี้">
          หน้านี้สำหรับผู้ดูแลเว็บไซต์เท่านั้น
        </AdminNotice>
      </AdminPage>
    );
  }

  const saving = saveMutation.isPending;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="CATEGORIES"
        title="จัดการหมวดหมู่สินค้า"
        description="กำหนดชื่อ ไอคอน และลำดับของหมวดหมู่ที่แสดงในร้านค้า"
        actions={
          <>
            <Link href="/admin" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              กลับหน้าแอดมิน
            </Link>
            <AdminButton variant="primary" icon={<Plus />} onClick={() => openEditor(null)}>
              เพิ่มหมวดหมู่
            </AdminButton>
          </>
        }
      />

      {notice && (
        <AdminNotice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อหมวดหมู่…" />

        <AdminTable caption="รายการหมวดหมู่สินค้า" busy={list.isFetching}>
          <AdminTableHead>
            <tr>
              <AdminTh>หมวดหมู่</AdminTh>
              <AdminTh align="right">สินค้า</AdminTh>
              <AdminTh align="right">ลำดับ</AdminTh>
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
            errorMessage="โหลดหมวดหมู่ไม่สำเร็จ"
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบหมวดหมู่ที่ค้นหา' : 'ยังไม่มีหมวดหมู่สินค้า'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างคำค้นหา
                </AdminButton>
              ) : (
                <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => openEditor(null)}>
                  เพิ่มหมวดหมู่แรก
                </AdminButton>
              )
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((c) => (
              <AdminTr key={c.id}>
                <AdminTd>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-iris-midnight text-base"
                      aria-hidden="true"
                    >
                      {c.icon || c.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-iris-pearl">{c.name}</div>
                      {c.description && <div className="line-clamp-1 text-xs text-iris-muted">{c.description}</div>}
                    </div>
                  </div>
                </AdminTd>
                <AdminTd align="right" mono>
                  {(c._count?.products ?? 0).toLocaleString('th-TH')}
                </AdminTd>
                <AdminTd align="right" mono muted>
                  {c.sortOrder}
                </AdminTd>
                <AdminTd>
                  <StatusBadge tone={c.isActive ? 'success' : 'neutral'} dot>
                    {c.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </StatusBadge>
                </AdminTd>
                <AdminTd align="right" nowrap>
                  <AdminIconButton aria-label={`แก้ไข ${c.name}`} onClick={() => openEditor(c)}>
                    <Pencil />
                  </AdminIconButton>
                  <AdminIconButton
                    tone="danger"
                    aria-label={`ปิดใช้งาน ${c.name}`}
                    disabled={!c.isActive}
                    onClick={() => setDeactivating(c)}
                  >
                    <Archive />
                  </AdminIconButton>
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTableBody>
        </AdminTable>

        <Pagination {...list.paginationProps} />
      </AdminPanel>

      <AdminDialog
        open={editorOpen}
        onClose={closeEditor}
        busy={saving}
        title={editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
        description="กำหนดชื่อ ไอคอน และลำดับการแสดงผลของหมวดหมู่สินค้า"
        footer={
          <>
            <AdminButton variant="secondary" onClick={closeEditor} disabled={saving}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="primary" type="submit" form="category-form" loading={saving} icon={<Save />}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มหมวดหมู่'}
            </AdminButton>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <AdminNotice tone="danger">{formError}</AdminNotice>}
          <AdminField label="ชื่อหมวดหมู่" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={form.name}
                maxLength={100}
                onChange={(e) => set('name', e.target.value)}
                placeholder="เช่น ไดโนเสาร์ Apex, อาวุธ Tek"
                className={adminInputClass}
              />
            )}
          </AdminField>
          <AdminField label="คำอธิบาย">
            {(field) => (
              <textarea
                {...field}
                rows={2}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="คำอธิบายสั้นๆ เกี่ยวกับหมวดหมู่นี้"
                className={`${adminInputClass} resize-y`}
              />
            )}
          </AdminField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdminField label="ไอคอน" hint="คีย์ไอคอนหรืออีโมจิ 1 ตัว">
              {(field) => (
                <input
                  {...field}
                  type="text"
                  value={form.icon}
                  maxLength={50}
                  onChange={(e) => set('icon', e.target.value)}
                  className={adminInputClass}
                />
              )}
            </AdminField>
            <AdminField label="ลำดับการแสดงผล" hint="น้อยแสดงก่อน">
              {(field) => (
                <input
                  {...field}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => set('sortOrder', parseInt(e.target.value, 10) || 0)}
                  className={adminInputClass}
                />
              )}
            </AdminField>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/15">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-iris-cyan"
            />
            <span>
              <span className="block text-sm font-semibold text-iris-pearl">เปิดใช้งานหมวดหมู่นี้</span>
              <span className="block text-xs text-iris-muted">หมวดหมู่ที่ปิดจะไม่แสดงในร้านค้า</span>
            </span>
          </label>
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivateMutation.mutateAsync(deactivating!.id)}
        title="ปิดใช้งานหมวดหมู่นี้?"
        description={
          deactivating
            ? `“${deactivating.name}” จะไม่แสดงในร้านค้า สินค้า ${(deactivating._count?.products ?? 0).toLocaleString('th-TH')} รายการในหมวดนี้ยังอยู่ และเปิดใช้งานใหม่ได้จากหน้าแก้ไข`
            : undefined
        }
        confirmText="ปิดใช้งาน"
      />
    </AdminPage>
  );
}

export default function AdminCategoriesPage() {
  return (
    <AdminSuspense>
      <CategoriesAdmin />
    </AdminSuspense>
  );
}
