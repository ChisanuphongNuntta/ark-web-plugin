'use client';

import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';


import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { adminApi, productApi } from '@/lib/api';
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  Filter,
  Package,
  Image as ImageIcon,
  Tag,
  Layers,
  Save,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { ProductArtwork } from '@/components/ProductArtwork';
import { expandBlueprintPath, COMMON_BLUEPRINT_PRESETS } from '@/lib/blueprintHelper';

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  itemBlueprint: string;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: number | null;
  category?: { id: number; name: string };
  imageUrl?: string | null; // Added
  sortOrder?: number; // Added
}

interface Category {
  id: number;
  name: string;
}

export default function AdminProductsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'visuals' | 'game'>('basic');
  const [search, setSearch] = useState('');
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const [formData, setFormData] = useState({
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
  });

  const { data: productsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => adminApi.getProducts().then((res) => res.data),
    enabled: !!user?.isAdmin,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productApi.getCategories().then((res) => res.data),
    enabled: !!user?.isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });

  const openModal = (product?: Product) => {
    setActiveTab('basic');
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price,
        itemBlueprint: product.itemBlueprint,
        quantity: product.quantity,
        quality: product.quality,
        isBlueprint: product.isBlueprint,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        categoryId: product.categoryId?.toString() || '',
        imageUrl: product.imageUrl || '',
        sortOrder: product.sortOrder || 0,
      });
    } else {
      setEditingProduct(null);
      setFormData({
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
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...formData,
      itemBlueprint: expandBlueprintPath(formData.itemBlueprint),
      price: Number(formData.price),
      quantity: Number(formData.quantity),
      quality: Number(formData.quality),
      categoryId: formData.categoryId ? Number(formData.categoryId) : null,
      sortOrder: Number(formData.sortOrder),
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Generic Confirmation Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const closeModalState = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const showConfirmModal = ({
    title,
    content,
    onConfirm,
    variant = 'default',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
  }: {
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    confirmText?: string;
    cancelText?: string;
  }) => {
    setModalConfig({
      isOpen: true,
      title,
      content,
      onConfirm: onConfirm
        ? () => {
          onConfirm();
          closeModalState();
        }
        : undefined,
      variant,
      confirmText,
      cancelText,
    });
  };

  const handleDelete = (product: Product) => {
    showConfirmModal({
      title: 'ลบสินค้า?',
      content: <p>คุณต้องการลบสินค้า <strong className="text-white">{product.name}</strong> หรือไม่?</p>,
      onConfirm: () => deleteMutation.mutate(product.id),
      variant: 'danger',
      confirmText: 'ลบถาวร',
    });
  };

  const filteredProducts = productsData?.products?.filter((p: Product) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? p.categoryId?.toString() === categoryFilter : true;
    return matchesSearch && matchesCategory && (!draftsOnly || !p.isActive);
  });

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
            &larr; กลับ Admin
          </Link>
          <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
            <Package className="h-8 w-8 text-emerald-400" />
            จัดการสินค้า
          </h1>
        </div>
        <Button onClick={() => openModal()} icon={<Plus className="h-5 w-5" />}>
          เพิ่มสินค้า
        </Button>
      </div>

      <div className="frozen-editorial-card flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg">ตรวจราคาและข้อมูลก่อนเปิดขาย</h2><p className="text-sm text-iris-muted">รายการร่างยังไม่ปรากฏในร้านค้า ตรวจรูป ราคา และการส่งของก่อนเปิดใช้งาน</p></div><button className="btn-secondary" aria-pressed={draftsOnly} onClick={()=>{setDraftsOnly(!draftsOnly);setPage(1);}}>{draftsOnly?'แสดงทั้งหมด':'ดูรายการรอตรวจ'}</button></div>
      {/* Filters */}
      <GlassCard glowOnHover>
        <div className="p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาสินค้า..."
              value={search}
              onChange={(e) => {setSearch(e.target.value);setPage(1);}}
              className="input pl-10 w-full"
            />
          </div>
          <div className="w-full md:w-64 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => {setCategoryFilter(e.target.value);setPage(1);}}
              className="input pl-10 w-full appearance-none"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categoriesData?.categories?.map((cat: Category) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {isError && <ErrorMessage title="โหลดรายการสินค้าไม่สำเร็จ" message="กรุณาลองใหม่อีกครั้ง" onRetry={() => refetch()} />}
      {/* Products Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts?.slice((page - 1) * 24, page * 24).map((product: Product) => (
            <GlassCard key={product.id} className="group relative overflow-hidden flex flex-col h-full hover:border-emerald-500/50 transition-colors">
              {/* Image / Icon */}
              <div className="h-40 bg-black/40 relative flex items-center justify-center overflow-hidden">
                <ProductArtwork
                  product={product}
                  alt={product.name}
                  className="h-full w-full transition-transform group-hover:scale-105"
                />

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {product.isFeatured && (
                    <span className="px-2 py-0.5 rounded bg-iris-gold/20 text-iris-gold text-xs font-bold border border-iris-gold/30 backdrop-blur-sm">
                      แนะนำ
                    </span>
                  )}
                  {!product.isActive && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30 backdrop-blur-sm">
                      ปิดใช้งาน
                    </span>
                  )}
                </div>

                <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity">
                  <button
                    onClick={() => openModal(product)}
                    aria-label={`แก้ไข ${product.name}`}
                    className="p-2 bg-black/60 rounded-lg hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    aria-label={`ลบ ${product.name}`}
                    className="p-2 bg-black/60 rounded-lg hover:bg-red-500 text-white transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!product.imageUrl && <p className="px-4 pt-3 text-xs text-amber-200">รอตรวจรูปภาพสินค้า</p>}
              {/* Content */}
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg leading-tight line-clamp-2">{product.name}</h3>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700/50 text-gray-300">
                    {product.category?.name || 'Uncategorized'}
                  </span>
                  {product.isBlueprint && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      BP
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-800">
                  <div className="text-emerald-400 font-mono font-bold text-lg">
                    {product.price.toLocaleString()} IC
                  </div>
                  <div className="text-xs text-gray-500">
                    ID: {product.id}
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}

          {/* Add New Card (Empty State) */}
          <button
            onClick={() => openModal()}
            className="h-full min-h-[300px] rounded-xl border-2 border-dashed border-gray-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center justify-center gap-3 group"
          >
            <div className="p-4 rounded-full bg-gray-800 group-hover:bg-emerald-500/20 text-gray-400 group-hover:text-emerald-400 transition-colors">
              <Plus className="h-8 w-8" />
            </div>
            <span className="text-gray-400 group-hover:text-emerald-400 font-medium">เพิ่มสินค้าใหม่</span>
          </button>
        </div>
      )}

      <nav aria-label="หน้ารายการสินค้า" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-iris-muted">{filteredProducts?.length || 0} รายการ · หน้า {page} / {Math.max(1, Math.ceil((filteredProducts?.length || 0) / 24))}</p>
        <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button><Button variant="secondary" disabled={page * 24 >= (filteredProducts?.length || 0)} onClick={() => setPage(page + 1)}>ถัดไป</Button></div>
      </nav>
      {/* Editor Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-black/20">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                {editingProduct ? <Edit2 className="text-emerald-400" /> : <Plus className="text-emerald-400" />}
                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content with Sidebar */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Sidebar Tabs */}
              <div className="w-full md:w-56 shrink-0 bg-black/20 border-r border-gray-800 p-3 flex md:flex-col gap-2 overflow-auto">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${activeTab === 'basic'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-400 hover:bg-white/5'
                    }`}
                >
                  <Tag className="h-5 w-5" />
                  <div className="font-medium">ข้อมูลทั่วไป</div>
                </button>
                <button
                  onClick={() => setActiveTab('visuals')}
                  className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${activeTab === 'visuals'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-400 hover:bg-white/5'
                    }`}
                >
                  <ImageIcon className="h-5 w-5" />
                  <div className="font-medium">รูปภาพ & การแสดงผล</div>
                </button>
                <button
                  onClick={() => setActiveTab('game')}
                  className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${activeTab === 'game'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-400 hover:bg-white/5'
                    }`}
                >
                  <Layers className="h-5 w-5" />
                  <div className="font-medium">ข้อมูลเกม (Blueprint)</div>
                </button>
              </div>

              {/* Form Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-black/10">
                <form id="product-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                  {(createMutation.isError || updateMutation.isError) && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">บันทึกไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ กรุณาลองอีกครั้ง</p>}
                  {editingProduct && !editingProduct.isActive && <p className="rounded-xl border border-sky-200/20 bg-sky-100/5 p-3 text-sm text-sky-100">{editingProduct.description || 'ร่างรอตรวจราคา รูปภาพ และการส่งของก่อนเปิดขาย'}</p>}

                  {/* BASIC INFO TAB */}
                  {activeTab === 'basic' && (
                    <div className="space-y-4 animate-fadeIn">
                      <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-4 text-emerald-400">ข้อมูลทั่วไป</h3>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">ชื่อสินค้า *</label>
                          <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input w-full text-lg"
                            placeholder="เช่น Rex Saddle (Ascendant)"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">ราคา (IC) *</label>
                          <div className="relative">
                            <input
                              type="number"
                              required
                              min="0"
                              value={formData.price}
                              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                              className="input w-full pl-8 font-mono text-emerald-400 font-bold"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">$</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">หมวดหมู่</label>
                          <select
                            value={formData.categoryId}
                            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                            className="input w-full"
                          >
                            <option value="">-- เลือกหมวดหมู่ --</option>
                            {categoriesData?.categories?.map((cat: Category) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-1">รายละเอียด</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="input w-full h-32 resize-none leading-relaxed"
                          placeholder="รายละเอียดสินค้า..."
                        />
                      </div>
                    </div>
                  )}

                  {/* VISUALS TAB */}
                  {activeTab === 'visuals' && (
                    <div className="space-y-6 animate-fadeIn">
                      <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-4 text-emerald-400">รูปภาพและการแสดงผล</h3>

                      <div className="flex gap-6">
                        <div className="w-1/3">
                          <label className="block text-sm text-gray-400 mb-2">ตัวอย่างรูปภาพ</label>
                          <div className="aspect-square rounded-xl bg-black/40 border-2 border-dashed border-gray-700 flex items-center justify-center overflow-hidden relative">
                            {formData.imageUrl ? (
                              <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-center p-4">
                                <ImageIcon className="h-10 w-10 text-gray-600 mx-auto mb-2" />
                                <span className="text-xs text-gray-500">ใส่ URL เพื่อแสดงรูป</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 space-y-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Image URL</label>
                            <input
                              type="url"
                              value={formData.imageUrl}
                              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                              className="input w-full font-mono text-sm"
                              placeholder="https://example.com/image.jpg"
                            />
                            <p className="text-xs text-gray-500 mt-1">รองรับ JPG, PNG, WEBP</p>
                          </div>

                          <div>
                            <label className="block text-sm text-gray-400 mb-1">ลำดับการแสดง (Sort Order)</label>
                            <input
                              type="number"
                              value={formData.sortOrder}
                              onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                              className="input w-full"
                              placeholder="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">ตัวเลขมากจะแสดงก่อน (หรือตามการตั้งค่า)</p>
                          </div>

                          <div className="pt-2 space-y-3">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 cursor-pointer hover:border-emerald-500/50 transition-colors">
                              <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="w-5 h-5 accent-emerald-500"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-white">เปิดใช้งานสินค้า</div>
                                <div className="text-xs text-gray-500">แสดงในหน้าร้านค้า</div>
                              </div>
                              <div className={`w-3 h-3 rounded-full ${formData.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 cursor-pointer hover:border-iris-gold/50 transition-colors">
                              <input
                                type="checkbox"
                                checked={formData.isFeatured}
                                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                className="w-5 h-5 accent-amber-400"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-white">สินค้าแนะนำ</div>
                                <div className="text-xs text-gray-500">แสดงในส่วน Featured</div>
                              </div>
                              {formData.isFeatured && <div className="text-iris-gold">★</div>}
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GAME DATA TAB */}
                  {activeTab === 'game' && (
                    <div className="space-y-4 animate-fadeIn">
                      <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-4 text-emerald-400">ข้อมูลภายในเกม</h3>

                      <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl mb-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="flex items-center gap-2 font-bold text-blue-400">
                            <Layers className="h-4 w-4" />
                            Blueprint Path (รองรับชื่อสั้น & AI Format)
                          </h4>
                          <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Auto-Expand
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mb-2">
                          พิมพ์ชื่อไอเทมแบบสั้น, Path ย่อย หรือ Blueprint Path เต็มจาก ARK ได้ทันที <br />
                          <span className="text-xs text-gray-400">
                            ตัวอย่างแบบสั้น: <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">PrimalItemResource_Polymer</code> หรือ <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">PopOutCake/PrimalItemStructure_BirthdayCake</code>
                          </span>
                        </p>
                        <input
                          type="text"
                          required
                          value={formData.itemBlueprint}
                          onChange={(e) => setFormData({ ...formData, itemBlueprint: e.target.value })}
                          className="input w-full font-mono text-xs p-3 bg-black/50 border-blue-500/20 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                          placeholder="เช่น Polymer, Rex_Character_BP, PopOutCake/PrimalItemStructure_BirthdayCake หรือ Blueprint'/'"
                        />

                        {/* Realtime Blueprint Expansion & Helper */}
                        {formData.itemBlueprint ? (
                          <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-950/40 p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                                {formData.itemBlueprint.trim() !== expandBlueprintPath(formData.itemBlueprint)
                                  ? 'ระบบแปลงเป็น Path เต็มของ Unreal Engine ให้อัตโนมัติ:'
                                  : 'Path รูปแบบมาตรฐานของ ARK:'}
                              </span>
                              {formData.itemBlueprint.trim() !== expandBlueprintPath(formData.itemBlueprint) && (
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, itemBlueprint: expandBlueprintPath(formData.itemBlueprint) })}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-200 font-bold text-[11px] border border-cyan-400/40 transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Wand2 className="h-3 w-3" /> ขยายเป็น Path เต็ม
                                </button>
                              )}
                            </div>
                            <code className="block font-mono text-[11px] text-slate-200 break-all bg-black/60 p-2.5 rounded-lg border border-cyan-500/20 select-all">
                              {expandBlueprintPath(formData.itemBlueprint)}
                            </code>
                          </div>
                        ) : null}

                        {/* Quick Presets */}
                        <div className="mt-3 pt-3 border-t border-blue-500/20">
                          <p className="text-[11px] font-semibold text-gray-400 mb-2">
                            ⚡ รายการยอดนิยม (คลิกเพื่อใส่ Blueprint ทันที):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {COMMON_BLUEPRINT_PRESETS.map((preset) => (
                              <button
                                key={preset.shortPath}
                                type="button"
                                onClick={() =>
                                  setFormData({
                                    ...formData,
                                    itemBlueprint: preset.shortPath,
                                    name: formData.name || preset.label.split(' (')[0],
                                  })
                                }
                                className="rounded-lg bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/40 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">จำนวนที่ได้รับ</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">ระดับคุณภาพ (Quality)</label>
                          <select
                            value={formData.quality}
                            onChange={(e) => setFormData({ ...formData, quality: Number(e.target.value) })}
                            className="input w-full"
                          >
                            <option value="0">Default / Primitive (ขาว)</option>
                            <option value="1">Ramshackle (เขียว)</option>
                            <option value="2">Apprentice (น้ำเงิน)</option>
                            <option value="3">Journeyman (ม่วง)</option>
                            <option value="4">Mastercraft (เหลือง)</option>
                            <option value="5">Ascendant (แดง)</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 cursor-pointer hover:border-blue-500/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={formData.isBlueprint}
                            onChange={(e) => setFormData({ ...formData, isBlueprint: e.target.checked })}
                            className="w-5 h-5 accent-blue-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-white">ให้เป็นใบ Blueprint</div>
                            <div className="text-xs text-gray-500">ผู้เล่นจะได้รับเป็นใบ Blueprint แทนไอเทมสำเร็จรูป</div>
                          </div>
                          {formData.isBlueprint && <Layers className="h-4 w-4 text-blue-400" />}
                        </label>
                      </div>
                    </div>
                  )}

                </form>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-800 bg-black/20 flex justify-end gap-3">
              <Button variant="secondary" onClick={closeModal} disabled={createMutation.isPending || updateMutation.isPending}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                onClick={(e) => handleSubmit(e as any)}
                loading={createMutation.isPending || updateMutation.isPending}
                icon={<Save className="h-4 w-4" />}
              >
                {editingProduct ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Laser Modal for alerts */}
      <Dialog open={modalConfig?.isOpen ?? false} onOpenChange={(open) => !open && closeModal?.()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modalConfig?.title || 'แจ้งเตือน'}</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-iris-muted">
            {modalConfig?.content}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            {!(modalConfig as any)?.singleButton && (
              <Button variant="outline" onClick={closeModal}>
                {modalConfig?.cancelText || 'ยกเลิก'}
              </Button>
            )}
            <Button
              variant={modalConfig?.variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                modalConfig?.onConfirm?.();
                closeModal?.();
              }}
            >
              {modalConfig?.confirmText || 'ตกลง'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
