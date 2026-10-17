'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, EyeOff, Pencil, Plus, Search } from 'lucide-react';
import {
  Amount,
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  SegmentedControl,
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
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Textarea,
  useToast,
} from '@/components/ui';
import { ProductArtwork } from '@/components/ProductArtwork';
import { adminApi, api, productApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { COMMON_BLUEPRINT_PRESETS, expandBlueprintPath } from '@/lib/blueprintHelper';

interface AdminProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  itemBlueprint: string;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: number | null;
  category?: { id: number; name: string } | null;
  imageUrl?: string | null;
  sortOrder?: number;
}

interface CategoryOption {
  id: number;
  name: string;
  isActive?: boolean;
}

type StatusFilter = 'all' | 'active' | 'draft' | 'featured' | 'noimage';
type FormTab = 'basic' | 'display' | 'game';

const PAGE_SIZE = 25;

const QUALITY_OPTIONS = [
  { value: '0', label: 'Primitive (ค่าเริ่มต้น)' },
  { value: '1', label: 'Ramshackle' },
  { value: '2', label: 'Apprentice' },
  { value: '3', label: 'Journeyman' },
  { value: '4', label: 'Mastercraft' },
  { value: '5', label: 'Ascendant' },
];

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

/** GET /admin/categories (includes inactive); falls back to the public list on older backends. */
async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  try {
    const { data } = await api.get('/admin/categories');
    return (data?.categories ?? []) as CategoryOption[];
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404 && status !== 405) throw err;
    const { data } = await productApi.getCategories();
    return (data?.categories ?? []) as CategoryOption[];
  }
}

interface FormState {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  sortOrder: string;
  isActive: boolean;
  isFeatured: boolean;
  itemBlueprint: string;
  quantity: string;
  quality: string;
  isBlueprint: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  imageUrl: '',
  sortOrder: '0',
  isActive: false,
  isFeatured: false,
  itemBlueprint: '',
  quantity: '1',
  quality: '0',
  isBlueprint: false,
};

function formFromProduct(p: AdminProduct, duplicate = false): FormState {
  return {
    name: duplicate ? `${p.name} (สำเนา)` : p.name,
    description: p.description ?? '',
    price: String(p.price),
    categoryId: p.categoryId ? String(p.categoryId) : '',
    imageUrl: p.imageUrl ?? '',
    sortOrder: String(duplicate ? (p.sortOrder ?? 0) + 1 : p.sortOrder ?? 0),
    isActive: duplicate ? false : p.isActive,
    isFeatured: duplicate ? false : p.isFeatured,
    itemBlueprint: p.itemBlueprint,
    quantity: String(p.quantity),
    quality: String(p.quality),
    isBlueprint: p.isBlueprint,
  };
}

const FIELD_TAB: Partial<Record<keyof FormState, FormTab>> = {
  name: 'basic',
  price: 'basic',
  description: 'basic',
  imageUrl: 'display',
  sortOrder: 'display',
  itemBlueprint: 'game',
  quantity: 'game',
};

function validate(f: FormState): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = 'กรอกชื่อสินค้า';
  if (!/^\d+$/.test(f.price.trim())) e.price = 'ราคาต้องเป็นจำนวนเต็มตั้งแต่ 0';
  if (!f.itemBlueprint.trim()) e.itemBlueprint = 'กรอก Blueprint ของไอเทม';
  if (!/^\d+$/.test(f.quantity.trim()) || Number(f.quantity) < 1) e.quantity = 'จำนวนต้องอย่างน้อย 1';
  if (!/^-?\d+$/.test(f.sortOrder.trim())) e.sortOrder = 'ใส่เป็นจำนวนเต็ม';
  const img = f.imageUrl.trim();
  if (img && !/^(https?:\/\/|\/)\S+$/.test(img)) e.imageUrl = 'ใช้ลิงก์ http(s):// หรือพาธที่ขึ้นต้นด้วย /';
  return e;
}

