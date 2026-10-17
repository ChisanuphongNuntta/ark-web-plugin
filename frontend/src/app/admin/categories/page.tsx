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
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

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
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => adminApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof formData }) =>
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
      sortOrder: 0,
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <GlassCard variant="danger" className="p-12 text-center">
        <p className="text-rose-400 font-bold">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </GlassCard>
    );
  }

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
            <FolderOpen className="h-7 w-7 text-iris-cyan" />
            จัดการหมวดหมู่สินค้า
          </h1>
        </div>
        <Button
          variant="primary"
          onClick={openCreateModal}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          เพิ่มหมวดหมู่ใหม่
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.categories?.map((category: Category) => (
            <GlassCard key={category.id} hoverEffect="lift" className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan text-xl">
                      {category.icon || '📦'}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-iris-pearl">{category.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-iris-muted flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {category._count?.products || 0} สินค้า
                        </span>
                        {!category.isActive && (
                          <Badge variant="muted">ปิดใช้งาน</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {category.description && (
                  <p className="text-xs text-iris-muted mt-3 line-clamp-2">
                    {category.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(category)}
                  className="flex-1"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  แก้ไข
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteConfirm(category.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </GlassCard>
          ))}

          {(!data?.categories || data.categories.length === 0) && (
            <GlassCard className="col-span-full p-12 text-center">
              <FolderOpen className="mx-auto h-12 w-12 text-iris-muted/40 mb-3" />
              <p className="text-iris-muted">ยังไม่มีหมวดหมู่สินค้าในระบบ</p>
              <div className="mt-4">
                <Button variant="primary" onClick={openCreateModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  เพิ่มหมวดหมู่แรก
                </Button>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
            </DialogTitle>
            <DialogDescription>
              กำหนดชื่อ ไอคอน และลำดับการแสดงผลของหมวดหมู่สินค้า
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                ชื่อหมวดหมู่ *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="เช่น ไดโนเสาร์ Apex, อาวุธ Tek"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-iris-pearl focus:border-iris-cyan focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                คำอธิบาย
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="คำอธิบายสั้นๆ เกี่ยวกับหมวดหมู่นี้"
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-sm text-iris-pearl focus:border-iris-cyan focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                  ไอคอน (Icon Key / Emoji)
                </label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="เช่น 🦖, ⚔️, 🛡️"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-iris-pearl focus:border-iris-cyan focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                  ลำดับการแสดงผล
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-iris-pearl focus:border-iris-cyan focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="catIsActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-white/10 bg-black/50 text-iris-cyan focus:ring-iris-cyan"
              />
              <label htmlFor="catIsActive" className="text-xs text-iris-pearl cursor-pointer font-bold">
                เปิดใช้งานหมวดหมู่นี้ (Active)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={closeModal}>
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                {editingCategory ? 'บันทึกการแก้ไข' : 'สร้างหมวดหมู่'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบหมวดหมู่?</DialogTitle>
            <DialogDescription>
              การลบหมวดหมู่นี้อาจส่งผลต่อสินค้าที่อยู่ในหมวดหมู่ดังกล่าว คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              isLoading={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
            >
              ยืนยันการลบ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
