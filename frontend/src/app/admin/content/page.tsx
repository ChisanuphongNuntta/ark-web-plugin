'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { contentApi, type AdminContentPageRow } from '@/lib/api';

const PAGE_TYPES = ['home', 'promotion', 'event', 'info', 'custom'] as const;
const PAGE_TYPE_LABEL: Record<string, string> = {
  home: 'หน้าหลัก',
  promotion: 'โปรโมชั่น',
  event: 'อีเวนท์',
  info: 'ข้อมูล',
  custom: 'กำหนดเอง',
};
const COLS = 5;
// Same look as AdminIconButton, for row actions that navigate.
const ROW_LINK_CLASS =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-iris-muted transition hover:border-white/10 hover:bg-white/[0.05] hover:text-iris-pearl [&>svg]:h-4 [&>svg]:w-4';

function apiErrorText(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('th-TH');
}

function ContentAdmin() {
  const list = usePaginatedQuery({
    key: 'admin-content-pages',
    fetcher: contentApi.getPagesPage,
    filters: { pageType: { values: PAGE_TYPES } },
  });

  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [newPageType, setNewPageType] = useState<string>('custom');
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminContentPageRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      contentApi.createPage({
        slug: slug.trim(),
        title: title.trim(),
        pageType: newPageType,
        layout: 'contained',
      }),
    onSuccess: () => {
      void list.invalidate();
      setCreateOpen(false);
      setNotice({ tone: 'success', text: 'สร้างหน้าใหม่แล้ว' });
    },
    onError: (error) => setCreateError(apiErrorText(error, 'สร้างหน้าไม่สำเร็จ กรุณาลองอีกครั้ง')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => contentApi.deletePage(id),
    onSuccess: () => {
      void list.invalidate();
      setNotice({ tone: 'success', text: 'ลบหน้าแล้ว' });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      contentApi.updatePage(id, { isPublished }),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (_res, vars) => {
      void list.invalidate();
      setNotice({ tone: 'success', text: vars.isPublished ? 'เผยแพร่หน้าแล้ว' : 'ปิดการเผยแพร่แล้ว' });
    },
    onError: (error) => setNotice({ tone: 'danger', text: apiErrorText(error, 'เปลี่ยนสถานะไม่สำเร็จ') }),
    onSettled: () => setBusyId(null),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => contentApi.duplicatePage(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      void list.invalidate();
      setNotice({ tone: 'success', text: 'คัดลอกหน้าแล้ว (เป็นฉบับร่าง)' });
    },
    onError: (error) => setNotice({ tone: 'danger', text: apiErrorText(error, 'คัดลอกหน้าไม่สำเร็จ') }),
    onSettled: () => setBusyId(null),
  });

  const openCreate = () => {
    setTitle('');
    setSlug('');
    setSlugTouched(false);
    setNewPageType('custom');
    setCreateError(null);
    createMutation.reset();
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (!createMutation.isPending) setCreateOpen(false);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return;
    if (!title.trim()) {
      setCreateError('กรุณากรอกชื่อหน้า');
      return;
    }
    if (!slug.trim()) {
      setCreateError('กรุณากรอก URL slug (a-z, 0-9, -)');
      return;
    }
    setCreateError(null);
    createMutation.mutate();
  };

  const creating = createMutation.isPending;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="CONTENT"
        title="จัดการหน้าเนื้อหา"
        description="สร้างและแก้ไขหน้าโปรโมชั่น อีเวนท์ และหน้าข้อมูลของเว็บไซต์"
        actions={
          <>
            <Link href="/admin" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              กลับหน้าแอดมิน
            </Link>
            <AdminButton variant="primary" icon={<Plus />} onClick={openCreate}>
              สร้างหน้าใหม่
            </AdminButton>
          </>
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar list={list} searchPlaceholder="ค้นหาชื่อหน้าหรือ slug…">
          <AdminFilterSelect
            label="ประเภทหน้า"
            value={list.filters.pageType}
            onChange={(v) => list.setFilter('pageType', v)}
            options={PAGE_TYPES.map((t) => ({ value: t, label: PAGE_TYPE_LABEL[t] }))}
          />
        </AdminToolbar>

        <AdminTable caption="รายการหน้าเนื้อหา" busy={list.isFetching}>
          <AdminTableHead>
            <tr>
              <AdminTh>หน้า</AdminTh>
              <AdminTh>ประเภท</AdminTh>
              <AdminTh align="right">บล็อก</AdminTh>
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
            errorMessage="โหลดรายการหน้าไม่สำเร็จ"
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบหน้าที่ตรงกับตัวกรอง' : 'ยังไม่มีหน้าที่สร้างไว้'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างตัวกรอง
                </AdminButton>
              ) : (
                <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={openCreate}>
                  สร้างหน้าแรก
                </AdminButton>
              )
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((p) => {
              const published = Boolean(p.isPublished);
              const rowBusy = busyId === p.id;
              const blockCount = Number(p._count?.blocks ?? 0);
              return (
                <AdminTr key={p.id}>
                  <AdminTd>
                    <Link
                      href={`/admin/content/${p.id}`}
                      className="font-semibold text-iris-pearl hover:text-iris-cyan"
                    >
                      {p.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-iris-muted">
                      <span className="font-mono">/p/{p.slug}</span>
                      <span>แก้ไขล่าสุด {formatDate(p.updatedAt)}</span>
                    </div>
                  </AdminTd>
                  <AdminTd muted>{PAGE_TYPE_LABEL[String(p.pageType)] ?? String(p.pageType ?? '—')}</AdminTd>
                  <AdminTd align="right" mono>
                    {blockCount.toLocaleString('th-TH')}
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge tone={published ? 'success' : 'neutral'} dot>
                      {published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                    </StatusBadge>
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <AdminIconButton
                      aria-label={published ? `ปิดการเผยแพร่ ${p.title}` : `เผยแพร่ ${p.title}`}
                      title={published ? 'ปิดการเผยแพร่' : 'เผยแพร่'}
                      disabled={rowBusy}
                      onClick={() => togglePublishMutation.mutate({ id: p.id, isPublished: !published })}
                    >
                      {published ? <EyeOff /> : <Eye />}
                    </AdminIconButton>
                    <AdminIconButton
                      aria-label={`คัดลอกหน้า ${p.title}`}
                      title="คัดลอกหน้า"
                      disabled={rowBusy}
                      onClick={() => duplicateMutation.mutate(p.id)}
                    >
                      <Copy />
                    </AdminIconButton>
                    <a
                      href={`/p/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`เปิดหน้า ${p.title} ในแท็บใหม่`}
                      title="ดูหน้าเว็บจริง"
                      className={ROW_LINK_CLASS}
                    >
                      <ExternalLink aria-hidden="true" />
                    </a>
                    <Link
                      href={`/admin/content/${p.id}`}
                      aria-label={`แก้ไขเนื้อหา ${p.title}`}
                      title="แก้ไขเนื้อหา"
                      className={ROW_LINK_CLASS}
                    >
                      <Pencil aria-hidden="true" />
                    </Link>
                    <AdminIconButton tone="danger" aria-label={`ลบหน้า ${p.title}`} onClick={() => setDeleting(p)}>
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

      <AdminDialog
        open={createOpen}
        onClose={closeCreate}
        busy={creating}
        title="สร้างหน้าใหม่"
        description="กำหนดชื่อและ URL ของหน้า แล้วเพิ่มเนื้อหาในหน้าแก้ไขต่อ"
        footer={
          <>
            <AdminButton variant="secondary" onClick={closeCreate} disabled={creating}>
              ยกเลิก
            </AdminButton>
            <AdminButton variant="primary" type="submit" form="content-create-form" loading={creating} icon={<Plus />}>
              สร้างหน้า
            </AdminButton>
          </>
        }
      >
        <form id="content-create-form" onSubmit={handleCreate} noValidate className="space-y-4">
          {createError && <AdminNotice tone="danger">{createError}</AdminNotice>}
          <AdminField label="ชื่อหน้า" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={title}
                maxLength={200}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="เช่น กิจกรรมแจกไดโนเสาร์ Alpha"
                className={adminInputClass}
              />
            )}
          </AdminField>
          <AdminField label="URL slug" required hint="ใช้ a-z, 0-9 และ - เท่านั้น หน้าจะอยู่ที่ /p/slug">
            {(field) => (
              <input
                {...field}
                type="text"
                value={slug}
                maxLength={100}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="alpha-dino-event"
                className={`${adminInputClass} font-mono`}
              />
            )}
          </AdminField>
          <AdminField label="ประเภทหน้า">
            {(field) => (
              <select
                {...field}
                value={newPageType}
                onChange={(e) => setNewPageType(e.target.value)}
                className={adminInputClass}
              >
                {PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PAGE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </AdminField>
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutateAsync(deleting!.id)}
        title="ลบหน้านี้?"
        description={
          deleting
            ? `“${deleting.title}” และบล็อกทั้งหมดในหน้านี้จะถูกลบถาวร ไม่สามารถย้อนกลับได้`
            : undefined
        }
        confirmText="ลบหน้า"
        confirmPhrase={deleting?.slug}
      />
    </AdminPage>
  );
}

export default function AdminContentPage() {
  return (
    <AdminSuspense>
      <ContentAdmin />
    </AdminSuspense>
  );
}
