'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { useCartStore } from '@/lib/store';
import { productApi } from '@/lib/api';
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight, Coins, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';

interface CartProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category?: { name: string } | null;
}

export function CartDrawer() {
  const { items, isDrawerOpen, setDrawerOpen, removeItem, setQuantity } = useCartStore();
  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Fetch product data for all cart items in parallel
  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['product-drawer', item.productId],
      queryFn: () =>
        productApi.getById(item.productId).then((res) => (res.data.product ?? res.data) as CartProduct),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Esc key closure
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, setDrawerOpen]);

  // Calculate subtotal
  const subtotal = React.useMemo(() => {
    return items.reduce((sum, item, idx) => {
      const product = productQueries[idx]?.data;
      if (!product) return sum;
      return sum + product.price * item.quantity;
    }, 0);
  }, [items, productQueries]);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer container panel */}
          <motion.div
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-iris-ink border-l border-white/10 flex flex-col shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="ตะกร้าสินค้าของคุณ"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-iris-river/20 to-transparent">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-iris-cyan" />
                <h3 className="font-display font-bold text-base text-iris-pearl uppercase tracking-wide">ตะกร้าสินค้า</h3>
                <span className="font-mono text-xs bg-iris-cyan/10 text-iris-cyan px-2 py-0.5 rounded-full">
                  {items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น
                </span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-8 w-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-white/5 transition outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
                aria-label="ปิดตะกร้า"
              >
                <X className="h-4.5 w-4.5 text-iris-pearl" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-iris-muted py-12">
                  <ShoppingBag className="h-12 w-12 text-white/10 mb-4 animate-float-gentle" />
                  <p className="font-bold text-iris-pearl uppercase tracking-wide">ตะกร้าของคุณยังว่างเปล่า</p>
                  <p className="max-w-[200px] mt-1">เลือกซื้อไดโนเสาร์และอาวุธระดับสูงแล้วมาเติมพ้อยต์กันต่อ</p>
                  <Button variant="cyan" size="sm" className="mt-5" onClick={() => setDrawerOpen(false)}>
                    เลือกสินค้าเข้าร้าน
                  </Button>
                </div>
              ) : (
                items.map((item, index) => {
                  const query = productQueries[index];
                  const product = query?.data;

                  if (query?.isLoading) {
                    return (
                      <div key={item.productId} className="p-3 bg-white/2 border border-white/5 rounded-2xl flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-iris-cyan" />
                        <span className="text-xs text-iris-muted">กำลังดึงข้อมูล...</span>
                      </div>
                    );
                  }

                  if (!product) return null;

                  return (
                    <article
                      key={item.productId}
                      className="p-3.5 bg-black/30 border border-white/5 rounded-2xl flex gap-3.5 items-center relative overflow-hidden group hover:border-white/10 transition"
                    >
                      {/* Product image */}
                      <div className="h-16 w-16 bg-black/40 border border-white/10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl">📦</span>
                        )}
                      </div>

                      {/* Detail info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-iris-cyan uppercase">{product.category?.name || 'Store'}</p>
                        <h4 className="text-xs font-bold text-iris-pearl truncate uppercase">{product.name}</h4>
                        <div className="flex items-center gap-1 mt-1 text-xs font-bold text-iris-gold">
                          <Coins className="h-3.5 w-3.5" />
                          <span>{product.price.toLocaleString()} IC</span>
                        </div>
                      </div>

                      {/* Actions & Count controller */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="text-iris-muted hover:text-rose-400 p-1 rounded-full transition"
                          aria-label="ลบออกจากตะกร้า"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        
                        <div className="flex items-center bg-black/40 border border-white/10 rounded-full h-7">
                          <button
                            onClick={() => setQuantity(item.productId, item.quantity - 1)}
                            className="w-7 h-full flex items-center justify-center text-iris-muted hover:text-white"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center font-mono text-[11px] font-bold text-iris-pearl">{item.quantity}</span>
                          <button
                            onClick={() => setQuantity(item.productId, item.quantity + 1)}
                            className="w-7 h-full flex items-center justify-center text-iris-muted hover:text-white"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Footer Summary & Checkout route */}
            {items.length > 0 && (
              <div className="p-5 border-t border-white/5 bg-black/40 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-iris-pearl uppercase tracking-wider">ยอดรวมค่าใช้จ่าย</h4>
                    <p className="text-[10px] text-iris-muted">ราคานี้อิงตามพ้อยต์ก่อนหักคูปองส่วนลด</p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-lg font-bold text-gradient-gold">
                    <Coins className="h-5 w-5 text-iris-gold" />
                    <span>{subtotal.toLocaleString()} IC</span>
                  </div>
                </div>

                <Link href="/cart" className="block w-full">
                  <Button
                    variant="cyan"
                    className="w-full justify-between"
                    onClick={() => setDrawerOpen(false)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    <span>ไปที่หน้าตะกร้าและชำระเงิน</span>
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
