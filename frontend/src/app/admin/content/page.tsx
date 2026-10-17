'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Pagination,
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
  Textarea,
  useToast,
} from '@/components/ui';
import { AdminNoAccess, AdminToolbar, formatDateTime } from '@/components/admin';
import { contentApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { PAGE_TYPE_OPTIONS, LAYOUT_OPTIONS, pageTypeLabel } from './_lib';

interface DynamicPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  pageType: string;
  isPublished: boolean;
  publishedAt: string | null;
  layout: string;
  createdAt: string;
  updatedAt: string;
  _count?: { blocks: number };
}

interface PagesResponse {
  pages?: DynamicPage[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export default function AdminContentPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageContent } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [searchInput, setSearchInput] = React.useState('');
  const search = React.useDeferredValue(searchInput.trim());
  const [pageType, setPageType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DynamicPage | null>(null);

  const query = useQuery({
    queryKey: ['admin-pages', { search, pageType, page }],
    queryFn: () =>
      contentApi
        .getPages({ pageType: pageType || undefined, search: search || undefined, page })
        .then((res) => res.data as PagesResponse),
    enabled: canManageContent,
    placeholderData: (prev) => prev,
  });

  const pages = query.data?.pages ?? [];
  const total = query.data?.pagination?.total ?? 0;
  const pageSize = query.data?.pagination?.limit ?? 20;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-pages'] });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof contentApi.createPage>[0]) => contentApi.createPage(data),
    onSuccess: (res) => {
      toast.success('สร้างหน้าแล้ว', 'เพิ่มบล็อกเนื้อหาได้ในหน้าแก้ไข');
      setCreateOpen(false);
      invalidate();
      const id = (res.data as { page?: { id?: number } })?.page?.id;
      if (id) router.push(`/admin/content/${id}`);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (p: DynamicPage) => contentApi.updatePage(p.id, { isPublished: !p.isPublished }),
    onSuccess: (_d, p) => {
      toast.success(p.isPublished ? 'ซ่อนหน้าแล้ว' : 'เผยแพร่หน้าแล้ว', p.title);
      invalidate();
    },
    onError: (err) => toast.error('เปลี่ยนสถานะไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const duplicateMutation = useMutation({
    mutationFn: (p: DynamicPage) => contentApi.duplicatePage(p.id),
    onSuccess: (_d, p) => {
      toast.success('คัดลอกหน้าแล้ว', `สำเนาของ ${p.title} ถูกบันทึกเป็นฉบับร่าง`);
      invalidate();
    },
    onError: (err) => toast.error('คัดลอกไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const deleteMutation = useMutation({
    mutationFn: (p: DynamicPage) => contentApi.deletePage(p.id),
    onSuccess: (_d, p) => {
      toast.success('ลบหน้าแล้ว', p.title);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error('ลบไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const openCreate = () => {
    createMutation.reset();
    setCreateOpen(true);
  };

  const header = (
    <PageHeader
      eyebrow="แคตตาล็อก"
      title="เนื้อหา"
      description="หน้าเพจที่สร้างจากบล็อก เช่น กิจกรรม โปรโมชั่น และข้อมูลเซิร์ฟเวอร์ แสดงที่ /p/ตามด้วย slug"
      actions={
        canManageContent ? (
          <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={openCreate}>
            สร้างหน้า
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

  if (!canManageContent) {
    return (
      <div className="pb-16">
        {header}
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลเว็บไซต์และผู้ดูแลสูงสุด" />
      </div>
    );
  }

  return (
    <div className="min-w-0 pb-16">
      {header}

      <AdminToolbar>
        <Input
          label="ค้นหา"
          hideLabel
          size="sm"
          wrapperClassName="w-full sm:w-72"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
          placeholder="ชื่อหน้าหรือ slug"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="ประเภท"
          hideLabel
          size="sm"
          wrapperClassName="w-full sm:w-44"
          value={pageType}
          onChange={(e) => {
            setPageType(e.target.value);
            setPage(1);
          }}
          options={[{ value: '', label: 'ทุกประเภท' }, ...PAGE_TYPE_OPTIONS]}
        />
      </AdminToolbar>

      {query.isError ? (
        <ErrorMessage
          title="โหลดรายการหน้าไม่สำเร็จ"
          message={apiErrorText(query.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <TableContainer aria-busy={query.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>หน้า</TableHeaderCell>
                  <TableHeaderCell>ประเภท</TableHeaderCell>
                  <TableHeaderCell align="right">บล็อก</TableHeaderCell>
                  <TableHeaderCell>แก้ไขล่าสุด</TableHeaderCell>
                  <TableHeaderCell>เผยแพร่</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">การทำงาน</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.isLoading ? (
                  <TableLoadingRows columns={6} rows={5} />
                ) : pages.length === 0 ? (
                  <TableEmptyRow
                    colSpan={6}
                    title={search || pageType ? 'ไม่พบหน้าที่ตรงกับตัวกรอง' : 'ยังไม่มีหน้าเนื้อหา'}
                    description={search || pageType ? undefined : 'สร้างหน้าแรก เช่น ประกาศกิจกรรมหรือกติกาเซิร์ฟเวอร์'}
                    action={
                      search || pageType ? undefined : (
                        <Button size="sm" onClick={openCreate}>
                          สร้างหน้า
                        </Button>
                      )
                    }
                  />
                ) : (
                  pages.map((p) => (
                    <TableRow key={p.id} interactive onClick={() => router.push(`/admin/content/${p.id}`)}>
                      <TableCell className="min-w-[240px]">
                        <p className="font-medium text-fg">{p.title}</p>
                        <p className="mt-0.5 font-mono text-xs text-fg-subtle">/p/{p.slug}</p>
                      </TableCell>
                      <TableCell muted>{pageTypeLabel(p.pageType)}</TableCell>
                      <TableCell align="right" mono muted>
                        {p._count?.blocks ?? 0}
                      </TableCell>
                      <TableCell mono muted className="whitespace-nowrap">
                        {formatDateTime(p.updatedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.isPublished}
                            disabled={publishMutation.isPending && publishMutation.variables?.id === p.id}
                            onCheckedChange={() => publishMutation.mutate(p)}
                            aria-label={`${p.isPublished ? 'ซ่อน' : 'เผยแพร่'} ${p.title}`}
                          />
                          {p.isPublished ? <span className="text-xs text-fg-muted">เผยแพร่</span> : <Badge>ร่าง</Badge>}
                        </div>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1">
                          <Link
                            href={`/p/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`เปิดหน้า ${p.title} ในแท็บใหม่`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                          </Link>
                          <IconButton
                            aria-label={`คัดลอก ${p.title}`}
                            size="sm"
                            disabled={duplicateMutation.isPending}
                            onClick={() => duplicateMutation.mutate(p)}
                          >
                            <Copy className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                          <IconButton aria-label={`แก้ไข ${p.title}`} size="sm" onClick={() => router.push(`/admin/content/${p.id}`)}>
                            <Pencil className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                          <IconButton aria-label={`ลบ ${p.title}`} size="sm" onClick={() => setDeleteTarget(p)}>
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
          {total > pageSize ? <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} onPageChange={setPage} /> : null}
        </>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="สร้างหน้า"
        description="ตั้งชื่อและที่อยู่ของหน้า หน้าใหม่จะเป็นฉบับร่างจนกว่าจะเผยแพร่"
        size="md"
        loading={createMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-content-create" loading={createMutation.isPending}>
              สร้างหน้า
            </Button>
          </>
        }
      >
        {createOpen ? (
          <CreatePageForm
            error={createMutation.isError ? apiErrorText(createMutation.error, 'สร้างหน้าไม่สำเร็จ ลองอีกครั้ง') : null}
            onSubmit={(data) => createMutation.mutate(data)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="ลบหน้า"
        description={
          deleteTarget
            ? `${deleteTarget.title} และบล็อกทั้งหมด ${deleteTarget._count?.blocks ?? 0} บล็อกจะถูกลบถาวร ลิงก์ /p/${deleteTarget.slug} จะใช้ไม่ได้`
            : undefined
        }
        variant="danger"
        confirmText="ลบหน้า"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}

function CreatePageForm({
  error,
  onSubmit,
}: {
  error: string | null;
  onSubmit: (data: Parameters<typeof contentApi.createPage>[0]) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [pageType, setPageType] = React.useState('custom');
  const [layout, setLayout] = React.useState('default');
  const [errors, setErrors] = React.useState<{ title?: string; slug?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: { title?: string; slug?: string } = {};
    if (!title.trim()) next.title = 'กรอกชื่อหน้า';
    if (!SLUG.test(slug.trim())) next.slug = 'ใช้ a-z, 0-9 และขีดกลาง เช่น winter-event';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      title: title.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      pageType,
      layout,
    });
  };

  return (
    <form id="admin-content-create" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <Input
        label="ชื่อหน้า"
        required
        value={title}
        placeholder="เช่น กิจกรรมฤดูหนาว"
        onChange={(e) => {
          setTitle(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
          if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
        }}
        error={errors.title}
      />
      <Input
        label="Slug"
        required
        mono
        value={slug}
        placeholder="winter-event"
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value.toLowerCase());
          if (errors.slug) setErrors((x) => ({ ...x, slug: undefined }));
        }}
        error={errors.slug}
        helperText={slug ? `ที่อยู่: /p/${slug}` : 'ชื่อภาษาไทยจะไม่ถูกแปลงเป็น slug ให้ กรอกเองเป็นภาษาอังกฤษ'}
      />
      <Textarea label="คำอธิบาย" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} helperText="ใช้เป็นคำอธิบายสำหรับการแชร์และค้นหา" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="ประเภท" value={pageType} onChange={(e) => setPageType(e.target.value)} options={PAGE_TYPE_OPTIONS} />
        <Select label="เลย์เอาต์" value={layout} onChange={(e) => setLayout(e.target.value)} options={LAYOUT_OPTIONS} />
      </div>
    </form>
  );
}
