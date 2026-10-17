'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Copy, Image as ImageIcon, Layers, Loader2, Pencil, Plus, Save, Tag } from 'lucide-react';
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
import api, {
  adminApi,
  PRODUCT_TYPES,
  type AdminCategoryRow,
  type AdminListRequest,
  type AdminProductFilter,
  type AdminProductRow,
  type ProductType,
} from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { getProductArtworkSrc } from '@/lib/productVisuals';
import { expandBlueprintPath, COMMON_BLUEPRINT_PRESETS } from '@/lib/blueprintHelper';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<ProductType, string> = {
  item: 'ไอเทม',
  dino: 'ไดโนเสาร์',
  engram: 'เอ็นแกรม',
  kit: 'ชุดไอเทม',
  bundle: 'แพ็กรวม',
  command: 'คำสั่ง',
  entitlement: 'สิทธิ์พิเศษ',
};

const QUALITY_OPTIONS = [
  { value: 0, label: 'ปกติ / Primitive (ขาว)' },
  { value: 1, label: 'Ramshackle (เขียว)' },
  { value: 2, label: 'Apprentice (น้ำเงิน)' },
  { value: 3, label: 'Journeyman (ม่วง)' },
  { value: 4, label: 'Mastercraft (เหลือง)' },
  { value: 5, label: 'Ascendant (แดง)' },
];

const ACTIVE_FILTERS = ['true', 'false'] as const;
const COLS = 6;

type EditorTab = 'basic' | 'visuals' | 'game';

interface ProductForm {
  name: string;
  description: string;
  price: number;
  itemBlueprint: string;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: string;
  imageUrl: string;
  sortOrder: number;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  description: '',
  price: 0,
  itemBlueprint: '',
  quantity: 1,
  quality: 0,
  isBlueprint: false,
  isActive: false,
  isFeatured: false,
  categoryId: '',
  imageUrl: '',
  sortOrder: 0,
};

function formFromProduct(p: AdminProductRow): ProductForm {
  return {
    name: p.name,
    description: p.description ?? '',
    price: Number(p.price) || 0,
    itemBlueprint: p.itemBlueprint ?? '',
    quantity: p.quantity ?? 1,
    quality: p.quality ?? 0,
    isBlueprint: Boolean(p.isBlueprint),
    isActive: Boolean(p.isActive),
    isFeatured: Boolean(p.isFeatured),
    categoryId: p.categoryId != null ? String(p.categoryId) : '',
    imageUrl: p.imageUrl ?? '',
    sortOrder: p.sortOrder ?? 0,
  };
}

/**
 * categoryId comes from the URL as a free-form value. The backend answers a
 * non-numeric id with 400, so the hook's FilterSpec only accepts an id or
 * 'none' (anything else is treated as "all" in hook state AND in the request).
 */
const CATEGORY_FILTER_PATTERN = '[0-9]{1,9}|none';

function fetchProductsPage(req: AdminListRequest<AdminProductFilter>, signal?: AbortSignal) {
  return adminApi.getProductsPage(req, signal);
}

function apiErrorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof msg === 'string' && msg ? msg : 'บันทึกไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ กรุณาลองอีกครั้ง';
}