export default function AdminProductsPage() {
  const { isLoading: authLoading } = useAuthStore();
  const { canManageProducts } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [page, setPage] = React.useState(1);
  const [editor, setEditor] = React.useState<{ open: boolean; product: AdminProduct | null; initial: FormState }>({
    open: false,
    product: null,
    initial: EMPTY_FORM,
  });
  const [deleteTarget, setDeleteTarget] = React.useState<AdminProduct | null>(null);

  const productsQuery = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => adminApi.getProducts().then((res) => (res.data?.products ?? []) as AdminProduct[]),
    enabled: canManageProducts,
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: fetchCategoryOptions,
    enabled: canManageProducts,
  });

  const products = React.useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const categories = categoriesQuery.data ?? [];

  const counts = React.useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => p.isActive).length,
      draft: products.filter((p) => !p.isActive).length,
      featured: products.filter((p) => p.isFeatured).length,
      noimage: products.filter((p) => !p.imageUrl).length,
    }),
    [products]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && String(p.categoryId ?? '') !== categoryFilter) return false;
      if (status === 'active' && !p.isActive) return false;
      if (status === 'draft' && p.isActive) return false;
      if (status === 'featured' && !p.isFeatured) return false;
      if (status === 'noimage' && p.imageUrl) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.itemBlueprint.toLowerCase().includes(q) || String(p.id) === q;
    });
  }, [products, search, categoryFilter, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: Record<string, unknown> }) =>
      id === null ? adminApi.createProduct(data) : adminApi.updateProduct(id, data),
    onSuccess: (_d, vars) => {
      toast.success(vars.id === null ? 'เพิ่มสินค้าแล้ว' : 'บันทึกสินค้าแล้ว');
      setEditor((s) => ({ ...s, open: false }));
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (p: AdminProduct) => adminApi.deleteProduct(p.id),
    onSuccess: (_d, p) => {
      toast.success('หยุดขายแล้ว', `${p.name} กลับเป็นร่าง`);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error('หยุดขายไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const openCreate = () => {
    saveMutation.reset();
    setEditor({ open: true, product: null, initial: EMPTY_FORM });
  };
  const openEdit = (p: AdminProduct) => {
    saveMutation.reset();
    setEditor({ open: true, product: p, initial: formFromProduct(p) });
  };
  const openDuplicate = (p: AdminProduct) => {
    saveMutation.reset();
    setEditor({ open: true, product: null, initial: formFromProduct(p, true) });
  };

  if (authLoading) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="ร้านค้า" title="สินค้า" />
      </div>
    );
  }

  if (!canManageProducts) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="ร้านค้า" title="สินค้า" />
        <EmptyState title="หน้านี้สำหรับ Admin และ Root" description="ติดต่อผู้ดูแลระบบหากต้องการจัดการสินค้า" />
      </div>
    );
  }

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="ร้านค้า"
        title="สินค้า"
        description="สินค้าที่ยังเป็นร่างจะไม่แสดงในร้าน ตรวจราคา รูป และ Blueprint ก่อนเปิดขาย"
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreate}>
            เพิ่มสินค้า
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 pb-4">
        <Input
          label="ค้นหาสินค้า"
          hideLabel
          placeholder="ชื่อ, Blueprint หรือรหัสสินค้า"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          wrapperClassName="w-full sm:w-80"
        />
        <Select
          label="หมวดหมู่"
          hideLabel
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          wrapperClassName="w-full sm:w-56"
          options={[{ value: '', label: 'ทุกหมวดหมู่' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <SegmentedControl<StatusFilter>
          aria-label="สถานะสินค้า"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'ทั้งหมด', count: counts.all },
            { value: 'active', label: 'เปิดขาย', count: counts.active },
            { value: 'draft', label: 'ร่าง', count: counts.draft },
            { value: 'featured', label: 'แนะนำ', count: counts.featured },
            { value: 'noimage', label: 'ไม่มีรูป', count: counts.noimage },
          ]}
        />
      </div>

      {productsQuery.isError ? (
        <ErrorMessage
          title="โหลดรายการสินค้าไม่สำเร็จ"
          message={apiErrorText(productsQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : (
        <TableContainer aria-busy={productsQuery.isLoading || undefined}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>สินค้า</TableHeaderCell>
                <TableHeaderCell>หมวดหมู่</TableHeaderCell>
                <TableHeaderCell align="right">ราคา</TableHeaderCell>
                <TableHeaderCell align="right">จำนวน</TableHeaderCell>
                <TableHeaderCell>คุณภาพ</TableHeaderCell>
                <TableHeaderCell>สถานะ</TableHeaderCell>
                <TableHeaderCell align="right">ลำดับ</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">การทำงาน</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {productsQuery.isLoading ? (
                <TableLoadingRows columns={8} rows={8} />
              ) : visible.length === 0 ? (
                <TableEmptyRow
                  colSpan={8}
                  title={products.length ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีสินค้า'}
                  description={products.length ? 'ลองเปลี่ยนคำค้นหรือสถานะ' : 'เพิ่มสินค้าชิ้นแรกเพื่อเริ่มขาย'}
                  action={
                    products.length ? undefined : (
                      <Button size="sm" onClick={openCreate}>
                        เพิ่มสินค้า
                      </Button>
                    )
                  }
                />
              ) : (
                visible.map((p) => (
                  <TableRow key={p.id} interactive onClick={() => openEdit(p)}>
                    <TableCell className="min-w-[260px]">
                      <div className="flex items-center gap-3">
                        <ProductArtwork product={p} alt="" className="h-10 w-10 shrink-0 rounded-control border border-line" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium text-fg hover:text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(p);
                            }}
                          >
                            {p.name}
                          </button>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                            <span className="font-mono">#{p.id}</span>
                            {p.isBlueprint ? <span>ใบ Blueprint</span> : null}
                            {!p.imageUrl ? <span className="text-warning">ไม่มีรูป</span> : null}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell muted className="whitespace-nowrap">
                      {p.category?.name ?? 'ไม่มีหมวดหมู่'}
                    </TableCell>
                    <TableCell align="right">
                      <Amount value={p.price} size="sm" />
                    </TableCell>
                    <TableCell align="right" mono>
                      {p.quantity}
                    </TableCell>
                    <TableCell muted className="whitespace-nowrap">
                      {QUALITY_OPTIONS[p.quality]?.label.split(' ')[0] ?? p.quality}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {p.isActive ? <Badge tone="success">เปิดขาย</Badge> : <Badge>ร่าง</Badge>}
                        {p.isFeatured ? <Badge tone="accent" outline>แนะนำ</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell align="right" mono muted>
                      {p.sortOrder ?? 0}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1">
                        <IconButton aria-label={`ทำสำเนา ${p.name}`} size="sm" onClick={() => openDuplicate(p)}>
                          <Copy className="h-4 w-4" strokeWidth={1.5} />
                        </IconButton>
                        <IconButton aria-label={`แก้ไข ${p.name}`} size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </IconButton>
                        {p.isActive ? (
                          <IconButton aria-label={`หยุดขาย ${p.name}`} size="sm" onClick={() => setDeleteTarget(p)}>
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

      <Pagination className="mt-4" page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />

      <ProductEditorDialog
        open={editor.open}
        product={editor.product}
        initial={editor.initial}
        categories={categories}
        submitting={saveMutation.isPending}
        error={saveMutation.isError ? apiErrorText(saveMutation.error, 'บันทึกไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ ลองอีกครั้ง') : null}
        onOpenChange={(open) => !open && setEditor((s) => ({ ...s, open: false }))}
        onSubmit={(data) => saveMutation.mutate({ id: editor.product?.id ?? null, data })}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="หยุดขายสินค้า"
        description={
          deleteTarget
            ? `${deleteTarget.name} จะกลับเป็นร่างและหายจากร้านทันที ข้อมูลสินค้าและประวัติการสั่งซื้อยังอยู่ เปิดขายใหม่ได้จากหน้าแก้ไข`
            : undefined
        }
        variant="warning"
        confirmText="หยุดขาย"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}

const FORM_ID = 'admin-product-form';

function ProductEditorDialog({
  open,
  product,
  initial,
  categories,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  product: AdminProduct | null;
  initial: FormState;
  categories: CategoryOption[];
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? `แก้ไข ${product.name}` : 'เพิ่มสินค้า'}
      description={product ? `รหัสสินค้า ${product.id}` : 'สินค้าใหม่จะเป็นร่างจนกว่าจะเปิดขาย'}
      size="xl"
      loading={submitting}
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {product ? 'บันทึก' : 'เพิ่มสินค้า'}
          </Button>
        </>
      }
    >
      {open ? (
        <ProductForm
          key={`${product?.id ?? 'new'}-${initial.name}`}
          initial={initial}
          categories={categories}
          error={error}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function ProductForm({
  initial,
  categories,
  error,
  onSubmit,
}: {
  initial: FormState;
  categories: CategoryOption[];
  error: string | null;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [tab, setTab] = React.useState<FormTab>('basic');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const expanded = form.itemBlueprint.trim() ? expandBlueprintPath(form.itemBlueprint) : '';
  const canExpand = !!expanded && expanded !== form.itemBlueprint.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const firstKey = Object.keys(found)[0] as keyof FormState | undefined;
    if (firstKey) {
      setTab(FIELD_TAB[firstKey] ?? 'basic');
      return;
    }
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      imageUrl: form.imageUrl.trim(),
      sortOrder: Number(form.sortOrder),
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      itemBlueprint: expandBlueprintPath(form.itemBlueprint),
      quantity: Number(form.quantity),
      quality: Number(form.quality),
      isBlueprint: form.isBlueprint,
    });
  };

  const tabHasError = (t: FormTab) => Object.entries(errors).some(([k, v]) => v && (FIELD_TAB[k as keyof FormState] ?? 'basic') === t);

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
      {error ? <ErrorMessage variant="inline" message={error} className="mb-4" /> : null}
      <Tabs value={tab} onValueChange={(v) => setTab(v as FormTab)}>
        <TabsList aria-label="ส่วนของข้อมูลสินค้า">
          <TabsTrigger value="basic">ข้อมูลทั่วไป{tabHasError('basic') ? <span className="text-danger">*</span> : null}</TabsTrigger>
          <TabsTrigger value="display">รูปและการแสดงผล{tabHasError('display') ? <span className="text-danger">*</span> : null}</TabsTrigger>
          <TabsTrigger value="game">ข้อมูลในเกม{tabHasError('game') ? <span className="text-danger">*</span> : null}</TabsTrigger>
        </TabsList>

        <TabsPanel value="basic" className="space-y-4">
          <Input label="ชื่อสินค้า" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} placeholder="เช่น Rex Saddle (Ascendant)" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="ราคา"
              required
              mono
              inputMode="numeric"
              rightIcon={<span className="text-xs">IC</span>}
              value={form.price}
              onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))}
              error={errors.price}
              helperText="ราคาตั้งต้น โปรโมชั่นคำนวณที่ระบบตอนชำระเงิน"
            />
            <Select
              label="หมวดหมู่"
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              options={[
                { value: '', label: 'ไม่มีหมวดหมู่' },
                ...categories.map((c) => ({ value: String(c.id), label: c.isActive === false ? `${c.name} (ปิดใช้งาน)` : c.name })),
              ]}
            />
          </div>
          <Textarea
            label="รายละเอียด"
            rows={5}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="สิ่งที่ผู้เล่นจะได้รับ เงื่อนไข หรือข้อจำกัด"
          />
        </TabsPanel>

        <TabsPanel value="display">
          <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">ตัวอย่างรูป</p>
              <ProductArtwork
                product={{ id: 0, name: form.name || 'สินค้า', imageUrl: form.imageUrl.trim() || null, categoryId: form.categoryId ? Number(form.categoryId) : null }}
                alt="ตัวอย่างรูปสินค้า"
                className="aspect-square w-full rounded-card border border-line"
              />
            </div>
            <div className="space-y-4">
              <Input
                label="ลิงก์รูปภาพ"
                mono
                placeholder="https://… หรือ /images/products/…"
                value={form.imageUrl}
                onChange={(e) => set('imageUrl', e.target.value)}
                error={errors.imageUrl}
                helperText="JPG, PNG หรือ WEBP แนะนำขนาดสี่เหลี่ยมจัตุรัส"
              />
              <Input
                label="ลำดับการแสดง"
                mono
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
                error={errors.sortOrder}
              />
              <div className="divide-y divide-line rounded-card border border-line">
                <Switch
                  className="px-4 py-3"
                  checked={form.isActive}
                  onCheckedChange={(v) => set('isActive', v)}
                  label="เปิดขาย"
                  description="แสดงในร้านและให้ผู้เล่นสั่งซื้อได้"
                />
                <Switch
                  className="px-4 py-3"
                  checked={form.isFeatured}
                  onCheckedChange={(v) => set('isFeatured', v)}
                  label="สินค้าแนะนำ"
                  description="แสดงในส่วนแนะนำของหน้าแรก"
                />
              </div>
            </div>
          </div>
        </TabsPanel>

        <TabsPanel value="game" className="space-y-4">
          <Input
            label="Blueprint"
            required
            mono
            spellCheck={false}
            autoComplete="off"
            placeholder="PrimalItemResource_Polymer หรือ Blueprint'/Game/…'"
            value={form.itemBlueprint}
            onChange={(e) => set('itemBlueprint', e.target.value)}
            error={errors.itemBlueprint}
            helperText="พิมพ์ชื่อสั้นหรือ Path เต็มก็ได้ ระบบแปลงเป็น Path เต็มตอนบันทึก"
          />
          {expanded ? (
            <div className="rounded-card border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-fg-muted">{canExpand ? 'Path เต็มที่จะบันทึก' : 'Path ถูกต้องตามรูปแบบ ARK'}</p>
                {canExpand ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set('itemBlueprint', expanded)}>
                    ใช้ Path เต็ม
                  </Button>
                ) : null}
              </div>
              <code className="mt-1 block select-all break-all font-mono text-xs text-fg">{expanded}</code>
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">รายการที่ใช้บ่อย</p>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_BLUEPRINT_PRESETS.map((preset) => (
                <Button
                  key={preset.shortPath}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      itemBlueprint: preset.shortPath,
                      name: f.name || preset.label.split(' (')[0],
                    }))
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="จำนวนที่ได้รับ"
              mono
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value.replace(/[^\d]/g, ''))}
              error={errors.quantity}
            />
            <Select label="คุณภาพ" value={form.quality} onChange={(e) => set('quality', e.target.value)} options={QUALITY_OPTIONS} />
          </div>
          <Checkbox
            checked={form.isBlueprint}
            onChange={(e) => set('isBlueprint', e.target.checked)}
            label="ส่งเป็นใบ Blueprint"
            description="ผู้เล่นได้รับใบ Blueprint สำหรับคราฟต์ แทนไอเทมสำเร็จรูป"
          />
        </TabsPanel>
      </Tabs>
    </form>
  );
}
