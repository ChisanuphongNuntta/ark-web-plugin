'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  LayoutTemplate,
  List,
  Minus,
  MousePointerClick,
  MoveVertical,
  Pencil,
  Plus,
  Rows3,
  Settings2,
  ShoppingBag,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { AdminNoAccess, DetailList, formatDateTime } from '@/components/admin';
import { contentApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { LAYOUT_OPTIONS, PAGE_TYPE_OPTIONS, blockLabel, pageTypeLabel } from '../_lib';

/* Block content is free-form JSON owned by the backend block registry. */
type BlockContent = Record<string, unknown>;

interface ContentBlock {
  id: number;
  pageId: number;
  blockType: string;
  content: BlockContent | null;
  settings: BlockContent | null;
  sortOrder: number;
  isVisible: boolean;
}

interface BlockType {
  type: string;
  name: string;
  icon?: string;
  description?: string;
  defaultContent: BlockContent;
}

interface PageDetail {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  pageType: string;
  layout: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  blocks?: ContentBlock[];
}

const BLOCK_ICON: Record<string, LucideIcon> = {
  heading: Type,
  text: FileText,
  image: ImageIcon,
  gallery: Grid3X3,
  banner: LayoutTemplate,
  grid: Grid3X3,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  html: Code,
  'product-list': ShoppingBag,
  countdown: Clock,
  video: Video,
  accordion: List,
  tabs: Rows3,
};

/** Block types with a dedicated form; everything else is edited as JSON. */
const FORM_BLOCKS = new Set(['heading', 'text', 'image', 'banner', 'button', 'spacer', 'html', 'product-list', 'video', 'countdown', 'divider']);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arrLen = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

function blockPreview(block: ContentBlock): string {
  const c = block.content ?? {};
  switch (block.blockType) {
    case 'heading':
      return str(c.text) || 'ยังไม่มีข้อความ';
    case 'text':
      return str(c.text).slice(0, 120) || 'ยังไม่มีข้อความ';
    case 'image':
      return str(c.url) || 'ยังไม่ได้ใส่รูป';
    case 'gallery':
      return `${arrLen(c.images)} รูป`;
    case 'banner':
      return str(c.title) || 'แบนเนอร์';
    case 'button':
      return [str(c.text), str(c.link)].filter(Boolean).join(' → ') || 'ปุ่ม';
    case 'divider':
      return 'เส้นคั่น';
    case 'spacer':
      return `สูง ${num(c.height, 40)}px`;
    case 'html':
      return c.html ? 'HTML กำหนดเอง' : 'ยังไม่มีโค้ด';
    case 'product-list':
      return `${num(c.limit, 8)} สินค้า${c.featured ? ' (เฉพาะแนะนำ)' : ''}`;
    case 'countdown':
      return str(c.endDate) || 'ยังไม่ได้ตั้งเวลา';
    case 'video':
      return str(c.url) || 'ยังไม่ได้ใส่ลิงก์';
    case 'accordion':
      return `${arrLen(c.items)} รายการ`;
    case 'tabs':
      return `${arrLen(c.tabs)} แท็บ`;
    default:
      return block.blockType;
  }
}

export default function PageEditorPage() {
  const params = useParams();
  const pageId = Number.parseInt(String(params.id ?? ''), 10);
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageContent } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [addOpen, setAddOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editingBlock, setEditingBlock] = React.useState<ContentBlock | null>(null);
  const [deleteBlock, setDeleteBlock] = React.useState<ContentBlock | null>(null);

  const pageQuery = useQuery({
    queryKey: ['admin-page', pageId],
    queryFn: () => contentApi.getPageById(pageId).then((res) => (res.data?.page ?? null) as PageDetail | null),
    enabled: canManageContent && Number.isFinite(pageId),
  });
  const blockTypesQuery = useQuery({
    queryKey: ['block-types'],
    queryFn: () => contentApi.getBlockTypes().then((res) => (res.data?.blockTypes ?? []) as BlockType[]),
    enabled: canManageContent,
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
  };

  const updatePageMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => contentApi.updatePage(pageId, data),
    onSuccess: (_d, data) => {
      if ('isPublished' in data && Object.keys(data).length === 1) {
        toast.success(data.isPublished ? 'เผยแพร่หน้าแล้ว' : 'ซ่อนหน้าแล้ว');
      } else {
        toast.success('บันทึกการตั้งค่าหน้าแล้ว');
        setSettingsOpen(false);
      }
      invalidate();
    },
    onError: (err, data) => {
      if ('isPublished' in data && Object.keys(data).length === 1) toast.error('เปลี่ยนสถานะไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง'));
    },
  });

  const createBlockMutation = useMutation({
    mutationFn: (t: BlockType) =>
      contentApi.createBlock(pageId, { blockType: t.type, content: t.defaultContent, sortOrder: pageQuery.data?.blocks?.length ?? 0 }),
    onSuccess: (res, t) => {
      toast.success(`เพิ่มบล็อก${blockLabel(t.type)}แล้ว`);
      setAddOpen(false);
      invalidate();
      const created = (res.data as { block?: ContentBlock })?.block;
      if (created) setEditingBlock(created);
    },
    onError: (err) => toast.error('เพิ่มบล็อกไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, data }: { blockId: number; data: Record<string, unknown> }) => contentApi.updateBlock(blockId, data),
    onSuccess: (_d, vars) => {
      if ('isVisible' in vars.data && Object.keys(vars.data).length === 1) {
        toast.success(vars.data.isVisible ? 'แสดงบล็อกแล้ว' : 'ซ่อนบล็อกแล้ว');
      } else {
        toast.success('บันทึกบล็อกแล้ว');
        setEditingBlock(null);
      }
      invalidate();
    },
    onError: (err, vars) => {
      if ('isVisible' in vars.data) toast.error('เปลี่ยนการแสดงผลไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง'));
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (block: ContentBlock) => contentApi.deleteBlock(block.id),
    onSuccess: () => {
      toast.success('ลบบล็อกแล้ว');
      setDeleteBlock(null);
      invalidate();
    },
    onError: (err) => toast.error('ลบบล็อกไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const reorderMutation = useMutation({
    mutationFn: (orders: { id: number; sortOrder: number }[]) => contentApi.reorderBlocks(pageId, orders),
    onSuccess: invalidate,
    onError: (err) => toast.error('จัดลำดับไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const page = pageQuery.data;
  const blocks = React.useMemo(() => [...(page?.blocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [page?.blocks]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((b, i) => ({ id: b.id, sortOrder: i })));
  };

  if (authLoading || !user) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="เนื้อหา" title="แก้ไขหน้า" />
      </div>
    );
  }

  if (!canManageContent) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="เนื้อหา" title="แก้ไขหน้า" />
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลเว็บไซต์และผู้ดูแลสูงสุด" />
      </div>
    );
  }

  if (pageQuery.isLoading) {
    return (
      <div className="space-y-4 pb-16" aria-busy="true">
        <PageHeader eyebrow="เนื้อหา" title={<Skeleton className="h-7 w-64" />} />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (pageQuery.isError) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="เนื้อหา" title="แก้ไขหน้า" />
        <ErrorMessage
          title="โหลดหน้าไม่สำเร็จ"
          message={apiErrorText(pageQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void pageQuery.refetch()}
        />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="เนื้อหา" title="แก้ไขหน้า" />
        <EmptyState
          title="ไม่พบหน้านี้"
          description="หน้าอาจถูกลบไปแล้ว"
          action={
            <Link href="/admin/content" className="text-sm text-accent underline-offset-4 hover:underline">
              กลับไปรายการหน้า
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="เนื้อหา"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {page.title}
            {page.isPublished ? <Badge tone="success">เผยแพร่</Badge> : <Badge>ร่าง</Badge>}
          </span>
        }
        description={<span className="font-mono text-xs">/p/{page.slug}</span>}
        actions={
          <>
            <a
              href={`/p/${page.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-control border border-line-strong px-4 text-sm text-fg transition-colors duration-150 hover:bg-surface-2"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              ดูหน้าจริง
            </a>
            <Button
              variant="secondary"
              leftIcon={<Settings2 className="h-4 w-4" strokeWidth={1.5} />}
              onClick={() => {
                updatePageMutation.reset();
                setSettingsOpen(true);
              }}
            >
              ตั้งค่าหน้า
            </Button>
            <Button
              variant={page.isPublished ? 'secondary' : 'primary'}
              loading={updatePageMutation.isPending && !settingsOpen}
              onClick={() => updatePageMutation.mutate({ isPublished: !page.isPublished })}
            >
              {page.isPublished ? 'เลิกเผยแพร่' : 'เผยแพร่'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          title="บล็อกเนื้อหา"
          description="เรียงจากบนลงล่างตามที่แสดงในหน้า"
          flush
          actions={
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>
              เพิ่มบล็อก
            </Button>
          }
        >
          {blocks.length === 0 ? (
            <EmptyState
              bare
              className="py-12"
              title="ยังไม่มีบล็อก"
              description="เริ่มจากหัวข้อและข้อความ แล้วค่อยเพิ่มรูปหรือรายการสินค้า"
              action={
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  เพิ่มบล็อกแรก
                </Button>
              }
            />
          ) : (
            <ol className="divide-y divide-line" aria-busy={reorderMutation.isPending || undefined}>
              {blocks.map((block, index) => {
                const Icon = BLOCK_ICON[block.blockType] ?? FileText;
                const toggling = updateBlockMutation.isPending && updateBlockMutation.variables?.blockId === block.id;
                return (
                  <li key={block.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-fg-subtle">{index + 1}</span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line text-fg-muted">
                      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-control text-left"
                      onClick={() => setEditingBlock(block)}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">{blockLabel(block.blockType)}</span>
                        {!block.isVisible ? <Badge outline>ซ่อน</Badge> : null}
                      </span>
                      <span className={`mt-0.5 block truncate text-xs text-fg-subtle ${block.isVisible ? '' : 'line-through'}`}>
                        {blockPreview(block)}
                      </span>
                    </button>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <IconButton
                        aria-label={`เลื่อนบล็อกที่ ${index + 1} ขึ้น`}
                        size="sm"
                        disabled={index === 0 || reorderMutation.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                      <IconButton
                        aria-label={`เลื่อนบล็อกที่ ${index + 1} ลง`}
                        size="sm"
                        disabled={index === blocks.length - 1 || reorderMutation.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                      <IconButton
                        aria-label={block.isVisible ? `ซ่อนบล็อกที่ ${index + 1}` : `แสดงบล็อกที่ ${index + 1}`}
                        size="sm"
                        disabled={toggling}
                        onClick={() => updateBlockMutation.mutate({ blockId: block.id, data: { isVisible: !block.isVisible } })}
                      >
                        {block.isVisible ? <Eye className="h-4 w-4" strokeWidth={1.5} /> : <EyeOff className="h-4 w-4" strokeWidth={1.5} />}
                      </IconButton>
                      <IconButton aria-label={`แก้ไขบล็อกที่ ${index + 1}`} size="sm" onClick={() => setEditingBlock(block)}>
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                      <IconButton aria-label={`ลบบล็อกที่ ${index + 1}`} size="sm" onClick={() => setDeleteBlock(block)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="ข้อมูลหน้า">
          <DetailList
            className="sm:grid-cols-1"
            items={[
              { label: 'ประเภท', value: pageTypeLabel(page.pageType) },
              { label: 'เลย์เอาต์', value: LAYOUT_OPTIONS.find((o) => o.value === page.layout)?.label ?? page.layout },
              { label: 'เผยแพร่เมื่อ', value: page.isPublished ? formatDateTime(page.publishedAt) : 'ยังไม่เผยแพร่', mono: page.isPublished },
              { label: 'แก้ไขล่าสุด', value: formatDateTime(page.updatedAt), mono: true },
              { label: 'Meta title', value: page.metaTitle || page.title },
              { label: 'คำอธิบาย', value: page.metaDescription || page.description },
            ]}
          />
        </Panel>
      </div>

      {/* Add block */}
      <Dialog open={addOpen} onOpenChange={setAddOpen} title="เพิ่มบล็อก" description="บล็อกใหม่จะต่อท้ายหน้า แก้ไขเนื้อหาได้ทันทีหลังเพิ่ม" size="lg">
        {blockTypesQuery.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : blockTypesQuery.isError ? (
          <ErrorMessage variant="inline" message="โหลดชนิดบล็อกไม่สำเร็จ" onRetry={() => void blockTypesQuery.refetch()} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(blockTypesQuery.data ?? []).map((t) => {
              const Icon = BLOCK_ICON[t.type] ?? FileText;
              return (
                <li key={t.type}>
                  <button
                    type="button"
                    disabled={createBlockMutation.isPending}
                    onClick={() => createBlockMutation.mutate(t)}
                    className="flex w-full items-start gap-3 rounded-control border border-line px-3 py-3 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{blockLabel(t.type)}</span>
                      {t.description ? <span className="mt-0.5 block text-xs text-fg-subtle">{t.description}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>

      {/* Edit block */}
      <Dialog
        open={!!editingBlock}
        onOpenChange={(open) => !open && setEditingBlock(null)}
        title={editingBlock ? `แก้ไขบล็อก${blockLabel(editingBlock.blockType)}` : undefined}
        size="lg"
        loading={updateBlockMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingBlock(null)} disabled={updateBlockMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-block-form" loading={updateBlockMutation.isPending}>
              บันทึกบล็อก
            </Button>
          </>
        }
      >
        {editingBlock ? (
          <BlockForm
            key={editingBlock.id}
            block={editingBlock}
            error={
              updateBlockMutation.isError && updateBlockMutation.variables?.blockId === editingBlock.id
                ? apiErrorText(updateBlockMutation.error, 'บันทึกไม่สำเร็จ ลองอีกครั้ง')
                : null
            }
            onSubmit={(content, settings) => updateBlockMutation.mutate({ blockId: editingBlock.id, data: { content, settings } })}
          />
        ) : null}
      </Dialog>

      {/* Page settings */}
      <Dialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="ตั้งค่าหน้า"
        size="md"
        loading={updatePageMutation.isPending}
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)} disabled={updatePageMutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-page-settings" loading={updatePageMutation.isPending}>
              บันทึก
            </Button>
          </>
        }
      >
        {settingsOpen ? (
          <PageSettingsForm
            page={page}
            error={updatePageMutation.isError ? apiErrorText(updatePageMutation.error, 'บันทึกไม่สำเร็จ ลองอีกครั้ง') : null}
            onSubmit={(data) => updatePageMutation.mutate(data)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={!!deleteBlock}
        onOpenChange={(open) => !open && setDeleteBlock(null)}
        title="ลบบล็อก"
        description={deleteBlock ? `บล็อก${blockLabel(deleteBlock.blockType)} "${blockPreview(deleteBlock)}" จะถูกลบถาวร` : undefined}
        variant="danger"
        confirmText="ลบบล็อก"
        loading={deleteBlockMutation.isPending}
        onConfirm={() => deleteBlock && deleteBlockMutation.mutate(deleteBlock)}
      />
    </div>
  );
}

function PageSettingsForm({
  page,
  error,
  onSubmit,
}: {
  page: PageDetail;
  error: string | null;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = React.useState(() => ({
    title: page.title,
    slug: page.slug,
    description: page.description ?? '',
    pageType: page.pageType,
    layout: page.layout || 'default',
    metaTitle: page.metaTitle ?? '',
    metaDescription: page.metaDescription ?? '',
  }));
  const [errors, setErrors] = React.useState<{ title?: string; slug?: string }>({});
  type Key = keyof typeof form;
  const set = (key: Key, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'title' || key === 'slug') setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: { title?: string; slug?: string } = {};
    if (!form.title.trim()) next.title = 'กรอกชื่อหน้า';
    if (!SLUG.test(form.slug.trim())) next.slug = 'ใช้ a-z, 0-9 และขีดกลาง';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      pageType: form.pageType,
      layout: form.layout,
      metaTitle: form.metaTitle.trim(),
      metaDescription: form.metaDescription.trim(),
    });
  };

  return (
    <form id="admin-page-settings" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}
      <Input label="ชื่อหน้า" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} />
      <Input
        label="Slug"
        required
        mono
        value={form.slug}
        onChange={(e) => set('slug', e.target.value.toLowerCase())}
        error={errors.slug}
        helperText={form.slug !== page.slug ? `ลิงก์เดิม /p/${page.slug} จะใช้ไม่ได้` : `ที่อยู่: /p/${form.slug}`}
      />
      <Textarea label="คำอธิบาย" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="ประเภท" value={form.pageType} onChange={(e) => set('pageType', e.target.value)} options={PAGE_TYPE_OPTIONS} />
        <Select label="เลย์เอาต์" value={form.layout} onChange={(e) => set('layout', e.target.value)} options={LAYOUT_OPTIONS} />
      </div>
      <fieldset className="space-y-4 border-t border-line pt-4">
        <legend className="pr-2 text-xs font-medium text-fg-muted">การค้นหาและการแชร์</legend>
        <Input label="Meta title" value={form.metaTitle} placeholder={form.title} onChange={(e) => set('metaTitle', e.target.value)} />
        <Textarea
          label="Meta description"
          rows={2}
          value={form.metaDescription}
          onChange={(e) => set('metaDescription', e.target.value)}
          helperText={`${form.metaDescription.length} ตัวอักษร แนะนำไม่เกิน 160`}
        />
      </fieldset>
    </form>
  );
}

function BlockForm({
  block,
  error,
  onSubmit,
}: {
  block: ContentBlock;
  error: string | null;
  onSubmit: (content: BlockContent, settings: BlockContent) => void;
}) {
  const [content, setContent] = React.useState<BlockContent>(() => ({ ...(block.content ?? {}) }));
  const [json, setJson] = React.useState(() => JSON.stringify(block.content ?? {}, null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const settings = block.settings ?? {};
  const useJson = !FORM_BLOCKS.has(block.blockType);

  const set = (key: string, value: unknown) => setContent((c) => ({ ...c, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (useJson) {
      try {
        const parsed = JSON.parse(json) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        onSubmit(parsed as BlockContent, settings);
      } catch {
        setJsonError('JSON ไม่ถูกต้อง ต้องเป็นออบเจกต์ { ... }');
      }
      return;
    }
    onSubmit(content, settings);
  };

  const imageUrl = str(content.url);

  return (
    <form id="admin-block-form" onSubmit={submit} noValidate className="space-y-4">
      {error ? <ErrorMessage variant="inline" message={error} /> : null}

      {useJson ? (
        <Textarea
          label="เนื้อหา (JSON)"
          rows={14}
          className="font-mono text-xs"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setJsonError(null);
          }}
          error={jsonError ?? undefined}
          helperText="บล็อกชนิดนี้ยังไม่มีฟอร์มเฉพาะ แก้ไขโครงสร้างตามที่หน้าเว็บรองรับ"
        />
      ) : null}

      {block.blockType === 'heading' ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Input label="ข้อความ" value={str(content.text)} onChange={(e) => set('text', e.target.value)} />
          <Select
            label="ขนาด"
            value={String(num(content.level, 2))}
            onChange={(e) => set('level', Number(e.target.value))}
            options={[
              { value: '1', label: 'H1 ใหญ่สุด' },
              { value: '2', label: 'H2 ใหญ่' },
              { value: '3', label: 'H3 กลาง' },
              { value: '4', label: 'H4 เล็ก' },
              { value: '5', label: 'H5' },
              { value: '6', label: 'H6' },
            ]}
          />
        </div>
      ) : null}

      {block.blockType === 'text' ? (
        <Textarea label="ข้อความ" rows={10} value={str(content.text)} onChange={(e) => set('text', e.target.value)} helperText="รองรับ Markdown" />
      ) : null}

      {block.blockType === 'image' ? (
        <>
          <Input label="URL รูปภาพ" mono value={imageUrl} placeholder="https://" onChange={(e) => set('url', e.target.value)} />
          <Input label="ข้อความแทนรูป (alt)" value={str(content.alt)} onChange={(e) => set('alt', e.target.value)} helperText="อธิบายรูปสำหรับโปรแกรมอ่านหน้าจอ" />
          <Input label="คำบรรยายใต้รูป" value={str(content.caption)} onChange={(e) => set('caption', e.target.value)} />
          {/^https?:\/\//.test(imageUrl) ? (
            // Admin-entered arbitrary URL; next/image would need a remote pattern per host.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={str(content.alt)} className="max-h-48 rounded-control border border-line object-contain" />
          ) : null}
        </>
      ) : null}

      {block.blockType === 'banner' ? (
        <>
          <Input label="รูปพื้นหลัง" mono value={str(content.imageUrl)} placeholder="https://" onChange={(e) => set('imageUrl', e.target.value)} />
          <Input label="หัวข้อ" value={str(content.title)} onChange={(e) => set('title', e.target.value)} />
          <Input label="หัวข้อรอง" value={str(content.subtitle)} onChange={(e) => set('subtitle', e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ข้อความปุ่ม" value={str(content.buttonText)} onChange={(e) => set('buttonText', e.target.value)} />
            <Input label="ลิงก์ปุ่ม" mono value={str(content.buttonLink)} onChange={(e) => set('buttonLink', e.target.value)} />
          </div>
        </>
      ) : null}

      {block.blockType === 'button' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ข้อความ" value={str(content.text)} onChange={(e) => set('text', e.target.value)} />
            <Input label="ลิงก์" mono value={str(content.link)} onChange={(e) => set('link', e.target.value)} />
          </div>
          <Select
            label="รูปแบบ"
            value={str(content.style) || 'primary'}
            onChange={(e) => set('style', e.target.value)}
            options={[
              { value: 'primary', label: 'หลัก (สีเน้น)' },
              { value: 'secondary', label: 'รอง (เส้นขอบ)' },
              { value: 'success', label: 'สำเร็จ' },
              { value: 'danger', label: 'อันตราย' },
            ]}
          />
        </>
      ) : null}

      {block.blockType === 'spacer' ? (
        <Input
          label="ความสูง (px)"
          mono
          inputMode="numeric"
          value={String(num(content.height, 40))}
          onChange={(e) => set('height', Math.max(0, Math.min(200, Number.parseInt(e.target.value, 10) || 0)))}
          helperText="0–200"
        />
      ) : null}

      {block.blockType === 'html' ? (
        <Textarea
          label="HTML"
          rows={12}
          className="font-mono text-xs"
          value={str(content.html)}
          onChange={(e) => set('html', e.target.value)}
          helperText="แสดงผลตามที่เขียนโดยไม่กรอง ตรวจโค้ดก่อนบันทึกทุกครั้ง"
        />
      ) : null}

      {block.blockType === 'product-list' ? (
        <>
          <Input
            label="จำนวนสินค้า"
            mono
            inputMode="numeric"
            value={String(num(content.limit, 8))}
            onChange={(e) => set('limit', Math.max(1, Math.min(24, Number.parseInt(e.target.value, 10) || 1)))}
            helperText="1–24"
          />
          <Checkbox checked={!!content.featured} onChange={(e) => set('featured', e.target.checked)} label="แสดงเฉพาะสินค้าแนะนำ" />
        </>
      ) : null}

      {block.blockType === 'video' ? (
        <>
          <Input label="ลิงก์วิดีโอ" mono value={str(content.url)} placeholder="https://www.youtube.com/watch?v=" onChange={(e) => set('url', e.target.value)} />
          <Checkbox checked={!!content.autoplay} onChange={(e) => set('autoplay', e.target.checked)} label="เล่นอัตโนมัติ (ปิดเสียง)" />
        </>
      ) : null}

      {block.blockType === 'countdown' ? (
        <>
          <Input label="หัวข้อ" value={str(content.title)} placeholder="กิจกรรมจะจบใน" onChange={(e) => set('title', e.target.value)} />
          <Input label="สิ้นสุด" type="datetime-local" mono value={str(content.endDate)} onChange={(e) => set('endDate', e.target.value)} helperText="เวลาประเทศไทย" />
        </>
      ) : null}

      {block.blockType === 'divider' ? (
        <Select
          label="รูปแบบเส้น"
          value={str(content.style) || 'solid'}
          onChange={(e) => set('style', e.target.value)}
          options={[
            { value: 'solid', label: 'เส้นทึบ' },
            { value: 'dashed', label: 'เส้นประ' },
            { value: 'dotted', label: 'จุด' },
          ]}
        />
      ) : null}
    </form>
  );
}