const formatPrice = (value: unknown) => `${(Number(value) || 0).toLocaleString('th-TH')} IC`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ProductsAdmin() {
  const { user, isLoading: authLoading } = useAuthStore();
  const isAdmin = Boolean(user?.isAdmin);
  const queryClient = useQueryClient();

  const list = usePaginatedQuery({
    key: 'admin-products',
    fetcher: fetchProductsPage,
    filters: {
      categoryId: { pattern: CATEGORY_FILTER_PATTERN },
      productType: { values: PRODUCT_TYPES },
      isActive: { values: ACTIVE_FILTERS },
    },
    enabled: isAdmin,
  });

  // Full category list (admin endpoint: includes inactive ones) for the filter and the form.
  const { data: categories } = useQuery({
    queryKey: ['admin-categories-all'],
    queryFn: () => api.get('/admin/categories').then((res) => (res.data?.categories ?? []) as AdminCategoryRow[]),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProductRow | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<AdminProductRow | null>(null);
  const [tab, setTab] = useState<EditorTab>('basic');
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<AdminProductRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const afterChange = () => {
    void list.invalidate();
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-categories-all'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: Record<string, unknown> }) =>
      id === null ? adminApi.createProduct(data) : adminApi.updateProduct(id, data),
    onSuccess: (_res, vars) => {
      afterChange();
      setEditorOpen(false);
      setNotice(vars.id === null ? 'เพิ่มสินค้าแล้ว' : 'บันทึกการแก้ไขแล้ว');
    },
    onError: (error) => setFormError(apiErrorText(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteProduct(id),
    onSuccess: () => {
      afterChange();
      setNotice('ปิดการขายสินค้าแล้ว');
    },
  });

  const openEditor = (product: AdminProductRow | null, mode: 'edit' | 'duplicate' = 'edit') => {
    setTab('basic');
    setFormError(null);
    saveMutation.reset();
    if (product && mode === 'duplicate') {
      setEditing(null);
      setDuplicateOf(product);
      setForm({
        ...formFromProduct(product),
        name: `${product.name} (คัดลอก)`,
        isActive: false,
        isFeatured: false,
        sortOrder: (product.sortOrder ?? 0) + 1,
      });
    } else {
      setEditing(product);
      setDuplicateOf(null);
      setForm(product ? formFromProduct(product) : EMPTY_FORM);
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saveMutation.isPending) return;
    setEditorOpen(false);
  };

  // Item products are delivered by blueprint; other types (dino, kit, command…) may have none.
  const source = editing ?? duplicateOf;
  const productType: ProductType = source?.productType ?? 'item';
  const blueprintRequired = productType === 'item';

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saveMutation.isPending) return;
    const name = form.name.trim();
    if (!name) {
      setTab('basic');
      setFormError('กรุณากรอกชื่อสินค้า');
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      setTab('basic');
      setFormError('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      return;
    }
    const blueprint = expandBlueprintPath(form.itemBlueprint);
    if (blueprintRequired && !blueprint) {
      setTab('game');
      setFormError('กรุณากรอก Blueprint Path ของไอเทม');
      return;
    }
    const quantity = Math.max(1, Math.trunc(Number(form.quantity) || 1));
    setFormError(null);

    const data: Record<string, unknown> = {
      name,
      description: form.description,
      price,
      // Keep null for non-item products that never had a blueprint.
      itemBlueprint: blueprint || (source && source.itemBlueprint === null ? null : blueprint),
      quantity,
      quality: Number(form.quality) || 0,
      isBlueprint: form.isBlueprint,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      imageUrl: form.imageUrl,
      sortOrder: Math.trunc(Number(form.sortOrder) || 0),
    };
    // A duplicate keeps the original's product type so dinos/kits stay dinos/kits.
    if (!editing && duplicateOf) data.productType = duplicateOf.productType;

    saveMutation.mutate({ id: editing?.id ?? null, data });
  };

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));

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

  const categoryOptions = [
    { value: 'none', label: 'ไม่มีหมวดหมู่' },
    ...(categories ?? []).map((c) => ({ value: String(c.id), label: c.isActive ? c.name : `${c.name} (ปิดใช้งาน)` })),
  ];
  const expanded = expandBlueprintPath(form.itemBlueprint);
  const canExpand = form.itemBlueprint.trim() !== '' && form.itemBlueprint.trim() !== expanded;
  const saving = saveMutation.isPending;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="PRODUCTS"
        title="จัดการสินค้า"
        description="ตรวจราคา รูปภาพ และการส่งของก่อนเปิดขาย รายการที่ปิดอยู่จะไม่แสดงในร้านค้า"
        actions={
          <>
            <Link href="/admin" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              กลับหน้าแอดมิน
            </Link>
            <AdminButton variant="primary" icon={<Plus />} onClick={() => openEditor(null)}>
              เพิ่มสินค้า
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
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อสินค้าหรือรหัสอ้างอิง…">
          <AdminFilterSelect
            label="หมวดหมู่"
            value={list.filters.categoryId}
            onChange={(v) => list.setFilter('categoryId', v)}
            options={categoryOptions}
            allLabel="ทุกหมวดหมู่"
          />
          <AdminFilterSelect
            label="ประเภท"
            value={list.filters.productType}
            onChange={(v) => list.setFilter('productType', v)}
            options={PRODUCT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            allLabel="ทุกประเภท"
          />
        </AdminToolbar>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
          <SegmentedTabs
            aria-label="กรองตามสถานะการขาย"
            value={list.filters.isActive}
            onChange={(v) => list.setFilter('isActive', v)}
            options={[
              { value: '', label: 'ทั้งหมด' },
              { value: 'true', label: 'เปิดขาย' },
              { value: 'false', label: 'รอตรวจ / ปิดขาย' },
            ]}
          />
          {list.isFiltered && (
            <AdminButton size="sm" variant="ghost" onClick={list.resetAll}>
              ล้างตัวกรอง
            </AdminButton>
          )}
        </div>

        <AdminTable caption="รายการสินค้า" busy={list.isFetching} minWidth={860}>
          <AdminTableHead>
            <tr>
              <AdminTh>สินค้า</AdminTh>
              <AdminTh>หมวดหมู่</AdminTh>
              <AdminTh>ประเภท</AdminTh>
              <AdminTh align="right">ราคา</AdminTh>
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
            errorMessage="โหลดรายการสินค้าไม่สำเร็จ"
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีสินค้า'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างตัวกรอง
                </AdminButton>
              ) : (
                <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => openEditor(null)}>
                  เพิ่มสินค้าแรก
                </AdminButton>
              )
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((p) => (
              <AdminTr key={p.id}>
                <AdminTd>
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getProductArtworkSrc(p)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-11 w-11 shrink-0 rounded-lg border border-white/[0.08] bg-iris-midnight object-contain"
                    />
                    <div className="min-w-0">
                      <div className="line-clamp-1 font-semibold text-iris-pearl">{p.name}</div>
                      <div className="text-xs text-iris-muted">
                        #{p.id}
                        {p.externalKey ? ` · ${p.externalKey}` : ''}
                        {p.isBlueprint ? ' · ใบ Blueprint' : ''}
                      </div>
                    </div>
                  </div>
                </AdminTd>
                <AdminTd muted>{p.category?.name ?? 'ไม่มีหมวดหมู่'}</AdminTd>
                <AdminTd muted nowrap>
                  {TYPE_LABEL[p.productType] ?? p.productType}
                </AdminTd>
                <AdminTd align="right" mono nowrap>
                  {formatPrice(p.price)}
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={p.isActive ? 'success' : 'neutral'} dot>
                      {p.isActive ? 'เปิดขาย' : 'ปิดขาย'}
                    </StatusBadge>
                    {p.isFeatured && <StatusBadge tone="info">แนะนำ</StatusBadge>}
                    {!p.imageUrl && <StatusBadge tone="warning">รอรูปภาพ</StatusBadge>}
                  </div>
                </AdminTd>
                <AdminTd align="right" nowrap>
                  <AdminIconButton aria-label={`คัดลอกเป็นร่างใหม่ ${p.name}`} onClick={() => openEditor(p, 'duplicate')}>
                    <Copy />
                  </AdminIconButton>
                  <AdminIconButton aria-label={`แก้ไข ${p.name}`} onClick={() => openEditor(p)}>
                    <Pencil />
                  </AdminIconButton>
                  <AdminIconButton
                    tone="danger"
                    aria-label={`ปิดการขาย ${p.name}`}
                    disabled={!p.isActive}
                    onClick={() => setDeactivating(p)}
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

      {/* Editor */}
      <AdminDialog
        open={editorOpen}
        onClose={closeEditor}
        busy={saving}
        size="lg"
        title={editing ? 'แก้ไขสินค้า' : duplicateOf ? 'คัดลอกเป็นสินค้าใหม่' : 'เพิ่มสินค้าใหม่'}
        description={
          editing
            ? `#${editing.id} · ${TYPE_LABEL[editing.productType] ?? editing.productType}`
            : duplicateOf
              ? `คัดลอกจาก #${duplicateOf.id} จะบันทึกเป็นร่าง (ปิดขาย)`
              : 'สินค้าใหม่จะเป็นร่างจนกว่าจะเปิดขาย'
        }
        footer={
          <>
            <AdminButton variant="secondary" onClick={closeEditor} disabled={saving}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="primary" type="submit" form="product-form" loading={saving} icon={<Save />}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
            </AdminButton>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          <SegmentedTabs
            aria-label="ส่วนของฟอร์มสินค้า"
            value={tab}
            onChange={(v) => setTab(v)}
            options={[
              { value: 'basic', label: 'ข้อมูลทั่วไป' },
              { value: 'visuals', label: 'รูปภาพและการแสดงผล' },
              { value: 'game', label: 'ข้อมูลในเกม' },
            ]}
          />

          {formError && <AdminNotice tone="danger">{formError}</AdminNotice>}
          {editing && !editing.isActive && (
            <AdminNotice tone="info">{editing.description || 'ร่างรอตรวจราคา รูปภาพ และการส่งของก่อนเปิดขาย'}</AdminNotice>
          )}

          {tab === 'basic' && (
            <div className="space-y-4">
              <SectionTitle icon={<Tag />}>ข้อมูลทั่วไป</SectionTitle>
              <AdminField label="ชื่อสินค้า" required>
                {(field) => (
                  <input
                    {...field}
                    type="text"
                    value={form.name}
                    maxLength={200}
                    onChange={(e) => set('name', e.target.value)}
                    className={adminInputClass}
                    placeholder="เช่น Rex Saddle (Ascendant)"
                  />
                )}
              </AdminField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AdminField label="ราคา (IC)" required>
                  {(field) => (
                    <input
                      {...field}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={form.price}
                      onChange={(e) => set('price', Number(e.target.value))}
                      className={`${adminInputClass} font-mono`}
                    />
                  )}
                </AdminField>
                <AdminField label="หมวดหมู่">
                  {(field) => (
                    <select
                      {...field}
                      value={form.categoryId}
                      onChange={(e) => set('categoryId', e.target.value)}
                      className={adminInputClass}
                    >
                      <option value="">ไม่มีหมวดหมู่</option>
                      {(categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.isActive ? c.name : `${c.name} (ปิดใช้งาน)`}
                        </option>
                      ))}
                    </select>
                  )}
                </AdminField>
              </div>
              <AdminField label="รายละเอียด">
                {(field) => (
                  <textarea
                    {...field}
                    rows={5}
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    className={`${adminInputClass} min-h-[8rem] resize-y leading-relaxed`}
                    placeholder="รายละเอียดสินค้า…"
                  />
                )}
              </AdminField>
            </div>
          )}

          {tab === 'visuals' && (
            <div className="space-y-4">
              <SectionTitle icon={<ImageIcon />}>รูปภาพและการแสดงผล</SectionTitle>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[10rem_1fr]">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-iris-midnight">
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.imageUrl} alt="ตัวอย่างรูปสินค้า" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-3 text-center text-xs text-iris-muted">ใส่ URL เพื่อดูตัวอย่างรูป</span>
                  )}
                </div>
                <div className="space-y-4">
                  <AdminField label="URL รูปภาพ" hint="รองรับ JPG, PNG, WEBP">
                    {(field) => (
                      <input
                        {...field}
                        type="url"
                        value={form.imageUrl}
                        onChange={(e) => set('imageUrl', e.target.value)}
                        className={`${adminInputClass} font-mono text-sm`}
                        placeholder="https://example.com/image.jpg"
                      />
                    )}
                  </AdminField>
                  <AdminField label="ลำดับการแสดง" hint="ใช้จัดลำดับสินค้าในหน้าร้าน">
                    {(field) => (
                      <input
                        {...field}
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) => set('sortOrder', Number(e.target.value))}
                        className={adminInputClass}
                      />
                    )}
                  </AdminField>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CheckRow
                  checked={form.isActive}
                  onChange={(v) => set('isActive', v)}
                  title="เปิดขายสินค้า"
                  hint="แสดงในหน้าร้านค้า"
                />
                <CheckRow
                  checked={form.isFeatured}
                  onChange={(v) => set('isFeatured', v)}
                  title="สินค้าแนะนำ"
                  hint="แสดงในส่วนสินค้าแนะนำ"
                />
              </div>
            </div>
          )}

          {tab === 'game' && (
            <div className="space-y-4">
              <SectionTitle icon={<Layers />}>ข้อมูลในเกม</SectionTitle>
              <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <AdminField
                  label="Blueprint Path"
                  required={blueprintRequired}
                  hint="พิมพ์ชื่อสั้น เช่น PrimalItemResource_Polymer หรือวาง Blueprint Path เต็มจาก ARK ได้"
                >
                  {(field) => (
                    <input
                      {...field}
                      type="text"
                      value={form.itemBlueprint}
                      onChange={(e) => set('itemBlueprint', e.target.value)}
                      className={`${adminInputClass} font-mono text-xs`}
                      placeholder="เช่น Polymer, PopOutCake/PrimalItemStructure_BirthdayCake"
                      spellCheck={false}
                    />
                  )}
                </AdminField>

                {form.itemBlueprint.trim() !== '' && (
                  <div className="space-y-2 rounded-xl border border-white/[0.08] bg-iris-midnight p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-iris-muted">
                        {canExpand ? 'Path เต็มที่ระบบจะบันทึก' : 'Path ที่จะบันทึก'}
                      </span>
                      {canExpand && (
                        <AdminButton size="sm" variant="secondary" onClick={() => set('itemBlueprint', expanded)}>
                          ใช้ Path เต็ม
                        </AdminButton>
                      )}
                    </div>
                    <code className="block select-all break-all font-mono text-[11px] text-iris-pearl">{expanded}</code>
                  </div>
                )}

                <div className="space-y-2 border-t border-white/[0.06] pt-3">
                  <p className="text-xs font-semibold text-iris-muted">รายการที่ใช้บ่อย (คลิกเพื่อใส่ Blueprint)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_BLUEPRINT_PRESETS.map((preset) => (
                      <button
                        key={preset.shortPath}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            itemBlueprint: preset.shortPath,
                            name: f.name || preset.label.split(' (')[0],
                          }))
                        }
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-iris-muted transition hover:border-iris-cyan/40 hover:text-iris-pearl"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AdminField label="จำนวนที่ได้รับ">
                  {(field) => (
                    <input
                      {...field}
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => set('quantity', Number(e.target.value))}
                      className={adminInputClass}
                    />
                  )}
                </AdminField>
                <AdminField label="ระดับคุณภาพ">
                  {(field) => (
                    <select
                      {...field}
                      value={form.quality}
                      onChange={(e) => set('quality', Number(e.target.value))}
                      className={adminInputClass}
                    >
                      {QUALITY_OPTIONS.map((q) => (
                        <option key={q.value} value={q.value}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  )}
                </AdminField>
              </div>

              <CheckRow
                checked={form.isBlueprint}
                onChange={(v) => set('isBlueprint', v)}
                title="ส่งเป็นใบ Blueprint"
                hint="ผู้เล่นจะได้รับใบ Blueprint แทนไอเทมสำเร็จรูป"
              />
            </div>
          )}
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivateMutation.mutateAsync(deactivating!.id)}
        title="ปิดการขายสินค้านี้?"
        description={
          deactivating
            ? `“${deactivating.name}” จะถูกซ่อนจากร้านค้า ประวัติคำสั่งซื้อยังอยู่ครบ และเปิดขายใหม่ได้จากหน้าแก้ไข`
            : undefined
        }
        confirmText="ปิดการขาย"
      />
    </AdminPage>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 border-b border-white/[0.06] pb-2 text-sm font-semibold text-iris-pearl">
      <span className="text-iris-cyan [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
        {icon}
      </span>
      {children}
    </h3>
  );
}

function CheckRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/15">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-iris-cyan"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-iris-pearl">{title}</span>
        <span className="block text-xs text-iris-muted">{hint}</span>
      </span>
    </label>
  );
}

export default function AdminProductsPage() {
  return (
    <AdminSuspense>
      <ProductsAdmin />
    </AdminSuspense>
  );
}
