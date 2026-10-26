'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Clock, Code, Eye, EyeOff, FileText, Grid3X3, Image as ImageIcon, Layout, List, Loader2, MessageSquare, Minus, Pencil, Plus, Save, Settings, ShoppingCart, Trash2, Type, Video, type LucideIcon } from 'lucide-react';
import { ArrowLeft, ExternalLink } from '@/components/tek/arrows';
import {
  AdminButton,
  AdminDialog,
  AdminField,
  AdminIconButton,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  ConfirmDialog,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import { AdminAccessGate } from '@/components/admin/console/ConsoleBits';
import { contentApi } from '@/lib/api';

interface ContentBlock {
  id: number;
  pageId: number;
  blockType: string;
  content: any;
  settings: any;
  sortOrder: number;
  isVisible: boolean;
}

interface BlockType {
  type: string;
  name: string;
  icon: string;
  description: string;
  defaultContent: any;
}

interface PageSettings {
  title: string;
  slug: string;
  description: string;
  pageType: string;
  metaTitle: string;
  metaDescription: string;
  layout: string;
}

const BLOCK_ICONS: Record<string, LucideIcon> = {
  heading: Type,
  text: FileText,
  image: ImageIcon,
  gallery: Grid3X3,
  banner: Layout,
  grid: Grid3X3,
  button: ExternalLink,
  divider: Minus,
  spacer: Layout,
  html: Code,
  'product-list': ShoppingCart,
  countdown: Clock,
  video: Video,
  accordion: List,
  tabs: MessageSquare,
};

const BLOCK_LABEL: Record<string, string> = {
  heading: 'หัวข้อ',
  text: 'ข้อความ',
  image: 'รูปภาพ',
  gallery: 'แกลเลอรี',
  banner: 'แบนเนอร์',
  grid: 'กริด',
  button: 'ปุ่ม',
  divider: 'เส้นคั่น',
  spacer: 'ระยะห่าง',
  html: 'HTML',
  'product-list': 'รายการสินค้า',
  countdown: 'นับถอยหลัง',
  video: 'วิดีโอ',
  accordion: 'หัวข้อพับได้',
  tabs: 'แท็บ',
};

const PAGE_TYPE_OPTIONS = [
  { value: 'custom', label: 'กำหนดเอง' },
  { value: 'home', label: 'หน้าหลัก' },
  { value: 'promotion', label: 'โปรโมชั่น' },
  { value: 'event', label: 'อีเวนท์' },
  { value: 'info', label: 'ข้อมูล' },
];

const LAYOUT_OPTIONS = [
  { value: 'default', label: 'มาตรฐาน' },
  { value: 'full-width', label: 'เต็มความกว้าง' },
  { value: 'sidebar', label: 'มีแถบด้านข้าง' },
];

const EMPTY_SETTINGS: PageSettings = {
  title: '',
  slug: '',
  description: '',
  pageType: 'custom',
  metaTitle: '',
  metaDescription: '',
  layout: 'default',
};

function blockLabel(type: string): string {
  return BLOCK_LABEL[type] ?? type.replace(/-/g, ' ');
}

function apiErrorText(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

function settingsFromPage(page: any): PageSettings {
  return {
    title: page.title ?? '',
    slug: page.slug ?? '',
    description: page.description || '',
    pageType: page.pageType || 'custom',
    metaTitle: page.metaTitle || '',
    metaDescription: page.metaDescription || '',
    layout: page.layout || 'default',
  };
}

export default function PageEditorPage() {
  return (
    <AdminAccessGate allow={['admin', 'root']}>
      <PageEditor />
    </AdminAccessGate>
  );
}

function PageEditor() {
  const params = useParams();
  const queryClient = useQueryClient();
  const pageId = parseInt(String(params.id ?? ''), 10);
  const validId = Number.isFinite(pageId) && pageId > 0;

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<ContentBlock | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>(EMPTY_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const { data: pageData, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-page', pageId],
    queryFn: () => contentApi.getPageById(pageId).then((res) => res.data),
    enabled: validId,
  });

  const { data: blockTypesData } = useQuery({
    queryKey: ['block-types'],
    queryFn: () => contentApi.getBlockTypes().then((res) => res.data),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
    // Keep the paginated list (status, block count) in sync.
    void queryClient.invalidateQueries({ queryKey: ['admin-content-pages'] });
  };
  const fail = (fallback: string) => (error: unknown) => setNotice({ tone: 'danger', text: apiErrorText(error, fallback) });

  const updatePageMutation = useMutation({
    mutationFn: (data: Partial<PageSettings> & { isPublished?: boolean }) => contentApi.updatePage(pageId, data),
    onSuccess: refresh,
  });

  const createBlockMutation = useMutation({
    mutationFn: (data: { blockType: string; content: any }) => contentApi.createBlock(pageId, data),
    onSuccess: () => {
      refresh();
      setShowAddBlock(false);
      setNotice({ tone: 'success', text: 'เพิ่มบล็อกแล้ว' });
    },
    onError: fail('เพิ่มบล็อกไม่สำเร็จ'),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, data }: { blockId: number; data: any }) => contentApi.updateBlock(blockId, data),
    onSuccess: refresh,
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: number) => contentApi.deleteBlock(blockId),
    onSuccess: () => {
      refresh();
      setNotice({ tone: 'success', text: 'ลบบล็อกแล้ว' });
    },
  });

  const reorderBlocksMutation = useMutation({
    mutationFn: (blockOrders: { id: number; sortOrder: number }[]) => contentApi.reorderBlocks(pageId, blockOrders),
    onSuccess: refresh,
    onError: fail('จัดลำดับบล็อกไม่สำเร็จ'),
  });

  if (!validId || isError || (!isLoading && !pageData?.page)) {
    return (
      <AdminPage>
        <AdminNotice tone="danger" title={isError ? 'โหลดหน้าไม่สำเร็จ' : 'ไม่พบหน้าที่ต้องการ'}>
          <div className="mt-2 flex flex-wrap gap-2">
            {isError && (
              <AdminButton size="sm" onClick={() => void refetch()}>
                ลองอีกครั้ง
              </AdminButton>
            )}
            <Link href="/admin/content" className="btn-secondary min-h-9 px-3.5 py-1.5 text-xs">
              กลับไปรายการหน้า
            </Link>
          </div>
        </AdminNotice>
      </AdminPage>
    );
  }

  if (isLoading || !pageData?.page) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="กำลังโหลด">
        <Loader2 className="h-7 w-7 animate-spin text-iris-cyan" aria-hidden="true" />
      </div>
    );
  }

  const page = pageData.page;
  const blocks: ContentBlock[] = page.blocks || [];
  const blockTypes: BlockType[] = blockTypesData?.blockTypes || [];
  const published = Boolean(page.isPublished);
  const busy = updatePageMutation.isPending || reorderBlocksMutation.isPending;

  const handleMoveBlock = (blockId: number, direction: 'up' | 'down') => {
    if (reorderBlocksMutation.isPending) return;
    const ordered = [...blocks];
    const index = ordered.findIndex((b) => b.id === blockId);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || newIndex < 0 || newIndex >= ordered.length) return;
    [ordered[index], ordered[newIndex]] = [ordered[newIndex], ordered[index]];
    reorderBlocksMutation.mutate(ordered.map((b, i) => ({ id: b.id, sortOrder: i })));
  };

  const handleToggleBlockVisibility = (block: ContentBlock) => {
    updateBlockMutation.mutate(
      { blockId: block.id, data: { isVisible: !block.isVisible } },
      { onError: fail('เปลี่ยนการแสดงผลบล็อกไม่สำเร็จ') },
    );
  };

  const handleTogglePublish = () => {
    updatePageMutation.mutate(
      { isPublished: !published },
      {
        onSuccess: () => setNotice({ tone: 'success', text: published ? 'ปิดการเผยแพร่แล้ว' : 'เผยแพร่หน้าแล้ว' }),
        onError: fail('เปลี่ยนสถานะการเผยแพร่ไม่สำเร็จ'),
      },
    );
  };

  const openSettings = () => {
    setPageSettings(settingsFromPage(page));
    setSettingsError(null);
    setShowSettings(true);
  };

  const closeSettings = () => {
    if (!updatePageMutation.isPending) setShowSettings(false);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (updatePageMutation.isPending) return;
    if (!pageSettings.title.trim() || !pageSettings.slug.trim()) {
      setSettingsError('กรุณากรอกชื่อหน้าและ URL slug');
      return;
    }
    setSettingsError(null);
    updatePageMutation.mutate(
      { ...pageSettings, title: pageSettings.title.trim(), slug: pageSettings.slug.trim() },
      {
        onSuccess: () => {
          setShowSettings(false);
          setNotice({ tone: 'success', text: 'บันทึกการตั้งค่าหน้าแล้ว' });
        },
        onError: (error) => setSettingsError(apiErrorText(error, 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง')),
      },
    );
  };

  const setSetting = <K extends keyof PageSettings>(key: K, value: PageSettings[K]) =>
    setPageSettings((s) => ({ ...s, [key]: value }));

  // Keep an unknown stored layout (e.g. "contained" from the create form) selectable so saving doesn't change it.
  const layoutOptions = LAYOUT_OPTIONS.some((o) => o.value === pageSettings.layout)
    ? LAYOUT_OPTIONS
    : [...LAYOUT_OPTIONS, { value: pageSettings.layout, label: pageSettings.layout }];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="PAGE EDITOR"
        title={page.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">/p/{page.slug}</span>
            <StatusBadge tone={published ? 'success' : 'neutral'} dot>
              {published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
            </StatusBadge>
          </span>
        }
        actions={
          <>
            <Link href="/admin/content" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              รายการหน้า
            </Link>
            <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              ดูตัวอย่าง
            </a>
            <AdminButton icon={<Settings />} onClick={openSettings}>
              ตั้งค่าหน้า
            </AdminButton>
            <AdminButton
              variant="primary"
              icon={published ? <EyeOff /> : <Eye />}
              loading={updatePageMutation.isPending && !showSettings}
              disabled={busy}
              onClick={handleTogglePublish}
            >
              {published ? 'ปิดการเผยแพร่' : 'เผยแพร่'}
            </AdminButton>
          </>
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel
        title="บล็อกเนื้อหา"
        description={blocks.length > 0 ? `${blocks.length.toLocaleString('th-TH')} บล็อก เรียงจากบนลงล่าง` : undefined}
        actions={
          blocks.length > 0 ? (
            <AdminButton size="sm" variant="primary" icon={<Plus />} onClick={() => setShowAddBlock(true)}>
              เพิ่มบล็อก
            </AdminButton>
          ) : undefined
        }
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Layout className="h-10 w-10 text-iris-muted/60" aria-hidden="true" />
            <p className="text-sm text-iris-muted">หน้านี้ยังไม่มีบล็อกเนื้อหา</p>
            <AdminButton variant="primary" icon={<Plus />} onClick={() => setShowAddBlock(true)}>
              เพิ่มบล็อกแรก
            </AdminButton>
          </div>
        ) : (
          <ol className="space-y-2" aria-busy={reorderBlocksMutation.isPending || undefined}>
            {blocks.map((block, index) => {
              const Icon = BLOCK_ICONS[block.blockType] ?? FileText;
              const label = blockLabel(block.blockType);
              return (
                <li
                  key={block.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-iris-midnight/60 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-6 shrink-0 text-right font-mono text-xs text-iris-muted">{index + 1}</span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                      <Icon className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-iris-pearl">{label}</span>
                        {!block.isVisible && (
                          <StatusBadge tone="warning">ซ่อนอยู่</StatusBadge>
                        )}
                      </div>
                      <p className="line-clamp-1 text-xs text-iris-muted">{getBlockPreview(block)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <AdminIconButton
                      aria-label={`เลื่อนบล็อก ${label} ขึ้น`}
                      disabled={index === 0 || reorderBlocksMutation.isPending}
                      onClick={() => handleMoveBlock(block.id, 'up')}
                    >
                      <ChevronUp />
                    </AdminIconButton>
                    <AdminIconButton
                      aria-label={`เลื่อนบล็อก ${label} ลง`}
                      disabled={index === blocks.length - 1 || reorderBlocksMutation.isPending}
                      onClick={() => handleMoveBlock(block.id, 'down')}
                    >
                      <ChevronDown />
                    </AdminIconButton>
                    <AdminIconButton
                      aria-label={block.isVisible ? `ซ่อนบล็อก ${label}` : `แสดงบล็อก ${label}`}
                      onClick={() => handleToggleBlockVisibility(block)}
                    >
                      {block.isVisible ? <Eye /> : <EyeOff />}
                    </AdminIconButton>
                    <AdminIconButton aria-label={`แก้ไขบล็อก ${label}`} onClick={() => setEditingBlock(block)}>
                      <Pencil />
                    </AdminIconButton>
                    <AdminIconButton tone="danger" aria-label={`ลบบล็อก ${label}`} onClick={() => setDeletingBlock(block)}>
                      <Trash2 />
                    </AdminIconButton>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </AdminPanel>

      {/* Add block */}
      <AdminDialog
        open={showAddBlock}
        onClose={() => {
          if (!createBlockMutation.isPending) setShowAddBlock(false);
        }}
        busy={createBlockMutation.isPending}
        size="lg"
        title="เพิ่มบล็อก"
        description="เลือกชนิดบล็อกที่ต้องการ บล็อกใหม่จะต่อท้ายหน้า"
      >
        {blockTypes.length === 0 ? (
          <p className="py-6 text-center text-sm text-iris-muted">กำลังโหลดชนิดบล็อก…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {blockTypes.map((bt) => {
              const Icon = BLOCK_ICONS[bt.type] ?? FileText;
              return (
                <button
                  key={bt.type}
                  type="button"
                  onClick={() => createBlockMutation.mutate({ blockType: bt.type, content: bt.defaultContent })}
                  disabled={createBlockMutation.isPending}
                  className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-iris-midnight">
                    <Icon className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-iris-pearl">{bt.name}</span>
                  {bt.description && <span className="text-xs text-iris-muted">{bt.description}</span>}
                </button>
              );
            })}
          </div>
        )}
      </AdminDialog>

      {/* Edit block (keyed so state resets per block) */}
      {editingBlock && (
        <BlockEditor
          key={editingBlock.id}
          block={editingBlock}
          isPending={updateBlockMutation.isPending}
          onClose={() => {
            if (!updateBlockMutation.isPending) setEditingBlock(null);
          }}
          onSave={(content, settings) =>
            updateBlockMutation.mutateAsync({ blockId: editingBlock.id, data: { content, settings } }).then(() => {
              setEditingBlock(null);
              setNotice({ tone: 'success', text: 'บันทึกบล็อกแล้ว' });
            })
          }
        />
      )}

      {/* Page settings */}
      <AdminDialog
        open={showSettings}
        onClose={closeSettings}
        busy={updatePageMutation.isPending}
        title="ตั้งค่าหน้า"
        description="ชื่อ URL ประเภท และข้อมูล SEO ของหน้า"
        footer={
          <>
            <AdminButton variant="secondary" onClick={closeSettings} disabled={updatePageMutation.isPending}>
              ยกเลิก
            </AdminButton>
            <AdminButton
              variant="primary"
              type="submit"
              form="page-settings-form"
              loading={updatePageMutation.isPending}
              icon={<Save />}
            >
              บันทึก
            </AdminButton>
          </>
        }
      >
        <form id="page-settings-form" onSubmit={handleSaveSettings} noValidate className="space-y-4">
          {settingsError && <AdminNotice tone="danger">{settingsError}</AdminNotice>}
          <AdminField label="ชื่อหน้า" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={pageSettings.title}
                onChange={(e) => setSetting('title', e.target.value)}
                className={adminInputClass}
              />
            )}
          </AdminField>
          <AdminField label="URL slug" required hint={`/p/${pageSettings.slug || '…'}`}>
            {(field) => (
              <input
                {...field}
                type="text"
                value={pageSettings.slug}
                onChange={(e) => setSetting('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className={`${adminInputClass} font-mono`}
              />
            )}
          </AdminField>
          <AdminField label="คำอธิบาย">
            {(field) => (
              <textarea
                {...field}
                rows={3}
                value={pageSettings.description}
                onChange={(e) => setSetting('description', e.target.value)}
                className={`${adminInputClass} resize-y`}
              />
            )}
          </AdminField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdminField label="ประเภทหน้า">
              {(field) => (
                <select
                  {...field}
                  value={pageSettings.pageType}
                  onChange={(e) => setSetting('pageType', e.target.value)}
                  className={adminInputClass}
                >
                  {PAGE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </AdminField>
            <AdminField label="เลย์เอาต์">
              {(field) => (
                <select
                  {...field}
                  value={pageSettings.layout}
                  onChange={(e) => setSetting('layout', e.target.value)}
                  className={adminInputClass}
                >
                  {layoutOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </AdminField>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            <p className="eyebrow">SEO</p>
          </div>
          <AdminField label="Meta title" hint="เว้นว่างเพื่อใช้ชื่อหน้า">
            {(field) => (
              <input
                {...field}
                type="text"
                value={pageSettings.metaTitle}
                placeholder={pageSettings.title}
                onChange={(e) => setSetting('metaTitle', e.target.value)}
                className={adminInputClass}
              />
            )}
          </AdminField>
          <AdminField label="Meta description">
            {(field) => (
              <textarea
                {...field}
                rows={2}
                value={pageSettings.metaDescription}
                onChange={(e) => setSetting('metaDescription', e.target.value)}
                className={`${adminInputClass} resize-y`}
              />
            )}
          </AdminField>
        </form>
      </AdminDialog>

      <ConfirmDialog
        open={deletingBlock !== null}
        onClose={() => setDeletingBlock(null)}
        onConfirm={() => deleteBlockMutation.mutateAsync(deletingBlock!.id)}
        title="ลบบล็อกนี้?"
        description={
          deletingBlock ? `บล็อก “${blockLabel(deletingBlock.blockType)}” จะถูกลบถาวร ไม่สามารถย้อนกลับได้` : undefined
        }
        confirmText="ลบบล็อก"
      />
    </AdminPage>
  );
}

function getBlockPreview(block: ContentBlock): string {
  const content = block.content ?? {};
  switch (block.blockType) {
    case 'heading':
      return content.text || 'หัวข้อว่าง';
    case 'text':
      return content.text?.substring(0, 100) || 'ข้อความว่าง';
    case 'image':
      return content.url ? 'ตั้งค่ารูปแล้ว' : 'ยังไม่มีรูป';
    case 'gallery':
      return `${content.images?.length || 0} รูป`;
    case 'banner':
      return content.title || 'แบนเนอร์';
    case 'button':
      return content.text || 'ปุ่ม';
    case 'divider':
      return 'เส้นคั่น';
    case 'spacer':
      return `ระยะห่าง ${content.height || 40}px`;
    case 'html':
      return content.html ? 'HTML กำหนดเอง' : 'HTML ว่าง';
    case 'product-list':
      return `${content.limit || 8} สินค้า`;
    case 'countdown':
      return content.endDate || 'นับถอยหลัง';
    case 'video':
      return content.url || 'ยังไม่มีวิดีโอ';
    case 'accordion':
      return `${content.items?.length || 0} รายการ`;
    case 'tabs':
      return `${content.tabs?.length || 0} แท็บ`;
    default:
      return block.blockType;
  }
}

function BlockEditor({
  block,
  onSave,
  onClose,
  isPending,
}: {
  block: ContentBlock;
  onSave: (content: any, settings: any) => Promise<void>;
  onClose: () => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState<any>(block.content ?? {});
  const [settings] = useState<any>(block.settings || {});
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: unknown) => setContent((c: any) => ({ ...c, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    onSave(content, settings).catch((err: unknown) => setError(apiErrorText(err, 'บันทึกบล็อกไม่สำเร็จ')));
  };

  const textField = (key: string, label: string, placeholder?: string) => (
    <AdminField label={label}>
      {(field) => (
        <input
          {...field}
          type="text"
          value={content[key] || ''}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value)}
          className={adminInputClass}
        />
      )}
    </AdminField>
  );

  const checkField = (key: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-sm text-iris-pearl transition hover:border-white/15">
      <input
        type="checkbox"
        checked={Boolean(content[key])}
        onChange={(e) => set(key, e.target.checked)}
        className="h-4 w-4 shrink-0 accent-iris-cyan"
      />
      {label}
    </label>
  );

  const known = [
    'heading', 'text', 'image', 'banner', 'button', 'spacer', 'html', 'product-list', 'video', 'countdown', 'divider',
  ].includes(block.blockType);

  return (
    <AdminDialog
      open
      onClose={onClose}
      busy={isPending}
      size="lg"
      title={`แก้ไขบล็อก${blockLabel(block.blockType)}`}
      footer={
        <>
          <AdminButton variant="secondary" onClick={onClose} disabled={isPending}>
            ยกเลิก
          </AdminButton>
          <AdminButton variant="primary" type="submit" form="block-editor-form" loading={isPending} icon={<Save />}>
            บันทึก
          </AdminButton>
        </>
      }
    >
      <form id="block-editor-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <AdminNotice tone="danger">{error}</AdminNotice>}

        {block.blockType === 'heading' && (
          <>
            {textField('text', 'ข้อความ', 'หัวข้อ…')}
            <AdminField label="ระดับหัวข้อ">
              {(field) => (
                <select
                  {...field}
                  value={content.level || 2}
                  onChange={(e) => set('level', parseInt(e.target.value, 10))}
                  className={adminInputClass}
                >
                  <option value={1}>H1 - ใหญ่สุด</option>
                  <option value={2}>H2 - ใหญ่</option>
                  <option value={3}>H3 - กลาง</option>
                  <option value={4}>H4 - เล็ก</option>
                  <option value={5}>H5 - เล็กมาก</option>
                  <option value={6}>H6 - เล็กสุด</option>
                </select>
              )}
            </AdminField>
          </>
        )}

        {block.blockType === 'text' && (
          <AdminField label="ข้อความ" hint="รองรับ Markdown">
            {(field) => (
              <textarea
                {...field}
                rows={8}
                value={content.text || ''}
                placeholder="เขียนข้อความที่นี่…"
                onChange={(e) => set('text', e.target.value)}
                className={`${adminInputClass} resize-y font-mono text-sm`}
              />
            )}
          </AdminField>
        )}

        {block.blockType === 'image' && (
          <>
            {textField('url', 'URL รูปภาพ', 'https://…')}
            {textField('alt', 'คำอธิบายรูป (alt)', 'คำอธิบายรูปภาพ…')}
            {textField('caption', 'คำบรรยายใต้รูป', 'ข้อความใต้รูป…')}
            {content.url && (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary URL
              <img src={content.url} alt={content.alt || ''} className="max-h-48 rounded-lg border border-white/[0.08]" />
            )}
          </>
        )}

        {block.blockType === 'banner' && (
          <>
            {textField('imageUrl', 'รูปพื้นหลัง', 'https://…')}
            {textField('title', 'หัวข้อ')}
            {textField('subtitle', 'หัวข้อรอง')}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {textField('buttonText', 'ข้อความปุ่ม')}
              {textField('buttonLink', 'ลิงก์ปุ่ม')}
            </div>
          </>
        )}

        {block.blockType === 'button' && (
          <>
            {textField('text', 'ข้อความ')}
            {textField('link', 'ลิงก์')}
            <AdminField label="รูปแบบปุ่ม">
              {(field) => (
                <select
                  {...field}
                  value={content.style || 'primary'}
                  onChange={(e) => set('style', e.target.value)}
                  className={adminInputClass}
                >
                  <option value="primary">หลัก</option>
                  <option value="secondary">รอง (เส้นขอบ)</option>
                  <option value="success">สำเร็จ</option>
                  <option value="danger">อันตราย</option>
                </select>
              )}
            </AdminField>
          </>
        )}

        {block.blockType === 'spacer' && (
          <AdminField label="ความสูง (px)" hint="0–200">
            {(field) => (
              <input
                {...field}
                type="number"
                min={0}
                max={200}
                value={content.height ?? 40}
                onChange={(e) => set('height', parseInt(e.target.value, 10) || 0)}
                className={adminInputClass}
              />
            )}
          </AdminField>
        )}

        {block.blockType === 'html' && (
          <AdminField label="โค้ด HTML">
            {(field) => (
              <textarea
                {...field}
                rows={10}
                value={content.html || ''}
                placeholder="<div>…</div>"
                onChange={(e) => set('html', e.target.value)}
                className={`${adminInputClass} resize-y font-mono text-sm`}
              />
            )}
          </AdminField>
        )}

        {block.blockType === 'product-list' && (
          <>
            <AdminField label="จำนวนสินค้า" hint="1–24">
              {(field) => (
                <input
                  {...field}
                  type="number"
                  min={1}
                  max={24}
                  value={content.limit ?? 8}
                  onChange={(e) => set('limit', parseInt(e.target.value, 10) || 1)}
                  className={adminInputClass}
                />
              )}
            </AdminField>
            {checkField('featured', 'แสดงเฉพาะสินค้าแนะนำ')}
          </>
        )}

        {block.blockType === 'video' && (
          <>
            {textField('url', 'URL วิดีโอ (YouTube/Embed)', 'https://www.youtube.com/watch?v=…')}
            {checkField('autoplay', 'เล่นอัตโนมัติ')}
          </>
        )}

        {block.blockType === 'countdown' && (
          <>
            {textField('title', 'หัวข้อ', 'อีเวนท์จะจบใน…')}
            <AdminField label="วันสิ้นสุด">
              {(field) => (
                <input
                  {...field}
                  type="datetime-local"
                  value={content.endDate || ''}
                  onChange={(e) => set('endDate', e.target.value)}
                  className={adminInputClass}
                />
              )}
            </AdminField>
          </>
        )}

        {block.blockType === 'divider' && (
          <AdminField label="รูปแบบเส้น">
            {(field) => (
              <select
                {...field}
                value={content.style || 'solid'}
                onChange={(e) => set('style', e.target.value)}
                className={adminInputClass}
              >
                <option value="solid">เส้นตรง</option>
                <option value="dashed">เส้นประ</option>
                <option value="dotted">จุด</option>
                <option value="gradient">ไล่สี</option>
              </select>
            )}
          </AdminField>
        )}

        {!known && (
          <p className="text-sm text-iris-muted">บล็อกชนิดนี้ยังไม่มีตัวแก้ไขในหน้านี้ กดบันทึกเพื่อเก็บค่าเดิม</p>
        )}
      </form>
    </AdminDialog>
  );
}
