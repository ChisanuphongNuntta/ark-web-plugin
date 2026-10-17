'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  FileText,
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  LayoutGrid,
  Filter,
  Globe,
  Calendar,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

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
  _count?: {
    blocks: number;
  };
}

const pageTypes = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'home', label: 'หน้าหลัก' },
  { value: 'promotion', label: 'โปรโมชั่น' },
  { value: 'event', label: 'อีเวนท์' },
  { value: 'info', label: 'ข้อมูล' },
  { value: 'custom', label: 'กำหนดเอง' },
];

export default function AdminContentPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pageType, setPageType] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<DynamicPage | null>(null);

  // New page form
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPageType, setNewPageType] = useState('custom');
  const [newLayout, setNewLayout] = useState('contained');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pages', { search, pageType }],
    queryFn: () =>
      contentApi
        .getPages({
          pageType: pageType || undefined,
          search: search || undefined,
        })
        .then((res: any) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      contentApi.createPage({
        slug: newSlug,
        title: newTitle,
        description: newDescription || undefined,
        pageType: newPageType,
        layout: newLayout,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => contentApi.deletePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
      setShowDeleteModal(null);
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      contentApi.updatePage(id, { isPublished }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => contentApi.duplicatePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    },
  });

  const resetForm = () => {
    setNewSlug('');
    setNewTitle('');
    setNewDescription('');
    setNewPageType('custom');
    setNewLayout('contained');
  };

  const handleSlugChange = (title: string) => {
    setNewTitle(title);
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setNewSlug(slug);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              กลับ Admin
            </Button>
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-iris-pearl flex items-center gap-3">
            <LayoutGrid className="h-7 w-7 text-iris-cyan" />
            Content & Page Builder
          </h1>
        </div>

        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          สร้างหน้าใหม่
        </Button>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-iris-muted" />
            <input
              type="text"
              placeholder="ค้นหาหน้าตามชื่อหรือ Slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 pl-10 pr-4 py-2.5 text-xs text-iris-pearl placeholder:text-iris-muted focus:border-iris-cyan focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-iris-cyan" />
            <select
              value={pageType}
              onChange={(e) => setPageType(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-xs font-bold text-iris-pearl focus:border-iris-cyan focus:outline-none"
            >
              {pageTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Pages List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : data?.pages?.length === 0 ? (
        <GlassCard className="p-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-iris-muted/40 mb-3" />
          <p className="text-lg font-bold text-iris-pearl">ยังไม่มีหน้าที่สร้างไว้</p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              สร้างหน้าแรก
            </Button>
          </div>
        </GlassCard>
      ) : (
        <div className="grid gap-4">
          {data?.pages?.map((page: DynamicPage) => (
            <GlassCard key={page.id} hoverEffect="lift" className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-shrink-0">
                  <div className={`h-3 w-3 rounded-full ${page.isPublished ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  {page.isPublished && (
                    <div className="absolute inset-0 rounded-full bg-emerald-400 blur-sm animate-pulse" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-base text-iris-pearl">{page.title}</h3>
                    <Badge variant={page.isPublished ? 'cyan' : 'muted'}>
                      {page.isPublished ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-iris-muted mt-1 font-mono">
                    <span className="flex items-center gap-1 text-iris-cyan">
                      <Globe className="h-3 w-3" />
                      /p/{page.slug}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {page._count?.blocks || 0} บล็อก
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(page.updatedAt).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    togglePublishMutation.mutate({
                      id: page.id,
                      isPublished: !page.isPublished,
                    })
                  }
                  title={page.isPublished ? 'ปิดการเผยแพร่' : 'เผยแพร่'}
                >
                  {page.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => duplicateMutation.mutate(page.id)}
                  title="คัดลอกหน้า"
                >
                  <Copy className="h-4 w-4" />
                </Button>

                <Link href={`/p/${page.slug}`} target="_blank">
                  <Button variant="outline" size="sm" title="ดูหน้าเว็บจริง">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>

                <Link href={`/admin/content/${page.id}`}>
                  <Button variant="primary" size="sm">
                    <Edit className="h-4 w-4 mr-1.5" />
                    แก้ไขเนื้อหา
                  </Button>
                </Link>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteModal(page)}
                  title="ลบหน้า"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Create Page Dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>สร้างหน้าใหม่</DialogTitle>
            <DialogDescription>
              กำหนดชื่อ และ URL Slug สำหรับหน้าเว็บใหม่
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                ชื่อหน้า (Title) *
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="เช่น กิจกรรมแจกไดโนเสาร์ Alpha"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-iris-pearl focus:border-iris-cyan focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                URL Slug *
              </label>
              <div className="mt-1.5 flex rounded-xl border border-white/10 bg-black/50 overflow-hidden text-xs">
                <span className="px-3 py-2.5 text-iris-muted bg-white/5 border-r border-white/10">/p/</span>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-iris-pearl focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                ประเภทหน้า (Page Type)
              </label>
              <select
                value={newPageType}
                onChange={(e) => setNewPageType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-xs font-bold text-iris-pearl focus:border-iris-cyan focus:outline-none"
              >
                {pageTypes.filter((t) => t.value).map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                onClick={() => createMutation.mutate()}
                isLoading={createMutation.isPending}
                disabled={!newTitle || !newSlug}
              >
                สร้างหน้า
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(showDeleteModal)} onOpenChange={(open) => !open && setShowDeleteModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบหน้า?</DialogTitle>
            <DialogDescription>
              คุณต้องการลบหน้า &quot;{showDeleteModal?.title}&quot; หรือไม่? ข้อมูลบล็อกทั้งหมดในหน้านี้จะถูกลบถาวร
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              isLoading={deleteMutation.isPending}
              onClick={() => showDeleteModal && deleteMutation.mutate(showDeleteModal.id)}
            >
              ยืนยันการลบ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
