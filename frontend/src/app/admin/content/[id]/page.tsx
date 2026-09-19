'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Settings,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  X,
  Image as ImageIcon,
  Type,
  FileText,
  Layout,
  Video,
  Code,
  Minus,
  Grid3X3,
  Clock,
  List,
  MessageSquare,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

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

const blockIcons: Record<string, any> = {
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

export default function PageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pageId = parseInt(params.id as string);

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pageSettings, setPageSettings] = useState({
    title: '',
    slug: '',
    description: '',
    pageType: 'custom',
    metaTitle: '',
    metaDescription: '',
    layout: 'default',
  });

  // Fetch page data
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['admin-page', pageId],
    queryFn: () => contentApi.getPageById(pageId).then(res => res.data),
    enabled: !!pageId,
  });

  // Fetch block types
  const { data: blockTypesData } = useQuery({
    queryKey: ['block-types'],
    queryFn: () => contentApi.getBlockTypes().then(res => res.data),
  });

  // Update page settings when data loads
  useEffect(() => {
    if (pageData?.page) {
      setPageSettings({
        title: pageData.page.title,
        slug: pageData.page.slug,
        description: pageData.page.description || '',
        pageType: pageData.page.pageType,
        metaTitle: pageData.page.metaTitle || '',
        metaDescription: pageData.page.metaDescription || '',
        layout: pageData.page.layout,
      });
    }
  }, [pageData]);

  // Update page mutation
  const updatePageMutation = useMutation({
    mutationFn: (data: any) => contentApi.updatePage(pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
    },
  });

  // Create block mutation
  const createBlockMutation = useMutation({
    mutationFn: (data: { blockType: string; content: any }) =>
      contentApi.createBlock(pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
      setShowAddBlock(false);
    },
  });

  // Update block mutation
  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, data }: { blockId: number; data: any }) =>
      contentApi.updateBlock(blockId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
      setEditingBlock(null);
    },
  });

  // Delete block mutation
  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: number) => contentApi.deleteBlock(blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
    },
  });

  // Reorder blocks mutation
  const reorderBlocksMutation = useMutation({
    mutationFn: (blockOrders: { id: number; sortOrder: number }[]) =>
      contentApi.reorderBlocks(pageId, blockOrders),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-page', pageId] });
    },
  });

  const handleAddBlock = (blockType: BlockType) => {
    createBlockMutation.mutate({
      blockType: blockType.type,
      content: blockType.defaultContent,
    });
  };

  const handleMoveBlock = (blockId: number, direction: 'up' | 'down') => {
    if (!pageData?.page?.blocks) return;

    const blocks = [...pageData.page.blocks];
    const index = blocks.findIndex((b: ContentBlock) => b.id === blockId);

    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === blocks.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];

    const blockOrders = blocks.map((block: ContentBlock, i: number) => ({
      id: block.id,
      sortOrder: i,
    }));

    reorderBlocksMutation.mutate(blockOrders);
  };

  const handleToggleBlockVisibility = (block: ContentBlock) => {
    updateBlockMutation.mutate({
      blockId: block.id,
      data: { isVisible: !block.isVisible },
    });
  };

  const handleSaveSettings = () => {
    updatePageMutation.mutate(pageSettings);
    setShowSettings(false);
  };

  const handleTogglePublish = () => {
    updatePageMutation.mutate({ isPublished: !pageData?.page?.isPublished });
  };

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    onConfirm?: () => void;
    singleButton?: boolean;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const showConfirmModal = ({
    title,
    content,
    onConfirm,
    variant = 'default',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    singleButton = false,
  }: {
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    confirmText?: string;
    cancelText?: string;
    singleButton?: boolean;
  }) => {
    setModalConfig({
      isOpen: true,
      title,
      content,
      onConfirm: onConfirm
        ? () => {
          onConfirm();
          closeModal();
        }
        : singleButton ? closeModal : undefined,
      variant,
      confirmText,
      cancelText,
      singleButton,
    });
  };

  // ESC to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddBlock(false);
        setEditingBlock(null);
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  if (!pageData?.page) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-400">ไม่พบหน้าที่ต้องการ</p>
        <Link href="/admin/content" className="text-emerald-400 hover:underline mt-2 inline-block">
          กลับไปรายการหน้า
        </Link>
      </div>
    );
  }

  const page = pageData.page;
  const blocks = page.blocks || [];
  const blockTypes = blockTypesData?.blockTypes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/content"
            className="p-2 rounded-lg bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              {page.title}
            </h1>
            <p className="text-sm text-gray-400">/{page.slug}</p>
          </div>

          {/* Status badge */}
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium border ${page.isPublished
              ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              }`}
          >
            {page.isPublished ? 'Published' : 'Draft'}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Preview */}
          <a
            href={`/p/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Preview
          </a>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Publish/Unpublish */}
          <button
            onClick={handleTogglePublish}
            disabled={updatePageMutation.isPending}
            className={`px-4 py-2 rounded-xl border transition-colors flex items-center gap-2 ${page.isPublished
              ? 'bg-yellow-500/20 border-yellow-500/30 hover:border-yellow-500/50 text-yellow-400'
              : 'bg-green-500/20 border-green-500/30 hover:border-green-500/50 text-green-400'
              }`}
          >
            {page.isPublished ? (
              <>
                <EyeOff className="h-4 w-4" />
                Unpublish
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Publish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-4">
        {blocks.length === 0 ? (
          <GlassCard>
            <div className="text-center py-16">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl"></div>
                <Layout className="h-16 w-16 text-emerald-400/50 relative mx-auto" />
              </div>
              <p className="text-gray-400 text-lg mb-4">ยังไม่มี Content Block</p>
              <Button onClick={() => setShowAddBlock(true)}>
                <Plus className="h-4 w-4 mr-2" />
                เพิ่ม Block แรก
              </Button>
            </div>
          </GlassCard>
        ) : (
          <>
            {blocks.map((block: ContentBlock, index: number) => {
              const IconComponent = blockIcons[block.blockType] || FileText;
              return (
                <GlassCard key={block.id} glowOnHover>
                  <div className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Drag handle */}
                      <div className="text-gray-500 cursor-move">
                        <GripVertical className="h-5 w-5" />
                      </div>

                      {/* Block type icon */}
                      <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                        <IconComponent className="h-5 w-5 text-emerald-400" />
                      </div>

                      {/* Block info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">
                            {block.blockType.replace('-', ' ')}
                          </span>
                          {!block.isVisible && (
                            <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-1">
                          {getBlockPreview(block)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {/* Move up */}
                        <button
                          onClick={() => handleMoveBlock(block.id, 'up')}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>

                        {/* Move down */}
                        <button
                          onClick={() => handleMoveBlock(block.id, 'down')}
                          disabled={index === blocks.length - 1}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>

                        {/* Toggle visibility */}
                        <button
                          onClick={() => handleToggleBlockVisibility(block)}
                          className={`p-1.5 rounded-lg transition-colors ${block.isVisible
                            ? 'hover:bg-white/10'
                            : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                        >
                          {block.isVisible ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => setEditingBlock(block)}
                          className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            showConfirmModal({
                              title: 'ลบ Content Block?',
                              content: <p>คุณต้องการลบ Block นี้ใช่หรือไม่? การกระทำนี้ไม่สามารถเรียกคืนได้</p>,
                              variant: 'danger',
                              confirmText: 'ลบ',
                              onConfirm: () => deleteBlockMutation.mutate(block.id),
                            });
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}

            {/* Add Block Button */}
            <button
              onClick={() => setShowAddBlock(true)}
              className="w-full py-4 rounded-xl border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-5 w-5" />
              เพิ่ม Block
            </button>
          </>
        )}
      </div>

      {/* Add Block Modal */}
      {showAddBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowAddBlock(false)}
          ></div>

          <div className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <GlassCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    เพิ่ม Block
                  </h2>
                  <button
                    onClick={() => setShowAddBlock(false)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {blockTypes.map((blockType: BlockType) => {
                    const IconComponent = blockIcons[blockType.type] || FileText;
                    return (
                      <button
                        key={blockType.type}
                        onClick={() => handleAddBlock(blockType)}
                        disabled={createBlockMutation.isPending}
                        className="p-4 rounded-xl bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 group-hover:bg-emerald-500/30 transition-colors">
                            <IconComponent className="h-5 w-5 text-emerald-400" />
                          </div>
                          <span className="text-2xl">{blockType.icon}</span>
                        </div>
                        <h3 className="font-medium mb-1">{blockType.name}</h3>
                        <p className="text-xs text-gray-500">{blockType.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Edit Block Modal */}
      {editingBlock && (
        <BlockEditor
          block={editingBlock}
          onSave={(content, settings) =>
            updateBlockMutation.mutate({
              blockId: editingBlock.id,
              data: { content, settings },
            })
          }
          onClose={() => setEditingBlock(null)}
          isPending={updateBlockMutation.isPending}
        />
      )}

      {/* Page Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          ></div>

          <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <GlassCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    ตั้งค่าหน้า
                  </h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ชื่อหน้า</label>
                    <input
                      type="text"
                      value={pageSettings.title}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, title: e.target.value })
                      }
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Slug (URL)</label>
                    <div className="flex items-center">
                      <span className="px-3 py-2 bg-black/40 border border-r-0 border-emerald-500/30 rounded-l-xl text-gray-500">
                        /p/
                      </span>
                      <input
                        type="text"
                        value={pageSettings.slug}
                        onChange={(e) =>
                          setPageSettings({
                            ...pageSettings,
                            slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                          })
                        }
                        className="input rounded-l-none flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">คำอธิบาย</label>
                    <textarea
                      value={pageSettings.description}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, description: e.target.value })
                      }
                      rows={3}
                      className="input w-full resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ประเภทหน้า</label>
                    <select
                      value={pageSettings.pageType}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, pageType: e.target.value })
                      }
                      className="input w-full"
                    >
                      <option value="custom">กำหนดเอง</option>
                      <option value="home">หน้าหลัก</option>
                      <option value="promotion">โปรโมชั่น</option>
                      <option value="event">อีเวนท์</option>
                      <option value="info">ข้อมูล</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Layout</label>
                    <select
                      value={pageSettings.layout}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, layout: e.target.value })
                      }
                      className="input w-full"
                    >
                      <option value="default">Default</option>
                      <option value="full-width">Full Width</option>
                      <option value="sidebar">With Sidebar</option>
                    </select>
                  </div>

                  <hr className="border-gray-700" />

                  <h3 className="font-medium text-gray-300">SEO</h3>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Meta Title</label>
                    <input
                      type="text"
                      value={pageSettings.metaTitle}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, metaTitle: e.target.value })
                      }
                      className="input w-full"
                      placeholder={pageSettings.title}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Meta Description</label>
                    <textarea
                      value={pageSettings.metaDescription}
                      onChange={(e) =>
                        setPageSettings({ ...pageSettings, metaDescription: e.target.value })
                      }
                      rows={2}
                      className="input w-full resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 rounded-xl border border-gray-500/30 hover:border-gray-500/50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <Button
                    onClick={handleSaveSettings}
                    disabled={updatePageMutation.isPending}
                  >
                    {updatePageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    บันทึก
                  </Button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Laser Modal */}
      <Dialog open={modalConfig.isOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modalConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-iris-muted">
            {modalConfig.content}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            {!modalConfig.singleButton && (
              <Button variant="outline" onClick={closeModal}>
                {modalConfig.cancelText || 'ยกเลิก'}
              </Button>
            )}
            <Button
              variant={modalConfig.variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                modalConfig.onConfirm?.();
                closeModal();
              }}
            >
              {modalConfig.confirmText || 'ตกลง'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function to get block preview text
function getBlockPreview(block: ContentBlock): string {
  const content = block.content;
  switch (block.blockType) {
    case 'heading':
      return content.text || 'Empty heading';
    case 'text':
      return content.text?.substring(0, 100) || 'Empty text';
    case 'image':
      return content.url ? 'Image set' : 'No image';
    case 'gallery':
      return `${content.images?.length || 0} images`;
    case 'banner':
      return content.title || 'Banner';
    case 'button':
      return content.text || 'Button';
    case 'divider':
      return 'Divider';
    case 'spacer':
      return `${content.height || 40}px spacer`;
    case 'html':
      return content.html ? 'Custom HTML' : 'Empty HTML';
    case 'product-list':
      return `${content.limit || 8} products`;
    case 'countdown':
      return content.endDate || 'Countdown';
    case 'video':
      return content.url || 'No video';
    case 'accordion':
      return `${content.items?.length || 0} items`;
    case 'tabs':
      return `${content.tabs?.length || 0} tabs`;
    default:
      return block.blockType;
  }
}

// Block Editor Component
function BlockEditor({
  block,
  onSave,
  onClose,
  isPending,
}: {
  block: ContentBlock;
  onSave: (content: any, settings: any) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState(block.content);
  const [settings, setSettings] = useState(block.settings || {});

  const handleSave = () => {
    onSave(content, settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <GlassCard>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent capitalize">
                แก้ไข {block.blockType.replace('-', ' ')}
              </h2>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Block-specific editor */}
              {block.blockType === 'heading' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ข้อความ</label>
                    <input
                      type="text"
                      value={content.text || ''}
                      onChange={(e) => setContent({ ...content, text: e.target.value })}
                      className="input w-full"
                      placeholder="หัวข้อ..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ระดับหัวข้อ</label>
                    <select
                      value={content.level || 2}
                      onChange={(e) => setContent({ ...content, level: parseInt(e.target.value) })}
                      className="input w-full"
                    >
                      <option value={1}>H1 - ใหญ่สุด</option>
                      <option value={2}>H2 - ใหญ่</option>
                      <option value={3}>H3 - กลาง</option>
                      <option value={4}>H4 - เล็ก</option>
                      <option value={5}>H5 - เล็กมาก</option>
                      <option value={6}>H6 - เล็กสุด</option>
                    </select>
                  </div>
                </>
              )}

              {block.blockType === 'text' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ข้อความ (รองรับ Markdown)</label>
                  <textarea
                    value={content.text || ''}
                    onChange={(e) => setContent({ ...content, text: e.target.value })}
                    rows={8}
                    className="input w-full resize-none font-mono text-sm"
                    placeholder="เขียนข้อความที่นี่..."
                  />
                </div>
              )}

              {block.blockType === 'image' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">URL รูปภาพ</label>
                    <input
                      type="text"
                      value={content.url || ''}
                      onChange={(e) => setContent({ ...content, url: e.target.value })}
                      className="input w-full"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Alt Text</label>
                    <input
                      type="text"
                      value={content.alt || ''}
                      onChange={(e) => setContent({ ...content, alt: e.target.value })}
                      className="input w-full"
                      placeholder="คำอธิบายรูปภาพ..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Caption</label>
                    <input
                      type="text"
                      value={content.caption || ''}
                      onChange={(e) => setContent({ ...content, caption: e.target.value })}
                      className="input w-full"
                      placeholder="คำอธิบายใต้รูป..."
                    />
                  </div>
                  {content.url && (
                    <div className="mt-4">
                      <img src={content.url} alt={content.alt} className="max-h-48 rounded-lg" />
                    </div>
                  )}
                </>
              )}

              {block.blockType === 'banner' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">รูปพื้นหลัง</label>
                    <input
                      type="text"
                      value={content.imageUrl || ''}
                      onChange={(e) => setContent({ ...content, imageUrl: e.target.value })}
                      className="input w-full"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">หัวข้อ</label>
                    <input
                      type="text"
                      value={content.title || ''}
                      onChange={(e) => setContent({ ...content, title: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">หัวข้อรอง</label>
                    <input
                      type="text"
                      value={content.subtitle || ''}
                      onChange={(e) => setContent({ ...content, subtitle: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">ข้อความปุ่ม</label>
                      <input
                        type="text"
                        value={content.buttonText || ''}
                        onChange={(e) => setContent({ ...content, buttonText: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Link ปุ่ม</label>
                      <input
                        type="text"
                        value={content.buttonLink || ''}
                        onChange={(e) => setContent({ ...content, buttonLink: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                  </div>
                </>
              )}

              {block.blockType === 'button' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ข้อความ</label>
                    <input
                      type="text"
                      value={content.text || ''}
                      onChange={(e) => setContent({ ...content, text: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Link</label>
                    <input
                      type="text"
                      value={content.link || ''}
                      onChange={(e) => setContent({ ...content, link: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Style</label>
                    <select
                      value={content.style || 'primary'}
                      onChange={(e) => setContent({ ...content, style: e.target.value })}
                      className="input w-full"
                    >
                      <option value="primary">Primary (Purple)</option>
                      <option value="secondary">Secondary (Outline)</option>
                      <option value="success">Success (Green)</option>
                      <option value="danger">Danger (Red)</option>
                    </select>
                  </div>
                </>
              )}

              {block.blockType === 'spacer' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ความสูง (px)</label>
                  <input
                    type="number"
                    value={content.height || 40}
                    onChange={(e) => setContent({ ...content, height: parseInt(e.target.value) })}
                    className="input w-full"
                    min={0}
                    max={200}
                  />
                </div>
              )}

              {block.blockType === 'html' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">HTML Code</label>
                  <textarea
                    value={content.html || ''}
                    onChange={(e) => setContent({ ...content, html: e.target.value })}
                    rows={10}
                    className="input w-full resize-none font-mono text-sm"
                    placeholder="<div>...</div>"
                  />
                </div>
              )}

              {block.blockType === 'product-list' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">จำนวนสินค้า</label>
                    <input
                      type="number"
                      value={content.limit || 8}
                      onChange={(e) => setContent({ ...content, limit: parseInt(e.target.value) })}
                      className="input w-full"
                      min={1}
                      max={24}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="featured"
                      checked={content.featured || false}
                      onChange={(e) => setContent({ ...content, featured: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="featured" className="text-sm text-gray-400">
                      แสดงเฉพาะสินค้าแนะนำ
                    </label>
                  </div>
                </>
              )}

              {block.blockType === 'video' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">URL วิดีโอ (YouTube/Embed)</label>
                    <input
                      type="text"
                      value={content.url || ''}
                      onChange={(e) => setContent({ ...content, url: e.target.value })}
                      className="input w-full"
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="autoplay"
                      checked={content.autoplay || false}
                      onChange={(e) => setContent({ ...content, autoplay: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="autoplay" className="text-sm text-gray-400">
                      เล่นอัตโนมัติ
                    </label>
                  </div>
                </>
              )}

              {block.blockType === 'countdown' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">หัวข้อ</label>
                    <input
                      type="text"
                      value={content.title || ''}
                      onChange={(e) => setContent({ ...content, title: e.target.value })}
                      className="input w-full"
                      placeholder="Event ends in..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">วันสิ้นสุด</label>
                    <input
                      type="datetime-local"
                      value={content.endDate || ''}
                      onChange={(e) => setContent({ ...content, endDate: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                </>
              )}

              {block.blockType === 'divider' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Style</label>
                  <select
                    value={content.style || 'solid'}
                    onChange={(e) => setContent({ ...content, style: e.target.value })}
                    className="input w-full"
                  >
                    <option value="solid">เส้นตรง</option>
                    <option value="dashed">เส้นประ</option>
                    <option value="dotted">จุด</option>
                    <option value="gradient">Gradient</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-500/30 hover:border-gray-500/50 transition-colors"
              >
                ยกเลิก
              </button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                บันทึก
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
