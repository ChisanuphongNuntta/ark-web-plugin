'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Coins, Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ProductArtwork } from '@/components/ProductArtwork';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { cartLineKey, useCartStore } from '@/lib/store';

export function CartDrawer() {
  const { items, isDrawerOpen, setDrawerOpen, removeItem, setQuantity } = useCartStore();

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['product-drawer-contract', item.productId, item.serverId],
      queryFn: () => shopApi.getProduct(item.productId).then((response) => response.product),
      staleTime: 5 * 60 * 1000,
    })),
  });

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isDrawerOpen) setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, setDrawerOpen]);

  // Display-only estimate from catalog unit prices. Checkout page fetches the
  // authoritative Backend Total before payment.
  const estimateSubtotal = React.useMemo(() => {
    return items.reduce((sum, item, index) => {
      const product = productQueries[index]?.data as Product | undefined;
      return product ? sum + product.price * item.quantity : sum;
    }, 0);
  }, [items, productQueries]);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-iris-ink shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="ตะกร้าสินค้าของคุณ"
          >
            <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-iris-river/20 to-transparent p-5">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-iris-cyan" />
                <h3 className="font-display text-base font-bold uppercase tracking-wide text-iris-pearl">
                  ตะกร้าสินค้า
                </h3>
                <span className="rounded-full bg-iris-cyan/10 px-2 py-0.5 font-mono text-xs text-iris-cyan">
                  {totalQuantity} ชิ้น
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/5 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
                aria-label="ปิดตะกร้า"
              >
                <X className="h-4 w-4 text-iris-pearl" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center text-xs text-iris-muted">
                  <ShoppingBag className="mb-4 h-12 w-12 text-white/10 animate-float-gentle" />
                  <p className="font-bold uppercase tracking-wide text-iris-pearl">ตะกร้าของคุณยังว่าง</p>
                  <p className="mt-1 max-w-[220px]">
                    เลือกสินค้าและเซิร์ฟเวอร์ปลายทางก่อนเข้าสู่ checkout
                  </p>
                  <Button variant="cyan" size="sm" className="mt-5" onClick={() => setDrawerOpen(false)}>
                    เลือกสินค้าเข้าร้าน
                  </Button>
                </div>
              ) : (
                items.map((item, index) => {
                  const query = productQueries[index];
                  const product = query?.data as Product | undefined;
                  const lineKey = cartLineKey(item.productId, item.serverId);

                  if (query?.isLoading) {
                    return (
                      <div key={lineKey} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-iris-cyan" />
                        <span className="text-xs text-iris-muted">กำลังดึงข้อมูลสินค้า...</span>
                      </div>
                    );
                  }

                  if (!product) {
                    return (
                      <div key={lineKey} className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/15 bg-rose-500/5 p-3 text-xs text-rose-200">
                        <span>โหลดสินค้า #{item.productId} ไม่สำเร็จ</span>
                        <button
                          type="button"
                          className="font-bold text-rose-300 hover:underline"
                          onClick={() => removeItem(item.productId, item.serverId)}
                        >
                          นำออก
                        </button>
                      </div>
                    );
                  }

                  return (
                    <article
                      key={lineKey}
                      className="group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-white/5 bg-black/30 p-3.5 transition hover:border-white/10"
                    >
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <ProductArtwork product={product} alt={product.name} className="h-full w-full" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase text-iris-cyan">
                          {product.category?.name || 'IRIS Store'}
                        </p>
                        <h4 className="truncate text-xs font-bold uppercase text-iris-pearl">{product.name}</h4>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-iris-gold">
                          <Coins className="h-3.5 w-3.5" />
                          <span>{product.price.toLocaleString()} IC / หน่วย</span>
                        </div>
                        <p className="mt-1 font-mono text-[9px] text-iris-muted">
                          เซิร์ฟเวอร์ #{item.serverId}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId, item.serverId)}
                          className="rounded-full p-1 text-iris-muted transition hover:text-rose-400"
                          aria-label="ลบออกจากตะกร้า"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex h-7 items-center rounded-full border border-white/10 bg-black/40">
                          <button
                            type="button"
                            onClick={() => setQuantity(item.productId, item.serverId, item.quantity - 1)}
                            className="flex h-full w-7 items-center justify-center text-iris-muted hover:text-white"
                            aria-label="ลดจำนวน"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center font-mono text-[11px] font-bold text-iris-pearl">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(item.productId, item.serverId, item.quantity + 1)}
                            className="flex h-full w-7 items-center justify-center text-iris-muted hover:text-white"
                            aria-label="เพิ่มจำนวน"
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

            {items.length > 0 && (
              <div className="space-y-4 border-t border-white/5 bg-black/40 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-iris-pearl">ประมาณการจาก catalog</h4>
                    <p className="text-[10px] text-iris-muted">
                      ยอดนี้ไม่ใช่ราคาสุดท้าย Backend Total จะแสดงในหน้า checkout
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-lg font-bold text-gradient-gold">
                    <Coins className="h-5 w-5 text-iris-gold" />
                    <span>~{estimateSubtotal.toLocaleString()} IC</span>
                  </div>
                </div>

                <Link href="/cart" className="block w-full">
                  <Button
                    variant="cyan"
                    className="w-full justify-between"
                    onClick={() => setDrawerOpen(false)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    <span>ไปที่ตะกร้าและชำระเงิน</span>
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
