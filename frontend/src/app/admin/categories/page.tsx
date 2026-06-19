'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { productApi, adminApi } from '@/lib/api';
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  X,
  FolderOpen,
  Package,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';

interface Category {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: {
    products: number;
  };
}

export default function AdminCategoriesPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    sortOrder: 0,
    isActive: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => productApi.getCategories().then((res) => res.data),
    enabled: !!user?.isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      adminApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDeleteConfirm(null);
    },
  });

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      icon: '',
      sortOrder: (data?.categories?.length || 0) + 1,
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      icon: '',
      sortOrder: 0,
      isActive: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  // Common emoji icons for categories
  const commonIcons = ['📦', '🦖', '🐟', '🦎', '⛏️', '🗡️', '🎒', '🏠', '🔧', '✨', '🎮', '💎'];

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <LaserCard className="border-red-500/30">
        <div className="text-center py-12">
          <p className="text-red-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </div>
      </LaserCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
            &larr; กลับ Admin
          </Link>
          <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
            <FolderOpen className="h-8 w-8 text-emerald-400" />
            จัดการหมวดหมู่
          </h1>
        </div>
        <LaserButton
          variant="primary"
          onClick={openCreateModal}
          icon={<Plus className="h-5 w-5" />}
        >
          เพิ่มหมวดหมู่
        </LaserButton>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.categories?.map((category: Category) => (
            <LaserCard key={category.id} glowOnHover>
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-xl blur-lg"></div>
                      <div className="relative text-4xl p-2 bg-black/40 rounded-xl border border-emerald-500/20">
                        {category.icon || '📦'}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{category.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-400 flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {category._count?.products || 0} สินค้า
                        </span>
                        {!category.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                            ปิดใช้งาน
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {category.description && (
                  <p className="text-sm text-gray-400 mt-3 line-clamp-2">
                    {category.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-emerald-500/10">
                  <LaserButton
                    variant="secondary"
                    onClick={() => openEditModal(category)}
                    icon={<Edit2 className="h-4 w-4" />}
                    className="flex-1"
                  >
                    แก้ไข
                  </LaserButton>
                  <button
                    onClick={() => setDeleteConfirm(category.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                    title="ลบ"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </LaserCard>
          ))}

          {(!data?.categories || data.categories.length === 0) && (
            <LaserCard className="col-span-full">
              <div className="text-center py-12">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl"></div>
                  <FolderOpen className="h-16 w-16 text-emerald-400/50 relative mx-auto" />
                </div>
                <p className="text-gray-400">ยังไม่มีหมวดหมู่</p>
                <LaserButton
                  variant="primary"
                  onClick={openCreateModal}
                  icon={<Plus className="h-5 w-5" />}
                  className="mt-4"
                >
                  เพิ่มหมวดหมู่แรก
                </LaserButton>
              </div>
            </LaserCard>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <LaserCard className="w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  {editingCategory ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ชื่อหมวดหมู่ *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full"
                    placeholder="เช่น สัตว์บก, อาวุธ"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">รายละเอียด</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input w-full h-20 resize-none"
                    placeholder="รายละเอียดหมวดหมู่..."
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">ไอคอน (Emoji)</label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {commonIcons.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon })}
                        className={`p-2 text-xl rounded-lg transition-all ${
                          formData.icon === icon
                            ? 'bg-emerald-500/30 border border-emerald-500'
                            : 'bg-black/40 border border-emerald-500/20 hover:border-emerald-500/50'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="input w-full"
                    placeholder="หรือใส่ emoji เอง"
                    maxLength={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">ลำดับการแสดง</label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({ ...formData, sortOrder: Number(e.target.value) })
                      }
                      className="input w-full"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">สถานะ</label>
                    <select
                      value={formData.isActive ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.value === 'active' })
                      }
                      className="input w-full"
                    >
                      <option value="active">เปิดใช้งาน</option>
                      <option value="inactive">ปิดใช้งาน</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <LaserButton
                    type="submit"
                    variant="primary"
                    loading={createMutation.isPending || updateMutation.isPending}
                    className="flex-1"
                  >
                    {editingCategory ? 'บันทึก' : 'เพิ่มหมวดหมู่'}
                  </LaserButton>
                  <LaserButton type="button" variant="secondary" onClick={closeModal}>
                    ยกเลิก
                  </LaserButton>
                </div>
              </form>
            </div>
          </LaserCard>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <LaserCard className="w-full max-w-md mx-4 border-red-500/30">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-red-400">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500/30 rounded-full blur-lg"></div>
                  <AlertTriangle className="h-8 w-8 relative" />
                </div>
                <h2 className="text-xl font-bold">ยืนยันการลบ</h2>
              </div>

              <p className="text-gray-300 mb-2">คุณต้องการลบหมวดหมู่นี้หรือไม่?</p>
              <p className="text-sm text-gray-400 mb-6">
                สินค้าในหมวดหมู่นี้จะไม่ถูกลบ แต่จะไม่มีหมวดหมู่
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 btn bg-red-500 hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : (
                    'ลบหมวดหมู่'
                  )}
                </button>
                <LaserButton
                  variant="secondary"
                  onClick={() => setDeleteConfirm(null)}
                >
                  ยกเลิก
                </LaserButton>
              </div>
            </div>
          </LaserCard>
        </div>
      )}
    </div>
  );
}
