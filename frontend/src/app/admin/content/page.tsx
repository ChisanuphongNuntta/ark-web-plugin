'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/lib/api';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
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
  X,
  Globe,
  Calendar,
  Layers,
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
  _count: {
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
  const [newPage, setNewPage] = useState({
    slug: '',
    title: '',
    description: '',
    pageType: 'custom',
  });

  // Fetch pages
  const { data, isLoading } = useQuery({
    queryKey: ['admin-pages', search, pageType],
    queryFn: () => contentApi.getPages({ search, pageType }).then(res => res.data),
  });

  // Create page mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => contentApi.createPage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
      setShowCreateModal(false);
      setNewPage({ slug: '', title: '', description: '', pageType: 'custom' });
    },
  });

  // Delete page mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => contentApi.deletePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
      setShowDeleteModal(null);
    },
  });

  // Duplicate page mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: number) => contentApi.duplicatePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    },
  });

  // Toggle publish mutation
  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      contentApi.updatePage(id, { isPublished }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    },
  });

  const handleCreatePage = () => {
    if (!newPage.slug || !newPage.title) return;
    createMutation.mutate(newPage);
  };

  const getPageTypeLabel = (type: string) => {
    return pageTypes.find(t => t.value === type)?.label || type;
  };

  const getPageTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      home: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      promotion: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      event: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      info: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    return colors[type] || colors.custom;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-2xl"></div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent relative flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-lg animate-pulse"></div>
              <LayoutGrid className="h-8 w-8 text-emerald-400 relative" />
            </div>
            Content Builder
          </h1>
        </div>

        <LaserButton onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          สร้างหน้าใหม่
        </LaserButton>
      </div>

      {/* Filters */}
      <LaserCard glowOnHover>
        <div className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/5 rounded-xl blur-sm pointer-events-none"></div>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-400 z-10" />
                <input
                  type="text"
                  placeholder="ค้นหาหน้า..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-10 relative"
                />
              </div>
            </div>

            {/* Page Type Filter */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-md"></div>
                <Filter className="h-5 w-5 text-cyan-400 relative" />
              </div>
              <select
                value={pageType}
                onChange={(e) => setPageType(e.target.value)}
                className="input w-48"
              >
                {pageTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </LaserCard>

      {/* Pages List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
          </div>
        </div>
      ) : data?.pages?.length === 0 ? (
        <LaserCard>
          <div className="text-center py-16">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl"></div>
              <FileText className="h-16 w-16 text-emerald-400/50 relative mx-auto" />
            </div>
            <p className="text-gray-400 text-lg mb-4">ยังไม่มีหน้าที่สร้างไว้</p>
            <LaserButton onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              สร้างหน้าแรก
            </LaserButton>
          </div>
        </LaserCard>
      ) : (
        <div className="grid gap-4">
          {data?.pages?.map((page: DynamicPage) => (
            <LaserCard key={page.id} glowOnHover>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Status indicator */}
                    <div className="relative">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          page.isPublished ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                      ></div>
                      {page.isPublished && (
                        <div className="absolute inset-0 bg-green-500 rounded-full blur-md animate-pulse"></div>
                      )}
                    </div>

                    {/* Page info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg">{page.title}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs border ${getPageTypeColor(
                            page.pageType
                          )}`}
                        >
                          {getPageTypeLabel(page.pageType)}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3.5 w-3.5" />/{page.slug}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {page._count.blocks} blocks
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(page.updatedAt).toLocaleDateString('th-TH')}
                        </span>
                      </div>

                      {page.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                          {page.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Preview */}
                    <a
                      href={`/p/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors"
                      title="Preview"
                    >
                      <ExternalLink className="h-4 w-4 text-emerald-400" />
                    </a>

                    {/* Toggle Publish */}
                    <button
                      onClick={() =>
                        togglePublishMutation.mutate({
                          id: page.id,
                          isPublished: !page.isPublished,
                        })
                      }
                      className={`p-2 rounded-lg border transition-colors ${
                        page.isPublished
                          ? 'bg-green-500/20 border-green-500/30 hover:border-green-500/50'
                          : 'bg-black/40 border-gray-500/30 hover:border-gray-500/50'
                      }`}
                      title={page.isPublished ? 'Unpublish' : 'Publish'}
                    >
                      {page.isPublished ? (
                        <Eye className="h-4 w-4 text-green-400" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    {/* Duplicate */}
                    <button
                      onClick={() => duplicateMutation.mutate(page.id)}
                      className="p-2 rounded-lg bg-black/40 border border-cyan-500/30 hover:border-cyan-500/50 transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4 text-cyan-400" />
                    </button>

                    {/* Edit */}
                    <Link
                      href={`/admin/content/${page.id}`}
                      className="p-2 rounded-lg bg-black/40 border border-blue-500/30 hover:border-blue-500/50 transition-colors"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4 text-blue-400" />
                    </Link>

                    {/* Delete */}
                    <button
                      onClick={() => setShowDeleteModal(page)}
                      className="p-2 rounded-lg bg-black/40 border border-red-500/30 hover:border-red-500/50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </LaserCard>
          ))}
        </div>
      )}

      {/* Create Page Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          ></div>

          <div className="relative z-10 w-full max-w-md">
            <LaserCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    สร้างหน้าใหม่
                  </h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      ชื่อหน้า <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newPage.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setNewPage({
                          ...newPage,
                          title,
                          slug: title
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/(^-|-$)/g, ''),
                        });
                      }}
                      placeholder="Summer Event 2024"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Slug (URL) <span className="text-red-400">*</span>
                    </label>
                    <div className="flex items-center">
                      <span className="px-3 py-2 bg-black/40 border border-r-0 border-emerald-500/30 rounded-l-xl text-gray-500">
                        /p/
                      </span>
                      <input
                        type="text"
                        value={newPage.slug}
                        onChange={(e) =>
                          setNewPage({
                            ...newPage,
                            slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, ''),
                          })
                        }
                        placeholder="summer-event-2024"
                        className="input rounded-l-none flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ประเภทหน้า</label>
                    <select
                      value={newPage.pageType}
                      onChange={(e) => setNewPage({ ...newPage, pageType: e.target.value })}
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
                    <label className="block text-sm text-gray-400 mb-1">คำอธิบาย</label>
                    <textarea
                      value={newPage.description}
                      onChange={(e) => setNewPage({ ...newPage, description: e.target.value })}
                      placeholder="คำอธิบายสั้นๆ เกี่ยวกับหน้านี้..."
                      rows={3}
                      className="input w-full resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl border border-gray-500/30 hover:border-gray-500/50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <LaserButton
                    onClick={handleCreatePage}
                    disabled={!newPage.slug || !newPage.title || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    สร้างหน้า
                  </LaserButton>
                </div>
              </div>
            </LaserCard>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(null)}
          ></div>

          <div className="relative z-10 w-full max-w-md">
            <LaserCard>
              <div className="p-6">
                <div className="text-center mb-6">
                  <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl"></div>
                    <Trash2 className="h-12 w-12 text-red-400 relative mx-auto" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">ยืนยันการลบ</h2>
                  <p className="text-gray-400">
                    คุณต้องการลบหน้า &quot;{showDeleteModal.title}&quot; หรือไม่?
                    <br />
                    <span className="text-red-400 text-sm">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                  </p>
                </div>

                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowDeleteModal(null)}
                    className="px-4 py-2 rounded-xl border border-gray-500/30 hover:border-gray-500/50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(showDeleteModal.id)}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 transition-colors flex items-center"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    ลบหน้า
                  </button>
                </div>
              </div>
            </LaserCard>
          </div>
        </div>
      )}
    </div>
  );
}
