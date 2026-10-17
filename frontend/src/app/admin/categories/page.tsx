'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
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
  Textarea,
  useToast,
} from '@/components/ui';
import { adminApi, api, productApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

interface AdminCategory {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}

interface FormState {
  name: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
}

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

/** GET /admin/categories (includes inactive); falls back to the public list on older backends. */
async function fetchCategories(): Promise<AdminCategory[]> {
  try {
    const { data } = await api.get('/admin/categories');
    return (data?.categories ?? []) as AdminCategory[];
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404 && status !== 405) throw err;
    const { data } = await productApi.getCategories();
    return (data?.categories ?? []) as AdminCategory[];
  }
}

export default function AdminCategoriesPage() {
  const { isLoading: authLoading } = useAuthStore();
  const { canManageCategories } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [editor, setEditor] = React.useState<{ open: boolean; category: AdminCategory | null }>({ open: false, category: null });
  const [deleteTarget, setDeleteTarget] = React.useState<AdminCategory | null>(null);

  const query = useQuery({
    queryKey: ['admin-categories'],
    queryFn: fetchCategories,
    enabled: canManageCategories,
  });

  const categories = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'th')),
    [query.data]
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: Record<string, unknown> }) =>
      id === null ? adminApi.createCategory(data) : adminApi.updateCategory(id, data),
    onSuccess: (_d, vars) => {
      toast.success(vars.id === null ? 'เพิ่มหมวดหมู่แล้ว' : 'บันทึกหมวดหมู่แล้ว');
      setEditor({ open: false, category: null });
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (c: AdminCategory) => adminApi.deleteCategory(c.id),
    onSuccess: (_d, c) => {
      toast.success('ปิดใช้งานหมวดหมู่แล้ว', c.name);
      setDeleteTarget(null);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (err) => toast.error('ปิดใช้งานไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const openCreate = () => {
    saveMutation.reset();
    setEditor({ open: true, category: null });
  };
  const openEdit = (c: AdminCategory) => {
    saveMutation.reset();
    setEditor({ open: true, category: c });
  };

  if (authLoading) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="ร้านค้า" title="หมวดหมู่สินค้า" />
      </div>
    );
  }

  if (!canManageCategories) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="ร้านค้า" title="หมวดหมู่สินค้า" />
        <EmptyState title="หน้านี้สำหรับ Admin และ Root" description="ติดต่อผู้ดูแลระบบหากต้องการจัดการหมวดหมู่" />
      </div>
    );
  }

  const deleteCount = deleteTarget?._count?.products ?? 0;

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="ร้านค้า"
        title="หมวดหมู่สินค้า"
        description="จัดกลุ่มสินค้าในร้าน ลำดับที่น้อยกว่าแสดงก่อน"
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreate}>
            เพิ่มหมวดหมู่
          </Button>
        }
      />

      {query.isError ? (
        <ErrorMessage
          title="โหลดหมวดหมู่ไม่สำเร็จ"
          message={apiErrorText(query.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <TableContainer aria-busy={query.isLoading || undefined}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>หมวดหมู่</TableHeaderCell>
                <TableHeaderCell>ไอคอน</TableHeaderCell>
                <TableHeaderCell align="right">สินค้า</TableHeaderCell>
                <TableHeaderCell align="right">ลำดับ</TableHeaderCell>
                <TableHeaderCell>สถานะ</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">การทำงาน</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.isLoading ? (
                <TableLoadingRows columns={6} rows={5} />
              ) : categories.length === 0 ? (
                <TableEmptyRow
                  colSpan={6}
                  title="ยังไม่มีหมวดหมู่"
                  description="สร้างหมวดหมู่เช่น ไดโนเสาร์ อาวุธ หรือชุดเริ่มต้น เพื่อให้ผู้เล่นค้นหาง่ายขึ้น"
                  action={
                    <Button size="sm" onClick={openCreate}>
                      เพิ่มหมวดหมู่
                    </Button>
                  }
                />
              ) : (
                categories.map((c) => (
                  <TableRow key={c.id} interactive onClick={() => openEdit(c)}>
                    <TableCell className="min-w-[240px]">
                      <p className="font-medium text-fg">{c.name}</p>
                      {c.description ? <p className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{c.description}</p> : null}
                    </TableCell>
                    <TableCell mono muted>
                      {c.icon || '—'}
                    </TableCell>
                    <TableCell align="right" mono>
                      {c._count?.products ?? '—'}
                    </TableCell>
                    <TableCell align="right" mono muted>
                      {c.sortOrder}
                    </TableCell>
                    <TableCell>{c.isActive ? <span className="text-fg-muted">ใช้งาน</span> : <Badge>ปิดใช้งาน</Badge>}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1">
                        <IconButton aria-label={`แก้ไข ${c.name}`} size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </IconButton>
                        {c.isActive ? (
                          <IconButton aria-label={`ปิดใช้งาน ${c.name}`} size="sm" onClick={() => setDeleteTarget(c)}>
                            <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                        ) : (
                          <span className="inline-block h-10 w-10 sm:h-8 sm:w-8" aria-hidden="true" />
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={editor.open}
        onOpenChange={(open) => !open && setEditor({ open: false, category: null })}
        title={editor.category ? `แก้ไข ${editor.category.name}` : 'เพิ่มหมวดหมู่'}
        size="md"
        loading={saveMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor({ open: false, category: null })} disabled={saveMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-category-form" loading={saveMutation.isPending}>
              {editor.category ? 'บันทึก' : 'เพิ่มหมวดหมู่'}
            </Button>
          </>
        }
      >
        <CategoryForm
          key={editor.category?.id ?? 'new'}
          category={editor.category}
          error={saveMutation.isError ? apiErrorText(saveMutation.error, 'บันทึกไม่สำเร็จ ลองอีกครั้ง') : null}
          onSubmit={(data) => saveMutation.mutate({ id: editor.category?.id ?? null, data })}
        />
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="ปิดใช้งานหมวดหมู่"
        description={
          deleteTarget
            ? deleteCount > 0
              ? `${deleteTarget.name} จะถูกซ่อนจากร้าน สินค้า ${deleteCount} รายการในหมวดนี้ไม่ถูกลบ`
              : `${deleteTarget.name} จะถูกซ่อนจากร้าน เปิดใช้งานใหม่ได้จากหน้าแก้ไข`
            : undefined
        }
        variant="warning"
        confirmText="ปิดใช้งาน"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}

function CategoryForm({
  category,
  error,
  onSubmit,
}: {
  category: AdminCategory | null;
  error: string | null;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = React.useState<FormState>(() => ({
    name: category?.name ?? '',
    description: category?.description ?? '',
    icon: category?.icon ?? '',
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
  }));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'กรอกชื่อหมวดหมู่';
    if (!/^-?\d+$/.test(form.sortOrder.trim())) next.sortOrder = 'ใส่เป็นจำนวนเต็ม';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      icon: form.icon.trim(),
      sortOrder: Number(form.sortOrder),
      isActive: form.isActive,
    });
  };

  return (
    <form id="admin-category-form" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <Input label="ชื่อหมวดหมู่" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} placeholder="เช่น ไดโนเสาร์" />
      <Textarea label="คำอธิบาย" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="ไอคอน"
          mono
          value={form.icon}
          onChange={(e) => set('icon', e.target.value)}
          helperText="คีย์ไอคอนที่หน้าร้านรองรับ"
        />
        <Input
          label="ลำดับการแสดง"
          mono
          inputMode="numeric"
          value={form.sortOrder}
          onChange={(e) => set('sortOrder', e.target.value)}
          error={errors.sortOrder}
        />
      </div>
      <Switch
        checked={form.isActive}
        onCheckedChange={(v) => set('isActive', v)}
        label="เปิดใช้งาน"
        description="ปิดแล้วหมวดหมู่นี้จะไม่แสดงในร้าน"
      />
    </form>
  );
}
