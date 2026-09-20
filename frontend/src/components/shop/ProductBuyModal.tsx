'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  CircleAlert,
  Coins,
  Minus,
  Plus,
  Server,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import { serverApi } from '@/lib/contracts/client';
import type { Product, ServerStatus } from '@/lib/contracts/types';
import { useCartStore } from '@/lib/store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProductArtwork } from '@/components/ProductArtwork';
import { categoryLabel } from '@/lib/catalogLabels';

const qualityConfig: Record<
  number,
  { label: string; tone: string; badge: 'default' | 'success' | 'info' | 'orchid' | 'gold' | 'cyan' }
> = {
  0: { label: 'PRIMITIVE', tone: 'text-slate-300', badge: 'default' },
  1: { label: 'RAMSHACKLE', tone: 'text-emerald-300', badge: 'success' },
  2: { label: 'APPRENTICE', tone: 'text-sky-300', badge: 'info' },
  3: { label: 'JOURNEYMAN', tone: 'text-iris-orchid', badge: 'orchid' },
  4: { label: 'MASTERCRAFT', tone: 'text-iris-gold', badge: 'gold' },
  5: { label: 'ASCENDANT', tone: 'text-iris-cyan', badge: 'cyan' },
};

interface ProductBuyModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductBuyModal({ product, isOpen, onClose }: ProductBuyModalProps) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);

  const [mounted, setMounted] = React.useState(false);
  const [quantity, setQuantity] = React.useState(1);
  const [selectedServerId, setSelectedServerId] = React.useState<number | null>(null);
  const [feedback, setFeedback] = React.useState<'idle' | 'added'>('idle');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const serversQuery = useQuery({
    queryKey: ['contract', 'servers'],
    queryFn: () => serverApi.listServers(),
    staleTime: 30_000,
    enabled: isOpen && !!product,
  });

  const servers = serversQuery.data?.servers ?? [];
  const quality = qualityConfig[product?.quality ?? 0] ?? qualityConfig[0];
  const isDino = product?.productType === 'dino';

  React.useEffect(() => {
    if (!isOpen) {
      setQuantity(1);
      setFeedback('idle');
      return;
    }
    const firstOnline = servers.find((s) => s.isOnline);
    if (firstOnline && selectedServerId === null) {
      setSelectedServerId(firstOnline.id);
    }
  }, [isOpen, servers, selectedServerId]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen || !product) return null;

  const serverUnavailable = serversQuery.isError || (!serversQuery.isLoading && servers.length === 0);
  const canAdd = selectedServerId !== null && !serversQuery.isLoading && !serverUnavailable;
  const totalPrice = product.price * quantity;

  const handleAddToCart = () => {
    if (!canAdd || selectedServerId === null) return;
    addItem(product.id, selectedServerId, quantity);
    setFeedback('added');
    window.setTimeout(() => setFeedback('idle'), 2200);
  };

  const handleCheckout = () => {
    if (!canAdd || selectedServerId === null) return;
    addItem(product.id, selectedServerId, quantity);
    onClose();
    router.push('/cart');
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] m-0 w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`สั่งซื้อ ${product.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-700/60 bg-[#0c1c2c] shadow-2xl transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4 bg-[#102637]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-iris-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
              {categoryLabel(product.category?.name || 'Items')}
              {product.isBlueprint ? ' · พิมพ์เขียว' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="ปิดหน้าต่างสั่งซื้อ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
            {/* Artwork */}
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-700/50 bg-[radial-gradient(ellipse_at_50%_40%,#28495a,#102637_75%)] flex items-center justify-center p-3">
              <ProductArtwork product={product} fit="contain" className="h-full w-full object-contain" />
              <div className="absolute top-2 left-2">
                <Badge variant={quality.badge}>{quality.label}</Badge>
              </div>
            </div>

            {/* Basic Info */}
            <div className="space-y-3">
              <h2 className="font-serif text-2xl font-normal text-iris-pearl leading-snug">
                {product.name}
              </h2>
              {product.description ? (
                <p className="text-xs text-iris-muted line-clamp-3 leading-relaxed">
                  {product.description}
                </p>
              ) : null}

              <div className="pt-2 flex items-baseline gap-2">
                <span className="text-xs uppercase tracking-wider text-iris-muted">ราคาต่อหน่วย:</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-iris-pearl">
                  {product.price.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-iris-gold">IC</span>
              </div>
            </div>
          </div>

          {/* Server Selection */}
          <div className="space-y-2 border-t border-slate-700/40 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-iris-pearl">
                <Server className="h-3.5 w-3.5 text-iris-cyan" /> เลือกเซิร์ฟเวอร์ปลายทาง
              </span>
              <span className="font-mono text-[10px] text-iris-muted">
                {servers.filter((s) => s.isOnline).length}/{servers.length} online
              </span>
            </div>

            {serversQuery.isLoading ? (
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-800" />
            ) : serverUnavailable ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
                <CircleAlert className="h-4 w-4 shrink-0 text-amber-400" />
                <span>ไม่พบเซิร์ฟเวอร์ที่พร้อมรับสินค้า กรุณาลองใหม่อีกครั้ง</span>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {servers.map((server: ServerStatus) => {
                  const isSelected = selectedServerId === server.id;
                  return (
                    <button
                      key={server.id}
                      type="button"
                      disabled={!server.isOnline}
                      onClick={() => setSelectedServerId(server.id)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-iris-cyan bg-iris-cyan/10 text-white shadow-[0_0_15px_rgba(160,224,244,0.15)]'
                          : server.isOnline
                          ? 'border-slate-700/50 bg-[#102637] text-slate-300 hover:border-slate-600 hover:text-white'
                          : 'border-slate-800 bg-black/20 text-slate-600 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate">{server.name}</p>
                        <p className="text-[10px] text-iris-muted">{server.map}</p>
                      </div>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          server.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quantity and Subtotal */}
          <div className="flex items-center justify-between border-t border-slate-700/40 pt-4">
            <div>
              <p className="text-xs font-bold text-iris-pearl">จำนวนสินค้า</p>
              <p className="text-[10px] text-iris-muted">
                ยอดรวม: <span className="font-mono text-sm font-bold text-iris-gold tabular-nums">{totalPrice.toLocaleString()} IC</span>
              </p>
            </div>
            <div className="flex items-center rounded-full border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                disabled={quantity <= 1 || isDino}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                aria-label="ลดจำนวน"
              >
                <Minus size={14} />
              </button>
              <output aria-label="จำนวนสินค้า" className="w-9 text-center font-mono text-sm font-bold text-iris-pearl">
                {quantity}
              </output>
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.min(99, v + 1))}
                disabled={quantity >= 99 || isDino}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                aria-label="เพิ่มจำนวน"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Feedback */}
          {feedback === 'added' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-300 animate-in fade-in">
              <Check className="h-4 w-4" /> เพิ่มสินค้าลงในตะกร้าเรียบร้อยแล้ว
            </div>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-700/50 bg-[#102637] p-5">
          <Button
            variant="secondary"
            disabled={!canAdd}
            onClick={handleAddToCart}
            leftIcon={feedback === 'added' ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            {feedback === 'added' ? 'เพิ่มแล้ว' : 'เพิ่มในตะกร้า'}
          </Button>
          <Button
            disabled={!canAdd}
            onClick={handleCheckout}
            rightIcon={<ChevronRight className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            ตรวจยอดและชำระ
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
